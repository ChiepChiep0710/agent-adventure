// Testes do mapeamento atividade -> cena de RPG e do ritmo determinístico das batalhas.
// A cena é decoração derivada do status/atividade reais: o teste fixa essa correspondência para que
// ela nunca invente um herói em ação quando o agente está parado.
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_FRAMES, encounterFrame, type MonsterKind } from '../../art/monsters';
import {
  BATTLE_CYCLE_MS,
  effectFrame,
  encounterBeat,
  encounterFor,
  ENCOUNTER_GAP,
  type EncounterInput,
} from './encounters';

const scene = (input: Partial<EncounterInput> = {}) => encounterFor({ seed: 7, ...input }).kind;

describe('encontros de RPG por atividade (skin de fantasia)', () => {
  it('editar/escrever vira batalha contra um monstrinho', () => {
    for (const activityKind of ['edit', 'write'] as const) {
      const e = encounterFor({ seed: 11, status: 'working', activityKind });
      expect(e.kind).toBe('battle');
      expect(['slime', 'bat', 'golem']).toContain(e.monster);
    }
  });

  it('rodar comando/testar virou forja (faíscas de bigorna), sem monstro', () => {
    for (const activityKind of ['run', 'test', 'git', 'mcp'] as const) {
      const e = encounterFor({ seed: 3, status: 'working', activityKind });
      expect(e.kind).toBe('craft');
      expect(e.monster).toBeNull();
    }
  });

  it('ler/pesquisar/planejar vira estudo com runas', () => {
    for (const activityKind of ['read', 'search', 'plan', 'think', 'skill', 'compact'] as const) {
      expect(scene({ status: 'working', activityKind })).toBe('study');
    }
  });

  it('web/navegador vira batedor acompanhado de morcego', () => {
    for (const activityKind of ['web', 'browser'] as const) {
      const e = encounterFor({ seed: 5, status: 'working', activityKind });
      expect(e.kind).toBe('scout');
      expect(e.monster).toBe('bat');
    }
  });

  it('esperar o usuário vira guarda (sem monstro), e terminar abre o baú', () => {
    expect(scene({ status: 'waiting', activityKind: 'edit' })).toBe('guard');
    expect(encounterFor({ seed: 1, status: 'waiting', activityKind: 'edit' }).monster).toBeNull();
    expect(scene({ status: 'done', activityKind: 'edit' })).toBe('loot');
    // parado/desligado descansa na fogueira, mesmo com a última atividade sendo editar
    expect(scene({ status: 'idle', activityKind: 'edit' })).toBe('rest');
    expect(scene({ status: 'offline' })).toBe('rest');
  });

  it('o status vence a atividade, como na classe de RPG', () => {
    expect(scene({ status: 'waiting', activityKind: 'run' })).toBe('guard');
    expect(scene({ status: 'shell', activityKind: 'read' })).toBe('craft');
    expect(scene({ status: 'done', activityKind: 'web' })).toBe('loot');
  });

  it('sem atividade não há cena', () => {
    expect(scene({ status: 'working' })).toBeNull();
    expect(scene({ status: undefined, activityKind: 'other' })).toBeNull();
  });

  it('a semente escolhe o lado e o monstrinho, sempre igual para a mesma entrada', () => {
    for (const seed of [0, 1, 2, 3, 42, 1234, 0xdeadbeef]) {
      const a = encounterFor({ seed, status: 'working', activityKind: 'edit' });
      const b = encounterFor({ seed, status: 'working', activityKind: 'edit' });
      expect(a).toEqual(b);
      expect([-1, 1]).toContain(a.side);
    }
    // a escolha do monstro não é sempre a mesma: varia com a semente
    const monsters = new Set(
      Array.from({ length: 40 }, (_, i) => encounterFor({ seed: i, status: 'working', activityKind: 'edit' }).monster),
    );
    expect(monsters.size).toBeGreaterThan(1);
    for (const m of monsters) expect(['slime', 'bat', 'golem']).toContain(m as MonsterKind);
  });

  it('os dois lados aparecem (a cena não fica sempre do mesmo lado)', () => {
    const sides = new Set(Array.from({ length: 40 }, (_, i) => encounterFor({ seed: i, status: 'working', activityKind: 'edit' }).side));
    expect(sides).toEqual(new Set([-1, 1]));
  });
});

describe('ritmo das cenas', () => {
  it('a batalha é determinística e cíclica de 4 s', () => {
    expect(BATTLE_CYCLE_MS).toBe(4000);
    for (const seed of [0, 3, 99]) {
      for (const now of [0, 250, 1000, 3999]) {
        expect(encounterBeat(now, seed)).toEqual(encounterBeat(now, seed));
        const a = encounterBeat(now, seed);
        const b = encounterBeat(now + BATTLE_CYCLE_MS, seed);
        expect(b.phase).toBeCloseTo(a.phase, 6);
        expect(b.castFrame).toBe(a.castFrame);
        expect(b.defeated).toBe(a.defeated);
        expect(b.flash).toBe(a.flash);
      }
    }
  });

  it('o ciclo tem golpe, derrota e renascimento (sem ficar travado num estado)', () => {
    const seen = { cast: new Set<number>(), defeated: 0, flash: 0, knock: 0, respawn: 0 };
    for (let now = 0; now <= BATTLE_CYCLE_MS; now += 50) {
      const b = encounterBeat(now, 21);
      expect(b.phase).toBeGreaterThanOrEqual(0);
      expect(b.phase).toBeLessThan(1);
      expect(encounterFrame('slime', b.frame)).toBe(b.frame);
      expect(b.poofFrame).toBeGreaterThanOrEqual(0);
      expect(b.poofFrame).toBeLessThan(ENCOUNTER_FRAMES.poof);
      seen.cast.add(b.castFrame);
      if (b.defeated) seen.defeated++;
      if (b.flash) seen.flash++;
      if (b.knock > 0) seen.knock++;
      if (b.phase > 0.86) seen.respawn++;
    }
    expect(seen.cast).toEqual(new Set([0, 1, 2]));
    expect(seen.defeated).toBeGreaterThan(0);
    expect(seen.flash).toBeGreaterThan(0);
    expect(seen.knock).toBeGreaterThan(0);
    expect(seen.respawn).toBeGreaterThan(0);
  });

  it('sementes diferentes não lutam em sincronia', () => {
    const phases = new Set([0, 1, 2, 3, 4, 5].map((seed) => encounterBeat(1234, seed).phase.toFixed(3)));
    expect(phases.size).toBeGreaterThan(1);
  });

  it('o quadro dos efeitos alterna dentro do ciclo pedido', () => {
    for (const seed of [0, 5, 77]) {
      const frames = new Set<number>();
      for (let now = 0; now < 1000; now += 60) {
        const f = effectFrame(now, seed, 220);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(3);
        expect(effectFrame(now, seed, 220)).toBe(f);
        frames.add(f);
      }
      expect(frames.size).toBe(3);
    }
    expect(effectFrame(0, 0, 500, 2)).toBeLessThan(2);
  });
});

describe('peças de arte das cenas', () => {
  it('cada cena tem a sua peça animada (martelo, runas, morcego, escudo, baú, fogueira)', () => {
    // cenas que o desenho usa: qualquer peça sem quadro quebraria o desenho em silêncio
    const arts = ['hammer', 'runes', 'bat', 'glint', 'chest', 'campfire', 'spark', 'slash', 'poof', 'slime'] as const;
    for (const art of arts) expect(ENCOUNTER_FRAMES[art], art).toBeGreaterThanOrEqual(2);
  });

  it('a cena fica ao lado do herói, sem cobrir o rosto', () => {
    expect(ENCOUNTER_GAP).toBeGreaterThanOrEqual(12);
  });
});
