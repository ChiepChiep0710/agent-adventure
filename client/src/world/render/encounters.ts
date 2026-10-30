// Encontros de RPG da skin de fantasia: a atividade REAL do agente vira uma cena de RPG ao lado dele.
//
// Regra de ouro: nada aqui inventa agente, status ou atividade. A cena é só decoração derivada do que o
// renderizador já sabe (`info.status` + `info.activity.kind`), e o Habblaud World nunca vê nada disto.
//
// O mapeamento `encounterFor` é puro e determinístico (mesma entrada -> mesma cena, mesma semente ->
// mesma sequência de quadros), o que também o torna testável em Node.
import type { ActivityKind, AgentStatus } from '../../../../shared/types';
import type { Sprite } from '../../art/api';
import { renderEncounterArt, type EncounterArt, type MonsterKind } from '../../art/monsters';

/** Tipo de cena. `null` = sem cena (o agente não está fazendo nada de RPG no momento). */
export type EncounterKind = 'battle' | 'craft' | 'study' | 'scout' | 'guard' | 'loot' | 'rest';

export interface Encounter {
  kind: EncounterKind | null;
  /** Monstrinho da cena (batalha e batedor); `null` nos outros tipos. */
  monster: MonsterKind | null;
  /** Lado da cena em relação ao herói: -1 esquerda, 1 direita (estável pela semente). */
  side: -1 | 1;
}

export interface EncounterInput {
  status?: AgentStatus;
  activityKind?: ActivityKind;
  seed: number;
}

/** Mistura inteira determinística (sem alocar string por quadro). */
function mix(a: number, b: number): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Código estável por tipo de atividade (só para sortear o monstrinho). */
const ACTIVITY_CODE: Readonly<Record<ActivityKind, number>> = {
  prompt: 1,
  think: 2,
  respond: 3,
  read: 4,
  search: 5,
  edit: 6,
  write: 7,
  run: 8,
  test: 9,
  git: 10,
  web: 11,
  browser: 12,
  plan: 13,
  delegate: 14,
  communicate: 15,
  ask: 16,
  mcp: 17,
  skill: 18,
  wait: 19,
  error: 20,
  compact: 21,
  done: 22,
  other: 23,
};

/** Monstrinhos possíveis numa batalha (o slime é o mais comum: é o "rato" do escritório). */
const BATTLE_POOL: readonly MonsterKind[] = ['slime', 'slime', 'golem', 'bat'];

/**
 * Qual cena o agente protagoniza agora. Segue a mesma precedência da classe de RPG
 * (`fantasy-class.ts`): status de espera manda mais que a atividade, e parado ninguém luta.
 */
export function encounterFor(info: EncounterInput): Encounter {
  const side: -1 | 1 = (mix(info.seed, 0x51ed2703) & 1) === 0 ? -1 : 1;
  const scene = (kind: EncounterKind | null, monster: MonsterKind | null = null): Encounter => ({ kind, monster, side });

  if (info.status === 'waiting') return scene('guard'); // de guarda esperando você (o "!" já existe)
  if (info.status === 'shell') return scene('craft'); // esperando a forja terminar
  if (info.status === 'done') return scene('loot'); // terminou: o baú abre
  if (info.status === 'offline') return scene('rest'); // saiu: senta na fogueira
  if (info.status === 'idle') return scene('rest'); // ocioso: descansa

  const kind = info.activityKind;
  if (!kind) return scene(null);
  switch (kind) {
    case 'edit':
    case 'write':
      return scene('battle', BATTLE_POOL[mix(info.seed, ACTIVITY_CODE[kind]) % BATTLE_POOL.length]);
    case 'run':
    case 'test':
    case 'git':
    case 'mcp':
      return scene('craft'); // martelo e faíscas de bigorna
    case 'read':
    case 'search':
    case 'plan':
    case 'skill':
    case 'think':
    case 'compact':
    case 'respond':
    case 'prompt':
    case 'communicate':
    case 'delegate':
      return scene('study'); // runas e livro de preces
    case 'web':
    case 'browser':
      return scene('scout', 'bat'); // o batedor e o morcego
    case 'ask':
    case 'wait':
    case 'error':
      return scene('guard');
    default:
      return scene(null);
  }
}

// ------------------------------------------------------------------ ritmo (puro e determinístico)

/** Duração do ciclo de uma batalha: golpe, recuo, derrota e renascimento do monstrinho. */
export const BATTLE_CYCLE_MS = 4000;

export interface EncounterBeat {
  /** 0..1 dentro do ciclo. */
  phase: number;
  /** Quadro do monstrinho (quique/asa). */
  frame: number;
  /** Quadro do efeito ofensivo do herói. */
  castFrame: number;
  /** Monstrinho derrotado: no lugar dele, a nuvem de poof. */
  defeated: boolean;
  /** Quadro da nuvem de poof. */
  poofFrame: number;
  /** Recuo (px) para longe do herói no impacto. */
  knock: number;
  /** Piscada de dano. */
  flash: boolean;
}

/**
 * Estado da batalha no instante `now`. Depende só de `now` e da semente (deslocamento do ciclo),
 * então dois agentes não lutam em sincronia e a cena é reproduzível nos testes.
 */
export function encounterBeat(now: number, seed = 0): EncounterBeat {
  const shift = mix(seed, 0x2f1b9d05) % BATTLE_CYCLE_MS;
  const t = now + shift;
  const phase = (((t % BATTLE_CYCLE_MS) + BATTLE_CYCLE_MS) % BATTLE_CYCLE_MS) / BATTLE_CYCLE_MS;
  const castFrame = phase < 0.12 ? 0 : phase < 0.24 ? 1 : 2;
  const impact = phase >= 0.24 && phase < 0.34;
  const defeated = phase >= 0.72 && phase < 0.86;
  return {
    phase,
    frame: Math.floor(t / 300) % 3,
    castFrame,
    defeated,
    poofFrame: defeated ? Math.min(2, Math.floor(((phase - 0.72) / 0.14) * 3)) : 0,
    knock: impact ? 2 : phase > 0.24 && phase < 0.38 ? 1 : 0,
    flash: impact,
  };
}

/** Quadro de um efeito que só alterna com o tempo (faíscas, runas, asas): estável por semente. */
export function effectFrame(now: number, seed: number, ms = 240, count = 3): number {
  const t = now + (mix(seed, 0x7a1c3b) % ms);
  return Math.floor(t / ms) % Math.max(1, count);
}

// ------------------------------------------------------------------ sprites (cache local, como os props sazonais)

const sprites = new Map<string, Sprite>();

/** Converte o PixelBuf em canvas uma única vez por peça/quadro. */
function sprite(name: EncounterArt, frame: number): Sprite {
  const key = `${name}|${frame}`;
  let s = sprites.get(key);
  if (!s) {
    const { buf, ax, ay } = renderEncounterArt(name, frame);
    const canvas = document.createElement('canvas');
    canvas.width = buf.w;
    canvas.height = buf.h;
    canvas.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    s = { canvas, ax, ay };
    sprites.set(key, s);
  }
  return s;
}

/** Quantas peças distintas já viraram canvas (só para testes/depuração). */
export function encounterSpriteCount(): number {
  return sprites.size;
}

let stillMq: MediaQueryList | null | undefined;

/** prefers-reduced-motion: a cena continua lá, mas parada (sem golpe, sem piscada). */
export function stillMotion(): boolean {
  if (stillMq === undefined) stillMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  return !!stillMq?.matches;
}

// ------------------------------------------------------------------ desenho

/** O mínimo que a cena precisa saber do personagem (px de mundo, pés). */
export interface EncounterActor {
  x: number;
  y: number;
  alpha: number;
  seed: number;
  status?: AgentStatus;
  activityKind?: ActivityKind;
  /** Desde quando o status atual vale (epoch ms); 0/undefined = desconhecido. */
  statusSince?: number;
  /** Andando pelo escritório: a fogueira não sai passeando atrás do herói. */
  moving?: boolean;
}

/** Distância lateral (px) entre o herói e a cena: longe o bastante para não cobrir o rosto. */
export const ENCOUNTER_GAP = 15;

function blit(
  ctx: CanvasRenderingContext2D,
  name: EncounterArt,
  frame: number,
  x: number,
  y: number,
  alpha: number,
  side: -1 | 1,
): void {
  const s = sprite(name, frame);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (side < 0) ctx.scale(-1, 1);
  ctx.drawImage(s.canvas, -s.ax, -s.ay);
  ctx.restore();
}

/**
 * Desenha a cena do agente. Chamado pelo renderizador por personagem visível (já dentro da ordenação
 * por profundidade), com o limite de cenas por quadro aplicado lá.
 */
export function drawEncounter(ctx: CanvasRenderingContext2D, actor: EncounterActor, now: number): void {
  const e = encounterFor(actor);
  if (!e.kind) return;
  // fogueira é coisa de quem está parado: andando, o descanso fica para depois
  if (e.kind === 'rest' && actor.moving) return;
  const still = stillMotion();
  const t = still ? 0 : now;
  const side = e.side;
  const baseX = actor.x + side * ENCOUNTER_GAP;
  const baseY = actor.y;
  const alpha = actor.alpha;

  switch (e.kind) {
    case 'battle': {
      const beat = still ? null : encounterBeat(t, actor.seed);
      const frame = beat ? beat.frame : 0;
      const castFrame = beat ? beat.castFrame : 0;
      // o projétil sai da mão do herói e chega no monstrinho
      blit(ctx, 'spark', castFrame, actor.x + side * (5 + castFrame * 3), baseY - 11, alpha, side);
      if (beat?.flash) {
        // golpe: arco de espada passando pelo monstrinho
        blit(ctx, 'slash', 1, baseX, baseY - 2, alpha * 0.9, side);
      }
      if (beat?.defeated) {
        blit(ctx, 'poof', beat.poofFrame, baseX, baseY, alpha, side);
      } else {
        const knock = beat ? beat.knock : 0;
        blit(ctx, e.monster ?? 'slime', frame, baseX + side * knock, baseY, alpha * (beat?.flash ? 0.75 : 1), side);
      }
      break;
    }
    case 'craft': {
      // bigorna e faíscas do ferreiro, logo ao lado dos pés
      blit(ctx, 'hammer', still ? 0 : effectFrame(t, actor.seed, 220), baseX, baseY, alpha, side);
      break;
    }
    case 'study': {
      // runas flutuando sobre o livro, na altura da mesa
      blit(ctx, 'runes', still ? 0 : effectFrame(t, actor.seed, 480), actor.x + side * 11, baseY - 24, alpha, side);
      break;
    }
    case 'scout': {
      // morcego rodeando o batedor (órbita fechada, sem sair do lugar)
      const a = (still ? 0 : t / 900) + (actor.seed % 360) * 0.0175;
      const bx = actor.x + side * (13 + Math.sin(a) * 3);
      const by = baseY - 25 + Math.cos(a) * 4;
      blit(ctx, 'bat', still ? 1 : effectFrame(t, actor.seed, 150), bx, by, alpha, side);
      break;
    }
    case 'guard': {
      // brilho no escudo de quem espera uma resposta sua
      blit(ctx, 'glint', still ? 0 : effectFrame(t, actor.seed, 900, 2), actor.x + side * 10, baseY - 18, alpha, side);
      break;
    }
    case 'loot': {
      // o baú abre em ~0,8 s e fica aberto com as moedas à mostra
      const since = actor.statusSince ?? 0;
      const age = since > 0 ? Math.max(0, now - since) : 800;
      const frame = still ? 2 : Math.min(2, Math.floor(age / 400));
      blit(ctx, 'chest', frame, baseX, baseY, alpha, side);
      if (frame === 2 && !still) {
        // brilho do ouro piscando (dois pixels, um por vez)
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = '#ffe9a8';
        const tw = Math.floor(now / 260) % 2;
        ctx.fillRect(Math.round(baseX + (tw ? -5 : 4)), Math.round(baseY - 13 - tw), 1, 1);
        ctx.fillStyle = '#fff6d2';
        ctx.fillRect(Math.round(baseX + (tw ? 6 : -3)), Math.round(baseY - 10 - (1 - tw)), 1, 1);
        ctx.restore();
      }
      break;
    }
    case 'rest': {
      // fogueira do descanso: ninguém luta quando está parado
      blit(ctx, 'campfire', still ? 0 : effectFrame(t, actor.seed, 320), baseX, baseY, alpha, side);
      break;
    }
  }
}
