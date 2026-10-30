// Testes dos auxiliares puros da pele do cenário externo (sem DOM): a skin de fantasia troca lamp /
// bench / parasol / totem por lanternas, bancos de tronco, barracas e pedras rúnicas, e a rua deixa
// de ter pintura viária. A chave de cache inclui a skin para nunca servir o sprite do escritório.
import { afterEach, describe, expect, it } from 'vitest';
import { setSkinForTests } from '../../art/skin';
import { carCacheKey, propCacheKey, propHasFantasyArt, propSkin, shouldDrawRoadMarkings } from './skin-props';

afterEach(() => setSkinForTests(undefined));

describe('pele dos props da área externa', () => {
  it('sem skin (escritório): mesmos sprites e pintura viária no lugar', () => {
    setSkinForTests('office');
    expect(propSkin()).toBe('office');
    expect(shouldDrawRoadMarkings()).toBe(true);
    for (const kind of ['lamp', 'bench', 'parasol', 'totem', 'tree'] as const) expect(propHasFantasyArt(kind)).toBe(false);
    // Chaves iguais às do cache antigo, só com o prefixo da skin.
    expect(propCacheKey({ kind: 'lamp', seed: 4 })).toBe('office:lamp');
    expect(propCacheKey({ kind: 'bench', seed: 4 })).toBe('office:bench');
    expect(propCacheKey({ kind: 'totem', seed: 4 })).toBe('office:totem');
    expect(propCacheKey({ kind: 'tree', seed: 9 })).toBe('office:tree:2');
    expect(carCacheKey(3, true)).toBe('office:car:3:1');
  });

  it('na fantasia os props de rua têm arte própria e a pista perde a pintura', () => {
    setSkinForTests('fantasy');
    expect(propSkin()).toBe('fantasy');
    expect(shouldDrawRoadMarkings()).toBe(false);
    for (const kind of ['lamp', 'bench', 'parasol', 'totem'] as const) expect(propHasFantasyArt(kind), kind).toBe(true);
    // Vegetação e pedras continuam iguais (a pele não mexe na natureza).
    for (const kind of ['tree', 'pine', 'bush', 'flowers', 'hedge', 'rock', 'paving'] as const) {
      expect(propHasFantasyArt(kind), kind).toBe(false);
    }
  });

  it('a chave do cache muda com a skin (a prévia de arte não serve o sprite errado)', () => {
    for (const kind of ['lamp', 'parasol', 'tree'] as const) {
      setSkinForTests('office');
      const office = propCacheKey({ kind, seed: 5 });
      setSkinForTests('fantasy');
      expect(propCacheKey({ kind, seed: 5 })).not.toBe(office);
    }
    setSkinForTests('office');
    const carOffice = carCacheKey(2, false);
    setSkinForTests('fantasy');
    expect(carCacheKey(2, false)).not.toBe(carOffice);
  });
});
