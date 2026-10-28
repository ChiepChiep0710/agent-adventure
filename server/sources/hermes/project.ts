// De que pasta é a sessão do Hermes Agent (a "sala" do escritório).
//
// O Hermes não grava o cwd de uma sessão de gateway: `sessions.cwd` só é preenchido nas sessões de CLI (verificado em
// 0.21: 338 sessões do Discord, nenhuma com cwd). Então o projeto sai do que o agente tocou: os caminhos absolutos
// que aparecem nos argumentos das ferramentas, subindo até a pasta com `.git`. Sem nenhum caminho utilizável, a sala
// vira uma pasta fictícia por canal (`~/.hermes` não serve: seria uma sala só para tudo).
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';

const MAX_PATHS = 80;
const MAX_WALK = 8;
const MAX_PATH_LEN = 400;

function isFile(p: string, stat = statSync): boolean {
  try {
    return stat(p).isFile();
  } catch {
    return false;
  }
}

/** Caminhos absolutos plausíveis dentro de um valor qualquer (objeto, lista, string de comando). */
export function absolutePathsIn(value: unknown, out: string[] = [], depth = 0): string[] {
  if (out.length >= MAX_PATHS || depth > 4) return out;
  if (typeof value === 'string') {
    if (value.length > MAX_PATH_LEN * 4) return out;
    // Comando de shell: cada palavra absoluta vale (o `cd /repo && npm test` conta).
    for (const word of value.split(/[\s"'`;&|()<>=,]+/)) {
      const p = word.replace(/^['"]|['"]$/g, '');
      if (p.length > 1 && p.length <= MAX_PATH_LEN && isAbsolute(p) && !p.startsWith('//')) out.push(p);
      if (out.length >= MAX_PATHS) break;
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      absolutePathsIn(v, out, depth + 1);
      if (out.length >= MAX_PATHS) break;
    }
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      absolutePathsIn(v, out, depth + 1);
      if (out.length >= MAX_PATHS) break;
    }
  }
  return out;
}

export interface ProjectRootOptions {
  /** Pasta de dados do Hermes: caminhos dentro dela não são projeto (são sessões, cache, skills...). */
  hermesHome: string;
  /** Home do usuário: caminhos nela e nos diretórios de sistema ficam de fora. */
  home: string;
  /** Injetável nos testes (fs real por padrão). */
  hasGit?: (dir: string) => boolean;
  stat?: typeof statSync;
}

const SYSTEM_PREFIXES = ['/tmp/', '/private/var/', '/var/folders/', '/usr/', '/opt/homebrew/', '/Library/'];

function hasGitDir(dir: string, opts: ProjectRootOptions): boolean {
  if (opts.hasGit) return opts.hasGit(dir);
  return existsSync(join(dir, '.git'));
}

/** Caminho utilizável como projeto? (fora da pasta do Hermes, dos diretórios de sistema e da própria home) */
function usable(p: string, opts: ProjectRootOptions): boolean {
  if (!isAbsolute(p)) return false;
  const clean = p.replace(/\/+$/, '');
  const homeClean = opts.home.replace(/\/+$/, '');
  const hermesClean = opts.hermesHome.replace(/\/+$/, '');
  if (clean === homeClean || clean === hermesClean) return false;
  if (clean.startsWith(hermesClean + sep)) return false;
  if (clean.startsWith(homeClean + sep + '.hermes')) return false;
  if (SYSTEM_PREFIXES.some((s) => clean.startsWith(s))) return false;
  return true;
}

/**
 * Raiz do projeto: a pasta com `.git` mais frequente entre os caminhos. Empate → a mais específica (mais funda).
 * `undefined` quando nenhum caminho cai dentro de um repositório.
 */
export function projectRootOf(paths: readonly string[], opts: ProjectRootOptions): string | undefined {
  const counts = new Map<string, number>();
  for (const raw of paths) {
    if (!usable(raw, opts)) continue;
    let dir = isFile(raw, opts.stat) ? dirname(raw) : raw.replace(/\/+$/, '');
    // Caminho que parece arquivo (tem extensão) e não existe no disco: a busca começa na pasta dele, nunca nele.
    if (!isFile(raw, opts.stat) && /\.[A-Za-z0-9]{1,8}$/.test(dir.slice(dir.lastIndexOf('/') + 1))) dir = dirname(dir);
    for (let i = 0; i < MAX_WALK; i++) {
      // Home, pasta do Hermes e diretórios de sistema nunca são projeto (nem param a subida).
      if (!usable(dir, opts)) break;
      if (hasGitDir(dir, opts)) {
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
        break;
      }
      const up = dirname(dir);
      if (up === dir || up === '/') break;
      dir = up;
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [dir, n] of counts) {
    if (n > bestCount || (n === bestCount && best && dir.length > best.length)) {
      best = dir;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Sala fictícia para uma sessão sem projeto conhecido: `~/.hermes/hermes-rooms/<canal>`. O nome que aparece no
 * escritório é o último segmento (o canal do Discord, a plataforma), não a pasta inteira.
 */
export function fallbackRoom(hermesHome: string, source: string, displayName: string | null | undefined): string {
  const channel = /#([\w-]{2,32})/.exec(displayName ?? '')?.[1];
  const label = (channel ?? source ?? 'hermes').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'hermes';
  return join(hermesHome, 'hermes-rooms', label);
}
