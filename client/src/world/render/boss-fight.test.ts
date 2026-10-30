import { describe, expect, it } from 'vitest';
import { encounterFor, fightTarget, type EncounterActor } from './encounters';

const hero = (extra: Partial<EncounterActor> = {}): EncounterActor => ({
  x: 100,
  y: 200,
  alpha: 1,
  seed: 4242,
  status: 'working',
  activityKind: 'edit',
  ...extra,
});

describe('herói x chefe da sala', () => {
  it('sem chefe na sala, o combate é com o monstrinho ao lado (comportamento antigo)', () => {
    const actor = hero();
    const e = encounterFor(actor);
    expect(e.kind).toBe('battle');
    const aim = fightTarget(actor, e);
    expect(aim.boss).toBe(false);
    expect(aim.side).toBe(e.side);
    expect(aim.x).toBe(actor.x + e.side * e.gap);
  });

  it('com chefe na sala, o golpe vai no chefe e o lado vem da posição dele', () => {
    const right = fightTarget(hero({ boss: { x: 300, y: 180 } }), encounterFor(hero({ boss: { x: 300, y: 180 } })));
    expect(right).toMatchObject({ boss: true, side: 1, x: 300, y: 180 });
    const left = fightTarget(hero({ boss: { x: 20, y: 180 } }), encounterFor(hero({ boss: { x: 20, y: 180 } })));
    expect(left).toMatchObject({ boss: true, side: -1, x: 20, y: 180 });
  });

  it('quem está parado continua sem luta (o chefe não inventa combate)', () => {
    const idle = hero({ status: 'idle', activityKind: undefined, boss: { x: 300, y: 180 } });
    const e = encounterFor(idle);
    expect(e.kind === null || e.kind === 'rest').toBe(true);
    expect(fightTarget(idle, e).boss).toBe(false);
  });
});
