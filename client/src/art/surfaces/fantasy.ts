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

/** Areia da arena: areia batida e clara, com rastros de fricção, pegadas e pedrinhas (nada de sangue). */
function paintArenaSand(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#9d8762', '#cdb894', 10);
  const pale = parseColor('#ddcaa6');
  const dark = parseColor('#7d6a4c');
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const n = noise(wx, wy, 17, seed) * 0.7 + noise(wx, wy, 5, seed + 4) * 0.3;
      b.put(px, py, tones[Math.min(9, Math.floor(n * 10))]);
    }
  }
  // Rastros: arcos curtos de areia revolvida (quem arrasta os pés na arena).
  for (let i = 0; i < 7; i++) {
    const cx = h3(i, 1, 31, seed) % CHUNK_PX;
    const cy = h3(i, 2, 32, seed) % CHUNK_PX;
    const len = 5 + (h3(i, 3, 33, seed) % 7);
    for (let k = 0; k < len; k++) {
      const x = (cx + k) % CHUNK_PX;
      const y = (cy + Math.round(Math.sin((k / len) * Math.PI) * 2)) % CHUNK_PX;
      b.put(x, y, k % 3 === 0 ? pale : dark);
    }
  }
  // Pegadas em pares, alternando o pé.
  for (let i = 0; i < 10; i++) {
    const fx = h3(i, 4, 34, seed) % (CHUNK_PX - 4);
    const fy = 2 + (h3(i, 5, 35, seed) % (CHUNK_PX - 5));
    const dx = i % 2 ? 3 : 1;
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1], [dx + 1, -2], [dx + 2, -2], [dx + 1, -1], [dx + 2, -1]] as const) {
      b.put((fx + ox) % CHUNK_PX, (fy + oy + CHUNK_PX) % CHUNK_PX, dark);
    }
  }
  // Pedrinhas e grãos mais claros.
  for (let i = 0; i < 46; i++) {
    const x = h3(i, 6, 36, seed) % CHUNK_PX;
    const y = h3(i, 7, 37, seed) % CHUNK_PX;
    b.put(x, y, i % 2 ? pale : parseColor('#8b7757'));
  }
}

/** Chão de rocha escura do entorno da masmorra: lajeada irregular, cascalho e rachaduras. */
function paintRockyGround(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#3b3936', '#5c5852', 9);
  const crack = parseColor('#26241f');
  const dust = parseColor('#6e6a62');
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      // Lajes grandes (célula de 22px) com junta escura entre elas.
      const cell = 22;
      const ix = wx % cell;
      const iy = wy % cell;
      const slab = h3(Math.floor(wx / cell), Math.floor(wy / cell), 41, seed);
      if (ix === cell - 1 || iy === cell - 1) {
        b.put(px, py, crack);
        continue;
      }
      const n = noise(wx, wy, 9, seed + (slab % 13)) * 0.6 + ((slab >>> 8) % 100) / 100 * 0.4;
      let c = tones[Math.min(tones.length - 1, Math.floor(n * tones.length))];
      // Rachaduras finas que atravessam as lajes.
      if (noise(wx, wy, 26, seed + 77) > 0.82 && noise(wx, wy, 3, seed + 78) > 0.5) c = crack;
      else if (h3(wx, wy, 42, seed) % 131 === 0) c = dust;
      b.put(px, py, c);
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
    case 'sand':
      // Arena da masmorra: areia batida, riscada pelos pés de quem duela ali.
      paintArenaSand(b, x0, y0, o.seed);
      break;
    case 'rock':
      // Entorno da masmorra: rocha escura, sem grama nenhuma.
      paintRockyGround(b, x0, y0, o.seed);
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
  // Cerca viva/mata do acampamento: a "tampa" é a copa iluminada, não pedra.
  if (style.pattern === 'hedge') return mix('#3f6b38', fantasyStoneBase(style.base), 0.12);
  if (style.pattern === 'treeline') return mix('#24401f', fantasyStoneBase(style.base), 0.1);
  // Masmorra: tampa de pedra quase preta (o teto da câmara some no escuro).
  if (style.pattern === 'dungeon') return mix('#1c1a18', fantasyStoneBase(style.base), 0.16);
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

// ------------------------------------------------------------------ mata e cerca viva (acampamento)

/** Verdes do acampamento (mata densa, folhagem e sub-bosque). */
const WILD = {
  leafLt: '#6faa53',
  leaf: '#4f8a44',
  leafDk: '#356334',
  pine: '#2b4f31',
  deep: '#152418',
  deep2: '#27422a',
  bark: '#5a4130',
  barkDk: '#3d2c1f',
} as const;

/**
 * Face da "parede" norte de um acampamento: sem parede nenhuma — a borda de uma floresta densa,
 * com troncos no escuro, copa em camadas (mais clara em cima, onde bate a luz) e sub-bosque na base.
 * A tampa de 4 px é a copa iluminada, o que faz o campo "fechar" sem muro.
 */
function treelineTile(col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const wx0 = col * TILE;
  // Fundo: mata funda com profundidade (ruído em duas escalas).
  for (let y = 0; y < WALL_FACE_H; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = noise(wx0 + x, y, 11, 71) * 0.7 + noise(wx0 + x, y, 3, 73) * 0.3;
      b.set(x, y, mix(WILD.deep, WILD.deep2, n));
    }
  }
  // Troncos: dois por coluna, com uma leve inclinação sorteada (sem emenda dura entre colunas).
  for (const tx of [3, 11]) {
    const lean = (h3(col, tx, 3, 9) % 3) - 1;
    for (let y = 7; y < WALL_FACE_H; y++) {
      const x = tx + Math.round(lean * ((y - 7) / 22));
      if (x < 0 || x > TILE - 2) continue;
      b.rect(x, y, 2, 1, y % 6 === 0 ? WILD.barkDk : WILD.bark);
      b.set(x, y, y % 5 === 0 ? WILD.barkDk : WILD.bark);
    }
  }
  // Copa: manchas de folhagem em três tons, mais claras no alto.
  for (let y = 0; y < WALL_FACE_H - 4; y++) {
    const top = 1 - y / WALL_FACE_H;
    for (let x = 0; x < TILE; x++) {
      const n = noise(wx0 + x, y, 5, 23) * 0.62 + noise(wx0 + x, y, 2, 29) * 0.38;
      if (n > 0.7 - top * 0.16) b.set(x, y, n > 0.8 ? WILD.leafLt : WILD.leafDk);
      else if (n > 0.58 - top * 0.12) b.set(x, y, WILD.pine);
    }
  }
  // Sub-bosque (rodapé): capim e samambaias escuras.
  for (let y = WALL_FACE_H - 4; y < WALL_FACE_H; y++) b.hline(0, TILE - 1, y, y === WALL_FACE_H - 4 ? '#2a3a24' : '#1b2718');
  for (let i = 0; i < 14; i++) {
    const x = h3(col, i, 5, 3) % TILE;
    const y = WALL_FACE_H - 6 + (h3(col, i, 6, 3) % 5);
    b.set(x, y, i % 3 ? WILD.leafDk : WILD.leaf);
    b.set(x, y - 1, WILD.leafLt);
  }
  // Tampa: a copa vista de cima, iluminada.
  b.rect(0, 0, TILE, WALL_CAP_H, '#20351f');
  b.hline(0, TILE - 1, 0, '#3d5c33');
  for (let x = 0; x < TILE; x++) if (h3(col * TILE + x, 0, 1, 4) % 3 === 0) b.set(x, 1, WILD.leafLt);
  b.hline(0, TILE - 1, WALL_CAP_H - 1, '#162512');
  return b;
}

/** Cerca viva aparada (muro sul do acampamento/core ao ar livre): folhagem densa e topo iluminado. */
function hedgeTile(col: number, h: number): PixelBuf {
  const b = new PixelBuf(TILE, h);
  const wx0 = col * TILE;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = noise(wx0 + x, y, 6, 31) * 0.7 + noise(wx0 + x, y, 3, 37) * 0.3;
      const lit = Math.max(0, 1 - y / (h * 0.8)) * 0.14;
      const c = n + lit;
      b.set(x, y, c > 0.74 ? WILD.leafLt : c > 0.58 ? WILD.leaf : c > 0.42 ? WILD.leafDk : '#284a26');
    }
  }
  // Ramos e folhinhas soltas (textura de cerca viva).
  for (let i = 0; i < 10; i++) {
    const x = h3(col, i, 7, 11) % TILE;
    const y = 4 + (h3(col, i, 8, 11) % (h - 6));
    b.set(x, y, WILD.barkDk);
  }
  for (let i = 0; i < 4; i++) {
    const x = h3(col, i, 9, 13) % TILE;
    const y = 3 + (h3(col, i, 10, 13) % (h - 8));
    b.set(x, y, i % 2 ? '#f2e08a' : '#e8e2d0');
  }
  // Topo aparado e iluminado; base na sombra.
  b.hline(0, TILE - 1, 0, '#7ab057');
  b.hline(0, TILE - 1, 1, WILD.leafLt);
  for (let x = 0; x < TILE; x++) if (h3(col * TILE + x, 1, 2, 6) % 3 === 0) b.set(x, 2, WILD.leaf);
  b.hline(0, TILE - 1, h - 1, '#1d331a');
  b.hline(0, TILE - 1, h - 2, '#24401f');
  return b;
}

/** Borda de mata baixa (muro sul de um campo quando a mata fecha o fundo). */
function treelineSouthTile(col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const wx0 = col * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = noise(wx0 + x, y, 5, 79) * 0.65 + noise(wx0 + x, y, 2, 83) * 0.35;
      b.set(x, y, n > 0.72 ? WILD.leafLt : n > 0.56 ? WILD.leafDk : mix(WILD.deep, WILD.pine, n));
    }
  }
  // Troncos baixos saindo da mata.
  for (const tx of [2, 10]) {
    for (let y = 3; y < TILE; y++) b.set(tx + (h3(col, tx, 4, 8) % 2), y, y % 5 === 0 ? WILD.barkDk : WILD.bark);
  }
  b.hline(0, TILE - 1, 0, '#4f7a3c');
  b.hline(0, TILE - 1, 1, '#3d5c33');
  b.hline(0, TILE - 1, TILE - 1, '#111c10');
  return b;
}

// ------------------------------------------------------------------ masmorra

/** Musgo e liquen das juntas (masmorra úmida). */
const DUNGEON_MOSS = ['#3f4d2c', '#4e5d34'] as const;

/**
 * Alvenaria da masmorra: blocos GRANDES e irregulares (6–9 px de altura, 8–13 de largura),
 * em fiadas desencontradas, com argamassa escura, musgo nas juntas de baixo e rachaduras.
 * Trabalha em coordenadas de MUNDO (wx0 = x0 do tile), então as fiadas continuam de uma coluna
 * para a outra sem emenda.
 */
function dungeonBlocks(b: PixelBuf, wx0: number, fy: number, fh: number, base: string, salt: number): void {
  const mortar = shade(base, -0.46);
  const tones = [shade(base, -0.1), shade(base, -0.04), shade(base, 0.02), shade(base, 0.06), shade(base, -0.16)];
  b.rect(0, fy, TILE, fh, shade(base, -0.4));
  let y = fy;
  let row = 0;
  while (y < fy + fh) {
    const bh = Math.max(3, Math.min(fy + fh - y, 6 + (h3(wx0 >> 4, row, 51 + salt, 7) % 4)));
    const off = h3(wx0 >> 4, row, 52 + salt, 7) % 14;
    let bx = -off;
    let k = 0;
    while (bx < TILE) {
      const bw = 8 + (h3((wx0 >> 4) * 31 + k, row, 53 + salt, 9) % 6);
      const hsh = h3((wx0 >> 4) + k * 17, row * 13, 54 + salt, 11);
      const tone = tones[hsh % tones.length];
      const x0 = Math.max(0, bx);
      const x1 = Math.min(TILE, bx + bw - 1);
      for (let x = x0; x < x1; x++) {
        for (let yy = y; yy < y + bh - 1; yy++) {
          let c = tone;
          if (yy === y) c = shade(tone, 0.09);
          else if (yy === y + bh - 2) c = shade(tone, -0.11);
          const sp = h3(wx0 + x, yy, hsh, 3) % 31;
          if (sp === 0) c = shade(tone, -0.14);
          else if (sp === 1) c = shade(tone, 0.05);
          b.set(x, yy, c);
        }
      }
      // Rachadura: uma por bloco, descendo torta do topo até a junta.
      if (hsh % 11 === 0) {
        let cx = x0 + 2 + (hsh % Math.max(1, x1 - x0 - 3));
        for (let yy = y + 1; yy < y + bh - 1; yy++) {
          b.set(Math.min(TILE - 1, Math.max(0, cx)), yy, mortar);
          cx += h3(wx0 + cx, yy, hsh, 5) % 3 === 0 ? 1 : -1;
        }
      }
      // Musgo no pé da parede e nas quinas que apanham umidade.
      if (y + bh > fy + fh - 9 && hsh % 5 < 2) {
        const mx = x0 + (hsh % Math.max(1, x1 - x0));
        for (let i = 0; i < 3; i++) b.set(Math.min(TILE - 1, mx + i), y + bh - 2 - (i % 2), DUNGEON_MOSS[i % 2]);
      }
      bx += bw;
      k++;
    }
    if (y + bh - 1 < fy + fh) b.hline(0, TILE - 1, y + bh - 1, mortar);
    y += bh;
    row++;
  }
  // Umidade: manchas escuras e um ou outro brilho de poça.
  for (let i = 0; i < 9; i++) {
    const x = h3(wx0 + i, i, 55, salt) % TILE;
    const yy = fy + (h3(wx0 + i, i + 1, 56, salt) % fh);
    b.set(x, yy, i % 3 === 0 ? 'rgba(90,120,130,0.22)' : shade(base, -0.24));
  }
}

/** Face da parede da masmorra: alvenaria escura + tampa de pedra com entulho. */
function dungeonWallTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const base = fantasyStoneBase(style.base);
  dungeonBlocks(b, col * TILE, fy, fh, base, variant % 7);
  // Tampa: pedra escura com entulho (lajes soltas e cascalho no topo do muro).
  const cap = mix('#1e1c1a', base, 0.18);
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.16));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 0, 61, 5);
    if (h % 4 === 0) b.set(x, 1, shade(cap, 0.1));
    if (h % 9 === 0) b.set(x, 2, shade(cap, -0.12));
  }
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.16));
  // Rodapé: pedra gasta, com aresta iluminada e musgo entre as juntas.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, shade(base, -0.24));
  b.hline(0, TILE - 1, by, shade(base, -0.06));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, shade(base, -0.4));
  for (let x = 0; x < TILE; x++) if (h3(col * TILE + x, 1, 62, 5) % 7 === 0) b.set(x, by + 1, DUNGEON_MOSS[0]);
  return b;
}

/** Mureta sul da masmorra: parapeito baixo de pedra, com musgo no pé. */
function dungeonSouthTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const base = fantasyStoneBase(style.base);
  const cap = mix('#1e1c1a', base, 0.2);
  const capH = 6;
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.16));
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.14));
  dungeonBlocks(b, col * TILE, capH, TILE - capH, shade(base, -0.08), 3);
  return b;
}

/** Coluna de 16x32 da face da parede norte na skin de fantasia. */
export function fantasyWallFaceTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const pattern = style.pattern ?? 'plain';
  // Acampamento/core ao ar livre: nada de pedra de castelo — mata densa ou cerca viva.
  if (pattern === 'treeline') return treelineTile(col);
  if (pattern === 'hedge') return hedgeTile(col, WALL_FACE_H);
  if (pattern === 'dungeon') return dungeonWallTile(style, variant, col);
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const base = fantasyStoneBase(style.base);
  const cap = fantasyCapColor(style);
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
  // Acampamento: o muro sul baixo é cerca viva (mata fechada quando é o limite do campo).
  if (style.pattern === 'hedge') return hedgeTile(col, TILE);
  if (style.pattern === 'treeline') return treelineSouthTile(col);
  if (style.pattern === 'dungeon') return dungeonSouthTile(style, col);
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
