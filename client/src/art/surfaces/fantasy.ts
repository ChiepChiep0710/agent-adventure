// Superfícies da skin de fantasia (puras): pisos de pedra/terra/madeira velha e paredes de castelo.
// Mesmo contrato dos pisos e paredes do escritório (floor.ts / walls.ts): blocos de 8x8 tiles em
// coordenadas de MUNDO (sem emendas entre blocos) e colunas de 16x32 da face da parede.
import { TILE, type FloorKind, type WallStyle } from '../api';
import { luminance, mix, parseColor, shade, type RGBA } from '../core/color';
import { PixelBuf } from '../core/pixbuf';

const CHUNK_TILES = 8;
const CHUNK_PX = CHUNK_TILES * TILE;
const WALL_FACE_H = TILE * 2;
const WALL_CAP_H = 4;
const BASEBOARD_H = 3;

function h3(a: number, b: number, c = 0, seed = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(seed | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

function noise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const r = (a: number, b: number) => h3(a, b, 0, seed) / 4294967296;
  const a = r(gx, gy);
  const b = r(gx + 1, gy);
  const c = r(gx, gy + 1);
  const d = r(gx + 1, gy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Paleta de pedra com N níveis (para escrita rápida por pixel). */
function levels(a: string, b: string, n = 8): RGBA[] {
  return Array.from({ length: n }, (_, i) => parseColor(mix(a, b, i / (n - 1))));
}

// ------------------------------------------------------------------ pisos

/** Lajes de pedra irregulares (blocos 2x1/1x1 tiles desencontrados), com musgo e rachaduras. */
function paintFlagstone(b: PixelBuf, x0: number, y0: number, seed: number, dark: string, light: string, moss: number): void {
  const tones = levels(dark, light, 10);
  const grout = parseColor(shade(dark, -0.32));
  const edgeHi = parseColor(shade(light, 0.06));
  const mossC = [parseColor('#5f7a3c'), parseColor('#6f8a46')];
  for (let py = 0; py < CHUNK_PX; py++) {
    const wy = y0 + py;
    const row = Math.floor(wy / 12);
    const iy = wy - row * 12;
    const off = (h3(row, 0, 7, seed) % 3) * 8;
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px + off;
      const slabW = 16 + (h3(row, Math.floor(wx / 24), 8, seed) % 2) * 8;
      const sx = Math.floor(wx / slabW);
      const ix = wx - sx * slabW;
      if (iy === 11 || ix === slabW - 1) {
        b.put(px, py, grout);
        continue;
      }
      const sh = h3(row, sx, 9, seed);
      if (iy === 0 || ix === 0) {
        b.put(px, py, edgeHi);
        continue;
      }
      const n = noise(wx, wy, 6, seed + (sh % 17)) * 0.55 + ((sh >>> 8) % 100) / 100 * 0.45;
      let c = tones[Math.min(tones.length - 1, Math.floor(n * tones.length))];
      const sp = h3(wx, wy, 10, seed) % 97;
      if (sp === 0) c = grout;
      else if (moss > 0 && (iy >= 9 || ix >= slabW - 3) && noise(wx, wy, 5, seed + 99) > 1 - moss) c = mossC[sp & 1];
      b.put(px, py, c);
    }
  }
}

/** Calçamento de pedras redondas (cobblestone): rua, corredor. */
function paintCobble(b: PixelBuf, x0: number, y0: number, seed: number, dark: string, light: string): void {
  // Pedras grandes (célula de 11px) com juntas finas e relevo: topo-esquerda claro, base-direita escura.
  // Vista de longe, pedras pequenas com juntas grossas viravam "chiado"; aqui o contraste fica dentro da pedra.
  const tones = levels(dark, light, 8);
  const gap = parseColor(shade(dark, -0.2));
  const CELL = 11;
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const cx = Math.floor(wx / CELL);
      const cy = Math.floor(wy / CELL);
      let d1 = 1e9;
      let d2 = 1e9;
      let id = 0;
      let ndx = 0;
      let ndy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const h = h3(cx + ox, cy + oy, 11, seed);
          const qx = (cx + ox) * CELL + 2 + (h % (CELL - 4));
          const qy = (cy + oy) * CELL + 2 + ((h >>> 8) % (CELL - 4));
          const dx = wx - qx;
          const dy = wy - qy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = h;
            ndx = dx;
            ndy = dy;
          } else if (d < d2) d2 = d;
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge < 0.9) {
        b.put(px, py, gap);
        continue;
      }
      let k = 2 + ((id >>> 16) % 3);
      if (edge < 2.2) k += ndx + ndy < 0 ? 2 : -2;
      b.put(px, py, tones[Math.max(0, Math.min(tones.length - 1, k))]);
    }
  }
}

/** Tábuas largas e escuras de taverna, com cravos de ferro nas pontas. */
function paintOldWood(b: PixelBuf, x0: number, y0: number, seed: number): void {
  /** [tom][0 normal, 1 topo, 2 veio, 3 tábua vizinha, 4 emenda]. */
  const T = ['#7a5232', '#6f4a2c', '#835a37', '#744d2f'].map((t) => [t, shade(t, 0.05), shade(t, -0.12), shade(t, -0.05), shade(t, -0.22)] as const);
  const nail = parseColor('#2b2422');
  for (let py = 0; py < CHUNK_PX; py++) {
    const wy = y0 + py;
    const row = Math.floor(wy / 6);
    const iy = wy - row * 6;
    const off = h3(row, 0, 1, seed) % 64;
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px + off;
      const plank = Math.floor(wx / 64);
      const ix = wx - plank * 64;
      const ph = h3(row, plank, 2, seed);
      const t = T[ph % T.length];
      let c: string;
      if (ix === 0 || iy === 5) c = t[4];
      else if (iy === 0) c = t[1];
      else if ((ix === 2 || ix === 61) && iy === 2) {
        b.put(px, py, nail);
        continue;
      } else if (iy === 1 + ((ph >>> 5) % 3) && (ix + (ph >>> 8)) % 19 < 8) c = t[3];
      else if (iy === 4) c = t[2];
      else c = t[0];
      b.put(px, py, parseColor(c));
    }
  }
}

/** Ladrilhos de terracota em xadrez (cozinha/taverna). */
function paintTerracotta(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const A = levels('#9c5b3b', '#b56c47', 6);
  const B = levels('#7f4a33', '#93573c', 6);
  const grout = parseColor('#4a3328');
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      if ((wx & 7) === 7 || (wy & 7) === 7) {
        b.put(px, py, grout);
        continue;
      }
      const set = ((wx >> 3) + (wy >> 3)) & 1 ? A : B;
      const n = noise(wx, wy, 4, seed + ((wx >> 3) * 7 + (wy >> 3)));
      b.put(px, py, set[Math.min(5, Math.floor(n * 6))]);
    }
  }
}

/** Ardósia azul-acinzentada em placas quadradas (banhos). */
function paintSlate(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#56606e', '#6c7684', 8);
  const grout = parseColor('#2f353e');
  const hi = parseColor('#7d8896');
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const ix = wx & 15;
      const iy = wy & 15;
      if (ix === 15 || iy === 15) b.put(px, py, grout);
      else if (ix === 0 || iy === 0) b.put(px, py, hi);
      else b.put(px, py, tones[Math.min(7, Math.floor(noise(wx, wy, 5, seed + (wx >> 4) * 13 + (wy >> 4)) * 8))]);
    }
  }
}

/** Trilha de terra batida com pedrinhas (calçadas externas). */
function paintDirt(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#8a6a46', '#a7845a', 10);
  const pebble = [parseColor('#c2b59b'), parseColor('#6d5638')];
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const sp = h3(wx, wy, 3, seed) % 53;
      if (sp < 2) {
        b.put(px, py, pebble[sp]);
        continue;
      }
      const n = noise(wx, wy, 14, seed) * 0.7 + noise(wx, wy, 4, seed + 2) * 0.3;
      b.put(px, py, tones[Math.min(9, Math.floor(n * 10))]);
    }
  }
}

/** Grama de campo: mais saturada que a do escritório, com flores silvestres e tufos. */
function paintMeadow(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#3f7a37', '#5f9c44', 10);
  const blade = parseColor('#79b552');
  const dark = parseColor('#2f5f2b');
  const flowers = ['#f4e36a', '#e86a6a', '#f5f1e6', '#a98ae0'].map(parseColor);
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const h = h3(wx, wy, 4, seed);
      if (h % 211 === 0) {
        b.put(px, py, flowers[(h >>> 9) % flowers.length]);
        continue;
      }
      if (h % 23 === 0) {
        b.put(px, py, blade);
        continue;
      }
      if (h % 29 === 0) {
        b.put(px, py, dark);
        continue;
      }
      b.put(px, py, tones[Math.min(9, Math.floor(noise(wx, wy, 20, seed + 5) * 10))]);
    }
  }
}

/** Piso de fantasia no lugar de cada tipo de piso do escritório (mesmos lugares, outra matéria). */
export function fantasyFloorChunk(kind: FloorKind, cx: number, cy: number, o: { seed: number; tint?: string }): PixelBuf {
  const b = new PixelBuf(CHUNK_PX, CHUNK_PX);
  const x0 = cx * CHUNK_PX;
  const y0 = cy * CHUNK_PX;
  switch (kind) {
    case 'marble': {
      // Salões (salas de projeto, recepção): lajes de pedra levemente tingidas pela cor da sala.
      const tint = o.tint ?? '#8a8f99';
      paintFlagstone(b, x0, y0, o.seed, mix('#6c6a66', tint, 0.12), mix('#a39e94', tint, 0.1), 0.06);
      break;
    }
    case 'carpet': {
      const tint = o.tint ?? '#7a5a8a';
      paintFlagstone(b, x0, y0, o.seed, mix('#5c5856', tint, 0.25), mix('#8e877c', tint, 0.2), 0);
      break;
    }
    case 'concrete':
      paintCobble(b, x0, y0, o.seed, '#5d5a57', '#8f8a82');
      break;
    case 'wood':
      paintOldWood(b, x0, y0, o.seed);
      break;
    case 'tile_check':
      paintTerracotta(b, x0, y0, o.seed);
      break;
    case 'tile_white':
      paintSlate(b, x0, y0, o.seed);
      break;
    case 'grass':
      paintMeadow(b, x0, y0, o.seed);
      break;
    case 'sidewalk':
      paintDirt(b, x0, y0, o.seed);
      break;
    case 'street':
      paintCobble(b, x0, y0, o.seed + 1, '#4a4743', '#76716a');
      break;
    default:
      paintFlagstone(b, x0, y0, o.seed, '#6c6a66', '#a39e94', 0.05);
  }
  return b;
}

// ------------------------------------------------------------------ paredes

/** Pedra de base da parede: paredes muito claras do escritório (creme, gelo, lavanda) viram granito
 * com só um resquício da matiz original — assim o layout do mundo não precisa saber da skin. */
const STONE_GREY = '#8d877d';

export function fantasyStoneBase(base: string): string {
  return luminance(base) > 0.75 ? mix(STONE_GREY, base, 0.16) : base;
}

export function fantasyCapColor(style: WallStyle): string {
  return mix(style.exterior ? '#3a3633' : '#2f2b2a', fantasyStoneBase(style.base), 0.12);
}

/** Pedra de castelo: blocos 8x6 desencontrados, tom por bloco, argamassa escura. */
function stoneBlocks(b: PixelBuf, base: string, fy: number, fh: number, col: number, variant: number): void {
  const mortar = shade(base, -0.3);
  for (let row = 0; row * 6 < fh; row++) {
    const y = fy + row * 6;
    const off = row % 2 ? 4 : 0;
    for (let bx = -8; bx < TILE; bx += 8) {
      const x0 = bx + off;
      const hsh = h3(col * 16 + x0, row, variant, 77);
      const tone = shade(base, [-0.06, -0.02, 0.02, 0.05, -0.04][hsh % 5]);
      for (let x = Math.max(0, x0); x < Math.min(TILE, x0 + 7); x++) {
        for (let yy = y; yy < Math.min(fy + fh, y + 5); yy++) {
          let c = tone;
          if (yy === y) c = shade(tone, 0.06);
          else if (yy === y + 4) c = shade(tone, -0.06);
          if (h3(x, yy, hsh, 5) % 37 === 0) c = shade(tone, -0.1);
          b.set(x, yy, c);
        }
      }
      if (x0 + 7 >= 0 && x0 + 7 < TILE) b.vline(x0 + 7, y, Math.min(fy + fh - 1, y + 4), mortar);
    }
    if (y + 5 < fy + fh) b.hline(0, TILE - 1, y + 5, mortar);
  }
}

/** Enxaimel (taverna): reboco claro com vigas de madeira escura. */
function timberFrame(b: PixelBuf, base: string, fy: number, fh: number, col: number): void {
  const plaster = mix('#e8dcc0', base, 0.2);
  const beam = '#4a3326';
  b.rect(0, fy, TILE, fh, plaster);
  for (let i = 0; i < 18; i++) b.set(h3(i, col, 1, 3) % TILE, fy + (h3(i, col, 2, 3) % fh), shade(plaster, -0.04));
  const mid = fy + Math.floor(fh / 2);
  b.rect(0, mid, TILE, 2, beam);
  b.hline(0, TILE - 1, mid, shade(beam, 0.12));
  if (col % 2 === 0) b.rect(0, fy, 2, fh, beam);
  // Diagonal (mão-francesa) em colunas alternadas.
  if (col % 4 === 1) for (let i = 0; i < Math.min(TILE, mid - fy); i++) b.rect(i, mid - 1 - i, 2, 1, beam);
}

/** Coluna de 16x32 da face da parede norte na skin de fantasia. */
export function fantasyWallFaceTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const base = fantasyStoneBase(style.base);
  const cap = fantasyCapColor(style);
  const pattern = style.pattern ?? 'plain';
  switch (pattern) {
    case 'glass': {
      // Vidro antigo esverdeado (continua translúcido) com treliça de chumbo em losango.
      b.clearRect(0, fy, TILE, fh);
      b.rect(0, fy, TILE, fh, 'rgba(150,190,160,0.30)');
      const iron = 'rgba(40,36,34,0.92)';
      for (let i = 0; i < fh; i++) {
        b.set(i & 15, fy + i, iron);
        b.set(15 - (i & 15), fy + i, iron);
      }
      b.vline(0, fy, fy + fh - 1, iron);
      break;
    }
    case 'wood_panel':
    case 'stripes':
      timberFrame(b, base, fy, fh, col);
      break;
    case 'tiles':
    case 'marble':
      stoneBlocks(b, mix(base, '#7a8290', 0.55), fy, fh, col, variant);
      break;
    default:
      stoneBlocks(b, base, fy, fh, col, variant);
  }
  if (pattern !== 'glass') b.hline(0, TILE - 1, fy, shade(base, -0.18));
  // Ameias/topo: pedra escura com aresta clara.
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.12));
  if (col % 2 === 0) b.vline(7, 0, WALL_CAP_H - 1, shade(cap, -0.1));
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.08));
  // Rodapé de pedra grossa.
  const trim = style.trim ?? shade(base, -0.2);
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, shade(trim, -0.1));
  b.hline(0, TILE - 1, by, shade(trim, 0.05));
  return b;
}

/** Tile de 16x16 da parede sul (mureta de pedra). */
export function fantasySouthWallTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const cap = fantasyCapColor(style);
  const capH = 6;
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.12));
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.06));
  const face = shade(fantasyStoneBase(style.base), -0.08);
  b.rect(0, capH, TILE, TILE - capH, face);
  stoneBlocks(b, face, capH, TILE - capH, col, 3);
  return b;
}
