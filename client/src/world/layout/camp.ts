// Layout de um acampamento de aventureiros (skin de fantasia) no lugar da sala de projeto.
//
// Contrato IGUAL ao de `layoutProjectRoom`: mesmo retângulo de 16x12 tiles, mesma porta
// (DOOR_X/DOOR_W), mesmos tipos de lugar ('desk' com deskId/rank/side, 'stool', 'nook', 'stand',
// 'switch', 'whiteboard') e mesma área caminhável — o corredor, o A* e a simulação não percebem
// a diferença. O que muda é o cenário: nada de paredes nem porcelanato; um campo de grama na
// borda da mata, com fogueira central, bancadas de artesão (os 6 lugares de trabalho), barracas,
// quadro de missões, sacos de dormir, caixotes e uma trilha de terra batida até a porta.
//
//   linhas 0–1  borda da mata (mata densa; nas salas ao sul, com a passagem da porta)
//   linhas 2–10 piso do campo (interior 14x9: colunas 1–14)
//   linha 11    cerca viva baixa (salas ao norte: com a porta para o corredor)
//
// A semente sorteia o espelhamento, a cor das lonas (a partir do acento do tema), a árvore da
// borda e o arbusto — cada projeto tem o seu acampamento.
import { FURNITURE, type Dir, type FurnitureKind, type RoomTheme, type WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { DOOR_W, DOOR_X, TILE } from '../constants';
import { AreaBuilder, type SpotOpts } from './builder';
import { slotRect, slotSide } from './geometry';
import type { AreaLayout, SpotDef, SpotKind } from './types';
import type { RoomInput } from './room';

const TENT_COLORS = ['red', 'blue', 'green', 'gold', 'violet', 'teal'] as const;
const TREES = ['pine', 'oak'] as const;
const BUSHES = ['fern', 'flower'] as const;
const BLANKETS = ['red', 'blue', 'green', 'gold'] as const;

/** Variações do acampamento sorteadas pela semente (exportado para testes). */
export interface CampVariant {
  /** Campo espelhado (a fogueira e as barracas trocam de lado). */
  mirror: boolean;
  /** Cor da lona das barracas, tirada do acento do tema. */
  tent: string;
  /** A barraca secundária usa a cor vizinha da roda (o campo nunca é monocromático). */
  tent2: string;
  tree: string;
  bush: string;
  blanket: string;
}

/** Cor de lona mais próxima do acento do tema (o acampamento segue a identidade da sala). */
function accentTent(accent: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(accent.trim());
  if (!m) return 'red';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (b > r && b > g) return g > r + 24 ? 'teal' : 'blue';
  if (r > g && r > b) return b > g + 16 ? 'violet' : g > 110 ? 'gold' : 'red';
  if (g >= r && g >= b) return r > 150 && g < 190 ? 'gold' : 'green';
  return 'red';
}

/** Sorteio das variações do acampamento (determinístico pela semente). */
export function campVariant(seed: number, theme: RoomTheme): CampVariant {
  const rng = mulberry32((seed ^ 0xca3f) >>> 0);
  const mirror = rng() < 0.5;
  const tent = accentTent(theme.accent);
  const i = TENT_COLORS.indexOf(tent as (typeof TENT_COLORS)[number]);
  const tent2 = TENT_COLORS[(i + 2) % TENT_COLORS.length];
  return {
    mirror,
    tent,
    tent2,
    tree: TREES[Math.floor(rng() * TREES.length) % TREES.length],
    bush: BUSHES[Math.floor(rng() * BUSHES.length) % BUSHES.length],
    blanket: BLANKETS[Math.floor(rng() * BLANKETS.length) % BLANKETS.length],
  };
}

/** Variação de uma cor hex (clareia/escurece) — mesma regra do layout das salas. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function layoutProjectCamp(room: RoomInput, theme: RoomTheme): AreaLayout {
  const rect = slotRect(room.slot);
  const side = slotSide(room.slot);
  const rng = mulberry32(room.seed ^ 0xca3f);
  const v = campVariant(room.seed, theme);
  const b = new AreaBuilder(room.id, 'room', rect);
  const area = b.area;
  area.side = side;
  const north = side === 'north';
  const door = { lx: DOOR_X, w: DOOR_W };

  // ---- "paredes": a mata na face norte e a cerca viva no limite sul (sem pedra de castelo).
  // O tom sai do tema, então cada acampamento tem uma mata levemente diferente.
  const treeline: WallStyle = { base: shade(theme.carpet, -0.1), trim: shade(theme.carpet, -0.3), pattern: 'treeline' };
  const hedge: WallStyle = { base: shade(theme.carpet, 0.05), trim: shade(theme.carpet, -0.2), pattern: 'hedge' };

  // ---- espelhamento (coordenadas locais pensadas com a fogueira à esquerda)
  const mir = v.mirror;
  const fx = (lx: number, w = 1) => (mir ? 16 - lx - w : lx);
  const fdir = (d: Dir): Dir => (mir && (d === 'left' || d === 'right') ? (d === 'left' ? 'right' : 'left') : d);
  const fdx = (dx: number | undefined) => (dx === undefined ? undefined : mir ? -dx : dx);
  const furn = (kind: FurnitureKind, lx: number, ly: number, variant?: string, o: { dx?: number; dy?: number; order?: number; seat?: string } = {}) =>
    b.furn(kind, fx(lx, FURNITURE[kind].footprint.w), ly, variant, { ...o, dx: fdx(o.dx) });
  const spot = (kind: SpotKind, lx: number, ly: number, dir: Dir, o: SpotOpts = {}): SpotDef => b.spot(kind, fx(lx), ly, fdir(dir), { ...o, dx: fdx(o.dx) });
  /** Assento; `dirVariant` = a variante do móvel é a própria direção. */
  const seat = (kind: SpotKind, fk: FurnitureKind, lx: number, ly: number, dir: Dir, variant?: string, o: SpotOpts & { order?: number } = {}, dirVariant = false): SpotDef =>
    b.seat(kind, fk, fx(lx), ly, fdir(dir), dirVariant ? fdir(dir) : variant, { ...o, dx: fdx(o.dx) });
  const wallItem = (kind: FurnitureKind, cx: number, variant?: string, o: { ly?: number; on?: 'face' | 'south'; order?: number } = {}) =>
    b.wall(kind, mir ? 16 - cx : cx, variant, o);

  // ---- piso: campo de grama (sem tom de porcelanato) e trilha de terra batida
  b.floor('grass', 0, 0, 16, 12, room.seed);
  // clareira em volta da fogueira (leste-oeste, linhas 4–5)
  b.floor('sidewalk', 2, 4, 8, 2, room.seed + 1);
  // trilha da porta até a clareira
  b.floor('sidewalk', DOOR_X, north ? 5 : 2, DOOR_W, north ? 6 : 3, room.seed + 2);
  // terra batida na frente das bancadas e das barracas
  b.floor('sidewalk', 1, 7, 7, 1, room.seed + 3);

  // ---- borda da mata (face norte) e cerca viva (limite sul / mureta)
  if (north) {
    b.face(0.5, 15, treeline);
    b.south(0.5, 15, 11, hedge, [door]);
  } else {
    b.face(0.5, 15, treeline, [door]);
    b.south(0.5, 15, 11, { ...hedge, exterior: true });
    // batente na passagem da porta (a mata mostra o vão)
    b.wall('door_frame', DOOR_X + DOOR_W / 2, undefined, { order: 0.05 });
  }
  b.cap(0, 0, 0.5, 12, hedge);
  b.cap(15.5, 0, 0.5, 12, hedge);

  // ---- caminhabilidade (idêntica à da sala: o acampamento ocupa o mesmo lote)
  b.walk(1, 2, 14, 9);
  area.door = north ? { x: rect.x + DOOR_X, y: rect.y + 11, w: DOOR_W, h: 1 } : { x: rect.x + DOOR_X, y: rect.y, w: DOOR_W, h: 2 };
  b.walk(area.door.x - rect.x, area.door.y - rect.y, area.door.w, area.door.h);

  // ---- placa com o nome do projeto (tabuleta pendurada na mata)
  const signCx = north ? 8 : 10.5;
  area.signId = wallItem('sign', signCx, undefined, { order: 0.95 });

  // ---- fogueira central (2x2), com a clareira em volta
  furn('campfire', 4, 4, undefined, { order: 0.42 });

  // ---- bancada de artesão: os 6 lugares de trabalho viram 3 + 3 em volta do fogo
  // (mesmos ranks/lados/deskId da ilha de mesas da sala; quem senta continua "na mesa")
  const deskV = theme.deskVariant;
  const chairV = theme.chairVariant;
  const ranks = [2, 0, 4];
  for (let i = 0; i < 3; i++) {
    const lx = 2 + i * 2;
    const back = furn('camp_table_back', lx, 3, deskV, { order: 0.35 + i * 0.05, seat: `N${i}` });
    const front = furn('camp_table', lx, 6, deskV, { order: 0.4 + i * 0.05, seat: `S${i}` });
    seat('desk', 'stump', lx, 2, 'down', chairV, { dx: TILE / 2, deskId: back, rank: ranks[i] + 1, side: 'N', order: 0.55 + i * 0.03 });
    seat('desk', 'stump', lx, 7, 'up', chairV, { dx: TILE / 2, deskId: front, rank: ranks[i], side: 'S', order: 0.6 + i * 0.03 });
  }

  // ---- quadro de missões (no lugar do quadro branco: os agentes leem as missões aqui)
  furn('quest_board', 9, 2, undefined, { order: 0.3 });
  spot('whiteboard', 9, 3, 'up', { dx: TILE / 2, dy: 2 });

  // ---- barracas (2): uma de frente para o campo, outra mais ao fundo
  furn('tent', 11, 2, v.tent, { order: 0.2 });
  furn('tent', 11, 6, v.tent2, { order: 0.22 });

  // ---- sacos de dormir (no lugar dos puffs: lugar extra de trabalho/descanso)
  for (let i = 0; i < 3; i++) seat('nook', 'bedroll', 11 + i, 9, 'up', BLANKETS[(i + 1) % BLANKETS.length], { order: 0.6 + i * 0.02 });
  // troncos junto à fogueira (banquetas)
  seat('stool', 'log_seat', 2, 4, 'right', undefined, { order: 0.62 });
  seat('stool', 'log_seat', 2, 5, 'right', undefined, { order: 0.63 });
  // saco de dormir extra do canto (varia com a semente)
  seat('nook', 'bedroll', 14, 10, 'left', v.blanket, { order: 0.64 });

  // ---- suprimentos
  furn('crate', 9, 8, undefined, { order: 0.34 });
  furn('barrel', 9, 9, undefined, { order: 0.36 });
  if (Math.floor(rng() * 2) === 1) furn('crate', 10, 8, undefined, { order: 0.35 });
  else furn('barrel', 10, 8, undefined, { order: 0.35 });

  // ---- árvores e arbustos nas bordas (a mata "entra" no campo)
  furn('camp_tree', 14, 2, v.tree, { order: 0.18 });
  furn('camp_bush', 14, 3, v.bush, { order: 0.19 });
  furn('camp_tree', 1, 9, v.tree === 'pine' ? 'oak' : 'pine', { order: 0.2 });
  furn('camp_bush', 14, 7, 'fern', { order: 0.21 });

  // ---- poste com lanterna (é onde se acende/apaga o acampamento) e o "interruptor"
  furn('lantern_post', 13, 10, undefined, { order: 0.24 });
  spot('switch', 12, 10, 'right', { dy: -2 });

  // ---- pontos em pé (subagentes sem lugar sentado trabalham aqui; também servem de conversa)
  spot('stand', 8, 3, 'left');
  spot('stand', 10, 6, 'right', { dx: -2 });
  spot('stand', 3, 10, 'up', { dy: -2 });

  // ---- sombreamento quando a luz está apagada (salas ao norte: a cerca sul fica clara)
  const p = { x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE };
  area.shade = north ? { x: p.x, y: p.y, w: p.w, h: p.h - TILE } : { x: p.x, y: p.y, w: p.w, h: p.h };
  return b.build();
}
