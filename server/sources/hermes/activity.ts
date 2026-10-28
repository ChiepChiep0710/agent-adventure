// Tradução das chamadas de ferramenta do Hermes Agent em atividades do escritório.
//
// O Hermes grava cada chamada em `messages.tool_calls` no formato OpenAI (uma função por entrada, com os argumentos
// em JSON *string*). Nomes diferentes dos do Claude Code, mesma ideia: o que o personagem está fazendo agora.
// Reaproveitamos o que já existe em shared/activity.ts (describeCommand, describeTool, SPECIAL) para os casos em que
// a heurística é a mesma — comando de shell, leitura/edição de arquivo, busca na web — e completamos o resto.
import type { ActivityDescription } from '../../../shared/activity';
import { SPECIAL, basename, describeCommand, describeTool, truncate } from '../../../shared/activity';
import type { Activity } from '../../../shared/types';
import { tr } from '../../../shared/i18n';

/** Uma chamada de ferramenta lida de `tool_calls` (ou da mensagem de resultado, quando só há o nome). */
export interface HermesToolCall {
  /** Id da chamada (para casar com o resultado em `messages.tool_call_id`). */
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

const MAX_DETAIL = 300;
const MAX_TEXT = 60;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** `tool_calls` do Hermes → lista de chamadas (ignora entradas que não são função). */
export function parseToolCalls(raw: string | null | undefined): HermesToolCall[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: HermesToolCall[] = [];
  for (const entry of parsed) {
    const e = obj(entry);
    if (!e) continue;
    const fn = obj(e.function) ?? e;
    const name = str(fn.name);
    if (!name) continue;
    let args: unknown = fn.arguments ?? fn.input ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    const id = str(e.id) ?? str(e.call_id);
    out.push({ ...(id ? { id } : {}), name, input: obj(args) ?? {} });
  }
  return out;
}

/**
 * Texto de uma mensagem do usuário. O Hermes grava ora string pura, ora uma lista de blocos (texto + anexos);
 * nos dois casos queremos só o texto, curto.
 */
export function userText(content: string | null | undefined): string | undefined {
  const raw = content?.trim();
  if (!raw) return undefined;
  if (raw.startsWith('[') || raw.startsWith('{"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const parts = parsed.map((b) => str(obj(b)?.text)).filter((t): t is string => !!t);
        if (parts.length) return truncate(parts.join(' '), MAX_DETAIL);
      } else {
        const o = obj(parsed);
        const t = str(o?.text) ?? str(o?.content);
        if (t) return truncate(t, MAX_DETAIL);
      }
    } catch {
      /* conteúdo de verdade começa com "[" ou "{" e não é JSON: usa como veio */
    }
  }
  return truncate(raw, MAX_DETAIL);
}

function fileOf(input: Record<string, unknown>): string | undefined {
  return str(input.path) ?? str(input.file_path) ?? str(input.notebook_path) ?? str(input.target);
}

/** Descrição de uma chamada de ferramenta do Hermes (PT, via tr()). */
export function describeHermesTool(name: string, input: Record<string, unknown>): ActivityDescription {
  switch (name) {
    case 'terminal': {
      const command = str(input.command);
      if (!command) return { kind: 'run', icon: '💻', text: tr('Rodando um comando no terminal') };
      return describeCommand(command);
    }
    case 'execute_code': {
      const code = str(input.code) ?? '';
      const first = code.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))?.trim();
      return { kind: 'run', icon: '🐍', text: tr('Rodando código Python'), ...(first ? { detail: truncate(first, MAX_DETAIL) } : {}) };
    }
    case 'read_file':
    case 'vision_analyze': {
      const file = fileOf(input) ?? str(input.image_url);
      return {
        kind: 'read',
        icon: name === 'vision_analyze' ? '🖼️' : '📖',
        text: file ? tr('Lendo {0}', [basename(file)]) : tr('Lendo arquivo'),
        ...(file ? { detail: truncate(file, MAX_DETAIL) } : {}),
      };
    }
    case 'patch': {
      const file = fileOf(input);
      return {
        kind: 'edit',
        icon: '✏️',
        text: file ? tr('Editando {0}', [basename(file)]) : tr('Editando arquivo'),
        ...(file ? { detail: truncate(file, MAX_DETAIL) } : {}),
      };
    }
    case 'write_file': {
      const file = fileOf(input);
      return {
        kind: 'write',
        icon: '📝',
        text: file ? tr('Escrevendo {0}', [basename(file)]) : tr('Escrevendo arquivo'),
        ...(file ? { detail: truncate(file, MAX_DETAIL) } : {}),
      };
    }
    case 'search_files': {
      const pat = str(input.pattern);
      return { kind: 'search', icon: '🔎', text: pat ? tr('Buscando “{0}”', [truncate(pat, 26)]) : tr('Buscando no código'), ...(pat ? { detail: pat } : {}) };
    }
    case 'web_search': {
      const q = str(input.query);
      return { kind: 'web', icon: '🌐', text: q ? tr('Pesquisando “{0}”', [truncate(q, 28)]) : tr('Pesquisando na web'), ...(q ? { detail: truncate(q, MAX_DETAIL) } : {}) };
    }
    case 'web_extract': {
      const urls = Array.isArray(input.urls) ? input.urls.map((u) => str(u)).filter((u): u is string => !!u) : [];
      const first = urls[0];
      const host = first ? hostOf(first) : undefined;
      return { kind: 'web', icon: '🌐', text: host ? tr('Lendo {0}', [host]) : tr('Lendo uma página'), ...(first ? { detail: truncate(first, MAX_DETAIL) } : {}) };
    }
    case 'browser_exec': {
      const goal = str(input.goal) ?? str(input.description);
      return { kind: 'browser', icon: '🧭', text: goal ? truncate(goal, MAX_TEXT) : tr('Navegando no navegador'), ...(goal ? { detail: goal } : {}) };
    }
    case 'delegate_task': {
      const tasks = Array.isArray(input.tasks) ? input.tasks : [];
      const first = obj(tasks[0]);
      const goal = str(first?.goal);
      const n = tasks.length;
      return {
        kind: 'delegate',
        icon: '👥',
        text: n > 1 ? tr('Disparou {0} subagentes', [n]) : tr('Disparou um subagente'),
        ...(goal ? { detail: truncate(goal, MAX_DETAIL) } : {}),
      };
    }
    case 'skill_view':
    case 'skill_manage': {
      const slug = str(input.name);
      return { kind: 'skill', icon: '📚', text: slug ? tr('Consultando a skill {0}', [slug]) : tr('Consultando uma skill') };
    }
    case 'memory':
      return { kind: 'other', icon: '🧠', text: tr('Atualizando a memória') };
    case 'clarify':
      return { kind: 'ask', icon: '❓', text: tr('Perguntando a você'), ...(str(input.question) ? { detail: truncate(str(input.question)!, MAX_DETAIL) } : {}) };
    case 'todo_list':
      return { kind: 'plan', icon: '🗒️', text: tr('Organizando as tarefas') };
    case 'cronjob_manage':
      return { kind: 'other', icon: '⏰', text: tr('Agendando uma tarefa') };
    case 'text_to_speech':
      return { kind: 'other', icon: '🔊', text: tr('Gerando áudio') };
    case 'discord':
    case 'discord_admin':
      return { kind: 'communicate', icon: '💬', text: tr('Falando no Discord') };
    case 'process_manage':
    case 'session_search':
      return { kind: 'run', icon: '📟', text: tr('Conferindo o que já aconteceu') };
    default:
      // Nome conhecido do outro lado (Read/Edit/Bash...) ou ferramenta MCP: a heurística compartilhada resolve.
      return describeTool(name, input);
  }
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Atividade de uma mensagem de texto do assistente (sem ferramentas). */
export function responseActivity(text: string | undefined): ActivityDescription {
  return SPECIAL.respond(text ? truncate(text, MAX_DETAIL) : undefined);
}

/** Atividade de um pedido do usuário. */
export function promptActivity(text: string): ActivityDescription {
  return { kind: 'prompt', icon: '🗣️', text: truncate(text, MAX_TEXT), detail: truncate(text, MAX_DETAIL) };
}

/** Monta a atividade do escritório a partir da descrição + id/instante. */
export function toActivity(id: string, at: number, desc: ActivityDescription, tool?: string): Activity {
  return {
    id,
    at,
    kind: desc.kind,
    icon: desc.icon,
    text: desc.text,
    ...(desc.detail ? { detail: desc.detail } : {}),
    ...(tool ? { tool } : {}),
  };
}
