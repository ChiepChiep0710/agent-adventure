import { describe, expect, it } from 'vitest';
import { NAME_POOL, isPoolName, pickName } from './names';
import { NameStore } from '../server/model/names';

const POOL = new Set(NAME_POOL.map((p) => p.name));

describe('nomes do pool', () => {
  it('isPoolName aceita os nomes do pool e o sufixo de quando ele esgota', () => {
    for (const p of NAME_POOL) expect(isPoolName(p.name), p.name).toBe(true);
    expect(isPoolName('Ana 2')).toBe(true);
    expect(isPoolName('Ana 1')).toBe(false);
    // títulos de sessão e apelidos da fonte não são nome de pool
    for (const n of ['T.O.P', 'Gia Lộc', 'Hermes', 'meu-projeto']) expect(isPoolName(n), n).toBe(false);
  });

  it('pickName só sai do pool e só cria "Nome 2" quando o pool inteiro está em uso', () => {
    expect(POOL.has(pickName('sessao-x', new Set()).name)).toBe(true);
    // com o pool todo ocupado, o próximo ganha sufixo numérico
    const all = new Set(NAME_POOL.map((p) => p.name));
    const extra = pickName('sessao-nova', all);
    expect(extra.name.endsWith(' 2')).toBe(true);
    expect(isPoolName(extra.name)).toBe(true);
  });

  it('NameStore com poolOnly descarta nome guardado de fora do pool', () => {
    const store = new NameStore(null, { poolOnly: true });
    store.remember('k1', { name: 'T.O.P', look: 'm' });
    const person = store.assign('k1', new Set());
    expect(isPoolName(person.name)).toBe(true);
  });

  it('NameStore sem poolOnly continua respeitando o nome guardado da fonte', () => {
    const store = new NameStore(null);
    store.remember('k2', { name: 'T.O.P', look: 'm' });
    expect(store.assign('k2', new Set()).name).toBe('T.O.P');
  });
});
