// Layout de uma câmara-arena da masmorra (skin de fantasia) no lugar da sala de projeto.
//
// Contrato IGUAL ao de `layoutProjectRoom`: mesmo retângulo de 16x12 tiles, mesma porta
// (DOOR_X/DOOR_W), mesmos tipos de lugar ('desk' com deskId/rank/side, 'stool', 'nook', 'stand',
// 'switch', 'whiteboard') e mesma área caminhável — corredor, A* e simulação não percebem a
// diferença. O que muda é o cenário: uma câmara subterrânea de pedra escura, com a ARENA (poço
// de areia) no centro, mesas de guerra em volta (os 6 lugares de trabalho), estandartes, tochas,
// grade levadiça, armações de armas, manequins, bonecos de treino, jaula e baú no canto.
//
//   linhas 0–1  parede norte de pedra (nas salas ao sul, com a passagem da porta)
//   linhas 2–10 piso da câmara (interior 14x9: colunas 1–14)
//   linha 11    parapeito baixo de pedra (nas salas ao norte, com a porta para o corredor)
//
// O poço da arena (areia) é o miolo LIVRE: fica caminhável, sem móvel nenhum, porque é ali que
// os personagens (e os encontros que o render desenha nos pés deles) duelam. As mesas de guerra
// ficam na borda de pedra do poço, então quem senta continua de frente para a luta.
//
// A semente sorteia o espelhamento, as cores dos estandartes (a partir do acento do tema) e o
// canto do tesouro (baú e jaula trocam de lado) — cada projeto tem a sua câmara.
import { FURNITURE, type Dir, type FurnitureKind, type RoomTheme, type WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { DOOR_W, DOOR_X, TILE } from '../constants';
import { AreaBuilder, type SpotOpts } from './builder';
import { biomeWall, dungeonBiome, pitShape, pitTiles, type DungeonBiome, type PitShape } from './dungeon-biome';
import { slotRect, slotSide } from './geometry';
import type { AreaLayout, SpotDef, SpotKind } from './types';
import type { RoomInput } from './room';

const BANNERS = ['red', 'blue', 'green', 'gold', 'violet', 'teal'] as const;

/** Variações da arena sorteadas pela semente (exportado para testes). */
export interface ArenaVariant {
  /** Câmara espelhada (mesas de guerra, armação e canto do tesouro trocam de lado). */
  mirror: boolean;
  /** Cor do estandarte principal, tirada do acento do tema. */
  banner: string;
  /** O segundo estandarte usa a cor vizinha da roda (a câmara nunca é monocromática). */
  banner2: string;
  /** O baú de tesouro fica no canto leste (senão, a jaula fica). */
  chestEast: boolean;
  /** Quantos braseiros a borda do poço ganha (1 ou 2). */
  braziers: number;
  /** Clima da câmara (piso, parede e cenário). */
  biome: DungeonBiome;
  /** Formato do poço da arena. */
  pit: PitShape;
}

/** Cor de estandarte mais próxima do acento do tema (a arena segue a identidade da sala). */
function accentBanner(accent: string): string {
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

/** Sorteio das variações da arena (determinístico pela semente). */
export function arenaVariant(seed: number, theme: RoomTheme): ArenaVariant {
  const rng = mulberry32((seed ^ 0xa3e4) >>> 0);
  const mirror = rng() < 0.5;
  const banner = accentBanner(theme.accent);
  const i = BANNERS.indexOf(banner as (typeof BANNERS)[number]);
  return {
    mirror,
    banner,
    banner2: BANNERS[(i + 2) % BANNERS.length],
    chestEast: rng() < 0.5,
    braziers: rng() < 0.55 ? 2 : 1,
    biome: dungeonBiome(seed, 1),
    pit: pitShape(seed, 1),
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

export function layoutProjectArena(room: RoomInput, theme: RoomTheme): AreaLayout {
  const rect = slotRect(room.slot);
  const side = slotSide(room.slot);
  const rng = mulberry32(room.seed ^ 0xa3e4);
  const v = arenaVariant(room.seed, theme);
  const b = new AreaBuilder(room.id, 'room', rect);
  const area = b.area;
  area.side = side;
  const north = side === 'north';
  const door = { lx: DOOR_X, w: DOOR_W };

  // ---- "paredes": pedra escura da masmorra na face norte e parapeito baixo de pedra ao sul.
  // O tom sai do tema (cada câmara é uma parte diferente da masmorra).
  const biome = v.biome;
  const wall: WallStyle = biomeWall(biome, 0.05);
  const parapet: WallStyle = biomeWall(biome, 0.55);

  // ---- espelhamento (coordenadas locais pensadas com o canto do tesouro a leste)
  const mir = v.mirror;
  const fx = (lx: number, w = 1) => (mir ? 16 - lx - w : lx);
  const fdir = (d: Dir): Dir => (mir && (d === 'left' || d === 'right') ? (d === 'left' ? 'right' : 'left') : d);
  const fdx = (dx: number | undefined) => (dx === undefined ? undefined : mir ? -dx : dx);
  const furn = (kind: FurnitureKind, lx: number, ly: number, variant?: string, o: { dx?: number; dy?: number; order?: number; seat?: string } = {}) =>
    b.furn(kind, fx(lx, FURNITURE[kind].footprint.w), ly, variant, { ...o, dx: fdx(o.dx) });
  const spot = (kind: SpotKind, lx: number, ly: number, dir: Dir, o: SpotOpts = {}): SpotDef => b.spot(kind, fx(lx), ly, fdir(dir), { ...o, dx: fdx(o.dx) });
  /** Assento; `dirVariant` = a variante do móvel é a própria direção. */
  const seat = (kind: SpotKind, fk: FurnitureKind, lx: number, ly: number, dir: Dir, variant?: string, o: SpotOpts & { order?: number; noFurniture?: boolean } = {}, dirVariant = false): SpotDef =>
    b.seat(kind, fk, fx(lx), ly, fdir(dir), dirVariant ? fdir(dir) : variant, { ...o, dx: fdx(o.dx) });
  const wallItem = (kind: FurnitureKind, cx: number, variant?: string, o: { ly?: number; on?: 'face' | 'south'; order?: number } = {}) =>
    b.wall(kind, mir ? 16 - cx : cx, variant, o);

  // ---- piso: lajes de pedra da câmara, borda de pedra e areia do poço da arena.
  // (o "anel" do poço é desenhado pelo piso: calçamento em volta da areia — sem kind novo para isso)
  // O bioma decide a matéria: piso da câmara, anel em volta do poço e o material do próprio poço.
  b.floor(biome.base, 0, 0, 16, 12, room.seed, theme.carpet);
  b.floor(biome.ring, 3, 3, 10, 5, room.seed + 1);
  // O formato do poço varia por semente (quadrado, octogonal, cruz, ferradura); o miolo de 4x3
  // do centro fica sempre dentro do poço, que é onde os duelos acontecem.
  for (const [dx, dy] of pitTiles(v.pit)) b.floor(biome.pit, 4 + dx, 4 + dy, 1, 1, room.seed + 2 + dx * 3 + dy * 7);
  // entrada de pedra da porta até a borda do poço
  b.floor(biome.ring, DOOR_X, north ? 8 : 2, DOOR_W, north ? 3 : 1, room.seed + 3);

  // ---- parede norte (com a passagem da porta nas salas ao sul) e parapeito sul
  if (north) {
    b.face(0.5, 15, wall);
    b.south(0.5, 15, 11, parapet, [door]);
  } else {
    b.face(0.5, 15, wall, [door]);
    b.south(0.5, 15, 11, { ...parapet, exterior: true });
    // batente na passagem da porta (a face da parede mostra o vão)
    b.wall('door_frame', DOOR_X + DOOR_W / 2, undefined, { order: 0.05 });
  }
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);

  // ---- caminhabilidade (idêntica à da sala: a arena ocupa o mesmo lote)
  b.walk(1, 2, 14, 9);
  area.door = north ? { x: rect.x + DOOR_X, y: rect.y + 11, w: DOOR_W, h: 1 } : { x: rect.x + DOOR_X, y: rect.y, w: DOOR_W, h: 2 };
  b.walk(area.door.x - rect.x, area.door.y - rect.y, area.door.w, area.door.h);

  // ---- itens da parede norte: grade levadiça, corrente, tochas, placa e quadro de missões
  area.signId = wallItem('sign', 8.5, undefined, { order: 0.95 });
  wallItem('portcullis', 3, undefined, { order: 0.25 });
  wallItem('chain', 5.5, undefined, { order: 0.2 });
  wallItem('wall_torch', 6.5, undefined, { order: 0.3 });
  wallItem('wall_torch', 10.5, undefined, { order: 0.31 });
  wallItem('whiteboard', 12.5, undefined, { order: 0.6 });
  // estandartes nas pontas, nas cores do acento do tema
  wallItem('banner', 1.2, v.banner, { order: 0.15 });
  wallItem('banner', 14.9, v.banner2, { order: 0.16 });
  // marcas do bioma na parede: teias, correntes, tochas extras (2 posições livres)
  const wallSpots = [4.3, 13.6];
  biome.wallProps.slice(0, wallSpots.length).forEach((k, i) => wallItem(k, wallSpots[i], undefined, { order: 0.18 + i * 0.01 }));

  // ---- estações de trabalho BAIXAS: os 6 lugares de trabalho (3 ao norte, 3 ao sul do poço).
  // Nada de mesa alta: cada dupla usa uma peça do ofício (esteira de runas, bigorna, caldeirão,
  // roda de amolar) e a pessoa senta numa almofada no chão. Assim a câmara continua com os 6
  // lugares (mesmo deskId/rank/side) sem tapar a luta no poço.
  const deskV = theme.deskVariant;
  const chairV = theme.chairVariant;
  const ranks = [2, 0, 4];
  const works = ['rune_mat', 'anvil_block', 'alchemy_pot', 'grindstone'] as const;
  for (let i = 0; i < 3; i++) {
    const lx = 2 + i * 2;
    const back = furn(works[(i + 1) % works.length], lx, 2, undefined, { order: 0.2 + i * 0.02, seat: `N${i}` });
    const front = furn(works[i % works.length], lx, 7, undefined, { order: 0.3 + i * 0.02, seat: `S${i}` });
    seat('desk', 'cushion', lx, 3, 'down', chairV, { deskId: back, rank: ranks[i] + 1, side: 'N', order: 0.55 + i * 0.03 });
    seat('desk', 'cushion', lx, 8, 'up', chairV, { deskId: front, rank: ranks[i], side: 'S', order: 0.6 + i * 0.03 });
  }

  // ---- quadro de missões: os agentes leem as missões no quadro da parede
  spot('whiteboard', 8, 3, 'up', { dx: TILE / 2 });

  // ---- braseiros na borda do poço (iluminam a luta; bloqueiam, como os móveis altos)
  furn('brazier', 2, 5, undefined, { order: 0.44 });
  if (v.braziers > 1) furn('brazier', 13, 5, undefined, { order: 0.45 });

  // ---- arquibancada: banco de pedra encostado na parede norte (2 lugares) + 2 almofadas nos cantos.
  // Tudo longe do miolo: o poço e a volta das mesas de guerra ficam livres para a luta.
  const bench = furn('bench_stone', 11, 2, undefined, { order: 0.22 });
  for (let i = 0; i < 2; i++) seat('stool', 'bench_stone', 11 + i, 2, 'down', undefined, { noFurniture: true, furnitureId: bench, order: 0.62 + i * 0.02 });
  seat('stool', 'cushion', 14, 2, 'left', chairV, { order: 0.64 });
  seat('stool', 'cushion', 1, 2, 'right', chairV, { order: 0.65 });

  // ---- armaria do duelo (sempre) + o cenário do bioma nas bordas
  furn('weapon_rack', 1, 10, undefined, { order: 0.26 });
  furn('armor_stand', 9, 10, undefined, { order: 0.28 });
  // o cenário do bioma ocupa 3 tiles da borda de baixo (10, 11 e 12 da linha 10); peça de 2 tiles
  // entra primeiro, ocupando 10 e 11, e a próxima peça de 1 tile cai em 12
  const decoX = [10, 11, 12];
  let slot = 0;
  for (const kind of biome.props) {
    if (slot >= decoX.length) break;
    const w = FURNITURE[kind].footprint.w;
    if (w === 2) {
      if (slot !== 0) continue;
      furn(kind, 10, 10, undefined, { order: 0.3 });
      slot = 2;
      continue;
    }
    furn(kind, decoX[slot], 10, undefined, { order: 0.3 + slot * 0.01 });
    slot++;
  }

  // ---- canto do tesouro (baú e jaula trocam de lado conforme a semente)
  if (v.chestEast) {
    furn('chest', 13, 10, undefined, { order: 0.33 });
    furn('cage', 14, 10, undefined, { order: 0.32 });
  } else {
    furn('cage', 13, 10, undefined, { order: 0.32 });
    furn('chest', 14, 10, undefined, { order: 0.33 });
  }

  // ---- braseiro da entrada (é onde se acende/apaga a câmara) e o "interruptor"
  furn('brazier', 1, 9, undefined, { order: 0.24 });
  spot('switch', 9, 9, 'left', { dy: -2 });

  // ---- pontos em pé (subagentes sem lugar sentado trabalham aqui; também servem de conversa)
  spot('stand', 1, 2, 'down');
  spot('stand', 9, 3, 'up', { dy: -2 });
  spot('stand', 14, 9, 'left', { dx: 2 });

  // ---- sombreamento quando a luz está apagada (salas ao norte: a mureta sul fica clara)
  const p = { x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE };
  area.shade = north ? { x: p.x, y: p.y, w: p.w, h: p.h - TILE } : { x: p.x, y: p.y, w: p.w, h: p.h };
  return b.build();
}
