// Testes da skin de fantasia (puros): detecção da pele, pisos de pedra/terra/madeira, paredes de
// castelo (todos os padrões), remapeamento das paredes claras do escritório e o tema das salas.
import { afterEach, describe, expect, it } from 'vitest';
import { TILE, type FloorKind, type WallPattern } from './api';
import { luminance } from './core/color';
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
