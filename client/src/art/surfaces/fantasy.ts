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

/** Índice preso dentro da paleta. */
function at(tones: readonly RGBA[], i: number): RGBA {
  return tones[i < 0 ? 0 : i >= tones.length ? tones.length - 1 : i];
}

/**
 * Varre um reticulado de célula `cell` em coordenadas de MUNDO, cobrindo o bloco e uma margem.
 * Detalhes sorteados por célula caem sempre nas mesmas coordenadas nos blocos vizinhos, então
 * nada aparece cortado na emenda de um bloco para o outro (ao contrário de sortear em px do bloco).
 */
function worldCells(x0: number, y0: number, cell: number, margin: number, fn: (gx: number, gy: number) => void): void {
  const gx0 = Math.floor((x0 - margin) / cell);
  const gx1 = Math.floor((x0 + CHUNK_PX + margin) / cell);
  const gy0 = Math.floor((y0 - margin) / cell);
  const gy1 = Math.floor((y0 + CHUNK_PX + margin) / cell);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) fn(gx, gy);
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

/** Cinza vulcânica compacta (bioma da forja): pó grafite, grumos macios, fendas de calor e brasas apagadas. */
function paintAsh(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#232120', '#4a4643', 12);
  const clump = parseColor('#565350');
  const clumpHi = parseColor('#635f5a');
  const soot = parseColor('#191817');
  const grain = parseColor('#6a665f');
  const crack = parseColor('#111010');
  const burnt = parseColor('#3b2b1f');
  const embers = [parseColor('#7a3d15'), parseColor('#5c2b0f')];
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const n = noise(wx, wy, 21, seed) * 0.6 + noise(wx, wy, 6, seed + 3) * 0.4;
      let c = at(tones, Math.floor(n * tones.length));
      // Grumos que o vento empilhou: manchas macias, um tom acima da cinza.
      const lump = noise(wx, wy, 13, seed + 7);
      if (lump > 0.76) c = h3(wx, wy, 11, seed) & 1 ? clump : clumpHi;
      else if (lump > 0.72) c = clumpHi;
      const sp = h3(wx, wy, 4, seed) % 157;
      if (sp === 0) c = grain;
      else if (sp === 1) c = soot;
      // Fendas de calor: cristas finas e compridas do ruído (contínuas entre blocos).
      const ridge = Math.abs(noise(wx, wy, 47, seed + 13) - 0.5);
      if (ridge < 0.016) c = crack;
      else if (ridge < 0.03 || (ridge < 0.042 && h3(wx, wy, 8, seed) % 3 === 0)) c = burnt;
      b.put(px, py, c);
    }
  }
  // Brasas: duas por bloco, bem apagadas — só uma lasca de calor sobrou.
  for (let i = 0; i < 2; i++) {
    const x = h3(i, 3, 73, seed) % CHUNK_PX;
    const y = h3(i, 4, 74, seed) % CHUNK_PX;
    b.put(x, y, embers[0]);
    if (i === 1) b.put(x + 1, y, embers[1]);
  }
}

/** Gelo rachado (caverna de gelo): placas azul-esbranquiçadas, aresta de cima na luz e brilhos frios. */
function paintIce(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#b6d1e3', '#f0f9ff', 10);
  const seam = parseColor('#8dafc6');
  const seamDk = parseColor('#789bb4');
  const crack = parseColor('#a5c3d7');
  const frost = parseColor('#dceef9');
  const glint = parseColor('#ffffff');
  // Placas tipo Voronoi (célula grande): gelo congelou em blocos, não em lajes com rejunte.
  const CELL = 20;
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
          const h = h3(cx + ox, cy + oy, 201, seed);
          const qx = (cx + ox) * CELL + 3 + (h % (CELL - 6));
          const qy = (cy + oy) * CELL + 3 + ((h >>> 8) % (CELL - 6));
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
      if (edge < 0.85) {
        // Fratura fina entre as placas.
        b.put(px, py, h3(wx, wy, 202, seed) & 1 ? seam : seamDk);
        continue;
      }
      const n = noise(wx, wy, 7, seed + ((id >>> 9) % 29)) * 0.55 + ((id >>> 17) % 100) / 100 * 0.45;
      let k = 3 + Math.floor(n * 5);
      // Relevo: aresta virada para a luz (norte/oeste) quase branca, base na sombra azulada.
      if (edge < 1.8) k += ndy < 0 || ndx < 0 ? 4 : -3;
      else if (edge < 3.2) k += ndy < 0 ? 2 : -1;
      b.put(px, py, at(tones, k));
    }
  }
  // Rachaduras internas: cristas de ruído esticadas (atravessam as placas, sem emenda).
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const ridge = Math.abs(noise(wx * 1.4, wy * 0.7, 29, seed + 23) - 0.5);
      if (ridge < 0.013) b.put(px, py, crack);
    }
  }
  // Brilhos: um pixel solto aqui e ali e duas estrelinhas de 4 pontas.
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      if (h3(x0 + px, y0 + py, 203, seed) % 1901 === 0) b.put(px, py, glint);
    }
  }
  for (let i = 0; i < 2; i++) {
    const x = 4 + (h3(i, 5, 211, seed) % (CHUNK_PX - 8));
    const y = 4 + (h3(i, 6, 212, seed) % (CHUNK_PX - 8));
    b.put(x, y, glint);
    b.put(x - 1, y, frost);
    b.put(x + 1, y, frost);
    b.put(x, y - 1, frost);
    b.put(x, y + 1, frost);
  }
}

/** Água parada e funda (cisterna): azul-petróleo, argolas de ondulação e uma faixa de reflexo. */
function paintWater(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#173742', '#2c5b69', 12);
  const ripple = parseColor('#316a78');
  const rippleHi = parseColor('#4b8896');
  const glint = parseColor('#6ba6ae');
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      // Duas escalas: manchas de profundidade + ondulação fina e esticada na horizontal.
      const n = noise(wx, wy, 34, seed) * 0.55 + noise(wx * 0.6, wy * 1.5, 8, seed + 2) * 0.45;
      const k = Math.floor(n * tones.length);
      let c = at(tones, k);
      // Faixa de reflexo: filetes horizontais largos, mais fortes perto do meio do bloco.
      // Clareia dois tons do próprio líquido (não uma cor chapada: nada de faixa sólida).
      const band = noise(wx * 0.22, wy * 2.6, 6, seed + 9);
      const bandY = Math.abs((((wy % CHUNK_PX) + CHUNK_PX) % CHUNK_PX) - CHUNK_PX / 2);
      const mask = bandY < 26 ? 1 - bandY / 26 : 0;
      const t = band + mask * 0.26;
      if (t > 0.78) c = at(tones, k + 4);
      else if (t > 0.7) c = at(tones, k + 2);
      b.put(px, py, c);
    }
  }
  // Ondulações: anéis concêntricos em coordenadas de mundo (nada de rejunte/reticulado).
  worldCells(x0, y0, 41, 22, (gx, gy) => {
    const h = h3(gx, gy, 91, seed);
    if (h % 7 > 3) return;
    const cx = gx * 41 + 6 + (h % 29);
    const cy = gy * 41 + 6 + ((h >>> 8) % 29);
    const r0 = 4 + ((h >>> 16) % 6);
    const reach = r0 + 3;
    for (let y = Math.floor(cy - reach); y <= cy + reach; y++) {
      for (let x = Math.floor(cx - reach); x <= cx + reach; x++) {
        const dx = x - cx;
        const dy = (y - cy) * 1.3; // anel achatado pela perspectiva
        const d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - r0) < 0.75) b.put(x - x0, y - y0, rippleHi);
        else if (d > 1 && Math.abs(d - r0 * 0.56) < 0.55) b.put(x - x0, y - y0, ripple);
      }
    }
  });
  // Reflexos pontuais da luz distante.
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      if (h3(x0 + px, y0 + py, 94, seed) % 1201 === 0) b.put(px, py, glint);
    }
  }
}

/** Terra úmida da gruta: barro marrom-esverdeado, moitas de musgo, seixos e poças escuras. */
function paintMossFloor(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const dirt = levels('#453d2c', '#6b5f43', 10);
  const mossTones = levels('#37502a', '#75924a', 7);
  const mossEdge = parseColor('#2b3f22');
  const mossTip = parseColor('#8aa855');
  const damp = parseColor('#332f26');
  const dampLo = parseColor('#2c2921');
  const pebbles = [parseColor('#9d947b'), parseColor('#aca38d'), parseColor('#585141')];
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const n = noise(wx, wy, 17, seed) * 0.62 + noise(wx, wy, 4, seed + 6) * 0.38;
      let c = at(dirt, Math.floor(n * dirt.length));
      // Musgo: mancha grande decide onde pega, ruído médio dá o volume.
      const m = noise(wx, wy, 27, seed + 11) * 0.72 + noise(wx, wy, 8, seed + 12) * 0.28;
      if (m > 0.58) c = at(mossTones, Math.floor((m - 0.58) * 18));
      else if (m > 0.545) c = mossEdge;
      if (h3(wx, wy, 9, seed) % 61 === 0) c = mossTip;
      if (noise(wx, wy, 29, seed + 21) > 0.79) c = h3(wx, wy, 12, seed) % 3 === 0 ? dampLo : damp;
      b.put(px, py, c);
    }
  }
  // Seixos: pedras de 2 px com sombra de contato.
  worldCells(x0, y0, 11, 3, (gx, gy) => {
    const h = h3(gx, gy, 121, seed);
    const x = gx * 11 + (h % 9);
    const y = gy * 11 + ((h >>> 8) % 9);
    if (h % 5 === 0) {
      b.put(x - x0, y - y0, pebbles[0]);
      b.put(x + 1 - x0, y - y0, pebbles[1]);
      b.put(x - x0, y + 1 - y0, pebbles[2]);
    } else if (h % 5 === 1) b.put(x - x0, y - y0, pebbles[2]);
  });
}

/** Cascalho de ossos (cripta): pó creme, lascas compridas de osso, alvéolos escuros. */
function paintBoneFloor(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const tones = levels('#b3a68a', '#e9dfc6', 10);
  const dust = parseColor('#f4ecd8');
  const grit = parseColor('#8b8069');
  const socket = parseColor('#4e4839');
  const socketRim = parseColor('#6f6754');
  const fragHi = parseColor('#fbf5e6');
  const fragLo = parseColor('#d6c9aa');
  const fragSh = parseColor('#8e8368');
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const n = noise(wx, wy, 15, seed) * 0.6 + noise(wx, wy, 4, seed + 6) * 0.4;
      let c = at(tones, Math.floor(n * tones.length));
      const sp = h3(wx, wy, 5, seed) % 97;
      if (sp === 0) c = dust;
      else if (sp === 1) c = grit;
      b.put(px, py, c);
    }
  }
  // Lascas de osso: retas curtas (2–5 px), horizontais ou inclinadas, com 1 px de sombra.
  worldCells(x0, y0, 10, 6, (gx, gy) => {
    const h = h3(gx, gy, 111, seed);
    if (h % 2 !== 0) return;
    const len = 2 + (h % 4);
    const x = gx * 10 + (h >>> 8) % 10;
    const y = gy * 10 + (h >>> 16) % 10;
    const slope = (h >>> 21) % 3;
    for (let k = 0; k < len; k++) {
      const fx = x + k;
      const fy = y + (slope === 1 ? Math.floor(k / 2) : slope === 2 ? -Math.floor(k / 2) : 0);
      b.put(fx - x0, fy - y0, k === 0 ? fragHi : fragLo);
      b.put(fx - x0, fy + 1 - y0, fragSh);
    }
  });
  // Alvéolos: covas escuras de onde saiu a medula.
  worldCells(x0, y0, 37, 3, (gx, gy) => {
    const h = h3(gx, gy, 112, seed);
    if (h % 4 !== 0) return;
    const x = gx * 37 + 4 + (h % 26);
    const y = gy * 37 + 4 + ((h >>> 9) % 26);
    b.put(x - x0, y - y0, socketRim);
    b.put(x + 1 - x0, y - y0, socket);
    b.put(x - x0, y + 1 - y0, socket);
    b.put(x + 1 - x0, y + 1 - y0, socket);
  });
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
    // --- biomas da masmorra
    case 'ash':
      paintAsh(b, x0, y0, o.seed);
      break;
    case 'ice':
      paintIce(b, x0, y0, o.seed);
      break;
    case 'water':
      paintWater(b, x0, y0, o.seed);
      break;
    case 'moss':
      paintMossFloor(b, x0, y0, o.seed);
      break;
    case 'bone':
      paintBoneFloor(b, x0, y0, o.seed);
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
  // Biomas: rocha da gruta (escura), neve-gelo socada (claríssima) e pedra queimada da forja.
  if (style.pattern === 'cave') return mix('#221f1c', fantasyStoneBase(style.base), 0.14);
  if (style.pattern === 'ice') return mix('#e2f1fb', fantasyStoneBase(style.base), 0.2);
  if (style.pattern === 'forge') return mix('#2a2320', fantasyStoneBase(style.base), 0.16);
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

// ------------------------------------------------------------------ biomas da masmorra (paredes)

/**
 * Rocha natural da caverna: massas arredondadas (Voronoi grande) com frestas escuras, sem fiadas
 * nem argamassa. O eixo X é coordenada de MUNDO, então as pedras continuam de uma coluna a outra.
 */
function caveRockMass(b: PixelBuf, wx0: number, fy: number, fh: number, style: WallStyle, salt: number): void {
  const dark = mix('#2b2723', fantasyStoneBase(style.base), 0.22);
  const tones = levels(shade(dark, -0.08), shade(dark, 0.26), 12);
  const crevice = parseColor(shade(dark, -0.5));
  const CELL = 13;
  for (let y = fy; y < fy + fh; y++) {
    for (let x = 0; x < TILE; x++) {
      const wx = wx0 + x;
      const cx = Math.floor(wx / CELL);
      const cy = Math.floor(y / CELL);
      let d1 = 1e9;
      let d2 = 1e9;
      let id = 0;
      let ndx = 0;
      let ndy = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const h = h3(cx + ox, cy + oy, 221 + salt, 17);
          const qx = (cx + ox) * CELL + 2 + (h % (CELL - 4));
          const qy = (cy + oy) * CELL + 2 + ((h >>> 8) % (CELL - 4));
          const dx = wx - qx;
          const dy = y - qy;
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
        // Fresta funda entre as pedras (é o que substitui a argamassa).
        b.put(x, y, crevice);
        continue;
      }
      const n = noise(wx, y, 3, 231 + salt) * 0.5 + ((id >>> 12) % 100) / 100 * 0.5;
      let k = 2 + Math.floor(n * 7);
      if (edge < 2) k += ndy < 0 ? 4 : -3;
      else if (edge < 3.4) k += ndx + ndy < 0 ? 2 : -1;
      b.put(x, y, at(tones, k));
    }
  }
  // Umidade escorrida: manchas verdes-escuras onde a água pinga do teto.
  for (let i = 0; i < 3; i++) {
    const x = h3(wx0 + i, i, 233 + salt, 19) % TILE;
    const y = fy + 1 + (h3(wx0 + i, i + 1, 234 + salt, 19) % Math.max(1, fh - 5));
    const len = 3 + (h3(wx0 + i, i + 2, 235 + salt, 19) % 3);
    for (let k = 0; k < len; k++) {
      b.set(x + (k & 1), y + k, k === 0 ? 'rgba(74,96,64,0.55)' : 'rgba(56,76,52,0.38)');
    }
  }
}

/** Face da parede de caverna: rocha viva + tampa escura com estalactites curtas. */
function caveWallTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const cap = fantasyCapColor(style);
  const dark = mix('#2b2723', fantasyStoneBase(style.base), 0.22);
  caveRockMass(b, col * TILE, fy, fh, style, variant % 7);
  // Tampa: pedra da abóbada, fosca, com lascas soltas.
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.18));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 0, 241, 5);
    if (h % 3 === 0) b.set(x, 1, shade(cap, 0.1));
    if (h % 8 === 0) b.set(x, 2, shade(cap, -0.14));
  }
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.2));
  // Estalactites: pontas de 1–2 px penduradas na beira da tampa.
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 1, 242, 5);
    if (h % 9 === 0) {
      b.set(x, fy, shade(cap, 0.22));
      b.set(x, fy + 1, shade(cap, 0.08));
    } else if (h % 23 === 0) b.set(x, fy, shade(cap, 0.16));
  }
  // Rodapé: rocha gasta pela água, com limo nas juntas.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, shade(dark, -0.24));
  b.hline(0, TILE - 1, by, shade(dark, -0.02));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, shade(dark, -0.44));
  for (let x = 0; x < TILE; x++) if (h3(col * TILE + x, 1, 243, 5) % 5 === 0) b.set(x, by + 1, DUNGEON_MOSS[0]);
  return b;
}

/** Mureta sul da caverna: rocha baixa arredondada com tampa de pedra. */
function caveSouthTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const cap = fantasyCapColor(style);
  const capH = 6;
  caveRockMass(b, col * TILE, capH, TILE - capH, style, 2);
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.18));
  for (let x = 0; x < TILE; x++) if (h3(col * TILE + x, 0, 244, 5) % 3 === 0) b.set(x, 1, shade(cap, 0.1));
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.2));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 1, 245, 5);
    if (h % 11 === 0) b.set(x, capH, shade(cap, 0.16));
  }
  return b;
}

/** Blocos de gelo translúcido: veios internos, arestas iluminadas e pingos de geada. */
function iceWallMass(b: PixelBuf, wx0: number, fy: number, fh: number, style: WallStyle, salt: number): void {
  const ice = mix('#a9d2e7', fantasyStoneBase(style.base), 0.16);
  const tones = levels(shade(ice, -0.18), shade(ice, 0.24), 10);
  const seam = parseColor(shade(ice, -0.3));
  const hi = parseColor(mix('#f4fcff', ice, 0.12));
  const crackHi = parseColor(mix('#eaf8ff', ice, 0.2));
  const crackLo = parseColor(shade(ice, -0.12));
  const ROW_H = 9;
  const BW = 15;
  for (let y = fy; y < fy + fh; y++) {
    const row = Math.floor((y - fy) / ROW_H);
    const rowY = fy + row * ROW_H;
    const iy = y - rowY;
    const off = (row % 2) * 7;
    for (let x = 0; x < TILE; x++) {
      const wx = wx0 + x + off;
      const bx = Math.floor(wx / BW);
      const ix = wx - bx * BW;
      const hsh = h3(bx, row, 251 + salt, 23);
      if (ix === BW - 1 || (iy === ROW_H - 1 && rowY + ROW_H - 1 < fy + fh)) {
        b.put(x, y, seam);
        continue;
      }
      // Aresta de cima e de dentro: o gelo devolve a luz da câmara.
      if (iy === 0) {
        b.put(x, y, hi);
        continue;
      }
      if (ix === 0) {
        b.set(x, y, shade(ice, 0.1));
        continue;
      }
      let k = 3 + Math.floor(noise(wx, y, 5, 253 + salt) * 4) + (hsh % 3) - 1;
      if (iy >= ROW_H - 3) k -= 2; // base do bloco na sombra azulada
      b.put(x, y, at(tones, k));
    }
  }
  // Rachaduras internas: linha clara com sombra azul do lado (o gelo quebrou por dentro).
  for (let i = 0; i < 4; i++) {
    const x = 2 + (h3(wx0, i, 254 + salt, 23) % (TILE - 4));
    const y = fy + 2 + (h3(wx0, i + 5, 255 + salt, 23) % Math.max(1, fh - 4));
    const len = 3 + (h3(wx0, i + 9, 256 + salt, 23) % 3);
    let cx = x;
    for (let k = 0; k < len; k++) {
      b.put(cx, y + k, crackHi);
      b.put(cx + 1, y + k, crackLo);
      cx += k % 2 === 0 ? 1 : 0;
    }
  }
  // Geada escorrendo: pingos curtos e claros descendo da aresta.
  for (let i = 0; i < 3; i++) {
    const x = 1 + (h3(wx0, i, 257 + salt, 29) % (TILE - 2));
    const y = fy + 1 + (h3(wx0, i + 3, 258 + salt, 29) % Math.max(1, fh - 5));
    b.put(x, y, hi);
    b.set(x, y + 1, 'rgba(244,252,255,0.6)');
  }
}

/** Face da parede de gelo: blocos azuis translúcidos + tampa de neve-gelo socada. */
function iceWallTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const cap = fantasyCapColor(style);
  const ice = mix('#a9d2e7', fantasyStoneBase(style.base), 0.16);
  iceWallMass(b, col * TILE, fy, fh, style, variant % 7);
  // Tampa: neve-geleira socada, branca, com cristais.
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, mix('#ffffff', cap, 0.2));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 0, 261, 7);
    if (h % 2 === 0) b.set(x, 1, mix('#ffffff', cap, 0.32));
    if (h % 5 === 0) b.set(x, 2, shade(cap, -0.08));
    if (h % 7 === 0) b.set(x, 3, mix('#ffffff', cap, 0.45));
  }
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.12));
  // Geada pendurada na beira da tampa.
  for (let i = 0; i < 2; i++) {
    const x = 2 + (h3(col, i, 262, 7) % (TILE - 4));
    const len = 2 + (h3(col, i, 263, 7) % 3);
    for (let k = 0; k < len; k++) b.set(x, fy + k, k === 0 ? '#f7fdff' : 'rgba(244,252,255,0.55)');
  }
  // Rodapé: gelo mais fundo, com aresta clara por cima.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, shade(ice, -0.24));
  b.hline(0, TILE - 1, by, mix('#eaf7ff', ice, 0.35));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, shade(ice, -0.42));
  return b;
}

/** Mureta sul do gelo: parapeito de blocos azuis com tampa de neve. */
function iceSouthTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const cap = fantasyCapColor(style);
  const capH = 6;
  iceWallMass(b, col * TILE, capH, TILE - capH, style, 4);
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, mix('#ffffff', cap, 0.24));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 0, 264, 7);
    if (h % 2 === 0) b.set(x, 1, mix('#ffffff', cap, 0.3));
    if (h % 4 === 0) b.set(x, 2, mix('#ffffff', cap, 0.4));
  }
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.14));
  return b;
}

/** Tijolo escuro de forja, preso por cravos de ferro, com veios de lava nas juntas. */
function forgeBricks(b: PixelBuf, wx0: number, fy: number, fh: number, style: WallStyle, salt: number): void {
  const iron = mix('#5a4137', fantasyStoneBase(style.base), 0.15);
  const tones = [shade(iron, -0.05), shade(iron, 0.01), shade(iron, 0.07), shade(iron, -0.11)] as const;
  const mortar = shade(iron, -0.3);
  const rivet = '#1d1b1a';
  const RH = 5;
  const BW = 8;
  for (let row = 0; fy + row * RH < fy + fh; row++) {
    const rowY = fy + row * RH;
    const off = (row % 2) * 4;
    for (let y = rowY; y < Math.min(rowY + RH, fy + fh); y++) {
      const iy = y - rowY;
      const fromBottom = fy + fh - 1 - y;
      for (let x = 0; x < TILE; x++) {
        const wx = wx0 + x + off;
        const bx = Math.floor(wx / BW);
        const ix = wx - bx * BW;
        const hsh = h3(bx, row, 271 + salt, 29);
        if (ix === BW - 1 || iy === RH - 1) {
          b.set(x, y, mortar);
          continue;
        }
        let c = tones[hsh % tones.length];
        if (iy === 0) c = shade(c, 0.07);
        else if (iy === RH - 2) c = shade(c, -0.08);
        if (h3(wx, y, 273 + salt, 31) % 23 === 0) c = shade(c, -0.1);
        // Fuligem: o fogo comeu o tijolo por baixo.
        if (fromBottom < 6) c = mix(c, '#171310', 0.32 - fromBottom * 0.045);
        if (ix === 1 && iy === 1 && hsh % 5 === 0) c = rivet;
        b.set(x, y, c);
      }
    }
    // Veios de lava nas juntas horizontais: poucos segmentos acesos, com halo quente.
    const jy = Math.min(rowY + RH - 1, fy + fh - 1);
    if (rowY + RH - 1 < fy + fh) {
      for (let x = 0; x < TILE; x++) {
        const wx = wx0 + x + off;
        if (h3(Math.floor(wx / 5), row, 272 + salt, 29) % 5 !== 0) continue;
        b.set(x, jy, '#e8802c');
        b.set(x, jy - 1, 'rgba(232,120,40,0.3)');
        b.set(x, jy + 1, 'rgba(232,120,40,0.34)');
      }
    }
    // Juntas verticais: brasa funda, só em poucos pontos.
    for (let x = 0; x < TILE; x++) {
      const wx = wx0 + x + off;
      const bx = Math.floor(wx / BW);
      if (wx - bx * BW !== BW - 1) continue;
      for (let y = rowY + 1; y < Math.min(rowY + RH - 1, fy + fh); y++) {
        if (h3(bx, row * 9 + (y - rowY), 274 + salt, 29) % 8 !== 0) continue;
        b.set(x, y, '#b85018');
        b.set(x - 1, y, 'rgba(184,80,24,0.3)');
        b.set(x + 1, y, 'rgba(184,80,24,0.3)');
      }
    }
  }
}

/** Face da parede da forja: tijolo de ferro e lava nas juntas + tampa de pedra queimada. */
function forgeWallTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const cap = fantasyCapColor(style);
  const iron = mix('#4a352c', fantasyStoneBase(style.base), 0.18);
  forgeBricks(b, col * TILE, fy, fh, style, variant % 7);
  // Tampa: pedra chamuscada com cinza e uma ou outra brasa viva.
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.16));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 0, 281, 9);
    if (h % 3 === 0) b.set(x, 1, shade(cap, 0.1));
    if (h % 6 === 0) b.set(x, 2, shade(cap, -0.14));
  }
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.2));
  for (let i = 0; i < 2; i++) {
    const x = h3(col, i, 282, 9) % TILE;
    b.set(x, 1 + (h3(col, i, 283, 9) % 2), i ? '#8a3a12' : '#c25a1c');
  }
  // Rodapé: pedra chamuscada, quase preta, com uma fresta ainda quente.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, shade(iron, -0.42));
  b.hline(0, TILE - 1, by, shade(iron, -0.2));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, '#171310');
  for (let x = 0; x < TILE; x++) if (h3(col * TILE + x, 2, 284, 9) % 11 === 0) b.set(x, by + 1, '#8f3c14');
  return b;
}

/** Mureta sul da forja: parapeito chamuscado com veios de lava. */
function forgeSouthTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const cap = fantasyCapColor(style);
  const capH = 6;
  forgeBricks(b, col * TILE, capH, TILE - capH, style, 5);
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.16));
  for (let x = 0; x < TILE; x++) {
    const h = h3(col * TILE + x, 0, 285, 9);
    if (h % 3 === 0) b.set(x, 1, shade(cap, 0.1));
    if (h % 5 === 0) b.set(x, 2, shade(cap, -0.12));
  }
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.2));
  return b;
}

/** Coluna de 16x32 da face da parede norte na skin de fantasia. */
export function fantasyWallFaceTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const pattern = style.pattern ?? 'plain';
  // Acampamento/core ao ar livre: nada de pedra de castelo — mata densa ou cerca viva.
  if (pattern === 'treeline') return treelineTile(col);
  if (pattern === 'hedge') return hedgeTile(col, WALL_FACE_H);
  if (pattern === 'dungeon') return dungeonWallTile(style, variant, col);
  // Biomas da masmorra: rocha viva, gelo e tijolo de forja.
  if (pattern === 'cave') return caveWallTile(style, variant, col);
  if (pattern === 'ice') return iceWallTile(style, variant, col);
  if (pattern === 'forge') return forgeWallTile(style, variant, col);
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
  if (style.pattern === 'cave') return caveSouthTile(style, col);
  if (style.pattern === 'ice') return iceSouthTile(style, col);
  if (style.pattern === 'forge') return forgeSouthTile(style, col);
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
