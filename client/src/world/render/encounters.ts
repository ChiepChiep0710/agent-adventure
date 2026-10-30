// Encontros de RPG da skin de fantasia: a atividade REAL do agente vira uma luta de RPG ao lado dele.
//
// Regra de ouro: nada aqui inventa agente, status ou atividade. A cena é só decoração derivada do que o
// renderizador já sabe (`info.status` + `info.activity.kind` + `info.activity.error`), e o Habblaud
// World nunca vê nada disto.
//
// O mapeamento `encounterFor` é puro e determinístico (mesma entrada -> mesma cena, mesma semente ->
// mesmo ciclo, mesmos números de dano), o que também o torna testável em Node. O desenho fica no fim
// do arquivo e só usa o canvas por cima da arte de `art/monsters.ts`.
import type { ActivityKind, AgentStatus } from '../../../../shared/types';
import type { Sprite } from '../../art/api';
import { pixelText, pixelTextWidth } from '../../art/pixelfont';
import { renderEncounterArt, type EncounterArt, type MonsterKind } from '../../art/monsters';

/** Tipo de cena. `null` = sem cena (o agente não tem atividade nenhuma no momento). */
export type EncounterKind = 'battle' | 'guard' | 'loot' | 'rest';

/** Como o herói ataca (define projétil, efeito de impacto e a peça desenhada). */
export type AttackStyle = 'fireball' | 'dagger' | 'smash' | 'light' | 'summon' | 'shield' | 'guard' | 'loot' | 'rest';

export interface Encounter {
  kind: EncounterKind | null;
  /** Monstro da cena (a vitória também guarda qual foi o derrotado, para o "poof"). */
  monster: MonsterKind | null;
  /** Estilo de ataque do herói (vem da classe que a atividade sugere). */
  attack: AttackStyle;
  /** Lado da cena em relação ao herói: -1 esquerda, 1 direita (estável pela semente). */
  side: -1 | 1;
  /** Monstro mais duro (atividade de erro / teste quebrado): golem, com aura vermelha. */
  tough: boolean;
  /** O herói apanha nesta cena (atividade 'error'): piscada vermelha e dano nele. */
  hurt: boolean;
  /** Monstro espera, sem trocar golpes (de guarda esperando você). */
  paused: boolean;
  /** Duração do ciclo de combate (3–6 s, estável pela semente). */
  cycleMs: number;
  /** Distância lateral até o monstro (18–26 px). */
  gap: number;
}

export interface EncounterInput {
  status?: AgentStatus;
  activityKind?: ActivityKind;
  /** A última atividade falhou (teste quebrado, comando com erro): monstro mais duro. */
  error?: boolean;
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

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

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

/**
 * Estilo de ataque por atividade — a mesma leitura de RPG de `fantasy-class.ts`:
 * tecer código é magia (bola de fogo), forjar no terminal é martelo, ler/pensar é luz de estudioso,
 * sair para a web é adaga de ladino, delegar é invocação, esperar é guarda.
 */
export function attackForActivity(kind: ActivityKind | undefined): AttackStyle | null {
  switch (kind) {
    case 'edit':
    case 'write':
      return 'fireball';
    case 'run':
    case 'test':
    case 'git':
    case 'mcp':
      return 'smash';
    case 'read':
    case 'search':
    case 'plan':
    case 'skill':
    case 'think':
    case 'compact':
      return 'light';
    case 'web':
    case 'browser':
      return 'dagger';
    case 'delegate':
      return 'summon';
    case 'respond':
    case 'prompt':
    case 'communicate':
      return 'light';
    case 'ask':
    case 'wait':
      return 'guard';
    case 'error':
      return 'smash';
    case 'done':
      return 'loot';
    case 'other':
      return 'fireball';
    default:
      return null;
  }
}

/** Monstrinhos possíveis por estilo (o slime é o "rato" do reino; o golem é o tanque). */
const MONSTERS_BY_STYLE: Readonly<Record<AttackStyle, readonly MonsterKind[]>> = {
  fireball: ['slime', 'mimic', 'wisp'],
  smash: ['golem', 'goblin', 'skeleton'],
  light: ['wisp', 'skeleton', 'wisp'],
  dagger: ['bat', 'goblin'],
  summon: ['skeleton', 'goblin', 'wisp'],
  shield: ['golem', 'skeleton'],
  guard: ['goblin', 'skeleton', 'bat'],
  loot: ['slime', 'golem', 'goblin'],
  rest: ['slime'],
};

/** Ciclo de combate em passos de meio segundo entre 3 e 6 s, estável pela semente. */
export function cycleFor(seed: number): number {
  return 3000 + (mix(seed, 0x3c6ef372) % 7) * 500;
}

/** Distância lateral até o monstro (18 a 26 px, estável pela semente). */
export function gapFor(seed: number): number {
  return 18 + (mix(seed, 0x27d4eb2f) % 9);
}

function pickMonster(pool: readonly MonsterKind[], seed: number, kind: number): MonsterKind {
  return pool[mix(seed, kind) % pool.length];
}

/**
 * Qual cena o agente protagoniza agora. Segue a mesma precedência da classe de RPG
 * (`fantasy-class.ts`): status de espera manda mais que a atividade, e parado ninguém luta.
 */
export function encounterFor(info: EncounterInput): Encounter {
  const side: -1 | 1 = (mix(info.seed, 0x51ed2703) & 1) === 0 ? -1 : 1;
  const cycleMs = cycleFor(info.seed);
  const gap = gapFor(info.seed);
  const kind = info.activityKind;
  const code = kind ? ACTIVITY_CODE[kind] : 0;
  const error = info.error === true || kind === 'error';
  const scene = (k: EncounterKind | null, attack: AttackStyle, monster: MonsterKind | null, paused = false, tough = false): Encounter => ({
    kind: k,
    monster,
    attack,
    side,
    tough,
    hurt: error,
    paused,
    cycleMs,
    gap,
  });

  // Status manda mais que a atividade (como na classe de RPG).
  if (info.status === 'waiting') {
    // de guarda esperando você: o monstro fica parado, à espreita (o "!" já existe)
    return scene('guard', 'guard', pickMonster(MONSTERS_BY_STYLE.guard, info.seed, code + 1), true);
  }
  if (info.status === 'shell') {
    // esperando a forja terminar: ferreiro de escudo erguido, monstro batendo nele
    return scene('battle', 'shield', pickMonster(MONSTERS_BY_STYLE.shield, info.seed, code + 3));
  }
  if (info.status === 'done') {
    // terminou: o monstro da última atividade caiu e o baú abre
    return scene('loot', 'loot', pickMonster(MONSTERS_BY_STYLE.loot, info.seed, code + 5), true);
  }
  if (info.status === 'offline' || info.status === 'idle') {
    // saiu/parado: senta no braseiro (o "Zzz" do ícone já conta a história)
    return scene('rest', 'rest', null, true);
  }

  if (!kind) return scene(null, 'rest', null, true);
  const attack = attackForActivity(kind) ?? 'fireball';
  if (attack === 'guard') {
    return scene('guard', 'guard', pickMonster(MONSTERS_BY_STYLE.guard, info.seed, code + 7), true);
  }
  if (attack === 'loot') {
    return scene('loot', 'loot', pickMonster(MONSTERS_BY_STYLE.loot, info.seed, code + 9), true);
  }
  // erro/atividade de erro: golem duro (o herói apanha: piscada vermelha)
  const pool = error ? (attack === 'fireball' ? (['mimic'] as const) : (['golem'] as const)) : MONSTERS_BY_STYLE[attack];
  return scene('battle', attack, pickMonster(pool, info.seed, code + 11), false, error);
}

// ------------------------------------------------------------------ ritmo (puro e determinístico)

/** Fases dos golpes dentro de um ciclo: dois golpes e o finalizador. */
export const HIT_PHASES: readonly number[] = [0.16, 0.44, 0.68];
/** Fase em que o monstro cai (a vida zera). */
export const DEFEAT_PHASE = 0.68;
/** Fase do contra-ataque que acerta o herói (só em cena de erro). */
export const HERO_HIT_PHASE = 0.56;
/** Quanto tempo (em fase) um número de dano fica subindo. */
const DAMAGE_LIFE = 0.22;

export interface DamageNumber {
  /** Dano mostrado (já dobrado no crítico). */
  value: number;
  crit: boolean;
  /** 0 = acabou de aparecer, 1 = sumiu. */
  age: number;
}

export interface EncounterBeat {
  /** 0..1 dentro do ciclo. */
  phase: number;
  /** Índice do ciclo (para os números de dano variarem a cada renascimento). */
  cycle: number;
  /** Vida do monstro (1 -> 0 ao longo do ciclo; enche de novo no renascimento). */
  hp: number;
  /** Quadro do monstro (0 parado, 1 se armando, 2 atacando, 3 ferido). */
  frame: number;
  /** Quadro da conjuração do herói. */
  castFrame: number;
  /** 0..1 = projétil em voo (do herói ao monstro); -1 = sem projétil neste instante. */
  projectile: number;
  /** Impacto agora (piscada + recuo + número de dano novo). */
  impact: boolean;
  /** Piscada de dano no monstro. */
  flash: boolean;
  /** Recuo (px) para longe do herói no impacto. */
  knock: number;
  /** Monstro derrotado: no lugar dele, a nuvem de poof. */
  defeated: boolean;
  /** Quadro da nuvem de poof. */
  poofFrame: number;
  /** 0..1 = renascendo (surge de novo depois do poof). */
  respawn: number;
  /** Números de dano visíveis agora (pixel font), estáveis por semente+ciclo. */
  damage: readonly DamageNumber[];
  /** 0..1 = pulso do contra-ataque que acerta o herói (cena de erro). */
  heroHit: number;
}

/** Sorteio determinístico de um golpe (base 6–18; crítico em ~1 de 5 dobra o valor). */
export function damageRoll(seed: number, cycle: number, index: number): { value: number; crit: boolean } {
  const r = mix(mix(seed, cycle + 1), 0x9e3779b1 + index * 131);
  const base = 6 + (r % 13);
  const crit = (r >>> 9) % 5 === 0;
  return { value: crit ? base * 2 : base, crit };
}

/** Início da conjuração que termina no golpe `i` (0.12 de fase antes do impacto). */
function windupStart(i: number): number {
  return HIT_PHASES[i] - 0.12;
}

/**
 * Estado da batalha no instante `now`. Depende só de `now`, da semente e do ciclo: dois agentes não
 * lutam em sincronia e a cena é reproduzível nos testes (nada de Math.random por quadro).
 */
export function encounterBeat(now: number, seed = 0, cycleMs = cycleFor(seed)): EncounterBeat {
  const ms = Math.max(1000, Math.round(cycleMs));
  const shift = mix(seed, 0x2f1b9d05) % ms;
  const t = now + shift;
  const cycle = Math.floor(t / ms);
  const phase = (((t % ms) + ms) % ms) / ms;

  // Conjuração do herói: três quadros dentro da janela de cada golpe.
  let castFrame = 0;
  let projectile = -1;
  let impact = false;
  let knock = 0;
  for (let i = 0; i < HIT_PHASES.length; i++) {
    const w = windupStart(i);
    const h = HIT_PHASES[i];
    if (phase >= w && phase < h) {
      castFrame = Math.min(2, Math.floor(((phase - w) / (h - w)) * 3));
      // o projétil percorre o caminho no último terço da conjuração
      if (phase >= h - 0.04) projectile = clamp01((phase - (h - 0.04)) / 0.04);
    }
    if (phase >= h && phase < h + 0.05) {
      impact = true;
      knock = phase < h + 0.025 ? 2 : 1;
    }
  }

  // Vida: drena de forma contínua e monótona até a queda (enche de novo no ciclo seguinte).
  const hp = phase >= DEFEAT_PHASE ? 0 : clamp01(1 - phase / DEFEAT_PHASE);
  const defeated = phase >= DEFEAT_PHASE && phase < 0.84;
  const poofFrame = defeated ? Math.min(2, Math.floor(((phase - DEFEAT_PHASE) / (0.84 - DEFEAT_PHASE)) * 3)) : 0;
  const respawn = phase >= 0.84 ? clamp01((phase - 0.84) / 0.16) : 1;

  // Quadro do monstro: ferido no impacto; armando-se enquanto o herói conjura; atacando no resto.
  let frame = 0;
  if (impact) frame = 3;
  else if (defeated) frame = 3;
  else if (phase < DEFEAT_PHASE) {
    let winding = false;
    for (let i = 0; i < HIT_PHASES.length; i++) if (phase >= windupStart(i) && phase < HIT_PHASES[i]) winding = true;
    frame = winding ? 1 : phase > 0.20 ? 2 : 0;
  }

  // Números de dano: gerados por semente+ciclo, visíveis por um instante após cada golpe.
  const damage: DamageNumber[] = [];
  for (let i = 0; i < HIT_PHASES.length; i++) {
    const age = (phase - HIT_PHASES[i]) / DAMAGE_LIFE;
    if (age >= 0 && age < 1) {
      const roll = damageRoll(seed, cycle, i);
      damage.push({ value: roll.value, crit: roll.crit, age });
    }
  }

  // Contra-ataque que acerta o herói (só a cena de erro usa este pulso).
  const heroHit = phase >= HERO_HIT_PHASE && phase < HERO_HIT_PHASE + 0.06 ? 1 - (phase - HERO_HIT_PHASE) / 0.06 : 0;

  return { phase, cycle, hp, frame, castFrame, projectile, impact, flash: impact, knock, defeated, poofFrame, respawn, damage, heroHit };
}

/** Pulso do contra-ataque do monstro no herói (cena de erro), 0 quando não há golpe. */
export function heroHitPulse(now: number, seed: number, cycleMs = cycleFor(seed)): number {
  return encounterBeat(now, seed, cycleMs).heroHit;
}

/** Estado da cena de guarda: o monstro só respira e encara (nada de dano). */
export function guardBeat(now: number, seed = 0): { frame: number; sway: number } {
  const t = now + (mix(seed, 0x1b873593) % 4000);
  const breath = Math.sin(t / 900);
  return { frame: breath > 0.7 ? 1 : 0, sway: Math.round(breath) };
}

/** Quadro de um efeito que só alterna com o tempo (faíscas, runas, chama): estável por semente. */
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
  /** A atividade atual falhou: monstro mais duro e o herói apanha. */
  error?: boolean;
  /** Desde quando o status atual vale (epoch ms); 0/undefined = desconhecido. */
  statusSince?: number;
  /** Andando pelo escritório: a fogueira/o combate não sai passeando atrás do herói. */
  moving?: boolean;
  /** Sentado à mesa: o monstro vai para a frente da mesa, senão fica escondido atrás dela. */
  seated?: boolean;
}

/** Distância lateral (px) entre o herói e a cena. */
export const ENCOUNTER_GAP = 18;

/** Base do monstro: no chão, ou na frente da mesa de quem está sentado. */
export function monsterBaseY(actor: { y: number; seated?: boolean }): number {
  return actor.y + (actor.seated ? 9 : 0);
}

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

/** Barra de vida de 3 px acima do monstro (verde -> amarela -> vermelha). */
export function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number, alpha: number): void {
  const w = 18;
  const h = 3;
  const left = Math.round(x - w / 2);
  const top = Math.round(y);
  const filled = Math.round(w * clamp01(hp));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(14,12,22,0.9)';
  ctx.fillRect(left - 1, top - 1, w + 2, h + 2);
  ctx.fillStyle = hp > 0.55 ? '#63d97a' : hp > 0.28 ? '#ffce4a' : '#ff5f5f';
  ctx.fillRect(left, top, filled, h);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(left, top, filled, 1);
  // tique de dano no fim da barra
  ctx.fillStyle = 'rgba(255,120,120,0.55)';
  ctx.fillRect(left + filled, top, 1, h);
}

/** Número de dano em fonte de pixel (3x5) subindo e sumindo; crítico em amarelo. */
function drawDamage(ctx: CanvasRenderingContext2D, x: number, y: number, d: DamageNumber, alpha: number): void {
  const text = `-${d.value}`;
  const w = pixelTextWidth(text);
  const rise = Math.round(d.age * 10);
  const px = Math.round(x - w / 2);
  const py = Math.round(y - 18 - rise);
  ctx.globalAlpha = alpha * (1 - d.age * d.age);
  pixelText(ctx, text, px + 1, py + 1, 'rgba(18,12,20,0.9)');
  pixelText(ctx, text, px, py, d.crit ? '#ffe14d' : '#ffffff');
  if (d.crit) {
    // estrelinha de crítico do lado do número
    ctx.fillStyle = '#fff6c2';
    ctx.fillRect(px + w + 1, py + 1, 1, 3);
    ctx.fillRect(px + w, py + 2, 3, 1);
  }
}

/** Moeda de ouro girando (2x2 / 1x3), determinística pela idade. */
function coin(ctx: CanvasRenderingContext2D, x: number, y: number, face: boolean): void {
  if (face) {
    ctx.fillStyle = '#c98a12';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.fillStyle = '#ffcf3a';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    ctx.fillStyle = '#fff6c2';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
  } else {
    ctx.fillStyle = '#ffcf3a';
    ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
  }
}

/**
 * Desenha a cena do agente. Chamado pelo renderizador por personagem visível (já dentro da ordenação
 * por profundidade), com o limite de cenas por quadro aplicado lá.
 */
export function drawEncounter(ctx: CanvasRenderingContext2D, actor: EncounterActor, now: number): void {
  const e = encounterFor(actor);
  if (!e.kind) return;
  // a cena de descanso é coisa de quem está parado: andando, fica para depois
  if (e.kind === 'rest' && actor.moving) return;
  const still = stillMotion();
  const t = still ? 0 : now;
  const side = e.side;
  const baseY = monsterBaseY(actor);
  const mx = actor.x + side * e.gap;
  const alpha = actor.alpha;

  // Sombra de "arena": anel de pedra sob o combate (deixa claro que ali é o ringue).
  if (e.kind === 'battle' || e.kind === 'guard' || e.kind === 'loot') {
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = '#0d1020';
    ctx.beginPath();
    ctx.ellipse(Math.round((actor.x + mx) / 2), Math.round(baseY + 1), Math.abs(mx - actor.x) / 2 + 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.16;
    ctx.strokeStyle = '#c9a86a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  switch (e.kind) {
    case 'battle': {
      const beat = encounterBeat(t, actor.seed, e.cycleMs);
      // Brilho vermelho atrás do monstro duro (golem de teste quebrado/erro)
      if (e.tough) {
        ctx.globalAlpha = alpha * 0.2;
        ctx.fillStyle = '#ff2f4a';
        ctx.beginPath();
        ctx.ellipse(Math.round(mx), Math.round(baseY - 10), 13, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // 1) monstro (ou a nuvem quando cai; some/renasce no fim do ciclo)
      if (beat.defeated) {
        blit(ctx, 'poof', beat.poofFrame, mx, baseY, alpha, side);
      } else if (beat.respawn < 1) {
        blit(ctx, e.monster ?? 'slime', 0, mx, baseY, alpha * beat.respawn, side);
      } else {
        const kn = beat.knock;
        blit(ctx, e.monster ?? 'slime', beat.frame, mx + side * kn, baseY, alpha * (beat.flash ? 0.8 : 1), side);
      }
      // 2) ataque do herói: projétil, golpe corpo a corpo ou escudo
      const handX = actor.x + side * 6;
      const handY = actor.y - 11;
      if (!still && beat.projectile >= 0) {
        drawProjectile(ctx, e.attack, actor.x, handX, handY, mx, baseY, beat.projectile, alpha, side, actor.seed, beat.cycle);
      }
      if (!still && e.attack === 'smash' && beat.castFrame === 2 && !beat.impact) {
        blit(ctx, 'hammer', 1, actor.x + side * 9, actor.y, alpha, side);
      }
      if (beat.impact) {
        // estouro no monstro: arco/estilhaço/feixe conforme o estilo
        const at = mx - side * 2;
        if (e.attack === 'fireball' || e.attack === 'summon') blit(ctx, 'spark', 2, at, baseY - 9, alpha, side);
        else if (e.attack === 'dagger') blit(ctx, 'slash', 2, at, baseY - 8, alpha, side);
        else if (e.attack === 'light') blit(ctx, 'lightbeam', 2, at, baseY - 10, alpha, side);
        else blit(ctx, 'smash', 2, at, baseY - 9, alpha, side);
        // faíscas pequenas no choque (desenhadas direto: sem estado, determinísticas)
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = '#ffe9a8';
        for (let i = 0; i < 4; i++) {
          const d = mix(actor.seed + beat.cycle * 7, i + 3);
          ctx.fillRect(Math.round(at + side * (2 + (d % 6))), Math.round(baseY - 6 - (d % 9)), 1, 1);
        }
      }
      // 3) vida + números de dano
      if (!beat.defeated && beat.respawn >= 1) {
        const barY = baseY - 32;
        drawHpBar(ctx, mx, barY, beat.hp, alpha * 0.95);
      }
      if (!still) for (const d of beat.damage) drawDamage(ctx, mx, baseY - 8, d, alpha);
      // 4) escudo do ferreiro (segurando o golpe do monstro) / invocação de reforços
      if (e.attack === 'shield') {
        const raise = beat.frame === 2 ? 1 : 0; // monstro atacando: escudo erguido
        blit(ctx, 'glint', raise, actor.x + side * 11, actor.y - 15, alpha, side);
        if (!still && beat.frame === 2) {
          // faísca do golpe batendo no escudo
          ctx.globalAlpha = alpha * 0.8;
          ctx.fillStyle = '#dff1ff';
          ctx.fillRect(Math.round(actor.x + side * 13), Math.round(actor.y - 16), 1, 3);
          ctx.fillRect(Math.round(actor.x + side * 12), Math.round(actor.y - 15), 3, 1);
        }
      } else if (e.attack === 'summon') {
        // círculo rúnico aos pés e dois fogos-fátuos "aliados" (puro efeito: são os subagentes que
        // já existem como personagens, aqui só o brilho da convocação)
        blit(ctx, 'runes', still ? 0 : effectFrame(t, actor.seed, 260), actor.x, actor.y + 1, alpha * 0.95, side);
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = '#9fe6ff';
        ctx.beginPath();
        ctx.ellipse(Math.round(actor.x), Math.round(actor.y), 13, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 5) herói ferido (atividade de erro): dano vermelho em cima dele
      if (!still && e.hurt && beat.heroHit > 0) drawHeroHit(ctx, actor.x, actor.y, beat, alpha);
      break;
    }
    case 'guard': {
      // monstro à espreita, parado; o cavaleiro de guarda com o escudo brilhando
      const g = guardBeat(t, actor.seed);
      blit(ctx, e.monster ?? 'goblin', g.frame, mx + side * g.sway, baseY, alpha, side);
      blit(ctx, 'glint', still ? 0 : effectFrame(t, actor.seed, 900, 2), actor.x + side * 10, actor.y - 17, alpha, side);
      if (!still) {
        // "olhar" do monstro: um piscar lento no olho, sem barra de vida cheia piscando
        drawHpBar(ctx, mx, baseY - 32, 1, alpha * 0.9);
      }
      break;
    }
    case 'loot': {
      // vitória: o monstro derrotado vira poof, o baú abre, moedas saltam e a estrela pisca
      const since = actor.statusSince ?? 0;
      const age = since > 0 ? Math.max(0, now - since) : 1500;
      const chestFrame = still ? 2 : Math.min(2, Math.floor(age / 400));
      if (!still && age < 700) blit(ctx, 'poof', Math.min(2, Math.floor(age / 240)), mx, baseY, alpha, side);
      // baú na frente do herói (o prêmio fica visível mesmo sentado)
      const cx = actor.x + side * 16;
      blit(ctx, 'chest', chestFrame, cx, actor.y + 6, alpha, side);
      if (chestFrame === 2) {
        // jorro de moedas em arco (analítico, sem estado)
        const burst = still ? 1 : ((age - 800) % 2400) / 2400;
        if (!still && burst > 0 && burst < 0.9) {
          for (let i = 0; i < 7; i++) {
            const d = mix(actor.seed + i * 37, 0x51ed);
            const vx = ((d % 11) - 5) * 0.7;
            const vy = -22 - (d % 9);
            const tt = clamp01(burst * 1.3) * 0.8;
            const px = cx + side * vx * tt * 2;
            const py = actor.y + 2 + vy * tt + 240 * tt * tt * 0.5;
            if (py < actor.y + 8) coin(ctx, px, py, Math.sin(now / 80 + i) > -0.3);
          }
        }
        if (!still) {
          blit(ctx, 'goldburst', effectFrame(t, actor.seed, 240), cx, actor.y + 2, alpha * 0.9, side);
          const vf = ((now - since) / 400) % 3;
          blit(ctx, 'victory', Math.floor(vf), actor.x + side * 10, actor.y - 26, alpha * 0.9, side);
        }
      }
      break;
    }
    case 'rest': {
      // braseiro do descanso: ninguém luta quando está parado
      blit(ctx, 'campfire', still ? 0 : effectFrame(t, actor.seed, 320), actor.x + side * 15, actor.y, alpha, side);
      break;
    }
  }
  ctx.globalAlpha = 1;
}

/** Projétil do herói até o monstro (bola de fogo, adaga ou feixe de luz). */
function drawProjectile(
  ctx: CanvasRenderingContext2D,
  attack: AttackStyle,
  heroX: number,
  handX: number,
  handY: number,
  mx: number,
  baseY: number,
  t: number,
  alpha: number,
  side: -1 | 1,
  seed: number,
  cycle: number,
): void {
  const targetX = mx - side * 5;
  const targetY = baseY - 9;
  const px = handX + (targetX - handX) * t;
  const arc = Math.sin(Math.PI * t) * (attack === 'dagger' ? 3 : 6);
  const py = handY + (targetY - handY) * t - arc;

  if (attack === 'light') {
    // feixe: linha de luz do punho ao alvo, com o glifo correndo por cima
    ctx.globalAlpha = alpha * (0.25 + 0.45 * t);
    ctx.fillStyle = '#bff2ff';
    const y = Math.round(handY);
    const x0 = Math.min(handX, targetX);
    const w = Math.abs(targetX - handX);
    ctx.fillRect(Math.round(x0), y, Math.round(w * t), 1);
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillRect(Math.round(x0), y + 1, Math.round(w * t), 1);
    blit(ctx, 'lightbeam', t < 0.5 ? 0 : 1, px, py + 8, alpha, side);
    return;
  }
  if (attack === 'dagger') {
    blit(ctx, 'dagger', Math.min(2, Math.floor(t * (1 + (mix(seed + cycle, 7) % 2)))), px, py + 8, alpha, side);
    return;
  }
  // bola de fogo / orbe arcano
  blit(ctx, 'fireball', t < 0.4 ? 0 : t < 0.8 ? 1 : 2, px, py + 8, alpha, side);
  // fumaça do rastro
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(Math.round(heroX + side * 10), Math.round(handY + 2), 1, 1);
}

/** Número de dano vermelho sobre o herói quando a atividade deu erro. */
function drawHeroHit(
  ctx: CanvasRenderingContext2D,
  heroX: number,
  heroY: number,
  beat: EncounterBeat,
  alpha: number,
): void {
  const value = damageRoll(-7, beat.cycle, 2).value;
  ctx.globalAlpha = alpha * beat.heroHit;
  ctx.fillStyle = '#ff5f5f';
  ctx.fillRect(Math.round(heroX - 1), Math.round(heroY - 15), 2, 5);
  ctx.fillRect(Math.round(heroX - 4), Math.round(heroY - 14), 8, 2);
  pixelText(ctx, `-${Math.max(3, value - 4)}`, Math.round(heroX + 6), Math.round(heroY - 20), '#ff8a8a');
  ctx.globalAlpha = 1;
}
