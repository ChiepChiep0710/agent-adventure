// Área externa: grama, árvores, calçada e rua; pátio/jardim nos slots sem sala.
// Na skin de fantasia o prédio é um complexo de masmorra: chão de rocha escura, matacões e
// blocos de pedra no lugar da grama, das árvores e dos canteiros; o pátio de um slot vazio vira
// uma câmara de pedra (lajes + calçamento) em vez de deck de madeira com guarda-sóis.
import type { WallStyle } from '../../art/api';
import { isFantasy } from '../../art/skin';
import { mulberry32 } from '../../../../shared/hash';
import { BUILDING_H, COL_W, CORE_COLS, CORRIDOR_Y, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, SOUTH_Y, TILE } from '../constants';
import { cellRect, slotAt, slotColumn, slotSide } from './geometry';
import type { ExteriorProp, FloorPatch, TileRect, WallItemPlacement, WallSegment } from './types';

export const EXTERIOR_WALL: WallStyle = { base: '#cfc8bd', trim: '#8a8174', pattern: 'brick', exterior: true };

/** Parede do entorno na skin de fantasia: pedra de masmorra (grande, irregular, escura). */
const FANTASY_WALL: WallStyle = { base: '#4a4641', trim: '#26231f', pattern: 'dungeon', exterior: true };
const FANTASY_WALL_DARK: WallStyle = { base: '#3b3833', trim: '#1f1d1a', pattern: 'dungeon', exterior: true };

/**
 * Muro do entorno na skin atual: na fantasia o prédio não tem fachada de tijolo — a masmorra é
 * fechada por paredes de rocha (o "fundo" um pouco mais escuro).
 */
export function exteriorWall(pattern: 'hedge' | 'treeline' | 'dungeon' = 'dungeon'): WallStyle {
  if (!isFantasy()) return EXTERIOR_WALL;
  return pattern === 'treeline' || pattern === 'dungeon' ? FANTASY_WALL_DARK : FANTASY_WALL;
}

export interface ExteriorLayout {
  /** Limites da área desenhada (tiles). */
  bounds: TileRect;
  floors: FloorPatch[];
  props: ExteriorProp[];
  /** Faixas da rua (y em px) e sentido (+1 = leste, -1 = oeste). */
  lanes: { y: number; dir: 1 | -1 }[];
  /** Linha central da rua (px), para as faixas tracejadas. */
  streetY: number;
  streetH: number;
}

/** Fechamento do corredor e pátio de um slot sem sala. */
export interface SlotShell {
  slot: number;
  rect: TileRect;
  walls: WallSegment[];
  windows: WallItemPlacement[];
  floors: FloorPatch[];
  props: ExteriorProp[];
}

export function layoutExterior(cols: number): ExteriorLayout {
  const w = cols * COL_W;
  const bounds: TileRect = { x: -EXT_WEST, y: -EXT_NORTH, w: w + EXT_WEST + EXT_EAST, h: BUILDING_H + EXT_NORTH + EXT_SOUTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0xc0de + cols);
  const fan = isFantasy();
  /** Árvore (escritório) ou matacão de rocha (masmorra) — o entorno da fantasia é pedra. */
  const treeKind = (): ExteriorProp['kind'] => (fan ? 'rock' : rng() < 0.25 ? 'pine' : 'tree');
  const shrubKind = (): ExteriorProp['kind'] => (fan ? 'rock' : 'bush');

  // entorno: gramado no escritório, rocha escura na masmorra
  floors.push({ kind: fan ? 'rock' : 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 11 });
  // calçada em volta do prédio
  const south = BUILDING_H;
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 2), w: px(bounds.w), h: px(2), seed: 12 });
  floors.push({ kind: 'street', x: px(bounds.x), y: px(south + 4), w: px(bounds.w), h: px(5), seed: 13 });
  floors.push({ kind: 'sidewalk', x: px(bounds.x), y: px(south + 9), w: px(bounds.w), h: px(2), seed: 14 });
  // caminho de pedra até a calçada, na frente da recepção
  floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 15 });
  floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 16 });

  // árvores ao norte (fileira com variação) e a oeste/leste
  for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x += 4 + Math.floor(rng() * 3)) {
    props.push({ kind: treeKind(), x: px(x) + Math.floor(rng() * 8), y: px(-3) - Math.floor(rng() * 20), seed: Math.floor(rng() * 1e9) });
    if (rng() < 0.6) props.push({ kind: shrubKind(), x: px(x + 2), y: px(-1) - 2, seed: Math.floor(rng() * 1e9) });
  }
  // bosque ao norte: fileiras irregulares cada vez mais esparsas
  for (const [row, gap] of [
    [-6, 5],
    [-10, 6],
    [-14, 8],
  ] as const) {
    for (let x = bounds.x + 2; x < bounds.x + bounds.w - 1; x += gap + Math.floor(rng() * 4)) {
      props.push({ kind: treeKind(), x: px(x) + Math.floor(rng() * 8), y: px(row) - Math.floor(rng() * 12), seed: Math.floor(rng() * 1e9) });
    }
  }
  for (const side of [-1, 1]) {
    for (const band of [0, 7, 13]) {
      const baseX = side < 0 ? -6 - band : w + 4 + band;
      for (let y = 1; y < BUILDING_H; y += 3 + Math.floor(rng() * 3)) {
        if (side < 0 && band === 0 && y >= CORRIDOR_Y - 1 && y <= south + 1) continue;
        props.push({ kind: treeKind(), x: px(baseX + Math.floor(rng() * 5)), y: px(y + 1), seed: Math.floor(rng() * 1e9) });
        if (band === 0 && rng() < 0.5) props.push({ kind: shrubKind(), x: px(side < 0 ? -2 : w + 1), y: px(y + 2), seed: Math.floor(rng() * 1e9) });
      }
    }
  }
  // cerca viva + flores ao longo da fachada sul e postes na calçada; diante de cada slot de
  // projeto, o trecho do caminho do jardim só tem cerca quando há sala ali
  for (let x = 0; x < w; x += 2) {
    const col = Math.floor(x / COL_W);
    const lx = x - col * COL_W;
    const gate = col >= CORE_COLS && (lx === 6 || lx === 8) ? slotAt(col, 'south') : undefined;
    props.push({
      kind: fan ? 'rock' : (x / 2) % 3 === 1 ? 'flowers' : 'hedge',
      x: px(x) + TILE,
      y: px(south + 1) + 10,
      seed: x * 7 + 3,
      whenRoom: gate,
    });
  }
  // postes de rua (no escritório); na masmorra a rua é ladeada por pedras soltas
  for (let x = bounds.x + 4; x < bounds.x + bounds.w; x += 10) {
    props.push({ kind: fan ? 'rock' : 'lamp', x: px(x), y: px(south + 3) + 6, seed: x });
  }
  for (const row of [13, 17, 21]) {
    for (let x = bounds.x + 3; x < bounds.x + bounds.w - 2; x += 6 + Math.floor(rng() * 5)) {
      props.push({ kind: treeKind(), x: px(x) + Math.floor(rng() * 10), y: px(south + row) + Math.floor(rng() * 10), seed: Math.floor(rng() * 1e9) });
      if (rng() < 0.3) props.push({ kind: shrubKind(), x: px(x + 3), y: px(south + row + 1), seed: Math.floor(rng() * 1e9) });
    }
  }
  props.push({ kind: fan ? 'rock' : 'bench', x: px(-4), y: px(CORRIDOR_Y + 3) + 6, seed: 1 });
  // totem com a marca na entrada principal (oeste)
  props.push({ kind: fan ? 'paving' : 'totem', x: px(-3) + 6, y: px(CORRIDOR_Y + 1), seed: 2 });

  const streetY = px(south + 4);
  const streetH = px(5);
  return {
    bounds,
    floors,
    props,
    lanes: [
      { y: streetY + Math.round(streetH * 0.36), dir: 1 },
      { y: streetY + Math.round(streetH * 0.86), dir: -1 },
    ],
    streetY,
    streetH,
  };
}

/** Parede externa + pátio de um slot vazio: deck de madeira com mesas e guarda-sóis, canteiros e caminho. */
export function slotShell(slot: number, lastColumn: boolean): SlotShell {
  const col = slotColumn(slot);
  const side = slotSide(slot);
  const rect = cellRect(col, side);
  const x0 = rect.x * TILE;
  const rng = mulberry32(0x9a7d + slot * 31);
  const walls: WallSegment[] = [];
  const windows: WallItemPlacement[] = [];
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const W = COL_W * TILE;
  const T = (n: number) => n * TILE;
  const seed = () => Math.floor(rng() * 1e9);
  const fan = isFantasy();
  /** Pátio de um slot vazio: deck de madeira no escritório, câmara de pedra na masmorra. */
  const deck = (lx: number, ly: number, w: number, h: number) => {
    floors.push({ kind: fan ? 'concrete' : 'sidewalk', x: x0 + T(lx), y: T(rect.y + ly), w: T(w), h: T(h), seed: slot + 7 });
    floors.push({ kind: fan ? 'marble' : 'wood', x: x0 + T(lx) + 4, y: T(rect.y + ly) + 4, w: T(w) - 8, h: T(h) - 8, seed: slot + 8 });
  };
  /** Enfeite do pátio: arbusto/guarda-sol no escritório, matacão na masmorra. */
  const prop = (office: ExteriorProp['kind'], lx: number, ly: number, s: number) =>
    props.push({ kind: fan ? 'rock' : office, x: x0 + T(lx), y: T(rect.y + ly) + 4, seed: s, slot });

  if (side === 'north') {
    // fachada com janelas fechando o corredor (linhas 10–11) — na fantasia, a pedra fecha o fundo
    const shellWall = exteriorWall(fan ? 'dungeon' : 'treeline');
    const fy = (CORRIDOR_Y - 2) * TILE;
    walls.push({ kind: 'face', x: x0, y: fy, w: W, style: shellWall });
    [3, 8, 13].forEach((cx, i) =>
      windows.push({ id: `shell:${slot}:janela${i}`, kind: 'window', cx: x0 + cx * TILE, baseY: CORRIDOR_Y * TILE, on: 'face', order: 0 }),
    );
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: fy, w: TILE / 2, h: 2 * TILE, style: shellWall });
    // caminho do piso até o pátio, pátio no meio e canteiros sob as janelas
    floors.push({ kind: 'sidewalk', x: x0 + T(7), y: T(rect.y), w: T(2), h: T(3), seed: slot });
    deck(3, 3, 10, 5);
    prop('parasol', 5.5, 6, seed());
    prop('parasol', 10.5, 6, seed());
    prop('bush', 3.5, 3, seed());
    prop('bush', 12.5, 3, seed());
    for (const cx of [3, 8, 13]) prop('flowers', cx, 9.5, slot * 3 + cx);
    prop('tree', 1, 3, seed());
    prop(rng() < 0.5 ? 'pine' : 'tree', 15, 3, seed());
    prop('bush', 1, 8, seed());
    prop('bush', 15, 8, seed());
  } else {
    // mureta externa fechando o corredor (linha 17) e pátio abaixo, ligado à calçada da rua
    const shellWall = exteriorWall(fan ? 'dungeon' : 'hedge');
    walls.push({ kind: 'south', x: x0, y: SOUTH_Y * TILE, w: W, style: shellWall });
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: SOUTH_Y * TILE, w: TILE / 2, h: TILE, style: shellWall });
    floors.push({ kind: 'sidewalk', x: x0 + T(7), y: T(rect.y + 1), w: T(2), h: T(rect.h - 1), seed: slot });
    // trecho entre a fachada e a calçada: só existe enquanto o slot está vazio (a cerca viva fecha)
    props.push({ kind: 'paving', x: x0 + T(7), y: T(BUILDING_H), seed: slot, slot });
    deck(3, 3.5, 10, 5);
    prop('parasol', 5.5, 6.5, seed());
    prop('parasol', 10.5, 6.5, seed());
    prop('bush', 3.5, 4, seed());
    prop('bush', 12.5, 4, seed());
    for (const cx of [3, 13]) prop('flowers', cx, 2, slot * 3 + cx);
    // bancos do pátio (na masmorra continuam sendo bancos, só que na pedra)
    props.push({ kind: 'bench', x: x0 + T(4), y: T(rect.y + 10) + 6, seed: slot, slot });
    props.push({ kind: 'bench', x: x0 + T(12), y: T(rect.y + 10) + 6, seed: slot + 1, slot });
    props.push({ kind: fan ? 'rock' : 'tree', x: x0 + T(1) + 6, y: T(rect.y + 11), seed: seed(), slot });
    props.push({ kind: fan ? 'rock' : rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(15) - 6, y: T(rect.y + 11) + 4, seed: seed(), slot });
    props.push({ kind: 'rock', x: x0 + T(14), y: T(rect.y + 2) + 4, seed: slot + 3, slot });
  }
  return { slot, rect, walls, windows, floors, props };
}
