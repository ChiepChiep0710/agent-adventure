// Chefes de sala da skin de fantasia: cada câmara da masmorra tem o seu dono, parado no centro do
// poço da arena. Não é um monstro que segue o personagem: é parte do cenário do bioma, com nome,
// barra de vida e uma pose de "acordado" quando alguém da sala está trabalhando de verdade.
//
// Desenho em PixelBuf (puro, testável em Node) com 2x2 tiles de footprint e a âncora no pé, então o
// renderizador cola o chefe no chão do poço como qualquer outro sprite de chão.
//
// Quadros: 0 = parado (respirando), 1 = erguendo o golpe, 2 = ferido (recuo).
import { PixelBuf } from './core/pixbuf';
import { floorSheet, type BufSprite } from './core/sprite';

/** Chefes, um por bioma da masmorra. */
export type BossKind =
  | 'sand_mummy'
  | 'bone_lord'
  | 'magma_golem'
  | 'frost_warden'
  | 'moss_horror'
  | 'crystal_queen'
  | 'drowned_king';

export const BOSS_KINDS: readonly BossKind[] = [
  'sand_mummy',
  'bone_lord',
  'magma_golem',
  'frost_warden',
  'moss_horror',
  'crystal_queen',
  'drowned_king',
];

export const BOSS_FRAMES = 3;

interface Palette {
  dark: string;
  base: string;
  light: string;
  accent: string;
  eye: string;
}

const PALETTES: Readonly<Record<BossKind, Palette>> = {
  sand_mummy: { dark: '#6b5330', base: '#a8864f', light: '#d8bd85', accent: '#5b4526', eye: '#ffd166' },
  bone_lord: { dark: '#5d5a52', base: '#b9b2a0', light: '#e8e2d2', accent: '#3f3b36', eye: '#8fe3ff' },
  magma_golem: { dark: '#2b2320', base: '#54453c', light: '#7d675a', accent: '#ff7a1a', eye: '#ffd166' },
  frost_warden: { dark: '#4a6f86', base: '#8fb8d3', light: '#dff1ff', accent: '#3c6f93', eye: '#9ce8ff' },
  moss_horror: { dark: '#33401f', base: '#4d5d33', light: '#7c8f4a', accent: '#a8c46a', eye: '#b7ff6a' },
  crystal_queen: { dark: '#3a2a55', base: '#6b4f96', light: '#a98ed6', accent: '#7de0ff', eye: '#e8fbff' },
  drowned_king: { dark: '#1f3c42', base: '#356a6b', light: '#5d9a92', accent: '#4fc3b8', eye: '#a8ffe4' },
};

/** Para o texto do nome do chefe e a cor do letreiro/barra. */
export function bossPalette(kind: BossKind): Palette {
  return PALETTES[kind];
}

/** 0 = parado, 1 = golpe, 2 = ferido. */
const clampFrame = (f: number): 0 | 1 | 2 => (f <= 0 ? 0 : f >= 2 ? 2 : 1);

interface Body {
  buf: PixelBuf;
  p: Palette;
  /** Deslocamento vertical do corpo no quadro (respiração/recuo). */
  dy: number;
}

/** Tronco + ombros + braços: a base de todo chefe humanoide. */
function trunk(b: Body, w: number, h: number, shoulder: number): void {
  const { buf, p } = b;
  const cx = 16;
  const top = 32 - h + b.dy;
  // capa/sombra por trás
  buf.ellipse(cx, top + h * 0.62, w * 0.62, h * 0.42, p.dark);
  // tronco
  buf.ellipse(cx, top + h * 0.58, w * 0.5, h * 0.4, p.base);
  // luz do lado esquerdo
  buf.ellipse(cx - w * 0.18, top + h * 0.5, w * 0.22, h * 0.26, p.light);
  // ombros
  buf.rect(cx - shoulder, top + Math.round(h * 0.28), shoulder * 2, 3, p.base);
  buf.rect(cx - shoulder, top + Math.round(h * 0.28), shoulder * 2, 1, p.light);
  // braços
  buf.rect(cx - shoulder - 1, top + Math.round(h * 0.3), 3, Math.round(h * 0.42), p.dark);
  buf.rect(cx + shoulder - 2, top + Math.round(h * 0.3), 3, Math.round(h * 0.42), p.dark);
}

/** Cabeça redonda com olhos acesos. */
function head(b: Body, cy: number, r: number, eyeGap = 3): void {
  const { buf, p } = b;
  const cx = 16;
  buf.ellipse(cx, cy + b.dy, r, r, p.base);
  buf.ellipse(cx - r * 0.35, cy + b.dy - r * 0.3, r * 0.45, r * 0.4, p.light);
  buf.rect(cx - eyeGap - 1, cy + b.dy, 2, 2, p.eye);
  buf.rect(cx + eyeGap - 1, cy + b.dy, 2, 2, p.eye);
}

const RENDER: Readonly<Record<BossKind, (frame: 0 | 1 | 2) => BufSprite>> = {
  // Tumba de arenito: múmia com faixas soltas e coroa de faraó apodrecida.
  sand_mummy: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.sand_mummy;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -1 : 0 };
    trunk(b, 16, 30, 8);
    head(b, 8, 6);
    // faixas atravessando o corpo
    for (let y = 12; y < 34; y += 4) {
      s.buf.rect(10, y + b.dy, 13, 1, p.accent);
      s.buf.rect(11, y + 1 + b.dy, 11, 1, p.light);
    }
    // coroa do faraó: bandas e a serpente na testa
    s.buf.rect(9, 1 + b.dy, 15, 2, p.accent);
    s.buf.rect(9, 3 + b.dy, 15, 1, p.base);
    s.buf.rect(15, 0 + b.dy, 2, 2, p.eye);
    // faixas soltas nos braços (golpe)
    if (frame === 1) {
      s.buf.rect(5, 16 + b.dy, 3, 10, p.light);
      s.buf.rect(24, 16 + b.dy, 3, 8, p.light);
    }
    return s;
  },

  // Cripta de ossos: rei-esqueleto com costelas, coroa de ferro e capa esfarrapada.
  bone_lord: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.bone_lord;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -1 : 0 };
    // capa esfarrapada
    s.buf.ellipse(16, 28 + b.dy, 12, 9, p.accent);
    trunk(b, 15, 29, 7);
    head(b, 8, 5.5);
    // costelas
    for (let i = 0; i < 5; i++) {
      const y = 15 + i * 3 + b.dy;
      s.buf.rect(11, y, 11, 1, p.dark);
      s.buf.rect(11, y, 2, 1, p.light);
      s.buf.rect(20, y, 2, 1, p.light);
    }
    // coroa de ferro com pontas
    s.buf.rect(10, 2 + b.dy, 13, 2, p.accent);
    for (const x of [10, 14, 18, 21]) s.buf.rect(x, 0 + b.dy, 1, 2, p.light);
    // ossos dos braços aparecendo
    s.buf.rect(5, 18 + b.dy, 2, 9, p.light);
    s.buf.rect(25, 18 + b.dy, 2, 9, p.light);
    if (frame === 1) s.buf.line(26, 20 + b.dy, 30, 8 + b.dy, p.light, 1);
    return s;
  },

  // Forja vulcânica: golem de rocha com veias de lava, sem pescoço, punhos enormes.
  magma_golem: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.magma_golem;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -2 : 0 };
    const cx = 16;
    // pernas curtas e grossas
    s.buf.rect(cx - 8, 26 + b.dy, 6, 7, p.dark);
    s.buf.rect(cx + 2, 26 + b.dy, 6, 7, p.dark);
    // tronco maciço
    s.buf.ellipse(cx, 20 + b.dy, 12, 11, p.base);
    s.buf.ellipse(cx - 4, 16 + b.dy, 5, 5, p.light);
    // cabeça pequena afundada nos ombros
    head(b, 7, 4.5, 2);
    // ombros em blocos
    s.buf.rect(cx - 14, 12 + b.dy, 7, 7, p.base);
    s.buf.rect(cx + 7, 12 + b.dy, 7, 7, p.base);
    // punhos
    s.buf.rect(cx - 16, 19 + b.dy, 6, 6, p.base);
    s.buf.rect(cx + 10, 19 + b.dy, 6, 6, p.base);
    // veias de lava
    s.buf.line(cx - 6, 14 + b.dy, cx + 1, 24 + b.dy, p.accent, 1);
    s.buf.line(cx + 2, 12 + b.dy, cx + 8, 22 + b.dy, p.accent, 1);
    s.buf.line(cx - 10, 22 + b.dy, cx - 4, 27 + b.dy, p.accent, 1);
    if (frame === 1) {
      // golpe: punho erguido com brasa
      s.buf.rect(cx + 10, 12 + b.dy, 6, 6, p.base);
      s.buf.rect(cx + 11, 13 + b.dy, 4, 3, p.accent);
    }
    return s;
  },

  // Caverna de gelo: guardião encapotado com lança de gelo e coroa de estalactites.
  frost_warden: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.frost_warden;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -1 : 0 };
    // manto comprido
    s.buf.ellipse(16, 26 + b.dy, 11, 10, p.dark);
    trunk(b, 15, 28, 7);
    head(b, 8, 5);
    // capuz
    s.buf.ellipse(16, 7 + b.dy, 7, 7, p.dark);
    s.buf.ellipse(16, 9 + b.dy, 5, 5, p.base);
    // estalactites no ombro esquerdo
    for (let i = 0; i < 3; i++) s.buf.rect(8 + i * 2, 9 + i + b.dy, 1, 4 - i, p.light);
    // lança de gelo
    s.buf.rect(27, 8 + b.dy, 2, 26, p.light);
    s.buf.line(28, 2 + b.dy, 30, 9 + b.dy, p.light, 1);
    s.buf.line(28, 2 + b.dy, 26, 9 + b.dy, p.light, 1);
    if (frame === 1) {
      s.buf.rect(27, 4 + b.dy, 2, 26, p.eye);
      s.buf.rect(26, 8 + b.dy, 4, 4, p.accent);
    }
    return s;
  },

  // Gruta de musgo: horror de lodo com cogumelos nas costas e braços de cipó.
  moss_horror: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.moss_horror;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -1 : 0 };
    const cx = 16;
    // massa disforme
    s.buf.ellipse(cx, 24 + b.dy, 13, 10, p.base);
    s.buf.ellipse(cx - 5, 20 + b.dy, 6, 5, p.light);
    s.buf.ellipse(cx, 14 + b.dy, 9, 7, p.base);
    head(b, 10, 5, 3);
    // braços de cipó pendurados
    s.buf.line(cx - 12, 18 + b.dy, cx - 15, 30 + b.dy, p.dark, 2);
    s.buf.line(cx + 12, 18 + b.dy, cx + 15, 30 + b.dy, p.dark, 2);
    // cogumelos brilhantes nas costas
    for (const [x, y] of [
      [8, 9],
      [24, 11],
      [11, 5],
    ] as const) {
      s.buf.rect(x, y + b.dy, 1, 3, p.light);
      s.buf.rect(x - 1, y - 1 + b.dy, 3, 1, p.accent);
      s.buf.set(x, y - 1 + b.dy, p.eye);
    }
    if (frame === 1) {
      // tentáculos erguidos
      s.buf.line(cx - 12, 18 + b.dy, cx - 18, 8 + b.dy, p.accent, 2);
      s.buf.line(cx + 12, 18 + b.dy, cx + 18, 8 + b.dy, p.accent, 2);
    }
    return s;
  },

  // Caverna de cristal: rainha alta, vestido de quartzo, coroa de pontas e shards flutuando.
  crystal_queen: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.crystal_queen;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -2 : 0 };
    const cx = 16;
    // vestido largo em losango
    s.buf.line(cx, 12 + b.dy, cx - 11, 32, p.base, 3);
    s.buf.line(cx, 12 + b.dy, cx + 11, 32, p.base, 3);
    s.buf.rect(cx - 11, 30, 23, 2, p.dark);
    // torso e cabeça
    trunk(b, 12, 22, 6);
    head(b, 8, 5);
    // coroa de quartzo
    for (const [x, h] of [
      [10, 4],
      [14, 6],
      [18, 5],
      [21, 3],
    ] as const) {
      s.buf.line(x + 1, 3 + b.dy, x + 1, 3 + b.dy - h, p.light, 1);
    }
    // shards flutuando ao lado
    for (const [x, y] of [
      [4, 14],
      [27, 18],
    ] as const) {
      s.buf.rect(x, y + b.dy, 2, 4, p.accent);
      s.buf.set(x, y - 1 + b.dy, p.eye);
    }
    if (frame === 1) {
      s.buf.rect(3, 10 + b.dy, 2, 6, p.eye);
      s.buf.rect(27, 14 + b.dy, 2, 6, p.eye);
    }
    return s;
  },

  // Cisterna alagada: rei afogado, barriga inchada, coroa torta e tridente de coral.
  drowned_king: (frame) => {
    const s = floorSheet(2, 2, 18);
    const p = PALETTES.drowned_king;
    const b: Body = { buf: s.buf, p, dy: frame === 2 ? 2 : frame === 1 ? -1 : 0 };
    const cx = 16;
    // corpo bojudo
    s.buf.ellipse(cx, 23 + b.dy, 12, 11, p.base);
    s.buf.ellipse(cx - 5, 19 + b.dy, 5, 5, p.light);
    head(b, 9, 5.5, 3);
    // coroa torta
    s.buf.rect(11, 2 + b.dy, 11, 2, p.accent);
    for (const x of [11, 15, 19]) s.buf.rect(x, 0 + b.dy, 1, 2, p.light);
    // barbatanas/corais nas costas
    s.buf.line(cx + 10, 16 + b.dy, cx + 15, 10 + b.dy, p.accent, 2);
    s.buf.line(cx - 10, 16 + b.dy, cx - 15, 11 + b.dy, p.accent, 2);
    // tridente
    s.buf.rect(27, 6 + b.dy, 2, 26, p.light);
    s.buf.rect(26, 5 + b.dy, 1, 2, p.accent);
    s.buf.rect(27, 4 + b.dy, 1, 2, p.accent);
    s.buf.rect(28, 5 + b.dy, 1, 2, p.accent);
    // água escorrendo
    s.buf.rect(cx - 2, 30, 1, 2, p.accent);
    s.buf.rect(cx + 4, 31, 1, 1, p.accent);
    if (frame === 1) {
      s.buf.rect(27, 2 + b.dy, 2, 26, p.light);
      s.buf.rect(25, 1 + b.dy, 5, 2, p.accent);
    }
    return s;
  },
};

const CACHE = new Map<string, BufSprite>();

/** Sprite do chefe (determinístico e cacheado por tipo/quadro). */
export function renderBossArt(kind: BossKind, frame = 0): BufSprite {
  const f = clampFrame(frame);
  const key = `${kind}:${f}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const sprite = RENDER[kind](f);
  // contorno automático, igual aos monstros e aos móveis
  sprite.buf.outline();
  CACHE.set(key, sprite);
  return sprite;
}
