// Testes da skin de fantasia (puros): detecção da pele, pisos de pedra/terra/madeira, paredes de
// castelo (todos os padrões), remapeamento das paredes claras do escritório e o tema das salas.
import { afterEach, describe, expect, it } from 'vitest';
import { TILE, type FloorKind, type WallPattern } from './api';
import { luminance } from './core/color';
import type { PixelBuf } from './core/pixbuf';
import { getSkin, isFantasy, normalizeSkin, setSkinForTests } from './skin';
import { CHUNK_PX } from './surfaces/floor';
import { fantasyCapColor, fantasyFloorChunk, fantasySouthWallTile, fantasyStoneBase, fantasyWallFaceTile } from './surfaces/fantasy';
import { FANTASY_THEME_COUNT, THEME_COUNT, roomTheme } from './theme';

const FLOOR_KINDS: FloorKind[] = ['carpet', 'wood', 'tile_check', 'tile_white', 'concrete', 'marble', 'grass', 'sidewalk', 'street'];
const PATTERNS: WallPattern[] = ['plain', 'stripes', 'tiles', 'wood_panel', 'brick', 'glass', 'marble'];
const LIGHT_WALL = { base: '#eef1f4', trim: '#9fb0c4', pattern: 'plain' as const };

/** Resumo dos pixels opacos: quantidade e cor média, para comparar imagens sem depender de Node. */
function stats(data: Uint8ClampedArray): string {
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    n++;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return n ? `${n}:${Math.round(r / n)}:${Math.round(g / n)}:${Math.round(b / n)}` : '0';
}

/** Resumo FNV-1a dos bytes (imagens iguais byte a byte dão o mesmo resumo). */
function digest(data: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  let g = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    h = Math.imul(h ^ data[i], 0x01000193);
    g = Math.imul(g ^ data[i], 0x5bd1e995) + i;
  }
  return `${h >>> 0}:${g >>> 0}`;
}

// A pele é fixa por carga da página; cada teste devolve o padrão do escritório ao terminar.
afterEach(() => setSkinForTests(undefined));

/** Soma das diferenças de RGB entre dois pixels (índices em bytes). */
function pixelDiff(a: PixelBuf, ia: number, b: PixelBuf, ib: number): number {
  return Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2]);
}

/**
 * Diferença média de cor na emenda entre dois blocos: borda direita de `a` contra a borda
 * esquerda de `b` (vertical = borda de baixo contra a de cima).
 */
function edgeDiff(a: PixelBuf, b: PixelBuf, vertical = false): number {
  let sum = 0;
  let n = 0;
  if (vertical) {
    for (let x = 0; x < a.w; x++) sum += pixelDiff(a, (a.h - 1) * a.w + x, b, x);
    n = a.w;
  } else {
    for (let y = 0; y < a.h; y++) sum += pixelDiff(a, y * a.w + a.w - 1, b, y * b.w);
    n = a.h;
  }
  return sum / n / 3;
}

/** Diferença média entre pixels vizinhos DENTRO do bloco — a "textura normal" para comparar. */
function interiorDiff(a: PixelBuf, vertical = false): number {
  let sum = 0;
  let n = 0;
  if (vertical) {
    for (let y = 1; y < a.h; y += 5) {
      for (let x = 0; x < a.w; x++) sum += pixelDiff(a, (y - 1) * a.w + x, a, y * a.w + x);
      n += a.w;
    }
  } else {
    for (let x = 1; x < a.w; x += 5) {
      for (let y = 0; y < a.h; y++) sum += pixelDiff(a, y * a.w + x - 1, a, y * a.w + x);
      n += a.h;
    }
  }
  return sum / n / 3;
}

describe('skin', () => {
  it('normaliza os apelidos da URL', () => {
    expect(normalizeSkin('fantasy')).toBe('fantasy');
    expect(normalizeSkin('rpg')).toBe('fantasy');
    expect(normalizeSkin(' FANTASY ')).toBe('fantasy');
    expect(normalizeSkin('office')).toBe('office');
    expect(normalizeSkin('default')).toBe('office');
    expect(normalizeSkin('')).toBeUndefined();
    expect(normalizeSkin(null)).toBeUndefined();
    expect(normalizeSkin(undefined)).toBeUndefined();
    expect(normalizeSkin('retro')).toBeUndefined();
  });

  it('sem window (Node) a pele é o escritório', () => {
    expect(getSkin()).toBe('office');
    expect(isFantasy()).toBe(false);
  });

  it('setSkinForTests troca e devolve a pele', () => {
    setSkinForTests('fantasy');
    expect(getSkin()).toBe('fantasy');
    expect(isFantasy()).toBe(true);
    setSkinForTests('office');
    expect(isFantasy()).toBe(false);
  });
});

describe('fantasyFloorChunk', () => {
  it('cobre o bloco inteiro, opaco, em todos os tipos de piso', () => {
    for (const kind of FLOOR_KINDS) {
      const b = fantasyFloorChunk(kind, 0, 0, { seed: 3, tint: '#7a5a8a' });
      expect(b.w, kind).toBe(CHUNK_PX);
      expect(b.h, kind).toBe(CHUNK_PX);
      // Sem frestas transparentes: qualquer pixel faltando apareceria como buraco no chão.
      expect(b.countOpaque(), kind).toBe(CHUNK_PX * CHUNK_PX);
    }
  });

  it('é determinística por semente e muda entre blocos vizinhos', () => {
    for (const kind of FLOOR_KINDS) {
      const a = fantasyFloorChunk(kind, 0, 0, { seed: 7 });
      const b = fantasyFloorChunk(kind, 0, 0, { seed: 7 });
      expect(digest(a.data), kind).toBe(digest(b.data));
      const c = fantasyFloorChunk(kind, 1, 0, { seed: 7 });
      expect(digest(c.data), kind).not.toBe(digest(a.data));
      const d = fantasyFloorChunk(kind, 0, 0, { seed: 8 });
      expect(digest(d.data), kind).not.toBe(digest(a.data));
    }
  });

  it('a laje da sala aceita o tinte do tema (chão de salas de projeto)', () => {
    const purple = fantasyFloorChunk('marble', 0, 0, { seed: 1, tint: '#8a5a9a' });
    const green = fantasyFloorChunk('marble', 0, 0, { seed: 1, tint: '#5a9a6a' });
    expect(stats(purple.data)).not.toBe(stats(green.data));
  });
});

describe('fantasyWallFaceTile', () => {
  it('desenha todos os padrões no tamanho da face', () => {
    for (const pattern of PATTERNS) {
      const face = fantasyWallFaceTile({ base: '#eef1f4', trim: '#9fb0c4', pattern }, 1, 0);
      expect(face.w, pattern).toBe(TILE);
      expect(face.h, pattern).toBe(2 * TILE);
      expect(face.countOpaque(), pattern).toBeGreaterThan(TILE * 10);
    }
  });

  it('o vidro continua translúcido e tem a treliça de chumbo', () => {
    const glass = fantasyWallFaceTile({ base: '#cfe6f0', trim: '#9fb9c6', pattern: 'glass' }, 0, 1);
    let translucent = 0;
    let iron = 0;
    // Só a face (entre a tampa de 4 px e o rodapé de 3 px): a moldura de pedra é sempre opaca.
    for (let y = 4; y < glass.h - 3; y++) {
      for (let x = 0; x < glass.w; x++) {
        const a = glass.data[(y * glass.w + x) * 4 + 3];
        if (a > 0 && a < 200) translucent++;
        else if (a >= 200) iron++;
      }
    }
    // A face de vidro (25 linhas x 16 px) fica quase toda translúcida...
    expect(translucent).toBeGreaterThan(TILE * 10);
    // ...e a treliça em losango é opaca, como o chumbo das janelas antigas.
    expect(iron).toBeGreaterThan(20);
  });

  it('é determinística por (padrão, variante, coluna)', () => {
    for (const pattern of PATTERNS) {
      const a = fantasyWallFaceTile({ base: '#8a8b84', pattern }, 2, 1);
      const b = fantasyWallFaceTile({ base: '#8a8b84', pattern }, 2, 1);
      expect(stats(a.data), pattern).toBe(stats(b.data));
    }
  });
});

describe('fantasySouthWallTile', () => {
  it('a mureta sul é totalmente opaca', () => {
    for (const pattern of PATTERNS) {
      const tile = fantasySouthWallTile({ base: '#e9e5dc', trim: '#a88e6c', pattern, exterior: true }, 2);
      expect(tile.w, pattern).toBe(TILE);
      expect(tile.h, pattern).toBe(TILE);
      expect(tile.countOpaque(), pattern).toBe(TILE * TILE);
    }
  });
});

describe('fantasyStoneBase', () => {
  it('paredes claras do escritório viram pedra, as escuras ficam como estão', () => {
    for (const light of ['#eef1f4', '#f8f1eb', '#dce8ee', '#cfc8bd']) {
      const stone = fantasyStoneBase(light);
      expect(stone, light).not.toBe(light);
      expect(luminance(stone), light).toBeLessThan(luminance(light));
      expect(luminance(stone), light).toBeLessThan(0.75);
      expect(luminance(stone), light).toBeGreaterThan(0.3);
    }
    const dark = '#5d5f60';
    expect(fantasyStoneBase(dark)).toBe(dark);
  });

  it('a tampa da parede segue a pedra (não a cor clara original)', () => {
    const light = fantasyCapColor(LIGHT_WALL);
    expect(light).toBe(fantasyCapColor({ ...LIGHT_WALL, base: fantasyStoneBase(LIGHT_WALL.base) }));
    expect(luminance(light)).toBeLessThan(0.5);
  });
});

// ------------------------------------------------------------------ biomas da masmorra

const NEW_FLOORS: FloorKind[] = ['ash', 'ice', 'water', 'moss', 'bone'];
const NEW_PATTERNS: WallPattern[] = ['cave', 'ice', 'forge'];

/** Luminância média dos pixels visíveis (0–1): compara biomas sem depender de Node. */
function meanLuminance(data: Uint8ClampedArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    n++;
  }
  return n ? sum / n : 0;
}

/** Média de um canal de cor (0 = R, 1 = G, 2 = B) nos pixels visíveis. */
function meanChannel(data: Uint8ClampedArray, ch: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    sum += data[i + ch];
    n++;
  }
  return n ? sum / n : 0;
}

/** Pixels claramente quentes (brasa/lava): vermelho alto e bem acima do verde e do azul. */
function warmCount(data: Uint8ClampedArray, minRed = 90): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    if (data[i] >= minRed && data[i] > data[i + 1] * 1.5 && data[i] > data[i + 2] * 1.5) n++;
  }
  return n;
}

/** Cores distintas numa coluna (x) ou linha (y) do buffer. */
function distinctInLine(w: number, data: Uint8ClampedArray, index: number, vertical: boolean): number {
  const seen = new Set<number>();
  const len = vertical ? data.length / w / 4 : w;
  for (let k = 0; k < len; k++) {
    const i = vertical ? (k * w + index) * 4 : (index * w + k) * 4;
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return seen.size;
}

describe('pisos dos biomas da masmorra', () => {
  it('cobrem o bloco inteiro, opacos e no tamanho do bloco', () => {
    for (const kind of NEW_FLOORS) {
      const b = fantasyFloorChunk(kind, 2, 3, { seed: 5 });
      expect(b.w, kind).toBe(CHUNK_PX);
      expect(b.h, kind).toBe(CHUNK_PX);
      expect(b.countOpaque(), kind).toBe(CHUNK_PX * CHUNK_PX);
    }
  });

  it('são determinísticos por semente e mudam entre blocos vizinhos', () => {
    for (const kind of NEW_FLOORS) {
      const a = fantasyFloorChunk(kind, 0, 0, { seed: 7 });
      const again = fantasyFloorChunk(kind, 0, 0, { seed: 7 });
      expect(digest(again.data), kind).toBe(digest(a.data));
      expect(digest(fantasyFloorChunk(kind, 1, 0, { seed: 7 }).data), kind).not.toBe(digest(a.data));
      expect(digest(fantasyFloorChunk(kind, 0, 1, { seed: 7 }).data), kind).not.toBe(digest(a.data));
      expect(digest(fantasyFloorChunk(kind, 0, 0, { seed: 8 }).data), kind).not.toBe(digest(a.data));
    }
  });

  it('não deixa emenda dura na borda do bloco', () => {
    for (const kind of NEW_FLOORS) {
      for (const seed of [1, 3, 7]) {
        const a = fantasyFloorChunk(kind, 0, 0, { seed });
        const right = fantasyFloorChunk(kind, 1, 0, { seed });
        const below = fantasyFloorChunk(kind, 0, 1, { seed });
        // A troca de bloco não pode ser um degrau de cor: fica na mesma ordem de grandeza da
        // diferença entre pixels vizinhos DENTRO do bloco.
        expect(edgeDiff(a, right), `${kind}/${seed} x`).toBeLessThan(interiorDiff(a) * 3 + 2);
        expect(edgeDiff(a, below, true), `${kind}/${seed} y`).toBeLessThan(interiorDiff(a, true) * 3 + 2);
        // ...e nenhuma borda vira uma linha/costura de cor única.
        for (const [x, vertical] of [[0, true], [a.w - 1, true], [0, false], [a.h - 1, false]] as const) {
          expect(distinctInLine(a.w, a.data, x, vertical), `${kind}/${seed}/${x}`).toBeGreaterThan(4);
        }
      }
    }
  });

  it('o gelo é bem mais claro que a rocha e a cinza bem mais escura que o mármore', () => {
    const ice = meanLuminance(fantasyFloorChunk('ice', 0, 0, { seed: 3 }).data);
    const rock = meanLuminance(fantasyFloorChunk('rock', 0, 0, { seed: 3 }).data);
    const ash = meanLuminance(fantasyFloorChunk('ash', 0, 0, { seed: 3 }).data);
    const marble = meanLuminance(fantasyFloorChunk('marble', 0, 0, { seed: 3 }).data);
    expect(ice).toBeGreaterThan(rock + 0.3);
    expect(ash).toBeLessThan(marble - 0.15);
    // e ninguém se confunde com o piso de pedra do corredor
    expect(ash).toBeLessThan(rock + 0.05);
  });

  it('cada matéria tem a matiz que anuncia o bioma', () => {
    const ice = fantasyFloorChunk('ice', 0, 0, { seed: 5 }).data;
    expect(meanChannel(ice, 2)).toBeGreaterThan(meanChannel(ice, 0) + 8); // azul acima do vermelho
    expect(meanLuminance(ice)).toBeGreaterThan(0.7);

    const water = fantasyFloorChunk('water', 0, 0, { seed: 5 }).data;
    expect(meanChannel(water, 2)).toBeGreaterThan(meanChannel(water, 0) + 20);
    expect(meanChannel(water, 1)).toBeGreaterThan(meanChannel(water, 0));

    const moss = fantasyFloorChunk('moss', 0, 0, { seed: 5 }).data;
    expect(meanChannel(moss, 1)).toBeGreaterThan(meanChannel(moss, 2) + 8); // esverdeado
    expect(meanChannel(moss, 1)).toBeGreaterThanOrEqual(meanChannel(moss, 0));

    const bone = fantasyFloorChunk('bone', 0, 0, { seed: 5 }).data;
    expect(meanLuminance(bone)).toBeGreaterThan(0.6); // pálido
    expect(meanChannel(bone, 0)).toBeGreaterThan(meanChannel(bone, 2) + 10); // creme, não branco-azulado
  });

  it('a água é líquida, não lajeada: nenhuma linha reta de rejunte atravessa o bloco', () => {
    const w = fantasyFloorChunk('water', 0, 0, { seed: 4 });
    for (let y = 0; y < w.h; y += 9) {
      expect(distinctInLine(w.w, w.data, y, false), `linha ${y}`).toBeGreaterThan(3);
    }
    for (let x = 0; x < w.w; x += 9) {
      expect(distinctInLine(w.w, w.data, x, true), `coluna ${x}`).toBeGreaterThan(3);
    }
    // Ondulação existe: o piso não é um degradê liso.
    expect(meanLuminance(w.data)).toBeLessThan(0.4);
  });

  it('a cinza guarda no máximo três brasas acesas por bloco', () => {
    for (const seed of [1, 7, 42, 1234]) {
      expect(warmCount(fantasyFloorChunk('ash', 0, 0, { seed }).data), `semente ${seed}`).toBeLessThanOrEqual(3);
    }
  });
});

describe('paredes dos biomas da masmorra', () => {
  it('a face tem o tamanho da face e fica toda opaca (sem translucidez)', () => {
    for (const pattern of NEW_PATTERNS) {
      const face = fantasyWallFaceTile({ base: '#eef1f4', trim: '#9fb0c4', pattern }, 2, 1);
      expect(face.w, pattern).toBe(TILE);
      expect(face.h, pattern).toBe(2 * TILE);
      expect(face.countOpaque(), pattern).toBe(TILE * 2 * TILE);
    }
  });

  it('a mureta sul tem 16x16 e fica toda opaca', () => {
    for (const pattern of NEW_PATTERNS) {
      const tile = fantasySouthWallTile({ base: '#e9e5dc', trim: '#a88e6c', pattern, exterior: true }, 2);
      expect(tile.w, pattern).toBe(TILE);
      expect(tile.h, pattern).toBe(TILE);
      expect(tile.countOpaque(), pattern).toBe(TILE * TILE);
    }
  });

  it('é determinística por (padrão, variante, coluna) e muda de coluna para coluna', () => {
    for (const pattern of NEW_PATTERNS) {
      const a = fantasyWallFaceTile({ base: '#8d877d', pattern }, 2, 1);
      const b = fantasyWallFaceTile({ base: '#8d877d', pattern }, 2, 1);
      expect(digest(a.data), pattern).toBe(digest(b.data));
      expect(digest(fantasyWallFaceTile({ base: '#8d877d', pattern }, 2, 2).data), pattern).not.toBe(digest(a.data));
      const s = fantasySouthWallTile({ base: '#8d877d', pattern }, 3);
      expect(digest(fantasySouthWallTile({ base: '#8d877d', pattern }, 3).data), pattern).toBe(digest(s.data));
      expect(digest(fantasySouthWallTile({ base: '#8d877d', pattern }, 4).data), pattern).not.toBe(digest(s.data));
    }
  });

  it('os biomas não se confundem: gelo claríssimo, caverna e forja escuras', () => {
    const lum = (pattern: WallPattern) => meanLuminance(fantasyWallFaceTile({ base: '#8d877d', pattern }, 0, 0).data);
    expect(lum('ice')).toBeGreaterThan(lum('cave') + 0.35);
    expect(lum('cave')).toBeLessThan(0.4);
    expect(lum('forge')).toBeLessThan(0.4);
    const cave = fantasyWallFaceTile({ base: '#8d877d', pattern: 'cave' }, 0, 0);
    const ice = fantasyWallFaceTile({ base: '#8d877d', pattern: 'ice' }, 0, 0);
    // gelo é azul; rocha da caverna é grafite neutro
    expect(meanChannel(ice.data, 2)).toBeGreaterThan(meanChannel(ice.data, 0) + 20);
    expect(Math.abs(meanChannel(cave.data, 2) - meanChannel(cave.data, 0))).toBeLessThan(20);
  });

  it('a forja tem brasas nas juntas; a caverna e o gelo não têm nada aceso', () => {
    const forge = fantasyWallFaceTile({ base: '#8d877d', pattern: 'forge' }, 2, 1).data;
    const forgeSouth = fantasySouthWallTile({ base: '#8d877d', pattern: 'forge' }, 1).data;
    expect(warmCount(forge, 110)).toBeGreaterThan(3);
    expect(warmCount(forgeSouth, 110)).toBeGreaterThan(0);
    expect(warmCount(fantasyWallFaceTile({ base: '#8d877d', pattern: 'cave' }, 2, 1).data, 110)).toBe(0);
    expect(warmCount(fantasyWallFaceTile({ base: '#8d877d', pattern: 'ice' }, 2, 1).data, 110)).toBeGreaterThanOrEqual(0);
    // e a lava é esparsa: nunca vira uma faixa contínua de fogo
    expect(warmCount(forge, 110)).toBeLessThan(forge.length / 4 / 6);
  });

  it('a tampa segue o bioma: rocha escura, neve-gelo claríssima, pedra queimada', () => {
    const base = '#8d877d';
    const cave = fantasyCapColor({ base, pattern: 'cave' });
    const ice = fantasyCapColor({ base, pattern: 'ice' });
    const forge = fantasyCapColor({ base, pattern: 'forge' });
    expect(luminance(cave)).toBeLessThan(0.25);
    expect(luminance(forge)).toBeLessThan(0.25);
    expect(luminance(ice)).toBeGreaterThan(0.7);
    expect(luminance(ice)).toBeGreaterThan(luminance(cave) + 0.5);
  });
});

describe('roomTheme com skin', () => {
  it('no escritório devolve os temas antigos', () => {
    setSkinForTests('office');
    expect(roomTheme(0).deskVariant).toBe('white');
    expect(roomTheme(THEME_COUNT - 1).wall.base).toBe('#f4efe8');
  });

  it('na fantasia devolve as zonas de RPG, estáveis e sem repetir vizinhas', () => {
    setSkinForTests('fantasy');
    expect(FANTASY_THEME_COUNT).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < FANTASY_THEME_COUNT * 2; i++) {
      expect(roomTheme(i)).toEqual(roomTheme(i));
      expect(roomTheme(i).carpet).not.toBe(roomTheme(i + 1).carpet);
      expect(roomTheme(i).accent).not.toBe(roomTheme(i + 1).accent);
    }
    expect(roomTheme(FANTASY_THEME_COUNT)).toEqual(roomTheme(0));
    // Nenhuma parece escritório: nenhuma parede clara, nenhuma mesa branca.
    for (let i = 0; i < FANTASY_THEME_COUNT; i++) {
      const t = roomTheme(i);
      expect(luminance(t.wall.base), `tema ${i}`).toBeLessThan(0.75);
      expect(t.deskVariant, `tema ${i}`).not.toBe('white');
      expect(['white', 'wood', 'dark']).toContain(t.deskVariant);
      expect(['blue', 'black', 'green', 'gray', 'red']).toContain(t.chairVariant);
      expect(PATTERNS).toContain(t.wall.pattern ?? 'plain');
    }
  });

  it('o tema da sala muda a pele do chão desenhado', () => {
    setSkinForTests('fantasy');
    const t = roomTheme(4);
    const floor = fantasyFloorChunk('marble', 0, 0, { seed: 11, tint: t.carpet });
    expect(floor.countOpaque()).toBe(CHUNK_PX * CHUNK_PX);
    setSkinForTests('office');
    expect(roomTheme(4).carpet).not.toBe(t.carpet);
  });
});
