import { afterEach, describe, expect, it } from 'vitest';
import { appearanceFromSeed } from '../../art/character/appearance';
import { renderCharacter } from '../../art/character/render';
import type { Dir, Pose } from '../../art/api';
import { setSkinForTests } from '../../art/skin';
import { FANTASY_CLASSES, baseFantasyClass, characterCostume, classForActivity, fantasyClassFor } from './fantasy-class';
import { bubblePalette, statusMarker } from './overlay';
import { wallScreenMode } from '../../art/dynamic';

afterEach(() => setSkinForTests(undefined));

describe('classes de RPG (skin de fantasia)', () => {
  it('classe de repouso é estável pela semente', () => {
    for (const seed of [0, 1, 7, 42, 123456789, -5]) {
      expect(baseFantasyClass(seed)).toBe(baseFantasyClass(seed));
      expect(FANTASY_CLASSES).toContain(baseFantasyClass(seed));
    }
    expect(new Set([0, 1, 2, 3, 4, 5].map(baseFantasyClass)).size).toBe(6);
  });

  it('a atividade escolhe o papel', () => {
    expect(classForActivity('edit')).toBe('mage');
    expect(classForActivity('write')).toBe('mage');
    expect(classForActivity('run')).toBe('smith');
    expect(classForActivity('test')).toBe('smith');
    expect(classForActivity('read')).toBe('scholar');
    expect(classForActivity('search')).toBe('scholar');
    expect(classForActivity('web')).toBe('rogue');
    expect(classForActivity('ask')).toBe('knight');
    expect(classForActivity(undefined)).toBeNull();
  });

  it('status manda mais que a atividade; parado volta à classe base', () => {
    expect(fantasyClassFor({ seed: 3, status: 'waiting', activityKind: 'edit' })).toBe('knight');
    expect(fantasyClassFor({ seed: 3, status: 'shell', activityKind: 'read' })).toBe('smith');
    expect(fantasyClassFor({ seed: 3, status: 'done', activityKind: 'edit' })).toBe(baseFantasyClass(3));
    expect(fantasyClassFor({ seed: 3, status: 'working', activityKind: 'edit' })).toBe('mage');
  });

  it('na fantasia a classe vence o traje sazonal; no escritório fica o sazonal', () => {
    setSkinForTests('fantasy');
    expect(characterCostume({ seed: 1, status: 'working', activityKind: 'edit' }, 'halloween')).toBe('mage');
    setSkinForTests('office');
    expect(characterCostume({ seed: 1, status: 'working', activityKind: 'edit' }, 'christmas')).toBe('santa');
    expect(characterCostume({ seed: 1 }, 'none')).toBeUndefined();
  });

  it('cada classe desenha algo por cima, sem mover a âncora', () => {
    const appearance = appearanceFromSeed(42);
    for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
      for (const pose of ['stand', 'walk', 'sit'] as Pose[]) {
        const req = { appearance, dir, pose, frame: 0 };
        const plain = renderCharacter(req);
        for (const costume of FANTASY_CLASSES) {
          const dressed = renderCharacter({ ...req, costume });
          expect(dressed.buf.data.some((b, i) => b !== plain.buf.data[i])).toBe(true);
          expect([dressed.ax, dressed.ay]).toEqual([plain.ax, plain.ay]);
        }
      }
    }
  });
});

describe('balões e marcas (skin de fantasia)', () => {
  it('pergaminho na fantasia, cores de sempre no escritório', () => {
    expect(bubblePalette('info', false).bg).toBe('#fffdf8');
    expect(bubblePalette('info', true).bg).toBe('#f6e8c8');
    expect(bubblePalette('alert', true).bg).not.toBe(bubblePalette('alert', false).bg);
  });
  it('"!" de missão para quem precisa de você, "✓" para entrega', () => {
    expect(statusMarker('alert')).toBe('quest');
    expect(statusMarker('deliver')).toBe('done');
    expect(statusMarker('info')).toBeNull();
    expect(statusMarker('shell')).toBeNull();
  });
});

describe('polimento da fantasia', () => {
  it('chapéus/elmos/capuzes passam do topo da cabeça, em pé e sentado', () => {
    const appearance = appearanceFromSeed(42);
    for (const dir of ['down', 'up', 'left'] as Dir[]) {
      for (const pose of ['stand', 'sit'] as Pose[]) {
        const req = { appearance, dir, pose, frame: 0 };
        const top = renderCharacter(req).buf.bounds()!.y;
        for (const costume of FANTASY_CLASSES) {
          const b = renderCharacter({ ...req, costume }).buf.bounds()!;
          expect(b.y, `${costume} ${dir} ${pose}`).toBeLessThan(top);
        }
      }
    }
  });
  it('TV e fliperama viram espelho mágico só na fantasia', () => {
    expect(wallScreenMode('tv', true)).toBe('mirror');
    expect(wallScreenMode('arcade', true)).toBe('mirror');
    expect(wallScreenMode('tv', false)).toBe('live');
  });
});
