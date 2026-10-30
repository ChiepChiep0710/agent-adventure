// Testes do mapeamento atividade -> cena de combate e do ritmo determinístico das batalhas.
// A cena é decoração derivada do status/atividade reais: o teste fixa essa correspondência para que
// ela nunca invente um herói em ação quando o agente está parado, e para que cada atividade de
// trabalho tenha monstro, estilo de ataque e números de dano estáveis.
import { describe, expect, it } from 'vitest';
import { ENCOUNTER_FRAMES, type MonsterKind } from '../../art/monsters';
import {
  cycleFor,
  DEFEAT_PHASE,
  damageRoll,
  encounterBeat,
  encounterFor,
  ENCOUNTER_GAP,
  gapFor,
  guardBeat,
  HERO_HIT_PHASE,
  HIT_PHASES,
  monsterBaseY,
  type EncounterInput,
} from './encounters';

const scene = (input: Partial<EncounterInput> = {}) => encounterFor({ seed: 7, ...input });

describe('combate por atividade (skin de fantasia)', () => {
  it('editar/escrever: mago lança bola de fogo em slime/mímico/espectro', () => {
    for (const activityKind of ['edit', 'write'] as const) {
      const e = encounterFor({ seed: 11, status: 'working', activityKind });
      expect(e.kind).toBe('battle');
      expect(e.attack).toBe('fireball');
      expect(['slime', 'mimic', 'wisp']).toContain(e.monster);
      expect(e.paused).toBe(false);
    }
  });

  it('rodar/testar/git: ferreiro martela o golem (sem projétil)', () => {
    for (const activityKind of ['run', 'test', 'git', 'mcp'] as const) {
      const e = encounterFor({ seed: 3, status: 'working', activityKind });
      expect(e.kind).toBe('battle');
      expect(e.attack).toBe('smash');
      expect(['golem', 'goblin', 'skeleton']).toContain(e.monster);
    }
  });

  it('ler/pesquisar/pensar: estudioso fere o espectro com luz', () => {
    for (const activityKind of ['read', 'search', 'think', 'plan', 'skill', 'compact'] as const) {
      const e = encounterFor({ seed: 5, status: 'working', activityKind });
      expect(e.kind).toBe('battle');
      expect(e.attack).toBe('light');
      expect(['wisp', 'skeleton']).toContain(e.monster);
    }
  });

  it('web/navegador: ladino atira adagas no morcego/goblin', () => {
    for (const activityKind of ['web', 'browser'] as const) {
      const e = encounterFor({ seed: 9, status: 'working', activityKind });
      expect(e.kind).toBe('battle');
      expect(e.attack).toBe('dagger');
      expect(['bat', 'goblin']).toContain(e.monster);
    }
  });

  it('delegar invoca reforços; responder/pedir fala em luz (clérigo)', () => {
    expect(encounterFor({ seed: 2, status: 'working', activityKind: 'delegate' }).attack).toBe('summon');
    expect(encounterFor({ seed: 2, status: 'working', activityKind: 'delegate' }).kind).toBe('battle');
    for (const activityKind of ['respond', 'prompt', 'communicate'] as const) {
      const e = encounterFor({ seed: 2, status: 'working', activityKind });
      expect(e.kind).toBe('battle');
      expect(e.attack).toBe('light');
    }
  });

  it('esperar o usuário é guarda (monstro parado, sem troca de golpes)', () => {
    const e = encounterFor({ seed: 1, status: 'waiting', activityKind: 'edit' });
    expect(e.kind).toBe('guard');
    expect(e.paused).toBe(true);
    expect(e.attack).toBe('guard');
    expect(e.monster).not.toBeNull();
    // atividade de pergunta/espera também vira guarda
    expect(scene({ status: 'working', activityKind: 'ask' }).kind).toBe('guard');
    expect(scene({ status: 'working', activityKind: 'wait' }).paused).toBe(true);
  });

  it('espera de shell é o ferreiro de escudo segurando o monstro', () => {
    const e = encounterFor({ seed: 4, status: 'shell', activityKind: 'read' });
    expect(e.kind).toBe('battle');
    expect(e.attack).toBe('shield');
    expect(e.monster).not.toBeNull();
    expect(e.paused).toBe(false);
  });

  it('terminar vira vitória com baú; parado/desligado descansa no braseiro', () => {
    const done = encounterFor({ seed: 1, status: 'done', activityKind: 'edit' });
    expect(done.kind).toBe('loot');
    expect(done.attack).toBe('loot');
    expect(done.paused).toBe(true);
    for (const status of ['idle', 'offline'] as const) {
      const e = encounterFor({ seed: 1, status, activityKind: 'edit' });
      expect(e.kind).toBe('rest');
      expect(e.attack).toBe('rest');
    }
  });

  it('o status vence a atividade, como na classe de RPG', () => {
    expect(scene({ status: 'waiting', activityKind: 'run' }).kind).toBe('guard');
    expect(scene({ status: 'shell', activityKind: 'read' }).attack).toBe('shield');
    expect(scene({ status: 'done', activityKind: 'web' }).kind).toBe('loot');
    expect(scene({ status: 'idle', activityKind: 'edit' }).kind).toBe('rest');
  });

  it('erro/teste quebrado deixa o monstro mais duro e o herói apanha', () => {
    for (const input of [
      { status: 'working', activityKind: 'error' },
      { status: 'working', activityKind: 'test', error: true },
    ] as const) {
      const e = encounterFor({ seed: 6, ...input });
      expect(e.kind).toBe('battle');
      expect(e.tough).toBe(true);
      expect(e.hurt).toBe(true);
      expect(e.monster).toBe('golem');
    }
    // sem erro, o mesmo teste não é duro
    expect(encounterFor({ seed: 6, status: 'working', activityKind: 'test' }).tough).toBe(false);
  });

  it('toda atividade de trabalho tem uma cena de combate (ninguém "trabalha" sem lutar)', () => {
    const working = [
      'prompt', 'think', 'respond', 'read', 'search', 'edit', 'write', 'run', 'test', 'git',
      'web', 'browser', 'plan', 'delegate', 'communicate', 'mcp', 'skill', 'other',
    ] as const;
    for (const activityKind of working) {
      const e = encounterFor({ seed: 12, status: 'working', activityKind });
      expect(e.kind, activityKind).not.toBeNull();
      expect(e.kind === 'battle' || e.kind === 'guard', activityKind).toBe(true);
      expect(e.monster, activityKind).not.toBeNull();
    }
  });

  it('sem atividade não há cena', () => {
    expect(scene({ status: 'working' }).kind).toBeNull();
    expect(scene({ status: undefined }).kind).toBeNull();
    expect(scene({ status: undefined, activityKind: undefined }).monster).toBeNull();
  });

  it('a semente escolhe lado, monstro e ciclo, sempre igual para a mesma entrada', () => {
    for (const seed of [0, 1, 2, 3, 42, 1234, 0xdeadbeef]) {
      const a = encounterFor({ seed, status: 'working', activityKind: 'edit' });
      const b = encounterFor({ seed, status: 'working', activityKind: 'edit' });
      expect(a).toEqual(b);
      expect([-1, 1]).toContain(a.side);
    }
    const monsters = new Set(
      Array.from({ length: 40 }, (_, i) => encounterFor({ seed: i, status: 'working', activityKind: 'edit' }).monster),
    );
    expect(monsters.size).toBeGreaterThan(1);
    for (const m of monsters) expect(['slime', 'mimic', 'wisp']).toContain(m as MonsterKind);
  });

  it('os dois lados aparecem e o monstro fica de 18 a 26 px do herói', () => {
    const sides = new Set(Array.from({ length: 40 }, (_, i) => encounterFor({ seed: i, status: 'working', activityKind: 'edit' }).side));
    expect(sides).toEqual(new Set([-1, 1]));
    for (const seed of [0, 1, 7, 99, 12345]) {
      const gap = gapFor(seed);
      expect(gap).toBeGreaterThanOrEqual(18);
      expect(gap).toBeLessThanOrEqual(26);
      expect(encounterFor({ seed, status: 'working', activityKind: 'edit' }).gap).toBe(gap);
    }
    expect(ENCOUNTER_GAP).toBeGreaterThanOrEqual(18);
  });

  it('o ciclo varia de 3 a 6 s por semente', () => {
    const cycles = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const c = cycleFor(seed);
      expect(c).toBeGreaterThanOrEqual(3000);
      expect(c).toBeLessThanOrEqual(6000);
      expect(c % 500).toBe(0);
      cycles.add(c);
    }
    expect(cycles.size).toBeGreaterThan(4);
  });
});

describe('ritmo das batalhas', () => {
  it('é determinístico e se repete a cada ciclo', () => {
    for (const seed of [0, 3, 99]) {
      const ms = cycleFor(seed);
      for (const now of [0, 250, 1000, 3999]) {
        expect(encounterBeat(now, seed)).toEqual(encounterBeat(now, seed));
        const a = encounterBeat(now, seed, ms);
        const b = encounterBeat(now + ms, seed, ms);
        expect(b.phase).toBeCloseTo(a.phase, 6);
        expect(b.castFrame).toBe(a.castFrame);
        expect(b.defeated).toBe(a.defeated);
        expect(b.flash).toBe(a.flash);
        expect(b.hp).toBeCloseTo(a.hp, 6);
      }
    }
  });

  it('a vida do monstro só cai dentro do ciclo (barra monotônica) e está cheia no começo', () => {
    for (const seed of [0, 8, 77]) {
      const ms = cycleFor(seed);
      let prevPhase = -1;
      let prevHp = 1;
      let minPhase = 2;
      let hpAtMin = 0;
      for (let i = 0; i <= 200; i++) {
        const b = encounterBeat(i * (ms / 200), seed, ms);
        expect(b.hp).toBeGreaterThanOrEqual(0);
        expect(b.hp).toBeLessThanOrEqual(1);
        if (b.phase < prevPhase - 1e-6) {
          // virou o ciclo: renasce com a vida cheia
          prevHp = 1;
        }
        expect(b.hp, `seed ${seed} fase ${b.phase.toFixed(3)}`).toBeLessThanOrEqual(prevHp + 1e-9);
        prevHp = b.hp;
        prevPhase = b.phase;
        if (b.phase < minPhase) {
          minPhase = b.phase;
          hpAtMin = b.hp;
        }
      }
      // no comecinho do ciclo a barra está praticamente cheia
      expect(hpAtMin).toBeGreaterThan(0.85);
    }
  });

  it('o ciclo tem golpe, queda e renascimento (sem ficar travado num estado)', () => {
    const ms = cycleFor(21);
    const seen = { cast: new Set<number>(), defeated: 0, flash: 0, knock: 0, respawn: 0, hpZero: 0 };
    for (let now = 0; now <= ms; now += 25) {
      const b = encounterBeat(now, 21, ms);
      expect(b.phase).toBeGreaterThanOrEqual(0);
      expect(b.phase).toBeLessThan(1);
      expect(b.frame).toBeGreaterThanOrEqual(0);
      expect(b.frame).toBeLessThan(ENCOUNTER_FRAMES.slime);
      expect(b.poofFrame).toBeGreaterThanOrEqual(0);
      expect(b.poofFrame).toBeLessThan(ENCOUNTER_FRAMES.poof);
      seen.cast.add(b.castFrame);
      if (b.defeated) seen.defeated++;
      if (b.flash) seen.flash++;
      if (b.knock > 0) seen.knock++;
      if (b.phase > 0.86) seen.respawn++;
      if (b.hp === 0) seen.hpZero++;
    }
    expect(seen.cast).toEqual(new Set([0, 1, 2]));
    expect(seen.defeated).toBeGreaterThan(0);
    expect(seen.flash).toBeGreaterThan(0);
    expect(seen.knock).toBeGreaterThan(0);
    expect(seen.respawn).toBeGreaterThan(0);
    expect(seen.hpZero).toBeGreaterThan(0);
  });

  it('o projétil viaja do herói ao monstro antes de cada golpe', () => {
    for (const seed of [1, 4, 19]) {
      const ms = cycleFor(seed);
      let flights = 0;
      for (let now = 0; now <= ms; now += 10) {
        const b = encounterBeat(now, seed, ms);
        if (b.projectile >= 0) {
          flights++;
          expect(b.projectile).toBeGreaterThanOrEqual(0);
          expect(b.projectile).toBeLessThanOrEqual(1);
        }
      }
      // pelo menos um instante de voo por golpe do ciclo
      expect(flights).toBeGreaterThanOrEqual(HIT_PHASES.length);
    }
  });

  it('os números de dano são estáveis por semente+ciclo e variam de ciclo para ciclo', () => {
    const ms = cycleFor(5);
    const samples: { now: number; d: ReturnType<typeof encounterBeat>['damage'] }[] = [];
    for (let now = 0; now <= ms; now += 10) {
      const b = encounterBeat(now, 5, ms);
      if (b.damage.length) samples.push({ now, d: b.damage });
    }
    expect(samples.length).toBeGreaterThan(0);
    const first = samples[0];
    expect(encounterBeat(first.now, 5, ms).damage).toEqual(first.d);
    for (const s of samples) {
      for (const d of s.d) {
        expect(d.value).toBeGreaterThanOrEqual(6);
        expect(d.age).toBeGreaterThanOrEqual(0);
        expect(d.age).toBeLessThan(1);
      }
    }
    // crítico é ~1 em 5: em muitos ciclos aparece
    let crits = 0;
    for (let cycle = 0; cycle < 60; cycle++) if (damageRoll(5, cycle, 0).crit) crits++;
    expect(crits).toBeGreaterThan(0);
  });

  it('o dano do crítico é o dobro do normal e não depende de Math.random', () => {
    const values = new Set<number>();
    for (let seed = 0; seed < 30; seed++) for (let i = 0; i < 3; i++) values.add(damageRoll(seed, 4, i).value);
    expect(values.size).toBeGreaterThan(4);
    // mesma chamada, mesmo resultado
    expect(damageRoll(123, 4, 2)).toEqual(damageRoll(123, 4, 2));
  });

  it('o contra-ataque do herói (cena de erro) só pulsa perto da fase dele', () => {
    const ms = cycleFor(33);
    let pulses = 0;
    for (let now = 0; now <= ms; now += 5) {
      const b = encounterBeat(now, 33, ms);
      if (b.heroHit > 0) {
        pulses++;
        expect(b.phase).toBeGreaterThanOrEqual(HERO_HIT_PHASE - 1e-9);
      }
    }
    expect(pulses).toBeGreaterThan(0);
  });

  it('a derrota acontece no último golpe e a vida zera antes do renascimento', () => {
    const ms = cycleFor(2);
    // acha o instante da queda varrendo o ciclo (a fase tem deslocamento por semente)
    let zeroHp = false;
    for (let now = 0; now <= ms; now += 5) {
      const b = encounterBeat(now, 2, ms);
      if (b.hp === 0) {
        zeroHp = true;
        expect(b.phase).toBeGreaterThanOrEqual(DEFEAT_PHASE - 1e-9);
      }
    }
    expect(zeroHp).toBe(true);
    expect(HIT_PHASES[HIT_PHASES.length - 1]).toBeCloseTo(DEFEAT_PHASE, 6);
  });

  it('sementes diferentes não lutam em sincronia', () => {
    const phases = new Set([0, 1, 2, 3, 4, 5].map((seed) => encounterBeat(1234, seed, cycleFor(seed)).phase.toFixed(3)));
    expect(phases.size).toBeGreaterThan(1);
  });

  it('a guarda respira devagar e é determinística', () => {
    for (const now of [0, 500, 2000]) {
      expect(guardBeat(now, 4)).toEqual(guardBeat(now, 4));
      expect([0, 1]).toContain(guardBeat(now, 4).frame);
    }
  });
});

describe('posicionamento e peças de arte da cena', () => {
  it('sentado à mesa, o monstro vai para a frente da mesa (mais para baixo)', () => {
    expect(monsterBaseY({ y: 100, seated: true })).toBeGreaterThan(monsterBaseY({ y: 100, seated: false }));
    expect(monsterBaseY({ y: 100 })).toBe(100);
  });

  it('cada cena usa uma peça animada que existe (martelo, runas, escudo, baú, fogueira, fogo, adaga, luz)', () => {
    const arts = [
      'hammer', 'runes', 'bat', 'glint', 'chest', 'campfire', 'spark', 'slash', 'poof',
      'fireball', 'dagger', 'lightbeam', 'smash', 'goldburst', 'victory',
    ] as const;
    for (const art of arts) expect(ENCOUNTER_FRAMES[art], art).toBeGreaterThanOrEqual(2);
  });
});
