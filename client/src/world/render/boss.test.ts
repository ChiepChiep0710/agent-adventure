import { describe, expect, it } from 'vitest';
import { BOSS_KINDS } from '../../art/bosses';
import { DUNGEON_BIOMES } from '../layout/dungeon-biome';
import { bossHp, bossKindFor, bossName, bossPose } from './boss';

describe('chefe de cada câmara', () => {
  it('cada bioma tem o seu chefe, e todos os chefes são usados', () => {
    const kinds = DUNGEON_BIOMES.map((b) => bossKindFor(b.id));
    expect(kinds).toHaveLength(DUNGEON_BIOMES.length);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const k of kinds) expect(BOSS_KINDS).toContain(k);
  });

  it('todo chefe tem nome traduzível', () => {
    for (const k of BOSS_KINDS) expect(bossName(k).length).toBeGreaterThan(2);
  });

  it('a barra cai com o número de heróis trabalhando na sala, sem zerar', () => {
    expect(bossHp(0)).toBe(1);
    let prev = 1;
    for (const n of [1, 2, 3, 5, 8, 20]) {
      const hp = bossHp(n);
      expect(hp).toBeLessThanOrEqual(prev);
      expect(hp).toBeGreaterThanOrEqual(0.12);
      prev = hp;
    }
  });

  it('sem ninguém trabalhando o chefe dorme; com gente ele ergue o golpe em parte do ciclo', () => {
    const idle = bossPose('crypt', 1234, 0, 5000);
    expect(idle.engaged).toBe(false);
    expect(idle.frame).toBe(0);
    // no ciclo de 1800 ms com 22% de golpe, alguma janela tem o quadro de golpe
    const frames = new Set<0 | 1 | 2>();
    for (let t = 0; t < 1800; t += 60) frames.add(bossPose('crypt', 1234, 2, t).frame);
    expect(frames.has(1)).toBe(true);
    // e a pose é determinística
    expect(bossPose('crypt', 1234, 2, 900)).toEqual(bossPose('crypt', 1234, 2, 900));
  });

  it('o chefe é do bioma da sala, não do agente', () => {
    expect(bossPose('ice', 7, 0, 0).kind).toBe('frost_warden');
    expect(bossPose('forge', 7, 0, 0).kind).toBe('magma_golem');
    expect(bossPose('cistern', 7, 3, 0).hp).toBeLessThan(1);
  });
});
