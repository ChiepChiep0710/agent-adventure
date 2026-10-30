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
  // Cintas de madeira escura com cravos de latão (nada de corrediças de aço).
  for (const x of [3, 12]) {
    b.vline(x, -3, 15, F.oakDark.dk);
    b.vline(x + 1, -3, 15, F.leather);
  }
  b.hline(1, 14, 4, F.oakDark.dk);
  b.hline(1, 14, 5, F.leather);
  b.rect(7, 1, 2, 4, '#c9a94a');
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

/**
 * Espelho mágico no lugar da TV: moldura de carvalho entalhado com cantos dourados e vidro roxo
 * (o mundo desenha o redemoinho de magia por cima). Nada de aço escovado nem tela apagada: na
 * fantasia a parede do lounge não pode parecer uma TV moderna.
 */
export function tv(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 1;
  const y = -27;
  const w = 30;
  const h = 18;
  // Moldura de carvalho claro: veio no alto, sombra na base e nas laterais.
  b.rect(x, y, w, h, F.oldWood.base);
  b.hline(x, x + w - 1, y, F.oldWood.lt);
  b.hline(x, x + w - 1, y + 1, F.oak.lt);
  b.vline(x, y, y + h - 1, F.oak.base);
  b.vline(x + w - 1, y, y + h - 1, F.oakDark.dd);
  b.hline(x, x + w - 1, y + h - 1, F.oakDark.dd);
  // Cantos e cravos dourados.
  for (const [dx, dy] of [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]] as const) b.set(x + dx, y + dy, F.gold);
  // Entalhe de folhas nas laterais.
  for (const dx of [3, w - 5]) b.vline(x + dx, y + 5, y + h - 6, F.oakDark.dk);
  // Vidro do espelho: roxo profundo com veios de magia.
  b.rect(x + 4, y + 3, w - 8, h - 6, '#2b2340');
  b.hline(x + 4, x + w - 5, y + 3, '#3d3160');
  b.hline(x + 4, x + w - 5, y + h - 4, '#1e1834');
  for (let i = 0; i < 4; i++) b.set(x + 7 + i * 4, y + 5 + (i % 2) * 3, 'rgba(127,224,208,0.45)');
  // Runas douradas gravadas na moldura inferior.
  for (let xx = x + 6; xx < x + w - 6; xx += 4) b.set(xx, y + h - 2, F.gold);
  b.outline();
  s.rects = { tv: rectAt(s, x + 4, y + 3, w - 8, h - 6) };
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
    // Dobradiças de latão (o ferro cinza fazia o armário parecer eletrodoméstico).
    b.rect(x, y, 2, 3, '#c9a94a');
    b.set(x, y, '#efd68a');
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

/**
 * Menir rúnico (lugar do fliperama): arenito quente com musgo, cintas de ferro e espelho de magia
 * emoldurado em madeira. O cinza de metal do fliperama some — dois menires no lounge leem como
 * santuário, não como armário de escritório.
 */
export function arcade(): BufFurniture {
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  const screen = { x: 3, y: -17, w: 10, h: 8 };
  const sand = ramp('#c4a878', 0.07);
  // Corpo: menir de arenito, luz no topo e sombra à direita.
  frontFace(b, 1, -20, 14, 36, sand);
  b.hline(2, 13, -19, '#d9c49a');
  b.vline(1, -20, 15, '#e2cfa6');
  b.vline(14, -20, 15, '#8f7a56');
  // Rachaduras e musgo (pedra velha).
  b.vline(4, -8, -4, 'rgba(90,74,52,0.55)');
  b.set(5, -6, 'rgba(90,74,52,0.55)');
  for (const [x, y] of [[2, -12], [3, -11], [12, -3], [13, -4], [2, 9], [13, 8]] as const) b.set(x, y, '#5f7a4a');
  // Moldura do espelho: madeira entalhada com cantos dourados.
  b.rect(2, -18, 12, 10, F.oakDark.base);
  b.hline(2, 13, -18, F.oak.lt);
  for (const [x, y] of [[2, -18], [13, -18], [2, -9], [13, -9]] as const) b.set(x, y, F.gold);
  b.rect(screen.x, screen.y, screen.w, screen.h, '#2b2340');
  b.hline(screen.x, screen.x + screen.w - 1, screen.y, '#3d3160');
  // Runas gravadas no arenito (brilham).
  for (const [x, y] of [[3, -6], [6, -6], [9, -6], [12, -6], [4, -2], [8, -2], [11, -2]] as const) b.set(x, y, F.magic);
  b.hline(3, 12, -5, 'rgba(127,224,208,0.35)');
  // Base de madeira com cravos.
  b.rect(0, 13, 16, 3, F.oakDark.base);
  b.hline(0, 15, 13, F.oak.lt);
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

// ------------------------------------------------------------------ divisórias, copa e recepção

/** Limpa o contorno lateral (1px de cada lado) para módulos que se emendam lado a lado. */
function noSides(b: PixelBuf, w = 16): void {
  for (let y = -b.oy; y < b.h - b.oy; y++) {
    b.clear(-1, y);
    b.clear(w, y);
  }
}

/**
 * Divisória de fantasia (lugar da divisória de vidro): cerca vazada de ripas de carvalho com vigas
 * e plinto de pedra. 'h' = corre leste-oeste (vista de frente), 'v' = corre norte-sul (vista de
 * cima, faixa fina) e 'end' = mourão de ponta. Sem vidro, então nada de brilho/reflexo.
 */
export function glassPartition(variant: string | undefined): BufFurniture {
  const v = variant ?? 'h';
  const s = floorSheet(1, 1, 22, 2);
  const b = s.buf;
  if (v === 'v') {
    // Corre norte-sul: viga de madeira com travessas de ferro (a cerca vista de cima).
    const cols = ['#42301e', '#6e4a2c', '#9a7449', '#7d5836', '#5f6673', '#7d5836', '#4c331f', '#2f2a24'];
    cols.forEach((c, i) => b.vline(4 + i, -16, 15, c));
    for (let y = -16; y < 16; y += 7) {
      b.hline(4, 11, y, '#4a4038');
      b.set(6, y, F.iron.lt);
      b.set(9, y, F.iron.dk);
    }
    underRect(b, 12, -16, 2, 32, 'rgba(30,26,20,0.14)');
    return { base: s };
  }
  if (v === 'end') {
    // Ponta: mourão de carvalho sobre base de pedra, com capitel de ferro.
    topFace(b, 4, 3, 8, 4, F.stone);
    frontFace(b, 4, 7, 8, 9, F.stone);
    b.hline(4, 11, 13, F.stone.dk);
    b.rect(6, -18, 4, 22, F.oakDark.base);
    b.vline(6, -18, 3, F.oakDark.lt);
    b.vline(9, -18, 3, F.oakDark.dd);
    b.rect(5, -20, 6, 3, F.iron.base);
    b.hline(5, 10, -20, F.iron.lt);
    b.set(8, -21, F.iron.lt);
    b.outline();
    contact(b, 3, 13, 10, 4, 0.2);
    return { base: s };
  }
  // 'h': ripas verticais entre duas vigas, com plinto de pedra (o vão entre as ripas é vazado).
  b.rect(0, -17, 16, 3, F.oakDark.base);
  b.hline(0, 15, -17, F.oakDark.lt);
  b.hline(0, 15, -15, F.oakDark.dd);
  for (let x = 0; x < 16; x += 3) {
    b.vline(x, -14, 5, F.oak.base);
    b.vline(x + 1, -14, 5, F.oak.dk);
    b.set(x, -14, F.oak.hi);
  }
  // Travessas horizontais que amarram as ripas.
  for (const y of [-8, 1]) {
    b.hline(0, 15, y, F.oakDark.base);
    b.hline(0, 15, y + 1, F.oakDark.dk);
  }
  // Plinto de pedra e rodapé de madeira (mesma altura da meia-parede original).
  topFace(b, 0, 6, 16, 3, F.stone);
  frontFace(b, 0, 9, 16, 7, F.stone);
  b.hline(0, 15, 14, F.stone.dk);
  noSides(b);
  contact(b, 0, 14, 16, 3, 0.16);
  return { base: s };
}

/** Gabinete de tábuas com tampo de pedra (base da bancada e da bancada com bacia). */
function stoneCounterBody(b: PixelBuf, kind: 'plain' | 'drawers' | 'doors'): void {
  frontFace(b, 0, 5, 16, 11, F.oakDark);
  b.vline(0, 5, 15, F.oakDark.lt);
  b.vline(15, 5, 13, F.oakDark.dd);
  b.rect(1, 14, 14, 2, '#33251a');
  b.hline(1, 14, 14, '#241a12');
  if (kind === 'drawers') {
    for (const y of [8, 11]) {
      b.hline(1, 14, y, F.oakDark.dd);
      b.hline(1, 14, y + 1, F.oakDark.lt);
    }
    for (const y of [6, 9, 12]) b.rect(6, y, 4, 1, F.iron.base);
  } else if (kind === 'doors') {
    b.vline(7, 6, 13, F.oakDark.dd);
    b.vline(8, 6, 13, F.oakDark.lt);
    b.rect(5, 8, 1, 3, F.iron.base);
    b.rect(10, 8, 1, 3, F.iron.base);
  } else {
    // Porta única com dobradiças em fita, como nas bancadas de taverna.
    b.rect(12, 8, 1, 3, F.iron.base);
    b.hline(1, 14, 6, F.oakDark.lt);
    for (const x of [2, 4, 12, 14]) b.set(x, 9, F.iron.base);
  }
  // Tampo de pedra: laje única com arestas gastas.
  topFace(b, 0, -3, 16, 7, F.stone);
  b.hline(0, 15, 4, F.stone.dk);
  b.hline(0, 15, 3, F.stone.hi);
  for (const [x, y] of [[3, -1], [11, 1], [7, 0]] as const) b.set(x, y, F.stone.base);
}

export function counter(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 6);
  stoneCounterBody(s.buf, variant === 'drawers' ? 'drawers' : 'plain');
  s.buf.outline();
  noSides(s.buf);
  contact(s.buf, 0, 14, 16, 3, 0.2);
  return { base: s };
}

/** Bancada de pedra com bacia d'água esculpida, caneca e colher de pau. */
export function counterSink(): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  stoneCounterBody(b, 'doors');
  // Bacia escavada na pedra: borda clara, água funda e reflexo.
  b.ellipse(8, 1, 5.6, 2.8, F.stone.dk);
  b.ellipse(8, 1.2, 4.8, 2.1, '#3d6b74');
  b.hline(5, 11, 0, '#6fa8b4');
  b.set(6, 1, 'rgba(255,255,255,0.5)');
  b.set(9, 2, 'rgba(127,224,208,0.5)');
  // Colher de pau atravessada na bacia.
  b.line(4, 0, 12, 1, F.oldWood.base);
  b.rect(11, -1, 3, 2, F.oldWood.lt);
  // Jarro de água (barro) na ponta da bancada.
  b.rect(12, -7, 3, 4, '#b0603c');
  b.hline(12, 14, -7, '#d07a4e');
  b.set(12, -5, '#8a462a');
  b.set(14, -6, '#8a462a');
  b.set(13, -8, '#8a6636');
  b.outline();
  noSides(b);
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ banheiro, recepção e apoio

/** Cadeira de taverna: assento de tábuas e espaldar entalhado, nos quatro sentidos. */
export function cafeChair(variant: string | undefined): BufFurniture {
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const leg = F.oakDark.dk;
  for (const x of [4, 11]) b.vline(x, 9, 15, leg);
  for (const x of [5, 10]) b.vline(x, 9, 13, F.oakDark.base);
  const seat = () => {
    b.rect(3, 5, 10, 4, F.oldWood.base);
    b.hline(3, 12, 5, F.oldWood.hi);
    b.hline(3, 12, 7, F.oldWood.dk);
    b.hline(3, 12, 8, F.oakDark.dd);
    b.set(7, 6, F.oldWood.dk);
  };
  const backPanel = (x: number, y: number, w: number, h: number) => {
    b.rect(x, y, w, h, F.oak.base);
    b.hline(x, x + w - 1, y, F.oak.hi);
    b.vline(x, y, y + h - 1, F.oak.lt);
    b.vline(x + w - 1, y, y + h - 1, F.oak.dk);
    // Cravos de ferro nas pontas do espaldar.
    b.set(x + 1, y + h - 2, F.iron.base);
    b.set(x + w - 2, y + h - 2, F.iron.base);
  };
  if (v === 'down') {
    for (const x of [4, 11]) b.vline(x, -3, 5, leg);
    backPanel(3, -6, 10, 5);
    seat();
    b.outline();
    contact(b, 2, 13, 12, 3, 0.2);
    return { base: s };
  }
  if (v === 'up') {
    seat();
    b.outline();
    const front = floorSheet(1, 1, 10);
    const f = front.buf;
    for (const x of [4, 11]) f.vline(x, 6, 10, leg);
    f.rect(3, 3, 10, 5, F.oak.base);
    f.hline(3, 12, 3, F.oak.hi);
    f.hline(3, 12, 7, F.oakDark.dd);
    f.vline(12, 3, 7, F.oak.dk);
    f.outline();
    return { base: s, front };
  }
  // left/right: espaldar lateral do lado oposto ao olhar.
  seat();
  const bx = v === 'left' ? 11 : 3;
  b.vline(bx + 1, 0, 8, leg);
  backPanel(bx, -6, 2, 12);
  b.outline();
  return { base: s };
}

/**
 * Privada de madeira (lugar do box de banheiro): baias de tábuas, banco furado e lanterninha.
 * Mesma semântica de estado do original: state 1 = porta fechada (ocupado); 0 = entreaberta.
 */
export function toiletStall(state: number): BufFurniture {
  const occupied = state >= 1;
  const panel = F.oakDark;
  const s = floorSheet(2, 2, 26, 3, 4);
  const b = s.buf;
  // Interior em penumbra: parede de tábuas ao fundo e banco de privada.
  b.rect(4, -8, 24, 9, '#33251a');
  b.rect(11, -7, 10, 6, '#4a3524');
  b.hline(11, 20, -7, '#5d4430');
  b.hline(11, 20, -2, '#2b1e15');
  b.ellipse(16, 3, 5.5, 4, '#4a3524');
  b.ellipse(16, 2.5, 5, 3.6, F.oldWood.base);
  b.ellipse(16, 3, 2.6, 2, '#1e1610');
  b.hline(12, 20, 1, F.oldWood.lt);
  // Lanterna de ferro na divisória esquerda (luz quente no interior).
  b.rect(3, 2, 3, 3, F.ironDark.base);
  b.set(4, 2, F.flame);
  b.set(4, 1, 'rgba(255,182,72,0.6)');
  b.set(3, 1, 'rgba(255,182,72,0.35)');
  // Divisórias laterais de tábuas com cintas de ferro.
  for (const x of [0, 29]) {
    b.rect(x, -22, 3, 34, panel.base);
    b.vline(x, -22, 11, panel.lt);
    b.vline(x + 2, -22, 11, panel.dd);
    b.hline(x, x + 2, -22, F.iron.base);
    for (let y = -16; y < 12; y += 6) b.hline(x, x + 2, y, F.ironDark.base);
  }
  b.outline();
  underRect(b, 2, 0, 28, 12, 'rgba(30,26,20,0.16)');
  // Frente: porta de tábuas (cobre o interior).
  const front = floorSheet(2, 2, 26, 3, 4);
  const f = front.buf;
  f.rect(0, 10, 32, 20, panel.base);
  f.rect(0, 9, 32, 2, F.oakDark.lt);
  f.hline(0, 31, 9, F.oakDark.hi);
  f.vline(0, 11, 29, panel.lt);
  f.vline(31, 11, 29, panel.dd);
  f.hline(0, 31, 29, panel.dd);
  for (const x of [1, 30]) f.rect(x, 30, 1, 2, '#3a2a1e');
  if (occupied) {
    // Fechada: tábuas verticais, fecho de ferro e corda vermelha de "trancado".
    for (let x = 8; x < 25; x += 4) f.vline(x, 12, 28, F.oakDark.dd);
    f.hline(7, 24, 12, F.oak.dk);
    f.vline(7, 12, 28, F.oak.dk);
    f.vline(24, 12, 28, F.oakDark.dd);
    f.rect(20, 18, 3, 3, F.iron.base);
    f.set(21, 19, '#2b1e15');
    f.hline(14, 19, 21, F.blood);
    f.set(13, 20, F.blood);
  } else {
    // Entreaberta: vão escuro à direita e folha estreita em perspectiva.
    f.rect(19, 12, 6, 17, '#2b1e15');
    f.rect(20, 13, 4, 15, '#5d4430');
    f.rect(7, 12, 12, 17, F.oak.base);
    f.hline(7, 18, 12, F.oak.hi);
    f.vline(7, 12, 28, F.oak.dk);
    f.vline(18, 12, 28, F.oakDark.dd);
    for (let x = 9; x < 18; x += 3) f.vline(x, 13, 27, F.oak.dk);
    f.rect(16, 18, 2, 3, F.iron.base);
    f.set(21, 19, F.poison);
  }
  f.outline();
  return { base: s, front };
}

/** Pia de pedra: pé de alvenaria, bacia funda com água e jarro de barro. */
export function sink(): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  // Pé de alvenaria (blocos com junta).
  frontFace(b, 2, 6, 12, 10, F.stone);
  b.vline(2, 6, 14, F.stone.hi);
  b.vline(13, 6, 14, F.stone.dk);
  for (const y of [9, 12]) b.hline(2, 13, y, F.stone.dk);
  b.rect(6, 8, 4, 2, F.stone.base);
  // Cuba larga de pedra escavada.
  b.rect(0, -3, 16, 7, F.stone.base);
  b.hline(0, 15, -3, F.stone.hi);
  b.hline(0, 15, 3, F.stone.dk);
  b.hline(0, 15, 4, F.stone.dd);
  b.ellipse(8, 0.5, 5.4, 2.6, F.stone.dk);
  b.ellipse(8, 0.9, 4.4, 1.9, '#3d6b74');
  b.hline(5, 10, 0, '#6fa8b4');
  b.set(7, 1, 'rgba(255,255,255,0.45)');
  // Jarro de barro e pano dobrado na borda.
  b.rect(11, -7, 3, 4, '#b0603c');
  b.hline(11, 13, -7, '#d07a4e');
  b.set(11, -5, '#8a462a');
  b.set(13, -6, '#8a462a');
  b.rect(2, -4, 4, 2, '#d8cdb4');
  b.hline(2, 5, -4, '#efe6d2');
  b.outline();
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

/** Balcão do estalajadeiro: tábuas com cintas, livro-razão, sino e castiçal. */
export function receptionDesk(seed: number): BufFurniture {
  const s = floorSheet(3, 1, 16);
  const b = s.buf;
  // Área de trabalho atrás: tábua com livro-razão aberto, castiçal e sino.
  topFace(b, 1, -10, 46, 6, F.oldWood);
  b.hline(1, 46, -10, F.oldWood.hi);
  woodGrain(b, 2, -9, 44, 4, F.oldWood, seed);
  // Livro-razão de couro com páginas de pergaminho.
  b.rect(7, -15, 17, 6, F.leather);
  b.hline(7, 23, -15, shade(F.leather, 0.22));
  b.rect(8, -14, 7, 4, F.parch);
  b.rect(16, -14, 7, 4, F.parchDark);
  b.vline(15, -14, -10, '#3a2a1e');
  b.hline(9, 13, -13, 'rgba(120,100,70,0.45)');
  b.hline(17, 21, -13, 'rgba(120,100,70,0.45)');
  b.set(22, -11, F.blood);
  // Castiçal de ferro com vela acesa.
  b.rect(30, -14, 2, 5, F.iron.base);
  b.hline(29, 32, -9, F.ironDark.dk);
  candle(b, 29, -14, 6, 3);
  // Sino de latão no canto.
  b.rect(38, -14, 5, 3, F.gold);
  b.hline(38, 42, -14, '#f6e7b0');
  b.hline(39, 41, -15, '#f6e7b0');
  b.set(40, -16, F.gold);
  b.set(39, -11, shade(F.gold, -0.35));
  // Balcão frontal: tábuas verticais com cintas de ferro e entalhe dourado.
  frontFace(b, 0, -2, 48, 18, F.oak);
  woodGrain(b, 1, -1, 46, 14, F.oak, seed, true);
  b.rect(0, 5, 48, 3, F.oakDark.base);
  b.hline(0, 47, 5, F.oakDark.lt);
  b.hline(0, 47, 7, F.oakDark.dd);
  for (let x = 4; x < 44; x += 8) {
    b.set(x, 11, F.gold);
    b.hline(x + 1, x + 3, 10, 'rgba(224,179,76,0.7)');
    b.set(x + 2, 12, 'rgba(224,179,76,0.45)');
  }
  b.rect(0, 14, 48, 2, F.oakDark.dd);
  // Tampo de pedra do balcão.
  topFace(b, -1, -6, 50, 5, F.stone);
  b.hline(-1, 48, -2, F.stone.dk);
  // Sino de atendimento, livro de registro e pena sobre o tampo.
  b.rect(28, -7, 5, 2, F.gold);
  b.set(29, -8, '#f6e7b0');
  b.set(30, -8, '#f6e7b0');
  scroll(b, 4, -5, 8, 3);
  b.line(15, -4, 19, -6, '#f2ecdc');
  b.set(20, -6, '#d8cfb8');
  b.outline();
  contact(b, -1, 13, 50, 4, 0.24);
  return { base: s };
}

/** Banco rústico de meio-tronco com cavaletes de madeira. */
export function bench(): BufFurniture {
  const s = floorSheet(2, 1, 10);
  const b = s.buf;
  // Mourões do encosto e cavaletes.
  for (const x of [2, 29]) {
    b.rect(x, -6, 2, 21, F.oakDark.base);
    b.vline(x, -6, 14, F.oakDark.lt);
    b.vline(x + 1, -6, 14, F.oakDark.dd);
  }
  // Travessa do encosto: meio-tronco lascado.
  b.rect(1, -6, 30, 3, F.oldWood.base);
  b.hline(1, 30, -6, F.oldWood.hi);
  b.hline(1, 30, -4, F.oldWood.dk);
  for (const x of [3, 12, 21, 28]) b.set(x, -5, F.oldWood.dk);
  // Assento: tábua grossa de tronco aplainado.
  b.rect(0, 2, 32, 4, F.oldWood.base);
  b.hline(0, 31, 2, F.oldWood.hi);
  b.hline(0, 31, 5, F.oldWood.dk);
  b.hline(0, 31, 6, F.oakDark.dd);
  b.set(9, 4, F.oldWood.dk);
  b.set(20, 3, F.oldWood.dk);
  // Casca nas pontas e pés.
  b.vline(0, 2, 5, '#4a3524');
  b.vline(31, 2, 5, '#3a2a1c');
  b.hline(2, 30, 13, F.oakDark.dk);
  b.outline();
  contact(b, 0, 13, 32, 3, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ parede (fantasia)

/** Espelho com moldura de ouro trabalhada (lugar do espelho de parede). */
export function mirror(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 13;
  const h = 15;
  // Moldura de ouro: bisel claro em cima/esquerda, escuro embaixo/direita.
  b.rect(x, y, w, h, F.gold);
  b.hline(x, x + w - 1, y, '#f8ebbc');
  b.vline(x, y, y + h - 1, '#f1d68a');
  b.vline(x + w - 1, y, y + h - 1, shade(F.gold, -0.32));
  b.hline(x, x + w - 1, y + h - 1, shade(F.gold, -0.32));
  b.hline(x + 1, x + w - 2, y + 1, shade(F.gold, -0.14));
  // Volutas nos quatro cantos (pedraria e arabesco).
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 4], [x + w - 3, y + h - 4]] as const) {
    b.rect(cx, cy, 2, 2, '#fff3c0');
    b.set(cx, cy + 1, shade(F.gold, -0.2));
  }
  b.set(x + (w >> 1), y, '#fff3c0');
  b.set(x + (w >> 1), y + h - 1, shade(F.gold, -0.4));
  // Vidro: região que o render recorta para o reflexo de quem está na frente.
  b.rect(x + 2, y + 2, w - 4, h - 4, '#8fa8b8');
  b.hline(x + 2, x + w - 3, y + 2, '#b9cbd6');
  b.hline(x + 2, x + w - 3, y + 3, '#a2b8c6');
  b.line(x + w - 5, y + 3, x + 5, y + h - 5, 'rgba(255,255,255,0.55)');
  b.set(x + w - 4, y + h - 4, '#6f8a9c');
  b.outline();
  s.rects = { glass: rectAt(s, x + 2, y + 2, w - 4, h - 4) };
  return { base: s };
}

/** Prateleira de parede com potes de conserva, poções, ervas e vela. */
export function shelfWall(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const r = rngOf(seed, 51);
  const w = F.oak;
  const plank = (y: number) => {
    b.rect(1, y, 30, 2, w.base);
    b.hline(1, 30, y, w.lt);
    b.hline(1, 30, y + 1, w.dk);
    for (const x of [4, 26]) {
      b.rect(x, y + 2, 2, 2, F.ironDark.base);
      b.set(x, y + 2, F.iron.base);
    }
  };
  plank(-19);
  plank(-9);
  // Prateleira de cima: potes de conserva e um tomo apoiado.
  let x = 3;
  for (let i = 0; i < 4 && x < 26; i++) {
    const hh = 5 + Math.floor(r() * 3);
    potion(b, x, -20, pick(r, [F.poison, '#6f8fe0', '#e0a03c', '#c96ad0']), hh);
    b.hline(x, x + 2, -20 - hh + 3, 'rgba(255,255,255,0.35)');
    x += 5;
  }
  b.rect(x, -25, 2, 5, pick(r, ['#6b3a3a', '#3f4f6a', '#4a5f3a']));
  b.hline(x, x + 1, -22, F.gold);
  // Ervas secas penduradas na ponta direita.
  for (const [dx, c] of [[0, '#6f8f4a'], [2, '#4a6a3a']] as const) {
    b.line(27 + dx, -19, 26 + dx, -26, c);
    b.set(26 + dx, -26, '#8aa85a');
    b.set(25 + dx, -24, '#7a9a4a');
  }
  // Prateleira de baixo: jarros de barro, rolos e caveira (varia com a seed).
  const v = seed % 3;
  if (v === 0) {
    b.rect(3, -14, 6, 5, '#b0603c');
    b.hline(3, 8, -14, '#d07a4e');
    b.rect(4, -11, 4, 1, '#8a462a');
    b.rect(10, -13, 3, 4, '#c99a5e');
    b.set(11, -14, '#8a6636');
    scroll(b, 15, -12, 7, 3);
    candle(b, 25, -10, 5, 2);
  } else if (v === 1) {
    for (let i = 0; i < 4; i++) {
      const c = pick(r, ['#6b3a3a', '#4a5f3a', '#5a4232', '#3f4f6a']);
      b.rect(4 + i * 3, -17, 2, 8, c);
      b.vline(4 + i * 3, -17, -10, shade(c, 0.14));
      b.hline(4 + i * 3, 5 + i * 3, -15, F.gold);
    }
    b.rect(17, -13, 4, 4, '#ded7c4');
    skull(b, 17, -17);
    b.rect(23, -14, 5, 5, '#4a3524');
    b.hline(23, 27, -14, '#5d4430');
    b.set(25, -12, F.gold);
  } else {
    potion(b, 3, -10, F.poison, 6);
    potion(b, 7, -10, '#6f8fe0', 5);
    scroll(b, 12, -12, 6, 3);
    b.rect(20, -15, 6, 6, '#b0603c');
    b.hline(20, 25, -15, '#d07a4e');
    b.hline(20, 25, -10, '#8a462a');
    b.set(22, -13, '#7a3e26');
    candle(b, 27, -10, 4, 2);
  }
  b.outline();
  return { base: s };
}

/** Tabuleta pendurada em cantoneiras de ferro (o render escreve o nome da sala no pergaminho). */
export function sign(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const x = 3;
  const y = -27;
  const w = 42;
  const h = 12;
  // Cantoneiras e argolas de ferro que seguram a tabuleta na parede.
  for (const cx of [x + 2, x + w - 5]) {
    b.rect(cx, y - 4, 3, 5, F.ironDark.base);
    b.hline(cx, cx + 2, y - 4, F.iron.base);
    b.vline(cx + 1, y - 3, y - 1, F.iron.lt);
  }
  // Tábua de carvalho emoldurada.
  b.rect(x, y, w, h, F.oakDark.base);
  b.hline(x, x + w - 1, y, F.oakDark.lt);
  b.vline(x, y, y + h - 1, F.oakDark.lt);
  b.vline(x + w - 1, y, y + h - 1, F.oakDark.dd);
  b.hline(x, x + w - 1, y + h - 1, F.oakDark.dd);
  // Pergaminho onde o render desenha o nome.
  b.rect(x + 2, y + 2, w - 4, h - 4, F.parch);
  b.hline(x + 2, x + w - 3, y + 2, '#f4e9c9');
  b.hline(x + 2, x + w - 3, y + h - 3, F.parchDark);
  // Cantoneiras, tachas e vinheta de canto em ferro.
  for (const [dx, dy, sx, sy] of [[0, 0, 1, 1], [w - 4, 0, -1, 1], [0, h - 4, 1, -1], [w - 4, h - 4, -1, -1]] as const) {
    b.rect(x + dx, y + dy, 4, 1, F.iron.base);
    b.rect(x + dx, y + dy, 1, 4, F.iron.base);
    b.set(x + dx + sx, y + dy + 2 * sy, F.iron.lt);
  }
  b.outline();
  s.rects = { sign: rectAt(s, x + 3, y + 3, w - 6, h - 6) };
  return { base: s };
}

/** Vão de porta em arco de pedra (lugar do batente de escritório). */
export function doorFrame(): BufFurniture {
  const s = wallSheet(2, 3);
  const b = s.buf;
  const st = F.stone;
  const cx = 16;
  const spring = -27;
  const top = -30;
  // Batentes de pedra (lados), com junta e bisel.
  b.rect(-2, spring, 3, 27, st.base);
  b.vline(-2, spring, -1, st.hi);
  b.vline(0, spring + 1, -1, st.dk);
  b.rect(31, spring, 3, 27, st.base);
  b.vline(31, spring + 1, -1, st.dk);
  b.vline(33, spring, -1, st.dd);
  for (let y = spring + 4; y < 0; y += 5) {
    b.hline(-2, 0, y, st.dk);
    b.hline(31, 33, y, st.dk);
  }
  // Arco pleno: pedra acima das aduelas, mais alta no fecho.
  for (let x = 1; x < 31; x++) {
    const dx = (x - cx) / 15;
    const rise = Math.round(3 * Math.sqrt(Math.max(0, 1 - dx * dx)));
    const archY = spring - rise;
    const hgt = archY - top;
    if (hgt > 0) b.rect(x, top, 1, hgt, st.base);
    // Aresta iluminada da aduela (o intradorso do arco).
    b.set(x, archY, st.hi);
    b.set(x, archY + 1, st.lt);
  }
  // Juntas das aduelas e fecho (chave) no meio.
  for (let x = 3; x < 31; x += 4) {
    for (let y = top; y < spring; y++) if (b.alpha(x, y) > 0) b.set(x, y, st.dk);
  }
  b.rect(14, top, 4, 3, st.lt);
  b.hline(14, 17, top, st.hi);
  b.hline(14, 17, top + 2, st.dk);
  // Soleira de pedra.
  b.rect(-2, -2, 36, 2, st.lt);
  b.hline(-2, 33, -2, st.hi);
  b.hline(-2, 33, -1, st.dk);
  b.outline();
  return { base: s };
}

/** Archote de parede no lugar do interruptor: aceso (on) ou apagado (off). */
export function lightSwitch(variant: string | undefined): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const on = (variant ?? 'on') === 'on';
  // Chapa de ferro na parede, com braço curto (mesma pegada do interruptor original).
  b.rect(6, -16, 3, 3, F.ironDark.base);
  b.vline(6, -16, -14, F.iron.base);
  b.hline(6, 8, -14, F.iron.dk);
  b.set(7, -15, F.iron.lt);
  b.hline(6, 9, -17, F.iron.base);
  b.set(9, -18, F.iron.base);
  // Tocha de madeira com aro de ferro.
  b.rect(9, -20, 2, 3, F.oldWood.base);
  b.hline(9, 10, -20, F.oldWood.lt);
  b.hline(9, 10, -18, F.iron.base);
  if (on) {
    // Chama curta e halo quente.
    b.set(10, -21, F.flameHot);
    b.set(9, -21, 'rgba(255,182,72,0.5)');
    b.set(10, -20, F.flame);
  } else {
    // Apagada: brasa morta na ponta.
    b.set(10, -21, '#6b4a32');
    b.set(9, -21, '#4a3524');
  }
  b.outline();
  return { base: s };
}

/**
 * Elevador de fantasia: portal de pedra com grade de ferro (portão levadiço). A grade sobe 3px
 * por estado (0 fechado .. 4 aberto), como as folhas deslizantes do original, e a runa do painel
 * acende quando há cabine andando.
 */
export function elevator(state: number): BufFurniture {
  const s = wallSheet(2, 2);
  const b = s.buf;
  const st = Math.max(0, Math.min(4, Math.round(state)));
  const stn = F.stone;
  // Moldura de pedra lavrada.
  b.rect(0, -28, 32, 28, stn.base);
  b.hline(0, 31, -28, stn.hi);
  b.vline(0, -28, -1, stn.lt);
  b.vline(31, -28, -1, stn.dk);
  b.rect(1, -27, 2, 27, stn.lt);
  b.rect(29, -27, 2, 27, stn.dd);
  // Painel de runas no alto: a runa acende (msm. leitura do indicador original).
  b.rect(10, -27, 12, 3, '#2b2622');
  const lit = st > 0;
  b.set(13, -26, lit ? F.magic : '#2e4a44');
  b.set(12, -25, lit ? F.magic : '#2e4a44');
  b.set(14, -25, lit ? F.magic : '#2e4a44');
  b.rect(16, -26, 4, 1, lit ? F.gold : '#3a3428');
  // Vão interno: poço de pedra com tocha e piso de lajes.
  const ix = 3;
  const iy = -23;
  const iw = 26;
  const ih = 23;
  b.rect(ix, iy, iw, ih, '#3a3228');
  b.rect(ix, iy, iw, 2, '#4a4034');
  b.rect(ix + 2, iy + 2, iw - 4, ih - 7, '#2b2622');
  // Piso de lajes e tocha quente na parede do fundo.
  b.rect(ix, iy + ih - 4, iw, 4, '#5a5248');
  b.hline(ix, ix + iw - 1, iy + ih - 4, '#6b6358');
  b.set(ix + 6, iy + ih - 5, 'rgba(255,182,72,0.35)');
  b.set(ix + 19, iy + ih - 5, 'rgba(255,182,72,0.28)');
  b.rect(ix + iw - 6, iy + 8, 1, 5, F.iron.base);
  b.set(ix + iw - 6, iy + 7, F.flame);
  b.set(ix + iw - 7, iy + 6, 'rgba(255,182,72,0.45)');
  // Grade levadiça: sobe `open` px por estado, presa nas correntes.
  const open = st * 3;
  const gh = ih - open;
  if (gh > 0) {
    for (let x = ix + 2; x < ix + iw - 2; x += 4) {
      b.vline(x, iy, iy + gh - 1, F.ironDark.base);
      b.vline(x + 1, iy, iy + gh - 1, F.iron.dk);
      b.set(x, iy + gh - 1, '#20242c');
    }
    for (const y of [iy + 2, iy + gh - 3]) {
      if (y < iy + gh) {
        b.hline(ix, ix + iw - 1, y, F.iron.base);
        b.hline(ix, ix + iw - 1, y + 1, F.ironDark.dd);
      }
    }
    b.hline(ix, ix + iw - 1, iy + gh - 1, '#20242c');
  }
  // Correntes e roldanas no alto do vão.
  for (const x of [ix + 1, ix + iw - 2]) {
    b.vline(x, iy, iy + 2, F.iron.base);
    b.set(x, iy, '#20242c');
  }
  b.rect(ix + 1, iy + 3, iw - 2, 1, 'rgba(30,26,20,0.5)');
  b.outline();
  return { base: s };
}

// ------------------------------------------------------------------ acampamento de aventureiros

/** Verdes, madeira queimada e pedra da clareira. */
const CAMP = {
  leaf: '#4f8a44',
  leafLt: '#6faa53',
  leafDk: '#356334',
  pine: '#2b4f31',
  pineLt: '#457a4a',
  bark: '#5a4130',
  barkLt: '#7a5a40',
  barkDk: '#3d2c1f',
  ash: '#3b342e',
  ashLt: '#544a41',
} as const;

/** Lonas das barracas por variante (o layout escolhe a cor a partir do tema da sala). */
const TENT_MATS: Readonly<Record<string, Ramp>> = {
  red: ramp('#b4463a', 0.07),
  blue: ramp('#3f5d8a', 0.07),
  green: ramp('#4a7a4e', 0.07),
  gold: ramp('#c08a3a', 0.07),
  violet: ramp('#6a4a8e', 0.07),
  teal: ramp('#3f8a8a', 0.07),
};

/** Manta/cor de tecido das barracas e sacos de dormir. */
const BLANKET: Readonly<Record<string, string>> = {
  red: '#a8433a',
  blue: '#3f5d8a',
  green: '#4a7a4e',
  gold: '#c08a3a',
};

/** Fogueira 2x2: clareira de cinzas, anel de pedras, lenha cruzada e chamas. */
export function campfire(seed: number): BufFurniture {
  const s = floorSheet(2, 2, 22);
  const b = s.buf;
  const r = rngOf(seed, 21);
  b.ellipse(16, 25, 13, 6.5, '#40382f');
  b.ellipse(16, 25, 9.5, 4.4, CAMP.ash);
  b.ellipse(16, 25, 6, 2.6, CAMP.ashLt);
  // Brasas espalhadas.
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = 1 + r() * 7;
    b.set(Math.round(16 + Math.cos(a) * d), Math.round(25 + Math.sin(a) * d * 0.5), ['#ff8a3c', '#ffb648', '#e0602a'][i % 3]);
  }
  // Anel de pedras (topo claro, base na sombra).
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const sx = Math.round(16 + Math.cos(a) * 13);
    const sy = Math.round(25 + Math.sin(a) * 6.2);
    const w = 3 + Math.floor(r() * 2);
    const h = 2 + Math.floor(r() * 2);
    const x0 = sx - Math.floor(w / 2);
    b.rect(x0, sy - h + 1, w, h, F.stone.base);
    b.hline(x0, x0 + w - 1, sy - h + 1, F.stone.lt);
    b.hline(x0, x0 + w - 1, sy, F.stone.dk);
  }
  // Lenha cruzada, com casca e anéis nas pontas.
  b.line(10, 24, 22, 20, CAMP.bark, 3);
  b.line(10, 21, 22, 25, CAMP.barkDk, 3);
  b.line(11, 23, 21, 19, CAMP.barkLt, 1);
  b.set(22, 20, '#c9a06a');
  b.set(22, 25, '#b98f5a');
  // Chamas (a maior no centro).
  flame(b, 16, 22, 9);
  flame(b, 12, 23, 5);
  flame(b, 20, 23, 6);
  // Fumaça subindo.
  for (const [sx, sy] of [[15, 8], [18, 5], [14, 3]] as const) b.set(sx, sy, 'rgba(196,196,206,0.20)');
  b.outline();
  contact(b, 3, 30, 26, 4, 0.24);
  s.rects = { glow: rectAt(s, 11, 13, 10, 10) };
  return { base: s };
}

/** Barraca A-frame 3x2: lona em duas águas, aba de entrada escura, cordas e estacas. */
export function tent(variant: string | undefined, seed: number): BufFurniture {
  const m = TENT_MATS[variant ?? 'red'] ?? TENT_MATS.red;
  const s = floorSheet(3, 2, 30);
  const b = s.buf;
  const r = rngOf(seed, 33);
  const cx = 24;
  const apex = 7;
  const baseY = 31;
  b.ellipse(cx, baseY - 1, 22, 4.5, 'rgba(28,32,52,0.22)');
  // Cordas e estacas.
  b.line(cx - 4, apex + 2, 2, baseY, 'rgba(226,214,186,0.65)');
  b.line(cx + 4, apex + 2, 46, baseY, 'rgba(226,214,186,0.55)');
  for (const px of [1, 46]) {
    b.rect(px, baseY - 2, 2, 3, CAMP.barkDk);
    b.set(px, baseY - 3, CAMP.barkLt);
  }
  // Duas águas da lona: esquerda na luz, direita na sombra.
  for (let y = apex; y <= baseY; y++) {
    const t = (y - apex) / (baseY - apex);
    const half = Math.round(2 + t * 21);
    b.hline(cx - half, cx - 1, y, m.base);
    b.hline(cx + 1, cx + half, y, shade(m.base, -0.14));
    b.set(cx - half, y, m.hi);
    b.set(cx - half + 1, y, m.lt);
    b.set(cx + half, y, m.dd);
    if (y % 9 === 0) {
      // costura entre panos de lona
      b.hline(cx - half, cx - 2, y, m.dk);
      b.hline(cx + 2, cx + half, y, shade(m.base, -0.2));
    }
  }
  // Cumeeira iluminada.
  b.vline(cx - 1, apex, baseY, m.hi);
  b.vline(cx, apex, baseY, m.lt);
  // Entrada: vão escuro com as abas dobradas para os lados.
  for (let y = 17; y <= baseY; y++) {
    const t = (y - 17) / (baseY - 17);
    const half = Math.max(1, Math.round(t * 9));
    b.hline(cx - half, cx + half, y, t < 0.3 ? '#241d18' : '#33291f');
  }
  b.line(cx - 10, baseY, cx - 5, 16, m.lt);
  b.line(cx - 9, baseY, cx - 4, 16, m.base);
  b.line(cx + 10, baseY, cx + 5, 16, m.dk);
  b.line(cx + 9, baseY, cx + 4, 16, shade(m.base, -0.22));
  // Amarração das abas e bandeirola na ponta.
  b.set(cx - 6, 22, F.gold);
  b.set(cx + 6, 22, F.gold);
  b.vline(cx, apex - 4, apex, CAMP.barkDk);
  for (let i = 0; i < 3; i++) b.hline(cx + 1, cx + 1 + (3 - i), apex - 4 + i, i === 0 ? F.gold : shade(F.gold, -0.15));
  // Remendos e furos da lona gasta.
  for (let i = 0; i < 4; i++) {
    const px = 6 + Math.floor(r() * 34);
    const py = 12 + Math.floor(r() * 18);
    b.set(px, py, m.dk);
  }
  b.outline();
  contact(b, 2, baseY - 2, 44, 3, 0.2);
  return { base: s };
}

/** Toco de árvore 1x1 usado como lugar à mesa (almofada de tecido no topo). */
export function stump(variant: string | undefined): BufFurniture {
  const c = cushionRamp(variant);
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  b.ellipse(8, 15.2, 6.5, 1.8, 'rgba(28,32,52,0.26)');
  // Casca e raízes.
  for (let y = 6; y <= 15; y++) {
    const inset = y > 13 ? 2 : 1;
    b.hline(3 - (y > 12 ? 1 : 0), 12 + inset - 1, y, CAMP.bark);
    b.set(3 - (y > 12 ? 1 : 0), y, CAMP.barkLt);
    b.set(12 + inset - 1, y, CAMP.barkDk);
  }
  for (const [x, y] of [[2, 14], [13, 14], [4, 15], [11, 15]] as const) b.set(x, y, CAMP.barkDk);
  // Topo cortado com anéis de crescimento.
  b.ellipse(8, 6.5, 5.6, 2.8, CAMP.barkLt);
  b.ellipse(8, 6.2, 5, 2.4, '#c9a06a');
  b.ellipse(8, 6.2, 3.4, 1.5, '#b98f5a');
  b.ellipse(8, 6.2, 1.8, 0.9, '#c9a06a');
  // Almofada de tecido dobrada.
  b.rect(5, 3, 6, 3, c.base);
  b.hline(5, 10, 3, c.lt);
  b.hline(5, 10, 5, c.dd);
  b.set(5, 3, c.hi);
  // Musgo na base.
  b.set(3, 12, CAMP.leafDk);
  b.set(12, 11, CAMP.leaf);
  b.outline();
  return { base: s };
}

/** Tronco deitado 1x1: banqueta rústica da fogueira. */
export function logSeat(): BufFurniture {
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  b.ellipse(8, 15, 7, 1.8, 'rgba(28,32,52,0.26)');
  for (let y = 5; y <= 14; y++) {
    const bulge = y === 5 || y === 14 ? 1 : 0;
    b.hline(1 + bulge, 14 - bulge, y, CAMP.bark);
    b.hline(2, 13, y, y < 8 ? CAMP.barkLt : CAMP.bark);
    b.set(1 + bulge, y, CAMP.barkLt);
    b.set(14 - bulge, y, CAMP.barkDk);
  }
  // Anéis na ponta cortada (oeste).
  b.ellipse(2.5, 9.5, 1.6, 4.2, '#b98f5a');
  b.ellipse(2.5, 9.5, 0.9, 2.4, '#c9a06a');
  // Fendas e musgo sobre a casca.
  b.hline(6, 10, 8, CAMP.barkDk);
  b.hline(5, 9, 11, CAMP.barkDk);
  for (const [x, y] of [[6, 6], [10, 7], [8, 13]] as const) b.set(x, y, CAMP.leafDk);
  b.outline();
  return { base: s };
}

/** Mesa de guerra 2x1 (lugar de trabalho de quem senta ao sul): tampa, armas largadas e vela. */
export function campTable(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 20);
  const b = s.buf;
  const m = woodMats(variant);
  const r = rngOf(seed, 41);
  for (const x of [1, 28]) {
    b.rect(x, 7, 3, 9, m.legs.base);
    b.vline(x, 7, 15, m.legs.lt);
    b.vline(x + 2, 7, 15, m.legs.dk);
  }
  b.hline(2, 29, 12, F.oakDark.base);
  woodTop(b, -1, -3, 34, 12, m.top, seed);
  // Machadinha cravada, pedra de amolar, cavacos e caneca.
  b.rect(8, -10, 2, 8, CAMP.barkLt);
  b.rect(6, -12, 6, 3, F.iron.base);
  b.hline(6, 11, -12, F.iron.lt);
  b.hline(7, 10, -9, F.iron.dk);
  b.rect(7, -9, 4, 1, F.ironDark.dk);
  b.rect(22, -6, 7, 3, '#8d877d');
  b.hline(22, 28, -6, '#a8a29a');
  b.rect(19, -5, 3, 3, m.edge.base);
  b.set(19, -5, m.edge.lt);
  for (let i = 0; i < 6; i++) b.set(14 + Math.floor(r() * 8), -2 - Math.floor(r() * 2), '#c9a06a');
  candle(b, 30, -3, 5, 2);
  scroll(b, 2, -4, 6, 3);
  // Armas largadas na mesa: espada curta e escudo de madeira com umbo de ferro.
  b.vline(17, -12, -4, '#cfd6df');
  b.vline(18, -12, -4, '#9aa3af');
  b.hline(15, 20, -4, F.gold);
  b.rect(17, -3, 2, 2, F.leather);
  b.ellipse(25, -8, 4.4, 3.6, F.oakDark.base);
  b.ellipse(25, -8, 2.8, 2.2, F.iron.base);
  b.set(25, -9, F.gold);
  b.outline();
  underRect(b, 2, 8, 28, 8, 'rgba(30,26,20,0.18)');
  contact(b, 0, 14, 32, 3, 0.22);
  return { base: s };
}

// ---------------------------------------------------------------- mesa de pedra da masmorra
/** Pedra lavrada da câmara: cinza-morno, com juntas escuras e ferro nas quinas. */
const DP = ramp('#55514a', 0.075);

/** Mesa de guerra de PEDRA (2x1): laje maciça sobre dois blocos, ferro nas quinas e entalhe rúnico. */
export function stoneTable(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 22);
  const b = s.buf;
  const r = rngOf(seed, 71);
  // Pés: dois blocos de pedra com aresta clara e base na sombra.
  for (const x of [2, 27]) {
    b.rect(x, 6, 3, 10, DP.base);
    b.vline(x, 6, 15, DP.lt);
    b.vline(x + 2, 6, 15, DP.dk);
    b.hline(x, x + 2, 15, '#1b1917');
  }
  b.hline(4, 27, 11, DP.dk);
  // Laje: topo claro, saia de pedra e sombra embaixo (vista de cima e de frente).
  b.rect(-1, -2, 34, 9, DP.base);
  b.hline(-1, 32, -2, DP.lt);
  b.hline(-1, 32, -1, DP.lt);
  b.hline(-1, 32, 6, DP.dk);
  b.rect(-1, 7, 34, 1, '#231f1b');
  // Juntas e rebites de ferro nas duas pontas.
  for (const x of [-1, 30]) {
    b.rect(x, -2, 3, 9, F.ironDark.base);
    b.vline(x, -2, 6, F.iron.base);
    b.set(x + 1, 0, F.iron.lt);
    b.set(x + 1, 4, F.iron.lt);
  }
  // Junta de assentamento no meio da laje (a mesa é feita de duas pedras) + lasca na quina.
  b.vline(15, -2, 6, DP.dk);
  b.vline(16, -2, 6, '#211e1a');
  b.set(15, -2, DP.lt);
  b.rect(31, -2, 2, 2, DP.dk);
  b.set(32, -2, '#1e1c19');
  // Entalhe rúnico no meio da saia + lascas e poeira.
  b.hline(12, 19, 2, DP.dk);
  b.set(13, 1, DP.lt);
  b.set(13, 3, DP.lt);
  b.set(18, 1, DP.lt);
  b.set(18, 3, DP.lt);
  b.hline(12, 19, 4, DP.dk);
  for (let i = 0; i < 7; i++) b.set(3 + Math.floor(r() * 26), 8 + Math.floor(r() * 2), '#2c2823');
  // Mapa aberto, vela acesa, caneca de ferro e punhal fincado.
  scroll(b, 3, -8, 11, 6);
  b.hline(5, 11, -6, 'rgba(120,40,32,0.55)');
  b.set(11, -7, F.blood);
  candle(b, 26, -4, 5, 2);
  b.rect(20, -6, 4, 5, F.ironDark.base);
  b.hline(20, 23, -6, F.iron.base);
  b.vline(21, -11, -7, '#cfd6df');
  b.hline(20, 22, -7, F.gold);
  b.outline();
  underRect(b, 2, 9, 28, 7, 'rgba(16,14,12,0.24)');
  contact(b, 0, 14, 32, 3, 0.26);
  return { base: s };
}

/** A mesma mesa de guerra de pedra vista por trás (quem senta ao norte vê a laje e o entalhe). */
export function stoneTableBack(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 16);
  const b = s.buf;
  const r = rngOf(seed, 73);
  for (const x of [2, 27]) {
    b.rect(x, 6, 3, 10, DP.dk);
    b.vline(x, 6, 15, DP.base);
    b.vline(x + 2, 6, 15, '#1d1b18');
  }
  // Saia de pedra vista de costas (sem quinas de ferro) e laje por cima.
  b.rect(1, 7, 30, 8, DP.dk);
  b.hline(1, 30, 7, DP.base);
  b.hline(2, 29, 9, DP.base);
  for (const x of [1, 30]) {
    b.rect(x, -3, 2, 12, DP.base);
    b.vline(x, -3, 8, DP.lt);
  }
  b.rect(2, -3, 28, 9, DP.base);
  b.hline(2, 29, -3, DP.lt);
  b.hline(2, 29, -2, DP.lt);
  b.hline(2, 29, 5, DP.dk);
  // Junta das duas pedras e veio de granito.
  b.vline(16, -3, 5, DP.dk);
  b.vline(17, -3, 5, '#211e1a');
  for (let i = 0; i < 6; i++) b.set(4 + Math.floor(r() * 22), 0 + Math.floor(r() * 4), DP.dk);
  // Brasão/entalhe na laje, pergaminho enrolado, castiçal e moedas.
  b.rect(12, -1, 8, 4, DP.dk);
  b.hline(12, 19, -1, '#2a2621');
  b.set(15, 0, F.gold);
  b.set(16, 1, F.gold);
  b.set(16, 2, F.gold);
  scroll(b, 4, -6, 8, 4);
  candle(b, 26, -3, 6, 2);
  for (let i = 0; i < 5; i++) b.set(7 + Math.floor(r() * 20), 6, F.gold);
  b.outline();
  underRect(b, 2, 9, 28, 7, 'rgba(16,14,12,0.24)');
  contact(b, 0, 14, 32, 3, 0.26);
  return { base: s };
}

/** Banco de pedra maciço (1x1): bloco gasto no centro, lascado nas quinas, pele de animal em cima. */
export function stoneStool(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const r = rngOf(seed, 77);
  // Bloco apoiado no chão (linha 15 = base do tile, 16 = chão).
  b.rect(2, 6, 12, 10, DP.base);
  b.vline(2, 6, 15, DP.lt);
  b.vline(13, 6, 15, DP.dk);
  b.hline(2, 13, 15, '#1c1a17');
  b.hline(3, 12, 6, DP.dk);
  // Assento: laje gasta e côncava, com lascas nas quinas.
  b.rect(1, 2, 14, 5, DP.lt);
  b.hline(1, 14, 2, DP.lt);
  b.hline(2, 13, 3, DP.base);
  b.hline(3, 12, 4, DP.dk);
  b.set(1, 5, DP.dk);
  b.set(14, 5, DP.dk);
  // Pele de animal dobrada em cima e um cravo de ferro na frente.
  b.rect(3, 0, 10, 3, F.leather);
  b.hline(3, 12, 0, '#6b4f39');
  b.hline(4, 11, 2, '#2e241c');
  b.set(7, 8, F.iron.lt);
  for (let i = 0; i < 4; i++) b.set(4 + Math.floor(r() * 8), 11 + Math.floor(r() * 4), DP.dk);
  b.outline();
  contact(b, 1, 15, 14, 2, 0.26);
  return { base: s };
}

/** Esteira de trabalho no chão: tomo aberto, vela acesa e círculo rúnico riscado na pedra. */
export function runeMat(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const r = rngOf(seed, 91);
  // esteira de palha gasta
  b.rect(1, 10, 14, 5, '#6b5a3a');
  b.hline(1, 14, 10, '#8a7448');
  b.hline(2, 13, 14, '#4a3e28');
  for (let i = 0; i < 5; i++) b.set(2 + Math.floor(r() * 12), 11 + Math.floor(r() * 4), '#54462d');
  // círculo rúnico riscado no piso, à frente
  b.ellipse(8, 13.5, 4, 1.6, '#7de0ff');
  b.hline(5, 11, 13, '#3a3f4a');
  // tomo aberto em cima da esteira
  b.rect(3, 7, 10, 4, '#c9b48a');
  b.hline(3, 12, 7, '#e6d6ae');
  b.vline(8, 7, 10, '#8a7a56');
  b.hline(4, 7, 8, '#5b4d36');
  b.hline(9, 11, 8, '#5b4d36');
  // vela curta com chama
  b.rect(12, 6, 2, 4, '#d9cba6');
  b.set(12, 5, '#ffce4a');
  b.set(12, 4, '#fff0a8');
  // penas/tinteiro ao lado
  b.rect(1, 7, 2, 3, '#2b2a33');
  b.set(2, 6, '#e6d6ae');
  b.outline();
  contact(b, 1, 15, 14, 2, 0.22);
  return { base: s };
}

/** Bigorna baixa de pedra: base maciça, bigorna de ferro e martelo encostado. */
export function anvilBlock(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 9);
  const b = s.buf;
  const r = rngOf(seed, 57);
  // bloco de pedra
  b.rect(2, 10, 12, 5, DP.base);
  b.hline(2, 13, 10, DP.lt);
  b.vline(2, 10, 14, DP.lt);
  b.vline(13, 10, 14, DP.dk);
  // bigorna de ferro sobre o bloco
  b.rect(4, 6, 8, 4, F.iron.base);
  b.hline(3, 12, 6, F.iron.lt);
  b.hline(4, 11, 5, F.iron.lt);
  b.rect(5, 8, 6, 2, F.iron.dk);
  b.set(2, 6, F.iron.dk);
  b.set(13, 6, F.iron.dk);
  // martelo encostado à direita
  b.line(14, 14, 12, 8, '#6b4f39');
  b.rect(11, 6, 4, 3, F.iron.base);
  b.hline(11, 14, 6, F.iron.lt);
  // faíscas/farpa no chão
  for (let i = 0; i < 3; i++) b.set(3 + Math.floor(r() * 10), 15, '#8d8578');
  b.outline();
  contact(b, 2, 15, 12, 2, 0.3);
  return { base: s };
}

/** Caldeirão de pedra em três pés, com poção verde borbulhando e ervas penduradas. */
export function alchemyPot(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 9);
  const b = s.buf;
  const r = rngOf(seed, 63);
  // pedras do fogareiro
  for (const x of [2, 6, 10]) b.rect(x, 12, 4, 3, DP.dk);
  b.hline(2, 13, 15, '#2b241f');
  // caldeirão bojudo
  b.ellipse(8, 9, 5.5, 4.5, '#3f3a36');
  b.ellipse(8, 8.5, 4.5, 3.2, '#4d4640');
  // poção
  b.ellipse(8, 7.5, 4, 1.8, '#7bd46a');
  b.hline(5, 11, 7, '#a8f08f');
  // bolhas
  for (let i = 0; i < 3; i++) b.set(6 + Math.floor(r() * 5), 5 + Math.floor(r() * 2), '#d6ffb0');
  // borda de ferro e alça
  b.hline(4, 12, 9, F.iron.dk);
  b.set(3, 8, F.iron.base);
  b.set(13, 8, F.iron.base);
  // ervas penduradas na alça
  b.line(13, 9, 14, 12, '#5d8a4a');
  b.set(14, 12, '#8fc46a');
  b.outline();
  contact(b, 3, 15, 10, 2, 0.28);
  return { base: s };
}

/** Roda de amolar em cavalete de madeira, com balde de água ao lado. */
export function grindstone(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 9);
  const b = s.buf;
  const r = rngOf(seed, 71);
  // cavalete
  b.line(3, 15, 6, 7, '#6b4f39');
  b.line(13, 15, 10, 7, '#6b4f39');
  b.hline(3, 13, 15, '#4a3728');
  // roda de pedra
  b.ellipse(8, 6, 5, 5, DP.base);
  b.ellipse(8, 6, 3.4, 3.4, DP.lt);
  b.ellipse(8, 6, 1.2, 1.2, DP.dk);
  b.line(4, 3, 12, 9, DP.dk);
  // eixo
  b.hline(3, 13, 6, F.iron.dk);
  // balde
  b.rect(12, 12, 3, 3, '#5a4a36');
  b.hline(12, 14, 12, '#7a6648');
  b.set(13, 13, '#4fc3b8');
  // respingos na pedra
  for (let i = 0; i < 4; i++) b.set(4 + Math.floor(r() * 8), 14 + Math.floor(r() * 2), '#7d756a');
  b.outline();
  contact(b, 3, 15, 11, 2, 0.24);
  return { base: s };
}

/** Almofada de chão (assento baixo): a pessoa senta no piso, sem móvel alto na frente. */
export function cushion(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const tones: Record<string, [string, string, string]> = {
    red: ['#7d3b3b', '#a85a5a', '#4d2626'],
    blue: ['#3b4d7d', '#5a6da8', '#26304d'],
    green: ['#3b6b4a', '#5a9a6e', '#26452e'],
    gold: ['#7d653b', '#a8955a', '#4d3f26'],
    violet: ['#553b7d', '#7a5aa8', '#33264d'],
    teal: ['#3b6b7d', '#5a95a8', '#26454d'],
    tan: ['#6b5a3a', '#8a7448', '#4a3e28'],
  };
  const [base, lt, dk] = tones[variant ?? 'tan'] ?? tones.tan;
  // almofada achatada com vinco central e franjas nos cantos
  b.ellipse(8, 12, 6, 2.6, base);
  b.ellipse(8, 11, 5.4, 2.2, lt);
  b.hline(4, 11, 11, dk);
  b.set(3, 13, dk);
  b.set(12, 13, dk);
  b.set(5, 9, lt);
  for (const x of [3, 13]) b.set(x, 14, '#c8a25a');
  b.outline();
  contact(b, 2, 15, 12, 2, 0.18);
  return { base: s };
}

/** Mesa de guerra vista por trás (lugar de trabalho de quem senta ao norte): travessa, maça e lanterna. */
export function campTableBack(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 16);
  const b = s.buf;
  const m = woodMats(variant);
  const r = rngOf(seed, 43);
  for (const x of [1, 28]) {
    b.rect(x, 6, 3, 10, m.legs.base);
    b.vline(x, 6, 15, m.legs.lt);
    b.vline(x + 2, 6, 15, m.legs.dk);
  }
  frontFace(b, 2, 8, 28, 7, m.edge);
  b.hline(2, 29, 8, m.edge.dk);
  b.hline(3, 28, 10, m.edge.lt);
  woodTop(b, -1, -5, 34, 12, m.top, seed);
  // Vigas empilhadas, mapa enrolado, maça de ferro e lanterna acesa.
  b.rect(3, -8, 12, 3, CAMP.barkLt);
  b.hline(3, 14, -8, '#8f6a45');
  b.hline(3, 14, -6, CAMP.barkDk);
  for (let i = 0; i < 3; i++) b.set(4 + i * 4, -6, CAMP.bark);
  scroll(b, 18, -7, 8, 4);
  b.rect(28, -10, 3, 6, F.iron.base);
  b.rect(28, -12, 3, 2, '#ffd98a');
  b.set(29, -11, F.flameHot);
  for (let i = 0; i < 5; i++) b.set(6 + Math.floor(r() * 22), -1, '#c9a06a');
  b.outline();
  underRect(b, 2, 9, 28, 7, 'rgba(30,26,20,0.18)');
  contact(b, 0, 14, 32, 3, 0.22);
  return { base: s };
}

/** Quadro de missões 2x1 em dois postes: pergaminhos pregados, sinete e adaga. */
export function questBoard(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 27);
  const b = s.buf;
  const r = rngOf(seed, 47);
  // Postes.
  for (const x of [2, 27]) {
    b.rect(x, -17, 3, 32, F.oakDark.base);
    b.vline(x, -17, 14, F.oakDark.lt);
    b.vline(x + 2, -17, 14, F.oakDark.dd);
    b.hline(x, x + 2, 14, CAMP.barkDk);
  }
  // Telhadinho de ardósia sobre o quadro.
  for (let i = 0; i < 4; i++) {
    const inset = 4 - i;
    b.hline(-1 + inset, 33 - inset, -21 + i, i === 0 ? '#6a6f78' : i === 3 ? '#33373e' : '#4d525a');
  }
  // Tábua de missões.
  b.rect(1, -17, 30, 17, F.oakDark.base);
  b.hline(1, 30, -17, F.oakDark.lt);
  b.hline(1, 30, 0, F.oakDark.dd);
  for (const y of [-12, -7, -2]) b.hline(2, 29, y, F.oakDark.dk);
  // Pergaminhos pregados (um com sinete de cera, outro rasgado).
  const sheets: readonly [number, number, number, number][] = [
    [4, -16, 8, 8],
    [14, -15, 7, 9],
    [23, -14, 6, 7],
    [4, -7, 9, 6],
    [16, -8, 10, 7],
  ];
  for (const [x, y, w, h] of sheets) {
    b.rect(x, y, w, h, F.parch);
    b.hline(x, x + w - 1, y, '#f4e9c9');
    b.hline(x, x + w - 1, y + h - 1, F.parchDark);
    for (let i = 1; i < h - 1; i += 2) b.hline(x + 1, x + w - 2 - (Math.floor(r() * 3)), y + i, 'rgba(120,100,70,0.55)');
    b.set(x + 1 + Math.floor(r() * (w - 2)), y, F.ironDark.base);
  }
  // Sinete vermelho e adaga de ferro cravada no canto.
  b.rect(14, -15, 2, 2, '#a8352f');
  b.set(15, -15, '#d05a48');
  b.vline(26, -13, -7, F.iron.base);
  b.rect(25, -15, 3, 3, F.iron.lt);
  b.hline(24, 27, -12, F.ironDark.dk);
  b.outline();
  contact(b, 1, 13, 30, 3, 0.22);
  return { base: s };
}

/** Saco de dormir 1x1 (assento): manta listrada, travesseiro e cordas. */
export function bedroll(variant: string | undefined): BufFurniture {
  const base = BLANKET[variant ?? 'red'] ?? BLANKET.red;
  const m = ramp(base, 0.07);
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  b.ellipse(8, 14.5, 6.5, 2, 'rgba(28,32,52,0.24)');
  // Manta enrolada no chão.
  for (let y = 4; y <= 14; y++) {
    const inset = y === 4 || y === 14 ? 1 : 0;
    b.hline(2 + inset, 13 - inset, y, y < 7 ? m.base : m.dk);
  }
  b.hline(3, 12, 4, m.lt);
  b.hline(3, 12, 5, m.hi);
  // Listras do tecido.
  for (const y of [8, 11]) b.hline(3, 12, y, shade(base, 0.16));
  // Travesseiro na cabeceira.
  b.rect(4, 2, 8, 3, '#e8dcbe');
  b.hline(4, 11, 2, '#f4ecd6');
  b.hline(4, 11, 4, '#c8b995');
  // Cordas e dobra.
  b.vline(6, 6, 13, '#8a6a46');
  b.vline(10, 6, 13, '#8a6a46');
  b.set(6, 6, '#c9a06a');
  b.set(10, 6, '#c9a06a');
  b.outline();
  return { base: s };
}

/** Caixote de suprimentos 1x1: tábuas, travessa em X e saco em cima. */
export function crate(): BufFurniture {
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  b.ellipse(8, 15, 6.5, 1.6, 'rgba(28,32,52,0.24)');
  b.rect(2, 1, 12, 14, F.oldWood.base);
  b.hline(2, 13, 1, F.oldWood.lt);
  b.vline(2, 1, 14, F.oldWood.lt);
  b.vline(13, 1, 14, F.oldWood.dk);
  b.hline(2, 13, 14, F.oldWood.dk);
  for (const x of [5, 8, 11]) b.vline(x, 2, 13, F.oakDark.base);
  b.line(3, 3, 12, 12, F.oakDark.dk);
  b.line(12, 3, 3, 12, F.oakDark.dk);
  for (const [x, y] of [[3, 2], [12, 2], [3, 13], [12, 13]] as const) b.set(x, y, F.iron.base);
  // Saco de estopa e corda em cima.
  b.ellipse(9, 1, 4, 2.4, '#c9a06a');
  b.hline(6, 12, 1, '#e0c58e');
  b.set(7, -1, '#8a6a46');
  b.set(11, -1, '#8a6a46');
  b.outline();
  return { base: s };
}

/** Barril 1x1 com aros de ferro (suprimentos do acampamento). */
export function barrelItem(): BufFurniture {
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  b.ellipse(8, 15, 6.5, 1.6, 'rgba(28,32,52,0.24)');
  barrel(b, 3, 1, 10, 14);
  b.outline();
  return { base: s };
}

/** Árvore do acampamento 1x1: pinheiro em camadas ou carvalho de copa redonda. */
export function campTree(variant: string | undefined): BufFurniture {
  const pine = variant !== 'oak';
  const s = floorSheet(1, 1, 42);
  const b = s.buf;
  b.ellipse(8, 15, 6.5, 2, 'rgba(28,32,52,0.26)');
  // Tronco.
  b.rect(7, 2, 3, 14, CAMP.bark);
  b.vline(7, 2, 15, CAMP.barkLt);
  b.vline(9, 2, 15, CAMP.barkDk);
  if (pine) {
    const layers: readonly [number, number, number][] = [
      [-28, -18, 5],
      [-21, -11, 8],
      [-14, -3, 11],
    ];
    for (const [apexY, baseY, half] of layers) {
      for (let y = apexY; y <= baseY; y++) {
        const t = (y - apexY) / (baseY - apexY);
        const w = Math.max(1, Math.round(t * half));
        b.hline(8 - w, 8 + w, y, t > 0.7 ? CAMP.pine : CAMP.leafDk);
        b.set(8 - w, y, CAMP.pineLt);
        b.set(8 + w, y, '#22422a');
      }
    }
    b.set(8, -30, CAMP.leafDk);
  } else {
    b.ellipse(8, -16, 9, 8, CAMP.leafDk);
    b.ellipse(4, -9, 5, 4.4, CAMP.leafDk);
    b.ellipse(12, -9, 5, 4.4, CAMP.pine);
    b.ellipse(8, -19, 6.5, 5, CAMP.leaf);
    b.ellipse(6, -21, 3.4, 2.6, CAMP.leafLt);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      b.set(Math.round(8 + Math.cos(a) * 7), Math.round(-16 + Math.sin(a) * 7.4), i % 3 === 0 ? CAMP.leafLt : '#2a4a2c');
    }
  }
  b.outline();
  return { base: s };
}

/** Arbusto 1x1 com frutinhas (borda do acampamento). */
export function campBush(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  b.ellipse(8, 14.5, 6.5, 2, 'rgba(28,32,52,0.22)');
  b.ellipse(8, 9, 6.5, 5.5, CAMP.leafDk);
  b.ellipse(4.5, 11, 3.6, 3, CAMP.pine);
  b.ellipse(11.5, 11, 3.6, 3, CAMP.pine);
  b.ellipse(8, 7, 4.6, 3.4, CAMP.leaf);
  b.ellipse(6.5, 5.5, 2, 1.6, CAMP.leafLt);
  // Frutinhas ou flores.
  const dots: readonly [number, number][] = [[5, 8], [10, 7], [7, 11], [12, 10]];
  for (let i = 0; i < dots.length; i++) b.set(dots[i][0], dots[i][1], variant === 'flower' ? (i % 2 ? '#f4e36a' : '#f5f1e6') : '#c04a42');
  b.outline();
  return { base: s };
}

/** Poste com lanterna 1x1: é onde se "acende" o acampamento (spot 'switch'). */
export function lanternPost(): BufFurniture {
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  b.ellipse(8, 15, 5.5, 1.8, 'rgba(28,32,52,0.24)');
  b.rect(7, -20, 2, 35, CAMP.bark);
  b.vline(7, -20, 14, CAMP.barkLt);
  b.vline(8, -20, 14, CAMP.barkDk);
  // Braço de ferro e argola.
  b.hline(4, 8, -20, F.iron.base);
  b.set(4, -20, F.iron.lt);
  b.vline(4, -19, -17, F.iron.base);
  // Lanterna: armação de ferro e vidro quente.
  b.rect(2, -17, 5, 7, F.ironDark.base);
  b.rect(3, -16, 3, 5, '#ffd98a');
  b.set(4, -15, F.flameHot);
  b.hline(2, 6, -12, F.iron.base);
  b.hline(2, 6, -18, F.iron.base);
  b.set(4, -18, F.iron.lt);
  // Base de pedras.
  b.ellipse(8, 14, 4, 1.6, F.stone.base);
  b.outline();
  s.rects = { glow: rectAt(s, 2, -18, 6, 7) };
  return { base: s };
}

// ------------------------------------------------------------------ arena da masmorra

/** Braseiro 1x1: tripé de ferro, cuba com brasas e chamas. Ilumina a arena (rects.glow). */
export function brazier(): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const r = rngOf(7, 61);
  b.ellipse(8, 15, 6.5, 2, 'rgba(22,18,16,0.32)');
  // Tripé de ferro (três pernas abertas) e aro de reforço.
  b.line(8, 8, 4, 15, F.ironDark.base, 1);
  b.line(8, 8, 12, 15, F.ironDark.base, 1);
  b.line(8, 8, 8, 15, F.ironDark.dk, 1);
  b.hline(5, 11, 14, F.ironDark.base);
  b.set(4, 15, F.ironDark.dk);
  b.set(12, 15, F.ironDark.dk);
  // Cuba: borda de ferro batido com rebites.
  b.ellipse(8, 8.5, 6.4, 3.4, F.iron.base);
  b.ellipse(8, 8.2, 5.4, 2.6, '#241f1b');
  b.hline(3, 13, 6, F.iron.lt);
  for (const x of [3, 8, 13]) b.set(x, 9, F.ironDark.dk);
  // Brasas e cinza.
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 4.4;
    b.set(Math.round(8 + Math.cos(a) * d), Math.round(8 + Math.sin(a) * d * 0.5), ['#ffb648', '#ff8a3c', '#e0602a', '#6b6b6b'][i % 4]);
  }
  // Chamas (a maior no centro) e brasa solta no chão.
  flame(b, 8, 7, 7);
  flame(b, 5, 8, 4);
  flame(b, 11, 8, 5);
  b.set(12, 13, '#ff8a3c');
  b.set(13, 14, 'rgba(255,138,60,0.5)');
  b.outline();
  s.rects = { glow: rectAt(s, 1, -1, 14, 12) };
  return { base: s };
}

/** Armação de armas 2x1: moldura de madeira com espadas, lança, machado e escudo. */
export function weaponRack(): BufFurniture {
  const s = floorSheet(2, 1, 18);
  const b = s.buf;
  // Montantes e travessas.
  for (const x of [1, 29]) {
    b.rect(x, -16, 3, 31, F.oakDark.base);
    b.vline(x, -16, 14, F.oakDark.lt);
    b.vline(x + 2, -16, 14, F.oakDark.dd);
  }
  b.rect(1, -16, 31, 3, F.oldWood.base);
  b.hline(1, 31, -16, F.oldWood.hi);
  b.rect(1, -3, 31, 3, F.oldWood.base);
  b.hline(1, 31, -3, F.oldWood.hi);
  // Espada longa ao centro-esquerda: lâmina, guarda e punho.
  b.vline(10, -14, -6, '#cfd6df');
  b.vline(11, -14, -6, '#9aa3af');
  b.hline(8, 13, -6, F.gold);
  b.rect(10, -5, 2, 3, F.leather);
  b.set(10, -2, F.gold);
  // Lança à direita: haste e ponta de ferro.
  b.vline(21, -15, 0, CAMP.bark);
  b.vline(22, -15, 0, CAMP.barkDk);
  b.rect(21, -17, 2, 3, '#cfd6df');
  b.set(21, -18, '#eef2f6');
  // Machado de guerra encostado à esquerda (cabo + lâmina).
  b.vline(5, -14, 0, CAMP.bark);
  b.rect(2, -13, 4, 4, F.iron.base);
  b.hline(2, 5, -13, F.iron.lt);
  b.set(1, -12, F.iron.dk);
  // Escudo redondo pendurado na travessa de baixo.
  b.ellipse(16, -1, 4.4, 3.6, F.oakDark.base);
  b.ellipse(16, -1, 3, 2.4, F.iron.base);
  b.set(16, -2, F.gold);
  b.outline();
  contact(b, 0, 14, 32, 3, 0.24);
  return { base: s };
}

/** Manequim de armadura 1x1: base de madeira, peitoral, ombreiras, elmo e lança. */
export function armorStand(): BufFurniture {
  const s = floorSheet(1, 1, 20);
  const b = s.buf;
  b.ellipse(8, 15, 6.4, 2, 'rgba(22,18,16,0.3)');
  // Base e mastro.
  b.rect(4, 13, 9, 2, F.oakDark.base);
  b.hline(4, 12, 13, F.oakDark.lt);
  b.vline(8, 12, -8, F.oakDark.dk);
  // Peitoral de aço com talhe e rebites.
  b.rect(5, -6, 7, 9, F.iron.base);
  b.rect(6, -5, 5, 7, F.iron.lt);
  b.hline(5, 11, -6, '#d5dbe2');
  b.vline(8, -6, 2, F.iron.dk);
  b.set(6, -4, F.ironDark.dk);
  b.set(10, -4, F.ironDark.dk);
  // Ombreiras arredondadas.
  for (const [cx, sgn] of [[4, -1], [11, 1]] as const) {
    b.ellipse(cx + (sgn < 0 ? 0.5 : -0.5), -6, 2.6, 2, F.iron.base);
    b.set(cx + (sgn < 0 ? 0.5 : -0.5), -8, F.iron.lt);
  }
  // Elmo fechado no topo do mastro.
  b.rect(6, -13, 5, 5, F.iron.base);
  b.hline(6, 10, -13, '#d5dbe2');
  b.vline(8, -12, -9, '#20242a');
  b.hline(6, 10, -9, F.iron.dk);
  b.set(8, -14, F.gold);
  // Lança encostada.
  b.vline(12, -18, 2, CAMP.bark);
  b.rect(12, -20, 1, 3, '#cfd6df');
  b.set(12, -21, '#eef2f6');
  b.outline();
  contact(b, 3, 14, 11, 3, 0.22);
  return { base: s };
}

/** Boneco de treino 1x1: poste, tronco de palha, braços de travessa e espada fincada ao lado. */
export function trainingDummy(): BufFurniture {
  const s = floorSheet(1, 1, 16);
  const b = s.buf;
  const r = rngOf(11, 67);
  b.ellipse(8, 15, 6.2, 2, 'rgba(22,18,16,0.3)');
  // Poste e base de pedra.
  b.rect(7, 4, 3, 11, CAMP.bark);
  b.vline(7, 4, 14, CAMP.barkLt);
  b.vline(9, 4, 14, CAMP.barkDk);
  b.rect(4, 13, 9, 2, F.stone.base);
  b.hline(4, 12, 13, F.stone.lt);
  // Tronco de palha com cordas.
  b.rect(3, -8, 11, 11, '#c2a05c');
  b.hline(3, 13, -8, '#d8bb78');
  b.hline(3, 13, 2, '#9c7c40');
  for (const y of [-5, -1]) {
    b.hline(3, 13, y, '#8a6636');
    b.set(4, y, '#a8814a');
  }
  // Braços de travessa e alvo pintado no peito.
  b.rect(0, -6, 4, 2, CAMP.bark);
  b.rect(13, -6, 4, 2, CAMP.bark);
  b.ellipse(8, -3, 2.4, 2.2, '#f2e6c8');
  b.ellipse(8, -3, 1.2, 1.1, '#a8352f');
  // Cabeça de estopa e palha solta.
  b.ellipse(8, -11, 3.4, 2.8, '#d8bb78');
  b.hline(6, 10, -12, '#e6cd90');
  for (let i = 0; i < 5; i++) b.set(2 + Math.floor(r() * 12), -1 + Math.floor(r() * 3), '#e6cd90');
  // Espada cravada no chão.
  b.vline(14, -6, 13, '#cfd6df');
  b.hline(12, 15, -6, F.gold);
  b.set(14, -7, '#eef2f6');
  b.outline();
  contact(b, 2, 14, 13, 3, 0.22);
  return { base: s };
}

/** Jaula 1x1: base de pedra, grades de ferro e vão escuro (canto da câmara). */
export function cage(): BufFurniture {
  const s = floorSheet(1, 1, 20);
  const b = s.buf;
  const r = rngOf(13, 71);
  b.ellipse(8, 15, 6.4, 2, 'rgba(22,18,16,0.3)');
  // Base e teto de pedra.
  b.rect(1, 12, 14, 3, F.stone.base);
  b.hline(1, 14, 12, F.stone.lt);
  b.rect(2, -10, 12, 3, F.stone.base);
  b.hline(2, 13, -10, F.stone.lt);
  b.hline(2, 13, -8, F.stone.dk);
  // Vão escuro.
  b.rect(2, -7, 12, 19, '#171310');
  for (let i = 0; i < 8; i++) b.set(3 + Math.floor(r() * 10), -4 + Math.floor(r() * 12), '#241d18');
  // Grades verticais e travessa horizontal.
  for (const x of [2, 5, 8, 11, 13]) {
    b.vline(x, -8, 11, F.iron.base);
    b.set(x, -8, F.iron.lt);
    b.set(x, 11, F.ironDark.dk);
  }
  b.hline(2, 13, 0, F.iron.base);
  b.hline(2, 13, -6, F.ironDark.dk);
  // Fecho e argola.
  b.rect(7, 1, 3, 2, F.ironDark.base);
  b.set(8, 1, F.gold);
  b.outline();
  contact(b, 1, 14, 14, 3, 0.22);
  return { base: s };
}

/** Baú de tesouro FECHADO 1x1: madeira, ferragens, fechadura e moedas no chão. */
export function treasureChest(): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  b.ellipse(8, 15, 6.4, 2, 'rgba(22,18,16,0.3)');
  // Corpo de tábuas.
  b.rect(2, 6, 12, 8, F.oakDark.base);
  b.hline(2, 13, 6, F.oakDark.lt);
  b.hline(2, 13, 13, F.oakDark.dd);
  for (const x of [5, 8, 11]) b.vline(x, 7, 12, F.oakDark.dk);
  // Tampa arredondada, fechada.
  b.rect(2, 1, 12, 5, F.oldWood.base);
  b.hline(2, 13, 1, F.oldWood.hi);
  b.ellipse(8, 2, 6, 2.2, F.oldWood.lt);
  for (let x = 3; x < 13; x += 3) b.set(x, 3, F.oldWood.dk);
  // Aros e fechadura.
  for (const x of [3, 12]) {
    b.rect(x, 1, 2, 13, F.iron.base);
    b.set(x, 13, F.ironDark.dk);
  }
  b.rect(7, 5, 3, 4, F.iron.base);
  b.hline(7, 9, 5, F.iron.lt);
  b.set(8, 7, '#241f1b');
  b.set(8, 9, F.gold);
  // Moedas espalhadas na base.
  for (const [x, y] of [[1, 13], [13, 14], [2, 15], [5, 14]] as const) {
    b.set(x, y, F.gold);
    b.set(x + 1, y, shade(F.gold, -0.2));
  }
  b.outline();
  contact(b, 1, 14, 14, 3, 0.24);
  return { base: s };
}

/** Banco de pedra 2x1 (assento dos espectadores da arena): laje sobre dois blocos, com musgo. */
export function benchStone(): BufFurniture {
  const s = floorSheet(2, 1, 10);
  const b = s.buf;
  const r = rngOf(17, 73);
  // Dois blocos de apoio.
  for (const x of [2, 25]) {
    b.rect(x, 6, 5, 9, F.stone.base);
    b.hline(x, x + 4, 6, F.stone.lt);
    b.vline(x + 4, 6, 14, F.stone.dk);
    b.hline(x, x + 4, 14, F.stone.dd);
  }
  // Laje do assento: topo claro, frente escura.
  b.rect(0, 0, 32, 8, F.stone.base);
  b.hline(0, 31, 0, F.stone.hi);
  b.hline(1, 30, 1, F.stone.lt);
  b.hline(0, 31, 7, F.stone.dk);
  b.hline(0, 31, 8, F.stone.dd);
  // Rachaduras e musgo nas quinas.
  b.hline(6, 12, 5, F.stone.dk);
  b.set(18, 3, F.stone.dk);
  b.set(19, 4, F.stone.dk);
  for (const [x, y] of [[1, 2], [14, 1], [29, 2], [9, 7]] as const) b.set(x, y, r() < 0.5 ? CAMP.leafDk : CAMP.leaf);
  b.outline();
  contact(b, 0, 13, 32, 3, 0.22);
  return { base: s };
}

/** Grade levadiça 2 tiles: vão escuro, barras de ferro, travessas e ferros em ponta na base. */
export function portcullis(): BufFurniture {
  const s = wallSheet(2, 3);
  const b = s.buf;
  const x0 = 1;
  const y0 = -28;
  const w = 30;
  const h = 26;
  // Vão escuro da passagem (a câmara além do portão).
  b.rect(x0, y0, w, h, '#141110');
  b.hline(x0, x0 + w - 1, y0, '#0d0b0a');
  // Moldura de pedra em volta do vão.
  b.rect(x0 - 2, y0 - 2, 2, h + 4, F.stone.base);
  b.rect(x0 + w, y0 - 2, 2, h + 4, F.stone.base);
  b.rect(x0 - 2, y0 - 3, w + 4, 3, F.stone.base);
  b.hline(x0 - 2, x0 + w + 1, y0 - 3, F.stone.lt);
  for (let x = x0 - 2; x < x0 + w + 2; x += 4) b.set(x, y0 - 2, F.stone.dk);
  // Barras verticais e travessas horizontais de ferro.
  for (let x = x0 + 1; x < x0 + w; x += 4) {
    b.vline(x, y0, y0 + h - 1, F.iron.base);
    b.set(x, y0, F.iron.lt);
    b.set(x, y0 + h - 1, F.ironDark.dk);
  }
  for (const y of [y0 + 5, y0 + 13, y0 + 21]) {
    b.hline(x0, x0 + w - 1, y, F.iron.base);
    b.hline(x0, x0 + w - 1, y + 1, F.ironDark.dk);
  }
  // Pontas de ferro na base (parecem suspensas logo acima do chão).
  for (let x = x0 + 1; x < x0 + w; x += 4) {
    b.set(x, y0 + h, F.iron.lt);
    b.set(x, y0 + h + 1, F.iron.dk);
  }
  // Corrente da qual a grade pende.
  for (let y = y0 - 3; y < y0 + 2; y += 2) b.rect(15, y, 2, 1, F.ironDark.base);
  b.outline();
  return { base: s };
}

/** Corrente de parede 1 tile: argola, elos alternados e gancho na ponta. */
export function chainItem(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  // Argola de fixação.
  b.ellipse(8, -30, 3, 2, F.iron.base);
  b.ellipse(8, -30, 1.6, 0.9, '#141110');
  // Elos: alternando na vertical (um estreito, um largo).
  let y = -28;
  let i = 0;
  while (y < -6) {
    if (i % 2 === 0) {
      b.rect(7, y, 2, 3, F.iron.base);
      b.set(7, y, F.iron.lt);
    } else {
      b.rect(6, y, 4, 2, F.iron.base);
      b.set(6, y, F.iron.lt);
      b.set(9, y + 1, F.ironDark.dk);
    }
    y += i % 2 === 0 ? 3 : 2;
    i++;
  }
  // Gancho na ponta.
  b.rect(7, y, 2, 2, F.ironDark.base);
  b.vline(8, y + 2, y + 4, F.iron.base);
  b.set(9, y + 4, F.iron.lt);
  b.set(7, y + 4, F.ironDark.dk);
  b.outline();
  return { base: s };
}

/** Archote de parede 1 tile: suporte de ferro, cabo de madeira, chama e halo (rects.glow). */
export function wallTorch(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  // Suporte de ferro em "L" e chapa.
  b.rect(6, -22, 2, 8, F.ironDark.base);
  b.hline(6, 9, -15, F.iron.base);
  b.set(9, -16, F.iron.lt);
  b.rect(5, -14, 4, 2, F.ironDark.dk);
  // Cabo de madeira inclinado para fora da parede.
  b.line(7, -14, 9, -22, CAMP.bark, 2);
  b.line(8, -14, 10, -22, CAMP.barkDk, 1);
  // Chama e fagulhas.
  flame(b, 10, -22, 6);
  b.set(7, -27, 'rgba(255,182,72,0.5)');
  b.set(12, -25, 'rgba(255,182,72,0.4)');
  b.outline();
  s.rects = { glow: rectAt(s, 5, -28, 8, 10) };
  return { base: s };
}

/** Estandarte da casa 1 tile: haste, pano com brasão e barra recortada. variants = cor. */
const BANNER_MATS: Readonly<Record<string, Ramp>> = {
  red: ramp('#9c2f2c', 0.07),
  blue: ramp('#2f4f86', 0.07),
  green: ramp('#3d6b42', 0.07),
  gold: ramp('#b0862f', 0.07),
  violet: ramp('#5d3f80', 0.07),
  teal: ramp('#2f7a7a', 0.07),
};

export function banner(variant: string | undefined): BufFurniture {
  const m = BANNER_MATS[variant ?? 'red'] ?? BANNER_MATS.red;
  const s = wallSheet(1);
  const b = s.buf;
  // Haste de ferro com ponteiras.
  b.rect(1, -31, 14, 2, F.ironDark.base);
  b.hline(1, 14, -31, F.iron.base);
  for (const x of [1, 13]) b.set(x, -29, F.gold);
  b.set(14, -30, F.gold);
  // Pano: dois panos com sombra na dobra central.
  b.rect(2, -29, 11, 20, m.base);
  b.vline(2, -29, -10, m.lt);
  b.vline(12, -29, -10, m.dd);
  b.vline(7, -29, -10, m.dk);
  b.hline(2, 12, -29, m.hi);
  // Barra recortada (duas pontas em V) e fios soltos na ponta do pano.
  for (let x = 2; x < 13; x++) {
    const notch = x > 4 && x < 11 ? 2 : 0;
    if (notch) b.clearRect(x, -10, 1, notch);
    b.set(x, -11 + notch, m.dk);
  }
  for (const x of [3, 5, 9, 11]) b.set(x, -9, m.dk);
  // Brasão: escudo de ouro com esmalte e uma espada.
  b.rect(5, -25, 5, 6, F.gold);
  b.rect(6, -24, 3, 4, m.dk);
  b.vline(7, -24, -21, '#f2f4f8');
  b.hline(6, 8, -22, '#d5dbe2');
  b.outline();
  return { base: s };
}

// ------------------------------------------------------------------ biomas da masmorra

/** Marfim velho dos ossos (cripta, covil). */
const BONE = { hi: '#f3edde', base: '#d8d0ba', dk: '#aaa189', dd: '#7c7461' } as const;

/** Tons de osso: claro (os de cima) e gasto (os do fundo do monte). */
const BONE_LIT = { hi: BONE.hi, base: BONE.base, dk: BONE.dk } as const;
const BONE_OLD = { hi: BONE.dk, base: BONE.dk, dk: BONE.dd } as const;

/** Osso comprido: haste de 2px com nós arredondados nas duas pontas. */
function longBone(
  b: PixelBuf,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  m: { hi: string; base: string; dk: string } = BONE_LIT,
): void {
  b.line(x0, y0, x1, y1, m.base, 2);
  for (const [kx, ky] of [[x0, y0], [x1, y1]] as const) {
    b.rect(kx - 1, ky - 1, 3, 3, m.base);
    b.set(kx - 1, ky - 1, m.hi);
    b.set(kx + 1, ky + 1, m.dk);
  }
}

/** Pilha de ossos 1x1: fêmures cruzados, costelas e uma caveira no alto do monte. */
export function bonePile(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  const r = rngOf(seed, 79);
  b.ellipse(8, 15, 6.6, 2, 'rgba(20,17,15,0.34)');
  // Fundo do monte: ossos velhos, mais apagados.
  longBone(b, 2, 13, 11, 12, BONE_OLD);
  longBone(b, 1, 10, 9, 14, BONE_OLD);
  longBone(b, 4, 9, 12, 13, BONE_OLD);
  // Ossos de cima, claros e cruzados.
  longBone(b, 2, 12, 11, 8);
  longBone(b, 5, 14, 13, 11);
  // Costelas curvas saindo do monte.
  for (let i = 0; i < 3; i++) {
    const x = 2 + i * 4;
    b.line(x, 12, x + 2, 9, BONE.dk);
    b.set(x + 2, 9, BONE.base);
    b.set(x + 3, 10, BONE.dd);
  }
  // Fragmentos de osso na poeira.
  for (let i = 0; i < 4; i++) b.set(1 + Math.floor(r() * 14), 13 + Math.floor(r() * 2), i % 2 ? BONE.dk : BONE.dd);
  // Sombra sob a mandíbula: separa a caveira do monte.
  b.hline(5, 11, 9, 'rgba(22,18,16,0.55)');
  // Caveira virada para a câmera, no topo do monte.
  b.rect(5, 2, 7, 5, '#ded7c4');
  b.hline(5, 11, 2, '#f1ebd9');
  b.vline(5, 2, 6, '#ece5d2');
  b.vline(11, 2, 6, '#b3aa93');
  b.rect(6, 4, 2, 2, '#241f1b');
  b.rect(9, 4, 2, 2, '#241f1b');
  b.set(8, 5, '#241f1b');
  b.set(7, 3, '#f7f2e4');
  b.rect(6, 7, 5, 2, '#d8d0ba');
  b.hline(6, 10, 7, '#e8e1cf');
  for (const x of [7, 9]) b.vline(x, 7, 8, '#8f8774');
  b.hline(6, 10, 8, '#a89f88');
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  return { base: s };
}

/**
 * Sarcófago 2x1: caixão de pedra lavrada em 3/4 — tampa em perspectiva, deslocada para a ponta e
 * erguida na cabeceira (vão escuro à mostra), painel entalhado com caveira em relevo e pó.
 */
export function sarcophagus(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 14);
  const b = s.buf;
  const st = F.stone;
  const face = ramp('#6f6b61', 0.06); // pedra da caixa, mais escura que a tampa
  const r = rngOf(seed, 103);
  const LX = 2;
  const RX = 29;
  b.ellipse(16, 15.4, 15, 2, 'rgba(18,16,14,0.34)');
  // Caixa: face frontal escura, com aresta de topo iluminada e quina direita na sombra.
  b.rect(LX, 3, RX - LX + 1, 9, face.base);
  b.hline(LX, RX, 3, face.lt);
  b.vline(LX, 3, 11, face.lt);
  b.vline(RX, 3, 11, face.dd);
  b.hline(LX, RX, 11, face.dd);
  // Painel escavado com moldura e caveira em baixo-relevo claro.
  b.rect(5, 4, 22, 7, face.dd);
  b.hline(5, 26, 4, '#514d45');
  b.rect(6, 5, 20, 5, '#5b574d');
  // Crânio 9px: topo estreito, órbitas fundas, narinas e mandíbula com dentes.
  b.rect(13, 4, 5, 1, st.lt);
  b.rect(12, 5, 7, 1, st.lt);
  b.rect(11, 6, 9, 2, st.lt);
  b.hline(11, 19, 6, st.hi);
  b.rect(12, 6, 2, 2, '#2f2b25');
  b.rect(17, 6, 2, 2, '#2f2b25');
  b.set(15, 7, '#2f2b25');
  b.rect(12, 8, 7, 2, st.base);
  b.hline(12, 18, 8, st.lt);
  for (const x of [13, 15, 17]) b.set(x, 8, '#3a362f');
  b.hline(12, 18, 9, '#3a362f');
  // Plinto mais largo que a caixa: degrau na silhueta (lê como caixão, não como viga).
  b.rect(LX - 1, 12, RX - LX + 3, 2, face.dk);
  b.hline(LX - 1, RX + 1, 12, face.base);
  b.hline(LX - 1, RX + 1, 13, face.dd);
  // Tampa: laje inclinada (~3px em 28) — cabeceira erguida, ponta apoiada — e deslocada à direita.
  const tilt = (x: number) => Math.round(((x - 3) / 28) * 3);
  for (let x = 3; x <= 31; x++) {
    const dy = tilt(x);
    b.vline(x, -8 + dy, -1 + dy, x < 18 ? st.lt : st.base);
    b.set(x, -8 + dy, st.hi);
    b.set(x, -7 + dy, st.hi);
    b.set(x, -2 + dy, st.base);
    b.set(x, -1 + dy, st.dk);
  }
  // Vão escuro entre a tampa erguida e a boca da caixa (some na ponta, onde ela assenta).
  for (let x = 3; x <= 31; x++) {
    const bot = -1 + tilt(x);
    if (bot + 1 <= 2) b.vline(x, bot + 1, 2, '#1b1712');
  }
  // Faixa entalhada a meio da tampa, com runas quase apagadas.
  for (let x = 5; x <= 29; x++) {
    const dy = tilt(x);
    b.set(x, -5 + dy, st.base);
    b.set(x, -4 + dy, st.base);
  }
  for (const gx of [9, 14, 19, 24] as const) {
    const dy = tilt(gx);
    b.set(gx, -5 + dy, st.dk);
    b.set(gx + 1, -4 + dy, st.dk);
  }
  b.set(20, -5 + tilt(20), 'rgba(127,224,208,0.5)');
  // Pó assentado sobre a tampa e no plinto.
  for (let i = 0; i < 8; i++) {
    b.set(4 + Math.floor(r() * 27), -6 + tilt(4) + Math.floor(r() * 4), i % 3 ? 'rgba(214,210,196,0.45)' : 'rgba(214,210,196,0.65)');
  }
  b.outline();
  contact(b, 1, 13, 30, 3, 0.24);
  return { base: s };
}

/** Chapéu e cores dos cogumelos luminosos da gruta. */
const MUSH = { hi: '#cbfff4', lt: '#63c9bb', base: '#3fa79b', dk: '#1d6a68', gill: '#123f3f', spore: '#7fe0d0' } as const;

/** Chapéu de cogumelo: silhueta escura, domo aceso, luz no alto e lamínulas na aba. */
function capDome(b: PixelBuf, cx: number, top: number, rx: number, ry: number): void {
  // Borda escura: dá a silhueta do chapéu contra a penumbra.
  for (let i = 0; i <= ry; i++) {
    const half = Math.max(1, Math.round(rx * Math.sqrt((i + 1) / (ry + 1))));
    b.hline(Math.round(cx - half), Math.round(cx + half) - 1, top + i, MUSH.dk);
  }
  // Miolo do chapéu, 1px por dentro da borda.
  for (let i = 1; i <= ry; i++) {
    const half = Math.max(0, Math.round(rx * Math.sqrt((i + 1) / (ry + 1))) - 1);
    if (half < 1) continue;
    b.hline(Math.round(cx - half), Math.round(cx + half) - 1, top + i, MUSH.base);
  }
  const w = Math.round(rx);
  // Luz de cima/esquerda e pintas luminosas.
  b.hline(Math.round(cx) - w + 2, Math.round(cx) + w - 3, top + 1, MUSH.lt);
  b.set(Math.round(cx) + Math.max(1, w - 2), top + Math.max(1, ry - 1), MUSH.hi);
  // Lamínulas sob a aba.
  b.hline(Math.round(cx) - w + 2, Math.round(cx) + w - 2, top + ry + 1, MUSH.gill);
}

/** Cogumelo: caule escuro e chapéu luminoso. (cx, foot) = centro da base. */
function glowMushroom(b: PixelBuf, cx: number, foot: number, rx: number, h: number): void {
  const top = foot - h;
  const x0 = Math.round(cx) - 1;
  b.rect(x0, top + 3, 2, Math.max(1, foot - top - 3), '#46554d');
  b.vline(x0, top + 3, foot - 1, '#5f7168');
  b.vline(x0 + 1, top + 3, foot - 1, '#26302c');
  b.set(x0, foot - 1, '#1d2522');
  capDome(b, cx, top, rx, Math.max(1, Math.round(rx * 0.55)));
}

/** Moita de cogumelos 1x1: quatro chapéus ciano acesos sobre caules escuros. */
export function mushroomCluster(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  const r = rngOf(seed, 83);
  b.ellipse(8, 15, 6.4, 2, 'rgba(16,26,24,0.34)');
  b.ellipse(8, 13.6, 6.6, 2.4, 'rgba(90,210,196,0.1)');
  glowMushroom(b, 4.5, 15, 3.6, 11);
  glowMushroom(b, 12, 15, 2.6, 6);
  glowMushroom(b, 2, 14, 1.8, 4);
  glowMushroom(b, 13.5, 15, 1.8, 3);
  // Esporos suspensos na penumbra.
  for (let i = 0; i < 6; i++) b.set(1 + Math.floor(r() * 14), Math.floor(r() * 9), 'rgba(127,224,208,0.55)');
  b.outline();
  s.rects = { glow: rectAt(s, 0, 0, 16, 14) };
  return { base: s };
}

/** Matizes das facetas (luz à esquerda, sombra à direita). */
interface FacetMat {
  hi: string;
  lt: string;
  base: string;
  dk: string;
}

const CRYSTALS: Readonly<Record<'violet' | 'cyan' | 'pale', FacetMat>> = {
  violet: { hi: '#ece0ff', lt: '#bda6f8', base: '#7f61d8', dk: '#4a3591' },
  cyan: { hi: '#e2fbff', lt: '#9fe8f2', base: '#49b6cd', dk: '#276f83' },
  pale: { hi: '#f4eaff', lt: '#d3c0ff', base: '#9b7fe6', dk: '#5b459c' },
};

/** Prisma de cristal: três facetas verticais e ponta luminosa. (cx, foot) = base. */
function facetPillar(b: PixelBuf, cx: number, foot: number, h: number, hw: number, m: FacetMat): void {
  for (let i = 0; i < h; i++) {
    const t = i / Math.max(1, h - 1);
    const half = Math.max(0, Math.round(hw * Math.pow(1 - t, 0.8)));
    const y = foot - i;
    b.hline(cx - half, cx + half, y, m.base);
    if (half < 1) {
      b.set(cx, y, m.hi);
      continue;
    }
    b.set(cx - half, y, m.lt);
    b.set(cx + half, y, m.dk);
    b.set(cx, y, m.hi);
  }
}

/** Aglomerado de cristais 1x1: quatro prismas violeta/ciano sobre uma rocha escura. */
export function crystalShard(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const r = rngOf(seed, 89);
  b.ellipse(8, 15, 6.6, 2, 'rgba(18,14,26,0.34)');
  // Rocha de base lascada.
  b.ellipse(8, 14, 6.2, 2.4, '#3a3348');
  b.hline(4, 11, 12, '#4a4258');
  b.set(3, 14, '#2d2738');
  b.set(12, 15, '#2d2738');
  facetPillar(b, 7, 14, 16, 3, CRYSTALS.violet);
  facetPillar(b, 12, 14, 11, 2, CRYSTALS.cyan);
  facetPillar(b, 3, 15, 8, 2, CRYSTALS.pale);
  facetPillar(b, 10, 15, 5, 1, CRYSTALS.cyan);
  // Faíscas de luz ao redor do aglomerado.
  for (let i = 0; i < 6; i++) b.set(1 + Math.floor(r() * 14), Math.floor(r() * 8), 'rgba(198,222,255,0.55)');
  b.outline();
  s.rects = { glow: rectAt(s, 1, 0, 14, 15) };
  return { base: s };
}

/** Gelo azulado da caverna fria. */
const ICE = { hi: '#f4fcff', lt: '#dcf4ff', base: '#8fc8e6', mid: '#5f9ec6', dk: '#3c6f96' } as const;

/** Estalagmite de gelo: aresta viva à esquerda, núcleo translúcido e lascas brancas. */
function icePillar(b: PixelBuf, cx: number, foot: number, h: number, hw: number, lean = 0): void {
  for (let i = 0; i < h; i++) {
    const t = i / Math.max(1, h - 1);
    const half = Math.max(0, Math.round(hw * Math.pow(1 - t, 0.72)));
    const x = cx + Math.round(t * lean);
    const y = foot - i;
    b.hline(x - half, x + half, y, ICE.base);
    if (half < 1) {
      b.set(x, y, ICE.hi);
      continue;
    }
    b.set(x - half, y, ICE.hi);
    b.set(x + half, y, ICE.dk);
    b.set(x, y, ICE.lt);
    if (i % 3 === 1 && half >= 2) b.set(x - 1, y, '#ffffff');
  }
}

/** Espigões de gelo 1x1: três estalagmites translúcidas sobre gelo rachado. */
export function iceSpike(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  const r = rngOf(seed, 91);
  b.ellipse(8, 15, 6.8, 1.8, 'rgba(18,26,34,0.28)');
  // Laje de gelo com rachaduras.
  b.ellipse(8, 14.6, 5.8, 2, '#a4d2e8');
  b.hline(4, 11, 13, '#ccecf8');
  b.line(3, 14, 7, 15, ICE.mid);
  b.line(10, 14, 13, 15, ICE.mid);
  b.set(6, 14, ICE.hi);
  icePillar(b, 7, 14, 16, 2.6);
  icePillar(b, 12, 15, 11, 2, 1);
  icePillar(b, 3, 15, 8, 2, -1);
  icePillar(b, 10, 15, 4, 1);
  // Névoa fria colada nas estalagmites (posições fixas, só o tom varia com a seed).
  const mist = ['rgba(214,242,255,0.4)', 'rgba(214,242,255,0.5)'][Math.floor(r() * 2)];
  for (const [x, y] of [[2, 6], [14, 5], [5, 1]] as const) b.set(x, y, mist);
  b.outline();
  contact(b, 2, 14, 12, 2, 0.2);
  return { base: s };
}

/** Poça de lava 2x1: crosta de pedra rachada em volta do metal fundido, com bolhas. */
export function lavaPool(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 6);
  const b = s.buf;
  const r = rngOf(seed, 97);
  b.ellipse(16, 14.8, 15, 2, 'rgba(18,12,8,0.34)');
  // Crosta de pedra em volta (anel escuro) e aresta iluminada no arco de cima.
  b.ellipse(16, 8, 14.8, 6.4, '#3a2a20');
  b.ellipse(16, 8.2, 13.6, 5.6, '#4b382b');
  for (let a = Math.PI; a <= Math.PI * 2; a += 0.1) {
    b.set(Math.round(16 + Math.cos(a) * 14.1), Math.round(8 + Math.sin(a) * 6), '#57422f');
  }
  // Rachaduras na crosta, com brasa no fundo de cada uma.
  const cracks: readonly [number, number, number, number][] = [
    [2, 5, 7, 3],
    [25, 3, 29, 6],
    [3, 12, 8, 11],
    [23, 12, 28, 10],
  ];
  for (const [x0, y0, x1, y1] of cracks) {
    b.line(x0, y0, x1, y1, '#1d120c');
    b.set(x0, y0, '#d1541a');
  }
  // Poça: borda em brasa, miolo amarelo e núcleo branco-quente.
  b.ellipse(16, 8.4, 11.4, 4.6, '#2a1a12');
  b.ellipse(16, 8.6, 10.2, 3.9, '#a8300d');
  b.ellipse(15.8, 8.2, 8.2, 3, '#dd5c19');
  b.ellipse(15.4, 7.8, 5.6, 2.1, '#f79a2a');
  b.ellipse(15, 7.4, 3.2, 1.2, '#ffd45c');
  b.set(15, 7, '#fff3b4');
  // Bolhas que estouram na superfície.
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.25 + r() * 0.6;
    const bx = Math.round(16 + Math.cos(a) * 9.4 * d);
    const by = Math.round(8 + Math.sin(a) * 3.4 * d);
    b.ellipse(bx, by, 1.5, 1, '#ffd45c');
    b.set(bx, by, '#b83a10');
  }
  // Fagulhas subindo da superfície.
  for (const [fx, fy] of [[10, 1], [16, 0], [21, 1]] as const) b.set(fx, fy, 'rgba(255,168,72,0.55)');
  b.outline();
  contact(b, 2, 12, 28, 3, 0.28);
  s.rects = { glow: rectAt(s, 2, 1, 28, 13) };
  return { base: s };
}

/** Teia de parede 1 tile: raios ancorados nas quinas e bordas, três anéis e uma aranha. */
export function webWall(seed: number): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const r = rngOf(seed, 101);
  // Fios finos: alfa < 160 para o contorno automático não engordar a teia.
  const silk = 'rgba(232,240,252,0.6)';
  const silkDim = 'rgba(212,224,242,0.42)';
  const knot = 'rgba(246,250,255,0.85)';
  const cx = 8;
  const cy = -16;
  // Pontas em ordem angular: quinas, topo/baixo e meias-laterais.
  const tips: readonly [number, number][] = [
    [2, -29],
    [7, -31],
    [13, -29],
    [14, -20],
    [13, -6],
    [8, -3],
    [2, -6],
    [1, -20],
  ];
  const strand = (x0: number, y0: number, x1: number, y1: number, c: string): void => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      b.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
    }
  };
  // Anéis primeiro (mais apagados): curvas que caem um pouco entre dois raios.
  for (const f of [0.38, 0.66, 0.9]) {
    for (let i = 0; i < tips.length; i++) {
      const [ax, ay] = tips[i];
      const [bx, by] = tips[(i + 1) % tips.length];
      const p0: [number, number] = [cx + (ax - cx) * f, cy + (ay - cy) * f];
      const p1: [number, number] = [cx + (bx - cx) * f, cy + (by - cy) * f];
      const sag: [number, number] = [cx + ((p0[0] + p1[0]) / 2 - cx) * 0.86, cy + ((p0[1] + p1[1]) / 2 - cy) * 0.86];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const u = 1 - t;
        const x = u * u * p0[0] + 2 * u * t * sag[0] + t * t * p1[0];
        const y = u * u * p0[1] + 2 * u * t * sag[1] + t * t * p1[1];
        b.set(Math.round(x), Math.round(y), silkDim);
      }
    }
  }
  // Raios por cima dos anéis: é o que faz a leitura de teia.
  for (const [tx, ty] of tips) strand(cx, cy, tx, ty, silk);
  // Nós onde a teia se prende nas quinas.
  for (const [tx, ty] of [[2, -29], [13, -29], [2, -6], [13, -6]] as const) b.set(tx, ty, knot);
  // Aranha (corpo escuro opaco => ganha contorno): fio, pernas curtas e cabeça com olhos.
  strand(cx, cy, 11, -11, silk);
  for (const [ex, ey] of [[9, -12], [8, -10], [9, -8], [10, -7], [13, -12], [14, -10], [13, -8], [12, -7]] as const) {
    b.line(11, -10, ex, ey, '#3a3342');
  }
  b.ellipse(10.6, -11, 2, 1.8, '#241f2b');
  b.set(10, -12, '#3d3549');
  b.rect(10, -9, 2, 2, '#1d1924');
  b.set(10, -8, '#c4544a');
  b.set(12, -8, '#c4544a');
  // Fio rompido que pende da teia (o comprimento varia com a seed).
  strand(4, -13, 4, -13 + 3 + Math.floor(r() * 4), silkDim);
  b.outline();
  return { base: s };
}

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
    case 'glass_partition':
      return glassPartition(variant);
    case 'counter':
      return counter(variant);
    case 'counter_sink':
      return counterSink();
    case 'cafe_chair':
      return cafeChair(variant);
    case 'toilet_stall':
      return toiletStall(state);
    case 'sink':
      return sink();
    case 'reception_desk':
      return receptionDesk(seed);
    case 'bench':
      return bench();
    case 'mirror':
      return mirror();
    case 'shelf_wall':
      return shelfWall(seed);
    case 'sign':
      return sign();
    case 'door_frame':
      return doorFrame();
    case 'light_switch':
      return lightSwitch(variant);
    case 'elevator':
      return elevator(state);
    // --- acampamento (só existe na skin de fantasia; o layout escolhe estes kinds no campo)
    case 'campfire':
      return campfire(seed);
    case 'stone_table':
      return stoneTable(seed);
    case 'stone_table_back':
      return stoneTableBack(seed);
    case 'stone_stool':
      return stoneStool(seed);
    case 'rune_mat':
      return runeMat(seed);
    case 'anvil_block':
      return anvilBlock(seed);
    case 'alchemy_pot':
      return alchemyPot(seed);
    case 'grindstone':
      return grindstone(seed);
    case 'cushion':
      return cushion(variant);
    case 'camp_table':
      return campTable(variant, seed);
    case 'camp_table_back':
      return campTableBack(variant, seed);
    case 'stump':
      return stump(variant);
    case 'log_seat':
      return logSeat();
    case 'tent':
      return tent(variant, seed);
    case 'quest_board':
      return questBoard(seed);
    case 'bedroll':
      return bedroll(variant);
    case 'crate':
      return crate();
    case 'barrel':
      return barrelItem();
    case 'camp_tree':
      return campTree(variant);
    case 'camp_bush':
      return campBush(variant);
    case 'lantern_post':
      return lanternPost();
    // --- arena da masmorra
    case 'brazier':
      return brazier();
    case 'weapon_rack':
      return weaponRack();
    case 'armor_stand':
      return armorStand();
    case 'training_dummy':
      return trainingDummy();
    case 'cage':
      return cage();
    case 'chest':
      return treasureChest();
    case 'bench_stone':
      return benchStone();
    case 'portcullis':
      return portcullis();
    case 'chain':
      return chainItem();
    case 'wall_torch':
      return wallTorch();
    case 'banner':
      return banner(variant);
    // --- biomas da masmorra
    case 'sarcophagus':
      return sarcophagus(seed);
    case 'bone_pile':
      return bonePile(seed);
    case 'mushroom_cluster':
      return mushroomCluster(seed);
    case 'crystal_shard':
      return crystalShard(seed);
    case 'ice_spike':
      return iceSpike(seed);
    case 'lava_pool':
      return lavaPool(seed);
    case 'web_wall':
      return webWall(seed);
    default:
      return undefined;
  }
}
