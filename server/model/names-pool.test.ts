import { describe, expect, it } from 'vitest';
import { NAME_POOL, isNameFromPool, pickName, pickNameIn } from '../../shared/names';
import { NameStore } from './names';

const HERMES = ['G-Dragon', 'Taeyang', 'T.O.P', 'Gia Lộc', 'An'];

describe('nomes: lista da fonte (pool do hermes)', () => {
  it('pickNameIn só devolve nomes da lista, sem repetir', () => {
    const used = new Set<string>();
    const seen: string[] = [];
    for (let i = 0; i < HERMES.length; i++) {
      const p = pickNameIn(HERMES, `sessao-${i}`, used);
      expect(HERMES).toContain(p.name);
      used.add(p.name);
      seen.push(p.name);
    }
    expect(new Set(seen).size).toBe(HERMES.length);
  });

  it('quando a lista da fonte esgota, completa com o pool do Habblaud ("thiếu thì mới thêm")', () => {
    const extra = pickNameIn(HERMES, 'sessao-nova', new Set(HERMES));
    expect(HERMES).not.toContain(extra.name);
    expect(NAME_POOL.map((p) => p.name)).toContain(extra.name);
  });

  it('isNameFromPool aceita a lista e o sufixo numérico, e recusa o resto', () => {
    expect(isNameFromPool(HERMES, 'Taeyang')).toBe(true);
    expect(isNameFromPool(HERMES, 'Taeyang 2')).toBe(true);
    expect(isNameFromPool(HERMES, 'Taeyang 1')).toBe(false);
    expect(isNameFromPool(HERMES, 'Pietra')).toBe(false);
  });

  it('NameStore com setPool usa a lista da fonte e descarta nome guardado de fora dela', () => {
    const store = new NameStore(null);
    store.setPool(HERMES);
    store.remember('k1', { name: 'Pietra', look: 'f' }); // nome de fora da lista
    const person = store.assign('k1', new Set());
    expect(HERMES).toContain(person.name);
  });

  it('NameStore sem setPool continua sorteando do pool do Habblaud', () => {
    const store = new NameStore(null);
    const person = store.assign('k2', new Set());
    expect(NAME_POOL.map((p) => p.name)).toContain(person.name);
    expect(pickName('k2', new Set()).name).toBe(person.name);
  });
});
