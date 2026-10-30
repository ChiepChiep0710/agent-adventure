// Móveis da skin de fantasia (RPG clássico): substituem os móveis de escritório quando `?skin=fantasy`
// está ativo. Mesmos footprints, âncoras e divisão base/front dos originais — colisões, assentos,
// profundidade e o desenho de quem senta continuam iguais. Kinds não listados aqui caem no escritório.
// Materiais: carvalho escuro, ferro forjado, pedra, pergaminho, cera e magia (ciano/esverdeado).
import type { FurnitureKind } from '../api';
import { ramp, shade, type Ramp } from '../core/color';
import { floorSheet, rectAt, wallSheet, type BufFurniture } from '../core/sprite';
import type { PixelBuf } from '../core/pixbuf';
import { contact, frontFace, pick, pot, rngOf, topFace, underRect, woodGrain } from './kit';

const F = {
  oak: ramp('#6e4a2c', 0.07),
  oakDark: ramp('#4c331f', 0.07),
  oldWood: ramp('#8c6742', 0.07),
  iron: ramp('#5f6673', 0.06),
  ironDark: ramp('#363b46', 0.06),
  stone: ramp('#9a988f', 0.05),
  parch: '#e7d7ae',
  parchDark: '#c3ad7e',
  wax: '#efe4cd',
  flame: '#ffb648',
  flameHot: '#fff3c0',
  magic: '#7fe0d0',
  poison: '#6fd06a',
  blood: '#a8352f',
  gold: '#e0b34c',
  leather: '#4a3526',
} as const;

/** Mata da mesa (topo e arestas) por variante — todas de madeira, só variam o tom. */
function woodMats(variant: string | undefined): { top: Ramp; edge: Ramp; legs: Ramp } {
  if (variant === 'white') return { top: ramp('#b79b74', 0.06), edge: ramp('#93795a', 0.06), legs: F.oakDark };
  if (variant === 'dark') return { top: ramp('#5a3d26', 0.07), edge: ramp('#422c1b', 0.07), legs: F.oakDark };
  return { top: F.oldWood, edge: F.oakDark, legs: F.oakDark };
}

// ------------------------------------------------------------------ objetos de cena

/** Vela: bastão de cera, chama e halo quente. (x, y) = canto inferior esquerdo da cera. */
function candle(b: PixelBuf, x: number, y: number, h = 5, w = 2): void {
  b.hline(x - 1, x + w, y, 'rgba(30,20,16,0.22)');
  b.rect(x, y - h + 1, w, h, F.wax);
  b.vline(x, y - h + 1, y, '#fdf7e8');
  b.vline(x + w - 1, y - h + 1, y, '#cbbd9d');
  const fx = x + Math.floor(w / 2);
  b.set(fx, y - h, F.flameHot);
  b.set(fx, y - h - 1, F.flame);
  b.set(fx - 1, y - h - 1, 'rgba(255,182,72,0.5)');
  b.set(fx + 1, y - h - 1, 'rgba(255,182,72,0.42)');
  b.set(fx, y - h - 2, 'rgba(255,182,72,0.55)');
}

/** Pergaminho enrolado deitado. */
function scroll(b: PixelBuf, x: number, y: number, w = 6, h = 3): void {
  b.rect(x, y, w, h, F.parch);
  b.hline(x, x + w - 1, y, '#f4e9c9');
  b.hline(x, x + w - 1, y + h - 1, F.parchDark);
  b.rect(x, y, 1, h, '#b09a6c');
  b.rect(x + w - 1, y, 1, h, '#b09a6c');
  if (h > 2) b.hline(x + 2, x + w - 3, y + 1, 'rgba(120,100,70,0.4)');
}

/** Frasco de poção: vidro, líquido colorido e rolha. (x, y) = canto inferior esquerdo. */
function potion(b: PixelBuf, x: number, y: number, color: string, h = 5): void {
  b.rect(x, y - h + 2, 3, h - 2, color);
  b.rect(x, y - h + 2, 3, 1, shade(color, 0.18));
  b.set(x, y - h + 2, 'rgba(255,255,255,0.55)');
  b.set(x + 2, y - h + 3, shade(color, -0.25));
  b.rect(x + 1, y - h, 1, 2, '#8fc8e8');
  b.set(x + 1, y - h - 1, '#8a6636');
  b.set(x, y, shade(color, -0.3));
}

/** Caveira pequena de 4x4 (bibliotecas de alquimista). */
function skull(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 4, 3, '#ded7c4');
  b.hline(x + 1, x + 2, y - 1, '#ece6d4');
  b.set(x + 1, y, '#2b2622');
  b.set(x + 2, y, '#2b2622');
  b.set(x + 1, y + 2, '#b9b09b');
  b.set(x + 2, y + 2, '#b9b09b');
  b.rect(x + 1, y + 3, 2, 1, '#ded7c4');
}

/** Chama de uma bacia/archote (triângulo suave com núcleo claro). */
function flame(b: PixelBuf, cx: number, cy: number, size = 5): void {
  for (let i = 0; i < size; i++) {
    const half = Math.round(((i + 1) / size) * (size / 2));
    const c = i < size * 0.4 ? F.flameHot : i < size * 0.75 ? F.flame : '#e0762a';
    b.hline(cx - half, cx + half, cy - i, c);
  }
  b.set(cx, cy - size, 'rgba(255,182,72,0.5)');
  b.set(cx - (size >> 1), cy - (size >> 1), 'rgba(255,182,72,0.35)');
  b.set(cx + (size >> 1), cy - (size >> 1), 'rgba(255,182,72,0.28)');
}

/** Barril de madeira com aros de ferro. (x, y) = canto superior esquerdo (boca elíptica). */
function barrel(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp = F.oldWood): void {
  for (let i = 0; i < h; i++) {
    const bulge = Math.round(Math.sin((i / (h - 1)) * Math.PI) * 1.2);
    b.hline(x - bulge, x + w - 1 + bulge, y + i, m.base);
    b.set(x - bulge, y + i, m.lt);
    b.set(x + w - 1 + bulge, y + i, m.dk);
  }
  for (const yy of [y + 2, y + h - 3]) {
    b.hline(x - 1, x + w, yy, F.iron.base);
    b.hline(x - 1, x + w, yy + 1, F.ironDark.dk);
  }
  b.ellipse(x + w / 2, y + 0.5, w / 2, 2, m.lt);
  b.ellipse(x + w / 2, y + 0.8, w / 2 - 1.5, 1.3, '#3a2a1c');
}

/** Tábua de madeira (tampo + espessura) usada por mesas pequenas e bancos. */
function woodTop(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, seed: number): void {
  topFace(b, x, y, w, h, m);
  woodGrain(b, x + 1, y + 1, w - 2, h - 2, m, seed);
  b.hline(x, x + w - 1, y + h, m.base);
  b.hline(x, x + w - 1, y + h + 1, m.dk);
}

// ------------------------------------------------------------------ mesas de escriba

/** Tampo + pernas + gaveteiro (igual ao móvel original, em carvalho escuro). */
function tableBody(b: PixelBuf, m: ReturnType<typeof woodMats>, seed: number, back: boolean): void {
  if (back) {
    frontFace(b, 1, 8, 30, 6, F.oakDark);
    b.hline(1, 30, 8, F.oakDark.dk);
    b.hline(2, 29, 11, F.oakDark.lt);
  }
  for (const x of [0, 29]) {
    b.rect(x, 8, 3, 8, m.legs.base);
    b.vline(x, 8, 15, m.legs.lt);
    b.vline(x + 2, 8, 15, m.legs.dk);
    b.hline(x, x + 2, 15, m.legs.dd);
  }
  if (!back) {
    // Gaveteiro com ferragens de ferro.
    frontFace(b, 19, 8, 10, 8, F.oakDark);
    b.hline(19, 28, 11, F.oakDark.dk);
    b.hline(19, 28, 12, F.oakDark.lt);
    b.rect(22, 9, 4, 1, F.iron.base);
    b.rect(22, 13, 4, 1, F.iron.base);
    b.set(23, 10, F.gold);
  }
  woodTop(b, 0, -6, 32, 12, m.top, seed);
}

export function desk(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 20);
  const b = s.buf;
  const m = woodMats(variant);
  tableBody(b, m, seed, false);
  // Atril com tomo aberto no lugar do monitor (a tela não é desenhada na skin de fantasia).
  b.rect(9, -6, 14, 2, F.oakDark.dk);
  b.line(11, -6, 9, -12, F.oakDark.base);
  b.line(21, -6, 23, -12, F.oakDark.base);
  b.rect(6, -14, 20, 9, F.leather);
  b.hline(6, 25, -14, shade(F.leather, 0.22));
  b.rect(7, -13, 8, 7, '#f0e6c8');
  b.rect(17, -13, 8, 7, '#e6dab8');
  b.vline(15, -13, -7, '#b9a374');
  b.vline(16, -13, -7, '#cdbb90');
  // Runas acesas nas páginas.
  const r = rngOf(seed, 9);
  for (let i = 0; i < 3; i++) {
    const y = -12 + i * 2;
    b.hline(8, 8 + Math.floor(r() * 5), y, 'rgba(127,224,208,0.85)');
    b.hline(18, 18 + Math.floor(r() * 5), y, 'rgba(127,224,208,0.7)');
  }
  b.set(14, -9, F.magic);
  // Vela, tinteiro, pena e pergaminho.
  candle(b, 26, 0, 6, 2);
  b.rect(2, -1, 3, 2, '#2f2a26');
  b.set(2, -1, '#4a423a');
  b.line(4, -2, 7, -9, '#f2ecdc');
  b.line(5, -2, 8, -9, '#d8cfb8');
  scroll(b, 19, -2, 6, 3);
  b.outline();
  underRect(b, 3, 8, 26, 7, 'rgba(30,26,40,0.22)');
  contact(b, -1, 13, 34, 4, 0.22);
  return { base: s };
}

export function deskBack(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 12);
  const b = s.buf;
  const m = woodMats(variant);
  tableBody(b, m, seed, true);
  const r = rngOf(seed, 10);
  // Pilha de tomos à esquerda.
  let y = -1;
  for (let i = 0; i < 3; i++) {
    const h = 2 + Math.floor(r() * 2);
    const c = pick(r, ['#6b3a3a', '#3f4f6a', '#4a5f3a', '#5a4232']);
    b.rect(2, y - h + 1, 7, h, c);
    b.hline(2, 8, y - h + 1, shade(c, 0.18));
    b.hline(3, 7, y - h + 2, 'rgba(230,215,180,0.7)');
    y -= h;
  }
  // Castiçal alto no meio e rolos à direita.
  b.rect(15, -3, 2, 4, F.iron.base);
  candle(b, 14, -3, 7, 4);
  scroll(b, 22, -3, 7, 3);
  scroll(b, 23, -6, 6, 2);
  b.set(20, 0, F.gold);
  b.outline();
  underRect(b, 3, 8, 26, 7, 'rgba(30,26,40,0.22)');
  contact(b, -1, 13, 34, 4, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ cadeiras

const CUSHION: Readonly<Record<string, string>> = {
  black: '#5b4430',
  blue: '#3f5d8a',
  red: '#8a3a34',
  green: '#3f6a4a',
  gray: '#7b7364',
};

function cushionRamp(variant: string | undefined): Ramp {
  return ramp(CUSHION[variant ?? 'black'] ?? CUSHION.black, 0.07);
}

/** Cadeira de espaldar alto, vista por trás: assento, saia e pernas de madeira. */
export function officeChair(variant: string | undefined): BufFurniture {
  const c = cushionRamp(variant);
  const base = floorSheet(1, 1, 6);
  const b = base.buf;
  b.rect(3, 3, 10, 6, c.dk);
  b.rect(4, 4, 8, 4, c.base);
  b.hline(4, 11, 4, c.lt);
  b.hline(3, 12, 8, c.dd);
  frontFace(b, 2, 9, 12, 3, F.oak);
  b.vline(2, 9, 11, F.oak.lt);
  for (const x of [2, 13]) {
    b.rect(x, 12, 1, 4, F.oakDark.dk);
    b.set(x, 12, F.oakDark.base);
  }
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  // Espaldar: montantes torneados, travessa entalhada e almofada de couro com tachas.
  const front = floorSheet(1, 1, 6);
  const f = front.buf;
  f.rect(3, 1, 2, 13, F.oak.base);
  f.rect(11, 1, 2, 13, F.oak.base);
  f.vline(3, 1, 13, F.oak.lt);
  f.vline(12, 1, 13, F.oak.dk);
  // Coroamento em dois blocos laterais (o centro fica aberto para não cobrir quem senta).
  f.rect(2, 1, 3, 3, F.oak.lt);
  f.rect(11, 1, 3, 3, F.oak.lt);
  f.hline(2, 13, 1, F.oak.hi);
  f.hline(5, 10, 2, F.oak.dk);
  f.set(3, 2, F.oak.dd);
  f.set(12, 2, F.oak.dd);
  // Almofada de couro na altura da lombar (como no encosto original).
  f.rect(5, 6, 6, 7, c.base);
  f.rect(6, 7, 4, 5, c.lt);
  f.hline(5, 10, 10, c.dk);
  f.set(5, 6, F.gold);
  f.set(10, 6, F.gold);
  f.set(5, 11, F.gold);
  f.set(10, 11, F.gold);
  f.rect(2, 14, 3, 1, F.oakDark.dd);
  f.rect(11, 14, 3, 1, F.oakDark.dd);
  f.outline();
  return { base, front };
}

export function officeChairFront(variant: string | undefined): BufFurniture {
  const c = cushionRamp(variant);
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  // Encosto ao norte (de frente para a câmera).
  b.rect(2, -9, 2, 13, F.oak.base);
  b.rect(12, -9, 2, 13, F.oak.base);
  b.vline(2, -9, 3, F.oak.lt);
  b.vline(13, -9, 3, F.oak.dk);
  b.rect(2, -9, 12, 3, F.oak.lt);
  b.hline(2, 13, -9, F.oak.hi);
  b.rect(5, -6, 6, 7, c.base);
  b.rect(6, -5, 4, 5, c.lt);
  b.hline(5, 10, -1, c.dk);
  b.set(5, -6, F.gold);
  b.set(10, -6, F.gold);
  b.rect(4, 2, 8, 1, F.oak.dk);
  // Assento e pernas da frente.
  b.rect(3, 3, 10, 4, c.base);
  b.hline(4, 11, 3, c.lt);
  b.hline(3, 12, 6, c.dd);
  frontFace(b, 2, 7, 12, 2, F.oak);
  for (const x of [2, 13]) {
    b.rect(x, 9, 1, 6, F.oakDark.dk);
    b.set(x, 9, F.oakDark.base);
  }
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ estantes

/** Estante antiga de 2 tiles: tomos, rolos, poções, caveira e velas. */
export function bookshelf(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 22);
  const b = s.buf;
  const w = F.oak;
  const r = rngOf(seed, 21);
  topFace(b, 0, -21, 32, 3, w);
  b.rect(0, -18, 32, 34, w.dk);
  b.rect(2, -17, 28, 31, shade(w.dd, -0.16));
  b.vline(0, -18, 15, w.lt);
  b.vline(1, -18, 15, w.base);
  b.vline(30, -18, 15, w.base);
  b.vline(31, -18, 15, w.dd);
  const shelves = [-8, 3, 15];
  for (const y of shelves) {
    b.hline(1, 30, y, w.lt);
    b.hline(1, 30, y + 1, w.dk);
  }
  b.hline(0, 31, 15, w.dd);
  shelves.forEach((shelf, i) => {
    const bottom = shelf - 1;
    let x = 3;
    while (x < 29) {
      const kind = r();
      if (kind < 0.2 && x < 25) {
        // Poções coloridas.
        potion(b, x, bottom, pick(r, [F.poison, '#6f8fe0', '#c96ad0', '#e0a03c']), 6);
        if (r() < 0.5) potion(b, x + 3, bottom, pick(r, [F.poison, '#6f8fe0']), 5);
        x += 6;
      } else if (kind < 0.34 && x < 24) {
        // Caveira sobre um livro.
        b.rect(x, bottom - 2, 6, 3, pick(r, ['#6b3a3a', '#3f4f6a']));
        skull(b, x + 1, bottom - 6);
        x += 7;
      } else if (kind < 0.48 && x < 25) {
        // Rolos de pergaminho deitados.
        scroll(b, x, bottom - 3, 6, 3);
        scroll(b, x + 1, bottom - 5, 5, 2);
        x += 7;
      } else {
        // Grupo de tomos antigos (um às vezes inclinado).
        const n = 2 + Math.floor(r() * 4);
        for (let k = 0; k < n && x < 29; k++) {
          const bw = 2 + Math.floor(r() * 2);
          const bh = 6 + Math.floor(r() * 5);
          const c = pick(r, ['#6b3a3a', '#7a5a2e', '#3f4f6a', '#4a5f3a', '#5a3a5a', '#8a5a30']);
          b.rect(x, bottom - bh + 1, bw, bh, c);
          b.vline(x, bottom - bh + 1, bottom, shade(c, 0.14));
          b.vline(x + bw - 1, bottom - bh + 1, bottom, shade(c, -0.2));
          b.hline(x, x + bw - 1, bottom - bh + 3, F.gold);
          b.hline(x, x + bw - 1, bottom - 2, F.gold);
          x += bw;
        }
        if (r() < 0.25 && x < 26) {
          b.line(x, bottom, x + 2, bottom - 6, F.parch, 1);
          b.set(x + 3, bottom - 6, F.parchDark);
          x += 5;
        } else x += 1;
      }
    }
  });
  candle(b, 26, -19, 5, 2);
  b.outline();
  contact(b, -1, 13, 34, 4, 0.24);
  return { base: s };
}

/** Estante estreita de 1 tile, também de madeira velha (parte da mesma composição). */
export function binderShelf(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  const w = F.oak;
  const r = rngOf(seed, 23);
  topFace(b, 0, -21, 16, 3, w);
  b.rect(0, -18, 16, 34, w.dk);
  b.rect(1, -17, 14, 31, shade(w.dd, -0.16));
  b.vline(0, -18, 15, w.lt);
  b.vline(15, -18, 15, w.dd);
  const shelves = [-8, 3, 15];
  for (const y of shelves) {
    b.hline(1, 14, y, w.lt);
    b.hline(1, 14, y + 1, w.dk);
  }
  const tops = [-17, -6, 5];
  tops.forEach((top, i) => {
    const bottom = shelves[i] - 1;
    const h = bottom - top + 1;
    if (i === 2 && r() < 0.5) {
      // Baú pequeno na prateleira de baixo.
      b.rect(2, bottom - 6, 11, 7, F.oldWood.base);
      b.hline(2, 12, bottom - 6, F.oldWood.lt);
      b.hline(2, 12, bottom - 4, F.iron.base);
      b.rect(6, bottom - 5, 2, 4, F.ironDark.base);
      b.set(6, bottom - 3, F.gold);
      return;
    }
    let x = 2;
    while (x < 13) {
      const q = r();
      if (q < 0.25) {
        potion(b, x, bottom, pick(r, [F.poison, '#6f8fe0', '#e0a03c']), Math.min(h - 1, 6));
        x += 4;
      } else if (q < 0.45) {
        scroll(b, x, bottom - 2, 4, 3);
        x += 5;
      } else {
        const bw = 2;
        const bh = Math.min(h - 1, 6 + Math.floor(r() * 3));
        const c = pick(r, ['#6b3a3a', '#7a5a2e', '#3f4f6a', '#4a5f3a']);
        b.rect(x, bottom - bh + 1, bw, bh, c);
        b.vline(x, bottom - bh + 1, bottom, shade(c, 0.14));
        b.hline(x, x + bw - 1, bottom - bh + 3, F.gold);
        x += bw;
      }
    }
  });
  b.outline();
  contact(b, 0, 13, 16, 4, 0.24);
  return { base: s };
}

// ------------------------------------------------------------------ baú, caldeirão, barril

export function filingCabinet(): BufFurniture {
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const m = F.oldWood;
  topFace(b, 1, -7, 14, 4, m);
  frontFace(b, 1, -3, 14, 19, m);
  // Cintas e ferragens de ferro.
  for (const x of [3, 12]) {
    b.vline(x, -3, 15, F.iron.base);
    b.vline(x + 1, -3, 15, F.ironDark.dk);
  }
  b.hline(1, 14, 4, F.iron.base);
  b.hline(1, 14, 5, F.ironDark.dk);
  b.rect(7, 1, 2, 4, F.ironDark.base);
  b.set(7, 3, F.gold);
  b.hline(2, 13, -3, m.lt);
  // Vela acesa em cima (lugar do vasinho original).
  candle(b, 9, -8, 4, 2);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.22);
  return { base: s };
}

export function printer(): BufFurniture {
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  // Suporte baixo de madeira.
  frontFace(b, 0, 3, 16, 13, F.oakDark);
  b.hline(1, 14, 6, F.oakDark.dk);
  b.hline(2, 13, 4, F.oakDark.lt);
  woodTop(b, 0, 0, 16, 4, F.oldWood, 5);
  // Caldeirão de ferro com caldo verde borbulhando.
  b.ellipse(8, -3, 7.4, 6.5, F.ironDark.dk);
  b.ellipse(7.6, -4, 7, 6, F.iron.base);
  b.ellipse(8, -7, 7, 2, F.iron.lt);
  b.ellipse(8, -7, 6, 1.4, F.poison);
  b.hline(4, 11, -8, '#4a7a3a');
  const r = rngOf(3, 12);
  for (let i = 0; i < 5; i++) {
    const bx = 4 + Math.floor(r() * 8);
    const by = -8 + Math.floor(r() * 2);
    b.set(bx, by, i % 2 ? 'rgba(180,255,160,0.9)' : 'rgba(120,220,120,0.8)');
  }
  // Alças e vazamento.
  b.rect(0, -5, 2, 2, F.ironDark.base);
  b.rect(14, -5, 2, 2, F.ironDark.base);
  b.vline(11, 0, 4, 'rgba(111,208,106,0.55)');
  b.set(11, 5, 'rgba(111,208,106,0.4)');
  // Fogo sob o caldeirão.
  flame(b, 8, 3, 3);
  b.outline();
  contact(b, -1, 13, 18, 4, 0.24);
  return { base: s };
}

export function trashBin(): BufFurniture {
  const s = floorSheet(1, 1, 2);
  const b = s.buf;
  barrel(b, 3, 5, 10, 10);
  // Tábua solta e palha saindo da boca.
  b.hline(4, 10, 4, F.parchDark);
  b.set(5, 3, F.parch);
  b.set(6, 2, F.parch);
  b.outline();
  contact(b, 3, 14, 10, 2, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ plantas e luz

export function plantSmall(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const v = variant ?? 'fern';
  pot(b, 4, 9, 8, 7, F.oakDark);
  b.rect(5, 9, 6, 1, '#2e2018');
  const r = rngOf(seed, 5);
  if (v === 'succulent') {
    // Aglomerado de cristais ciano.
    const c = '#6f9fe0';
    for (const [x0, y0, x1, y1] of [[8, 9, 4, 1], [8, 9, 8, -2], [8, 9, 12, 1], [8, 9, 6, 3], [8, 9, 11, 4]] as const) {
      b.line(x0, y0, x1, y1, c);
      b.set(x1, y1, '#bfe0ff');
    }
    b.set(8, -2, '#e0f4ff');
    b.set(4, 1, '#8fc4ff');
  } else if (v === 'flower') {
    // Cogumelos lilás luminosos.
    for (const [x, y] of [[5, 6], [10, 5], [8, 3]] as const) {
      b.rect(x, y, 2, 4, '#d8cbb0');
      b.ellipse(x + 1, y - 1, 2.4, 1.6, '#b07ae8');
      b.set(x, y - 1, '#e6c8ff');
      b.set(x + 1, y - 2, 'rgba(200,160,255,0.5)');
    }
  } else {
    // Cogumelos verdes brilhantes (cogumelo-do-luar).
    for (const [x, y, rad] of [[4, 6, 2.6], [10, 4, 3], [7, 2, 2.2]] as const) {
      b.rect(x + 1, y, 2, 4, '#cfc4a8');
      b.ellipse(x + 2, y - 1, rad, rad * 0.7, '#59c98a');
      b.set(x + 1, y - 2, '#a8f0c0');
      b.set(x + 2, y - 1, 'rgba(120,240,170,0.45)');
    }
    if (r() < 0.6) b.set(12, 7, 'rgba(120,240,170,0.6)');
  }
  b.outline();
  contact(b, 3, 14, 10, 2, 0.24);
  return { base: s };
}

/** Archote de ferro: lugar da planta alta. */
export function plantTall(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(1, 1, 24, 6);
  const b = s.buf;
  const r = rngOf(seed, 17);
  // Base tripé e haste.
  b.ellipse(8, 14, 4.5, 1.6, F.ironDark.dk);
  b.rect(7, -6, 2, 20, F.iron.base);
  b.vline(7, -6, 13, F.iron.lt);
  b.vline(8, -6, 13, F.iron.dk);
  for (const [x, y] of [[5, 15], [10, 15]] as const) b.line(8, 8, x, y, F.ironDark.base);
  // Bacia larga (a silhueta acompanha a da planta alta original).
  b.ellipse(8, -7.5, 8.5, 2.6, F.ironDark.dk);
  b.ellipse(8, -9, 8.5, 2.2, F.iron.base);
  b.hline(1, 14, -9, F.iron.lt);
  b.ellipse(8, -9, 6.6, 1.4, '#3a2a1c');
  // Brasas presas nas bordas.
  b.set(1, -10, F.flame);
  b.set(15, -11, '#e0762a');
  b.set(0, -9, 'rgba(255,182,72,0.6)');
  // Chama que balança conforme a semente.
  const lean = r() < 0.5 ? 0 : 1;
  flame(b, 8 + lean, -10, 7);
  b.set(8 - 3, -12, 'rgba(255,182,72,0.4)');
  b.set(8 + 3, -13, 'rgba(255,182,72,0.3)');
  b.set(13, -14, 'rgba(255,182,72,0.25)');
  b.set(2, -13, 'rgba(255,182,72,0.25)');
  void variant;
  b.outline();
  contact(b, 3, 13, 10, 3, 0.24);
  return { base: s };
}

export function floorLamp(): BufFurniture {
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  b.ellipse(8, 14, 4.5, 1.6, F.ironDark.dk);
  b.rect(7, -14, 2, 28, F.iron.base);
  b.vline(7, -14, 13, F.iron.lt);
  b.vline(8, -14, 13, F.iron.dk);
  // Braços do candelabro.
  b.hline(3, 12, -15, F.iron.base);
  b.set(3, -16, F.iron.lt);
  b.set(12, -16, F.iron.dk);
  // Três velas.
  candle(b, 3, -16, 6, 2);
  candle(b, 7, -16, 8, 2);
  candle(b, 12, -16, 6, 2);
  b.outline();
  contact(b, 3, 13, 10, 3, 0.22);
  s.rects = { glow: rectAt(s, 4, -24, 8, 8) };
  return { base: s };
}

export function waterCooler(): BufFurniture {
  const s = floorSheet(1, 1, 20);
  const b = s.buf;
  // Suporte de madeira.
  frontFace(b, 2, 7, 12, 9, F.oakDark);
  b.hline(3, 12, 10, F.oakDark.dk);
  woodTop(b, 2, 6, 12, 2, F.oldWood, 3);
  // Barril de cerveja com torneira.
  barrel(b, 3, -7, 10, 13);
  b.rect(4, -8, 8, 2, F.iron.base);
  b.hline(4, 11, -8, F.iron.lt);
  b.rect(12, -2, 3, 2, F.ironDark.base);
  b.set(14, -1, F.gold);
  b.vline(12, 0, 2, F.ironDark.dk);
  // Caneca sob a torneira.
  b.rect(11, 2, 3, 3, '#b88a4a');
  b.set(11, 2, '#e6c98a');
  b.set(14, 3, '#8a6636');
  b.set(5, -6, F.gold);
  b.outline();
  contact(b, 1, 13, 14, 4, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ reunião

/** Mesa de guerra redonda com mapa, velas e miniaturas. */
export function meetingTable(seed: number): BufFurniture {
  const s = floorSheet(3, 2, 10);
  const b = s.buf;
  for (const x of [6, 39]) {
    b.rect(x, 22, 3, 10, F.oakDark.base);
    b.vline(x, 22, 31, F.oakDark.lt);
    b.vline(x + 2, 22, 31, F.oakDark.dd);
  }
  // Tampo redondo (elipse) com veios.
  b.ellipse(24, 14, 24, 10, F.oakDark.base);
  b.ellipse(23.5, 12, 24, 9.5, F.oldWood.base);
  b.ellipse(23.5, 12, 22, 8, F.oldWood.lt);
  const r = rngOf(seed, 31);
  for (let i = 0; i < 12; i++) {
    const yy = 5 + Math.floor(r() * 13);
    b.hline(4 + Math.floor(r() * 8), 40 - Math.floor(r() * 8), yy, F.oldWood.base);
  }
  // Mapa de pergaminho no centro.
  b.rect(12, 4, 24, 12, F.parch);
  b.hline(12, 35, 4, '#f2e7c6');
  b.hline(12, 35, 15, F.parchDark);
  b.vline(12, 4, 15, F.parchDark);
  b.vline(35, 4, 15, F.parchDark);
  b.line(15, 11, 20, 8, 'rgba(120,90,50,0.5)');
  b.line(20, 8, 27, 9, 'rgba(120,90,50,0.5)');
  b.line(27, 9, 31, 6, 'rgba(120,90,50,0.5)');
  b.ellipse(24, 7, 3, 2, 'rgba(100,140,180,0.35)');
  // Marcas de estratégia (miniaturas) e velas nas pontas.
  b.rect(16, 10, 2, 2, '#a8352f');
  b.rect(22, 11, 2, 2, '#3f5d8a');
  b.rect(29, 8, 2, 2, '#a8352f');
  candle(b, 6, -1, 6, 2);
  candle(b, 40, -1, 6, 2);
  candle(b, 6, 20, 5, 2);
  b.set(33, 12, F.gold);
  b.outline();
  contact(b, -1, 28, 50, 5, 0.22);
  underRect(b, 6, 22, 36, 8, 'rgba(30,26,40,0.16)');
  return { base: s };
}

// ------------------------------------------------------------------ parede

/** Quadro de missões: cortiça com pergaminhos pregados (o render desenha os post-its por cima). */
export function whiteboard(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const x = 2;
  const y = -27;
  const w = 44;
  const h = 19;
  const frame = F.oak;
  b.rect(x, y, w, h, frame.base);
  b.hline(x, x + w - 1, y, frame.hi);
  b.vline(x, y, y + h - 1, frame.lt);
  b.vline(x + w - 1, y, y + h - 1, frame.dk);
  b.hline(x, x + w - 1, y + h - 1, frame.dk);
  // Cortiça.
  b.rect(x + 1, y + 1, w - 2, h - 2, '#a9804f');
  const r = rngOf(7, 43);
  for (let i = 0; i < 90; i++) {
    b.set(x + 2 + Math.floor(r() * (w - 4)), y + 2 + Math.floor(r() * (h - 4)), r() < 0.5 ? '#b98f5c' : '#9a7345');
  }
  // Pergaminhos com selo de cera.
  const notes: [number, number, number, number][] = [[6, 4, 11, 8], [20, 3, 9, 7], [32, 5, 9, 9], [12, 12, 10, 5]];
  notes.forEach(([nx, ny, nw, nh], i) => {
    b.rect(x + nx, y + ny, nw, nh, i % 3 === 1 ? '#efe1b8' : F.parch);
    b.hline(x + nx, x + nx + nw - 1, y + ny, '#f6ecd0');
    b.hline(x + nx, x + nx + nw - 1, y + ny + nh - 1, F.parchDark);
    for (let k = 1; k < nh - 1; k += 2) b.hline(x + nx + 1, x + nx + nw - 2, y + ny + k, 'rgba(110,90,60,0.45)');
    b.set(x + nx + Math.floor(nw / 2), y + ny - 1, F.ironDark.base);
    if (i === 0) b.set(x + nx + nw - 2, y + ny + nh - 2, F.blood);
  });
  // Bandeja com penas.
  b.rect(x + 3, y + h, w - 6, 2, frame.base);
  b.hline(x + 3, x + w - 4, y + h, frame.lt);
  b.line(x + 9, y + h - 1, x + 12, y + h - 6, '#f2ecdc');
  b.set(x + 12, y + h - 6, '#d8cfb8');
  b.outline();
  s.rects = { board: rectAt(s, x + 2, y + 2, w - 4, h - 4) };
  return { base: s };
}

export function windowItem(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 1;
  const w = 30;
  const top = -28;
  const spring = -18;
  const bottom = -6;
  const cx = x + w / 2;
  const st = F.stone;
  // Pedra da moldura: lados retos + arco no alto.
  b.rect(x, top, w, spring - top, st.base);
  b.rect(x, spring, 3, bottom - spring, st.base);
  b.rect(x + w - 3, spring, 3, bottom - spring, st.base);
  // Vazado do arco.
  for (let y = top; y < spring; y++) {
    const t = (spring - y) / (spring - top);
    const half = Math.round((w / 2 - 3) * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let xx = Math.round(cx - half); xx < Math.round(cx + half); xx++) b.clear(xx, y);
  }
  for (let y = spring; y < bottom; y++) for (let xx = x + 3; xx < x + w - 3; xx++) b.clear(xx, y);
  // Aduelas em destaque.
  for (let y = top; y < spring; y += 4) b.hline(x, x + 2, y, st.lt);
  b.vline(x, spring, bottom - 1, st.lt);
  b.vline(x + w - 1, spring, bottom - 1, st.dk);
  // Grade de ferro.
  for (const gx of [cx - 6, cx, cx + 6]) b.vline(Math.round(gx), top + 3, bottom - 1, F.ironDark.base);
  b.hline(x + 3, x + w - 4, spring, F.ironDark.base);
  b.hline(x + 3, x + w - 4, spring + 5, F.ironDark.base);
  // Peitoril.
  b.rect(x - 1, bottom, w + 2, 2, st.lt);
  b.hline(x - 1, x + w, bottom, st.hi);
  b.hline(x - 1, x + w, bottom + 1, st.dk);
  b.outline();
  s.rects = { glass: rectAt(s, x + 3, top + 2, w - 6, bottom - top - 3) };
  return { base: s };
}

/** Estandarte pendurado (lugar dos pôsteres). */
export function poster(variant: string | undefined): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 12;
  const h = 17;
  const cloth = pick(rngOf(variant === 'coffee' ? 1 : variant === 'rocket' ? 2 : 3, 8), ['#7a2f2c', '#2f4a7a', '#3f6a3a', '#5a3a6a']);
  // Haste.
  b.rect(x - 1, y, w + 2, 2, F.oakDark.base);
  b.hline(x - 1, x + w, y, F.oakDark.lt);
  // Tecido.
  b.rect(x, y + 2, w, h - 2, cloth);
  b.vline(x, y + 2, y + h - 1, shade(cloth, 0.16));
  b.vline(x + w - 1, y + 2, y + h - 1, shade(cloth, -0.25));
  // Barra inferior e franjas.
  b.rect(x, y + h - 4, w, 2, F.gold);
  for (let xx = x; xx < x + w; xx += 2) b.set(xx, y + h - 1, shade(cloth, -0.3));
  // Emblema: espada e estrela.
  b.vline(x + 5, y + 5, y + 10, '#e6e0cc');
  b.hline(x + 3, x + 8, y + 9, F.gold);
  b.set(x + 6, y + 4, F.gold);
  b.set(x + 5, y + 4, '#f6e7b0');
  b.set(x + 7, y + 4, '#f6e7b0');
  b.outline();
  return { base: s };
}

/** Tapeçaria (lugar dos quadros) com brasão e franja. */
export function painting(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 2;
  const y = -27;
  const w = 28;
  const h = 18;
  const cloth = pick(rngOf(seed, 41), ['#5a2f3a', '#2f3a6a', '#3f5a3a']);
  b.rect(x, y, w, h, shade(cloth, -0.2));
  b.rect(x + 1, y + 1, w - 2, h - 3, cloth);
  b.hline(x + 1, x + w - 2, y + 1, shade(cloth, 0.2));
  b.vline(x + 1, y + 1, y + h - 2, shade(cloth, 0.12));
  b.vline(x + w - 2, y + 1, y + h - 2, shade(cloth, -0.28));
  const ax = x + 2;
  const ay = y + 2;
  const aw = w - 4;
  const ah = h - 6;
  // Brasão: escudo com dragão estilizado e coroa.
  const cx = ax + Math.floor(aw / 2);
  b.ellipse(cx, ay + 7, 7, 6, F.gold);
  b.ellipse(cx, ay + 7, 6, 5, '#8a2f2c');
  b.vline(cx - 3, ay + 3, ay + 8, F.gold);
  b.vline(cx + 3, ay + 3, ay + 8, F.gold);
  b.hline(cx - 3, cx + 3, ay + 5, F.gold);
  b.set(cx - 3, ay + 2, F.gold);
  b.set(cx + 3, ay + 2, F.gold);
  b.set(cx, ay + 1, F.gold);
  // Franja.
  for (let xx = x; xx < x + w; xx += 2) b.set(xx, y + h, shade(cloth, -0.35));
  b.outline();
  s.rects = { art: rectAt(s, ax, ay, aw, ah) };
  return { base: s };
}

/** Espelho mágico no lugar da TV: moldura de ferro e vidro fundo (o render desenha a "visão"). */
export function tv(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 1;
  const y = -27;
  const w = 30;
  const h = 18;
  b.rect(x, y, w, h, F.ironDark.base);
  b.hline(x, x + w - 1, y, F.iron.base);
  b.vline(x, y, y + h - 1, F.iron.base);
  b.vline(x + w - 1, y, y + h - 1, F.ironDark.dd);
  b.hline(x, x + w - 1, y + h - 1, F.ironDark.dd);
  // Cantos ornamentados em ouro.
  for (const [dx, dy] of [[1, 1], [w - 3, 1], [1, h - 3], [w - 3, h - 3]] as const) b.set(x + dx, y + dy, F.gold);
  b.rect(x + 2, y + 2, w - 4, h - 4, '#243048');
  b.hline(x + 2, x + w - 3, y + 2, '#3a4a6a');
  // Runas gravadas na borda inferior.
  for (let xx = x + 4; xx < x + w - 4; xx += 4) b.set(xx, y + h - 2, F.magic);
  b.outline();
  s.rects = { tv: rectAt(s, x + 2, y + 2, w - 4, h - 4) };
  return { base: s };
}

export function clock(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const cx = 8;
  const cy = -21.5;
  // Relógio de sol de parede: disco de pedra, gnômon e marcas.
  b.ellipse(cx, cy, 7, 7, F.ironDark.base);
  b.ellipse(cx, cy, 6, 6, '#cfc6ae');
  b.ellipse(cx - 1, cy - 1, 4, 4, '#e2dac4');
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    b.set(Math.round(cx + Math.cos(ang) * 4.6), Math.round(cy + Math.sin(ang) * 4.6), F.ironDark.base);
  }
  b.line(cx, cy, cx + 3, cy - 2, F.ironDark.dk);
  b.set(cx, cy, F.ironDark.dk);
  b.outline();
  s.rects = { face: rectAt(s, 2, -28, 12, 12) };
  return { base: s };
}

// ------------------------------------------------------------------ copa

/** Barril de cerveja no lugar da cafeteira (state 1 = servindo). */
export function coffeeMachine(state: number): BufFurniture {
  const s = floorSheet(1, 1, 18);
  const b = s.buf;
  // Bancada de madeira.
  frontFace(b, 0, 5, 16, 11, F.oakDark);
  b.hline(1, 14, 9, F.oakDark.dk);
  woodTop(b, 0, 3, 16, 2, F.oldWood, 4);
  // Barril deitado sobre a bancada.
  barrel(b, 2, -8, 12, 12);
  b.rect(7, -10, 3, 3, F.iron.base);
  b.hline(7, 9, -10, F.iron.lt);
  // Torneira e caneca.
  b.rect(11, -3, 4, 1, F.iron.base);
  b.vline(14, -2, 1, F.ironDark.base);
  b.rect(13, 2, 3, 3, '#b88a4a');
  b.set(13, 2, '#e6c98a');
  b.set(16, 3, '#8a6636');
  if (state === 1) {
    // Espuma escorrendo da torneira.
    b.vline(14, 0, 2, '#f6f0dc');
    b.set(14, 3, '#fffaf0');
    b.set(13, 3, 'rgba(255,250,240,0.7)');
  }
  b.outline();
  contact(b, -1, 13, 18, 4, 0.22);
  return { base: s };
}

export function fridge(): BufFurniture {
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  topFace(b, 2, -23, 12, 3, F.oldWood);
  frontFace(b, 2, -20, 12, 35, F.oldWood);
  // Duas portas com dobradiças e puxador.
  b.hline(2, 13, -6, F.oakDark.dk);
  b.vline(8, -20, 15, F.oakDark.dk);
  b.vline(9, -20, 15, F.oakDark.lt);
  for (const [x, y] of [[2, -18], [12, -18], [2, 2], [12, 2]] as const) {
    b.rect(x, y, 2, 3, F.iron.base);
    b.set(x, y, F.iron.lt);
  }
  b.set(7, -12, F.gold);
  b.set(10, -12, F.gold);
  // Rótulo de taberna entalhado na porta.
  b.rect(5, -2, 6, 1, F.iron.base);
  b.outline();
  contact(b, 1, 13, 14, 4, 0.22);
  return { base: s };
}

/** Estante de poções do mercador (lugar da máquina de snacks). */
export function vendingMachine(): BufFurniture {
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  frontFace(b, 1, -22, 14, 37, F.oak);
  b.vline(1, -22, 15, F.oak.lt);
  b.vline(14, -22, 15, F.oak.dk);
  // Letreiro.
  b.rect(1, -24, 14, 4, F.oakDark.base);
  b.hline(1, 14, -24, F.gold);
  b.rect(4, -22, 8, 1, F.gold);
  // Prateleiras de vidro com poções luminosas.
  for (const y of [-17, -10, -3]) {
    b.rect(3, y, 10, 1, 'rgba(200,220,235,0.45)');
    for (let i = 0; i < 4; i++) potion(b, 3 + i * 3, y, ['#6fd06a', '#6f8fe0', '#c96ad0', '#e0a03c'][i], 5);
  }
  // Balcão e moedas.
  b.rect(2, 1, 12, 3, F.oakDark.base);
  b.set(6, 2, F.gold);
  b.set(9, 2, F.gold);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.24);
  return { base: s };
}

/** Forno de pedra pequeno (lugar do micro-ondas). */
export function microwave(): BufFurniture {
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  frontFace(b, 0, 3, 16, 13, F.stone);
  b.hline(1, 14, 6, F.stone.dk);
  b.rect(2, -6, 12, 10, F.stone.base);
  b.hline(2, 13, -6, F.stone.hi);
  // Boca do forno em arco com fogo.
  b.rect(5, -3, 7, 7, '#2b2622');
  b.hline(4, 12, -3, '#1e1a18');
  b.hline(5, 11, -4, '#2b2622');
  flame(b, 8, 3, 4);
  b.set(6, 3, '#ffb648');
  b.set(10, 2, 'rgba(255,182,72,0.6)');
  // Chaminé e lenha.
  b.rect(11, -11, 3, 6, F.stone.base);
  b.hline(11, 13, -11, F.stone.lt);
  b.line(11, -12, 12, -13, 'rgba(220,220,220,0.4)');
  b.rect(1, 12, 4, 2, '#5a3d26');
  b.outline();
  contact(b, -1, 13, 18, 4, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ lounge

/** Banco comprido com peles (lugar do sofá). */
export function sofa(variant: string | undefined): BufFurniture {
  const up = variant === 'up';
  const s = floorSheet(3, 1, 14);
  const b = s.buf;
  const fur = ramp('#8a6a48', 0.07);
  const plank = F.oak;
  if (!up) {
    // Encosto de tábuas com peles dobradas.
    b.rect(5, -11, 38, 13, plank.base);
    for (let y = -10; y < 1; y += 3) b.hline(6, 41, y, plank.dk);
    b.hline(5, 42, -11, plank.lt);
    for (let i = 0; i < 3; i++) {
      b.rect(7 + i * 12, -9, 10, 8, fur.base);
      b.hline(8 + i * 12, 15 + i * 12, -9, fur.lt);
      b.set(9 + i * 12, -6, fur.dd);
      b.set(12 + i * 12, -4, fur.dd);
    }
    // Assento de pele.
    b.rect(6, 2, 36, 7, fur.dk);
    b.rect(6, 2, 36, 5, fur.base);
    b.hline(7, 40, 2, fur.lt);
    // Saia e pés.
    frontFace(b, 5, 9, 38, 4, plank);
    for (const x of [7, 39]) b.rect(x, 13, 2, 2, F.oakDark.dd);
    // Braços de madeira.
    for (const x of [0, 42]) {
      b.rect(x, -5, 6, 4, plank.lt);
      b.hline(x, x + 5, -5, plank.hi);
      b.rect(x + 1, -1, 4, 14, plank.base);
      b.vline(x + 1, -1, 12, plank.lt);
      b.vline(x + 4, -1, 12, plank.dk);
    }
    b.outline();
    contact(b, -1, 13, 50, 4, 0.24);
    return { base: s };
  }
  // De costas: braços altos, faixa do assento e topo das peles; front = costas do encosto.
  b.rect(5, -3, 38, 5, fur.base);
  b.hline(5, 42, -3, fur.lt);
  for (const x of [7, 33]) {
    b.rect(x, -5, 6, 4, fur.lt);
    b.hline(x + 1, x + 4, -5, fur.hi);
  }
  for (const x of [0, 42]) {
    b.rect(x, -7, 6, 4, plank.lt);
    b.hline(x, x + 5, -7, plank.hi);
    b.rect(x + 1, -3, 4, 16, plank.base);
    b.vline(x + 1, -3, 12, plank.lt);
    b.vline(x + 4, -3, 12, plank.dk);
  }
  b.outline();
  contact(b, -1, 13, 50, 4, 0.24);
  const front = floorSheet(3, 1, 14);
  const f = front.buf;
  f.hline(3, 44, 1, plank.lt);
  f.rect(0, 2, 48, 10, plank.base);
  for (let y = 4; y < 12; y += 3) f.hline(1, 46, y, plank.dk);
  f.hline(0, 47, 12, plank.dd);
  f.hline(0, 47, 13, F.oakDark.dd);
  for (const x of [2, 23, 44]) {
    f.rect(x, 14, 2, 2, F.oakDark.dd);
    f.set(x, 14, F.oakDark.base);
  }
  f.outline();
  return { base: s, front };
}

/** Trono de madeira com pele (lugar da poltrona), nos quatro sentidos. */
export function armchair(variant: string | undefined): BufFurniture {
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  const fur = ramp('#8a6a48', 0.07);
  const plank = F.oak;
  if (v === 'down' || v === 'up') {
    if (v === 'down') {
      b.rect(3, -10, 10, 12, plank.base);
      for (let y = -9; y < 0; y += 3) b.hline(4, 11, y, plank.dk);
      b.hline(3, 12, -10, plank.lt);
      b.set(5, -10, F.gold);
      b.set(10, -10, F.gold);
      b.rect(4, -8, 8, 9, fur.base);
      b.hline(5, 10, -8, fur.lt);
      b.rect(3, 2, 10, 7, fur.dk);
      b.rect(3, 2, 10, 5, fur.base);
      b.hline(4, 11, 2, fur.lt);
      frontFace(b, 3, 9, 10, 4, plank);
      b.rect(0, -4, 4, 5, plank.lt);
      b.rect(12, -4, 4, 5, plank.dk);
      for (const x of [1, 13]) b.rect(x, 13, 2, 2, F.oakDark.dd);
      b.outline();
      contact(b, -1, 13, 18, 4, 0.24);
      return { base: s };
    }
    b.rect(3, -3, 10, 5, fur.base);
    b.hline(3, 12, -3, fur.lt);
    b.rect(0, -6, 4, 6, plank.lt);
    b.rect(12, -6, 4, 6, plank.dk);
    b.outline();
    contact(b, -1, 13, 18, 4, 0.24);
    const front = floorSheet(1, 1, 14);
    const f = front.buf;
    f.hline(2, 13, 1, plank.lt);
    f.rect(0, 2, 16, 10, plank.base);
    for (let y = 4; y < 12; y += 3) f.hline(1, 14, y, plank.dk);
    f.hline(0, 15, 12, plank.dd);
    f.hline(0, 15, 13, F.oakDark.dd);
    for (const x of [1, 13]) f.rect(x, 14, 2, 2, F.oakDark.dd);
    f.outline();
    return { base: s, front };
  }
  // Lateral: encosto de um lado, braço baixo na frente.
  const left = v === 'left';
  const bx = left ? 11 : 0;
  b.rect(1, 2, 14, 8, fur.base);
  b.hline(1, 14, 2, fur.lt);
  b.rect(1, 9, 14, 5, plank.base);
  b.hline(1, 14, 9, plank.dk);
  b.rect(bx, -10, 5, 24, plank.base);
  b.rect(bx, -10, 5, 2, plank.lt);
  b.hline(bx + 1, bx + 3, -10, plank.hi);
  b.vline(bx, -8, 13, plank.lt);
  b.vline(bx + 4, -8, 13, plank.dk);
  b.clear(bx, -10);
  b.clear(bx + 4, -10);
  b.hline(bx, bx + 4, 13, plank.dd);
  b.rect(left ? 1 : 13, -3, 2, 3, F.gold);
  for (const x of [1, 13]) b.rect(x, 13, 2, 2, F.oakDark.dd);
  b.outline();
  contact(b, -1, 13, 18, 4, 0.24);
  return { base: s };
}

/** Fardo de palha (lugar do puff). */
export function beanbag(variant: string | undefined): BufFurniture {
  const straw: Readonly<Record<string, string>> = { red: '#c99a4e', blue: '#b8a05c', yellow: '#d8b055', green: '#a8a05a' };
  const m = ramp(straw[variant ?? 'red'] ?? straw.red, 0.07);
  const s = floorSheet(1, 1, 6);
  const b = s.buf;
  b.ellipse(8, 9, 7.5, 6, m.dk);
  b.ellipse(7.8, 8, 7, 5.6, m.base);
  b.ellipse(7.4, 6.8, 5.4, 3.8, m.lt);
  b.ellipse(8, 7.6, 3.4, 2, m.base);
  // Cordas de fardo.
  b.line(3, 11, 4, 4, 'rgba(90,70,40,0.55)');
  b.line(12, 11, 11, 4, 'rgba(90,70,40,0.55)');
  // Fios de palha.
  const r = rngOf(4, 6);
  for (let i = 0; i < 14; i++) b.set(2 + Math.floor(r() * 12), 3 + Math.floor(r() * 10), i % 3 ? m.hi : m.dd);
  b.hline(4, 12, 14, m.dd);
  b.outline();
  contact(b, 0, 12, 16, 4, 0.24);
  return { base: s };
}

/** Pedra rúnica / espelho mágico (lugar do fliperama). */
export function arcade(): BufFurniture {
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  const screen = { x: 3, y: -17, w: 10, h: 8 };
  // Monólito de pedra com veios e runas.
  frontFace(b, 1, -20, 14, 36, F.stone);
  b.hline(2, 13, -19, F.stone.lt);
  b.vline(1, -20, 15, F.stone.hi);
  b.vline(14, -20, 15, F.stone.dk);
  // Moldura de ferro do espelho.
  b.rect(2, -18, 12, 10, F.ironDark.base);
  b.hline(2, 13, -18, F.iron.base);
  b.rect(screen.x, screen.y, screen.w, screen.h, '#1a2a3a');
  b.rect(screen.x + 1, screen.y + 1, screen.w - 2, 2, '#2c4a5a');
  // Runas gravadas (brilham).
  for (const [x, y] of [[3, -6], [6, -6], [9, -6], [12, -6], [4, -2], [8, -2], [11, -2]] as const) b.set(x, y, F.magic);
  b.hline(3, 12, -5, 'rgba(127,224,208,0.35)');
  // Pedestal.
  b.rect(0, 13, 16, 3, F.ironDark.dk);
  b.hline(0, 15, 13, F.ironDark.base);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.26);
  s.rects = { screen: rectAt(s, screen.x, screen.y, screen.w, screen.h) };
  return { base: s };
}

/** Mesa de jogo com tabuleiro de xadrez (lugar do ping-pong). */
export function pingpongTable(): BufFurniture {
  const s = floorSheet(3, 2, 8);
  const b = s.buf;
  for (const x of [4, 42]) {
    b.rect(x, 22, 3, 9, F.oakDark.base);
    b.vline(x, 22, 30, F.oakDark.lt);
  }
  b.rect(22, 22, 4, 7, F.oakDark.dk);
  woodTop(b, 0, -4, 48, 23, F.oldWood, 8);
  // Tabuleiro: casa 4x4 em 8x8 (32x32 px) no centro.
  const bx = 8;
  const by = 2;
  b.rect(bx - 1, by - 1, 34, 18, F.oakDark.dk);
  for (let yy = 0; yy < 4; yy++) {
    for (let xx = 0; xx < 8; xx++) {
      b.rect(bx + xx * 4, by + yy * 4, 4, 4, (xx + yy) % 2 ? '#e8dcbe' : '#4a3a2a');
    }
  }
  // Peças.
  const r = rngOf(9, 33);
  for (let i = 0; i < 6; i++) {
    const px = bx + 1 + Math.floor(r() * 7) * 4;
    const py = by + Math.floor(r() * 4) * 4;
    b.rect(px, py, 2, 3, i % 2 ? '#f4ecd8' : '#3a2a22');
  }
  // Velas nas pontas.
  candle(b, 2, 1, 6, 2);
  candle(b, 44, 1, 6, 2);
  b.outline();
  contact(b, 0, 27, 48, 5, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ apoio

export function stool(): BufFurniture {
  const s = floorSheet(1, 1, 2);
  const b = s.buf;
  b.ellipse(8, 14.5, 4, 1.4, F.oakDark.dd);
  for (const [x, y] of [[4, 14], [11, 14]] as const) b.line(8, 8, x, y, F.oakDark.base);
  b.rect(7, 8, 2, 6, F.oak.base);
  b.ellipse(8, 6, 5.5, 3, F.oakDark.dk);
  b.ellipse(8, 5.4, 5.5, 2.6, F.oldWood.lt);
  b.set(5, 4, F.oldWood.hi);
  b.set(6, 4, F.oldWood.hi);
  b.outline();
  contact(b, 3, 13, 10, 3, 0.22);
  return { base: s };
}

export function cafeTable(): BufFurniture {
  const s = floorSheet(1, 1, 4);
  const b = s.buf;
  b.ellipse(8, 14, 3.5, 1.4, F.oakDark.dd);
  b.rect(7, 4, 2, 10, F.oakDark.base);
  b.ellipse(8, 3, 7, 3.2, F.oakDark.dk);
  b.ellipse(8, 2.4, 7, 3, F.oldWood.lt);
  b.hline(3, 12, 2, F.oldWood.hi);
  // Caneca e prato.
  b.rect(10, 0, 3, 2, '#c99a5e');
  b.set(10, 0, '#e6c98a');
  b.ellipse(4, 2, 2, 1, '#e8dcbe');
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  return { base: s };
}

export function coffeeTable(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 6);
  const b = s.buf;
  for (const x of [2, 28]) b.rect(x, 9, 2, 5, F.oakDark.dd);
  woodTop(b, 1, 1, 30, 8, F.oldWood, seed);
  scroll(b, 5, 2, 7, 4);
  candle(b, 24, 4, 4, 2);
  potion(b, 16, 6, F.poison, 5);
  b.outline();
  contact(b, 0, 12, 32, 4, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ despacho

/** Móvel de fantasia do kind, ou undefined quando o kind não tem versão de fantasia. */
export function fantasyBuild(kind: FurnitureKind, variant: string | undefined, state: number, seed: number): BufFurniture | undefined {
  switch (kind) {
    case 'desk':
      return desk(variant, seed);
    case 'desk_back':
      return deskBack(variant, seed);
    case 'office_chair':
      return officeChair(variant);
    case 'office_chair_front':
      return officeChairFront(variant);
    case 'bookshelf':
      return bookshelf(seed);
    case 'binder_shelf':
      return binderShelf(seed);
    case 'filing_cabinet':
      return filingCabinet();
    case 'printer':
      return printer();
    case 'trash_bin':
      return trashBin();
    case 'plant_small':
      return plantSmall(variant, seed);
    case 'plant_tall':
      return plantTall(variant, seed);
    case 'floor_lamp':
      return floorLamp();
    case 'water_cooler':
      return waterCooler();
    case 'meeting_table':
      return meetingTable(seed);
    case 'whiteboard':
      return whiteboard();
    case 'window':
      return windowItem();
    case 'poster':
      return poster(variant);
    case 'painting':
      return painting(seed);
    case 'tv':
      return tv();
    case 'clock':
      return clock();
    case 'coffee_machine':
      return coffeeMachine(state);
    case 'fridge':
      return fridge();
    case 'vending_machine':
      return vendingMachine();
    case 'microwave':
      return microwave();
    case 'sofa':
      return sofa(variant);
    case 'armchair':
      return armchair(variant);
    case 'beanbag':
      return beanbag(variant);
    case 'arcade':
      return arcade();
    case 'pingpong_table':
      return pingpongTable();
    case 'stool':
      return stool();
    case 'cafe_table':
      return cafeTable();
    case 'coffee_table':
      return coffeeTable(seed);
    default:
      return undefined;
  }
}
