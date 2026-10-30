// Testes da atmosfera de masmorra (puro): o ambiente da skin de fantasia escurece/esfria sem perder a
// hora real, e as fontes de fogo tremulam de forma determinística (paradas com movimento reduzido).
import { describe, expect, it } from 'vitest';
import { ambientAt, isNeutral } from './daylight';
import {
  DUNGEON_NIGHT,
  isTorchKind,
  TORCH_GLOW_MAX,
  TORCH_HALO_MAX,
  TORCH_KINDS,
  torchColor,
  torchFlicker,
  torchPool,
} from './dungeon-light';
import { dungeonAmbient } from './dungeon-light';

describe('atmosfera de masmorra', () => {
  it('escurece e esfria o ambiente mesmo de dia (nunca fica neutro)', () => {
    for (const hour of [3, 8, 13.5, 18, 22.5]) {
      const real = ambientAt(hour);
      const dungeon = dungeonAmbient(real);
      expect(dungeon.hour, `hora ${hour}`).toBe(real.hour);
      expect(isNeutral(dungeon), `hora ${hour}`).toBe(false);
      expect(dungeon.night).toBeGreaterThanOrEqual(DUNGEON_NIGHT);
      // pedra sob luz fria: mais azul que vermelho
      expect(dungeon.inside[2]).toBeGreaterThan(dungeon.inside[0]);
      expect(dungeon.outside[2]).toBeGreaterThan(dungeon.outside[0]);
      // e mais escuro que o ambiente real
      expect(dungeon.inside[0] + dungeon.inside[1] + dungeon.inside[2]).toBeLessThan(real.inside[0] + real.inside[1] + real.inside[2]);
    }
  });

  it('a noite da masmorra fica mais escura que o "dia" dela', () => {
    const day = dungeonAmbient(ambientAt(13.5));
    const night = dungeonAmbient(ambientAt(22.5));
    expect(night.night).toBeGreaterThan(day.night);
    expect(night.inside[0] + night.inside[1] + night.inside[2]).toBeLessThan(day.inside[0] + day.inside[1] + day.inside[2]);
  });

  it('aplicar de novo não muda nada (idempotente)', () => {
    const once = dungeonAmbient(ambientAt(21));
    expect(dungeonAmbient(once)).toEqual(once);
  });

  it('reconhece as fontes de luz quente pelo nome, aceitando kinds novos', () => {
    for (const k of TORCH_KINDS) expect(isTorchKind(k), k).toBe(true);
    expect(isTorchKind('floor_lamp')).toBe(true);
    expect(isTorchKind('campfire')).toBe(true);
    expect(isTorchKind('lantern_post')).toBe(true);
    expect(isTorchKind('brazier')).toBe(true);
    expect(isTorchKind('wall_torch')).toBe(true);
    expect(isTorchKind('desk')).toBe(false);
    expect(isTorchKind('bookshelf')).toBe(false);
  });

  it('a poça da fogueira é maior e mais forte que a da tocha', () => {
    const fire = torchPool('campfire');
    const torch = torchPool('wall_torch');
    expect(fire.w).toBeGreaterThan(torch.w);
    expect(fire.h).toBeGreaterThan(torch.h);
    expect(fire.alpha).toBeGreaterThan(torch.alpha);
    for (const k of ['campfire', 'brazier', 'lantern_post', 'wall_torch', 'torch', 'floor_lamp', 'desconhecido']) {
      const p = torchPool(k);
      expect(p.w, k).toBeGreaterThan(0);
      expect(p.h, k).toBeGreaterThan(0);
      expect(p.lift, k).toBeGreaterThanOrEqual(0);
      expect(p.alpha, k).toBeGreaterThan(0);
      expect(p.alpha, k).toBeLessThanOrEqual(1);
    }
  });

  it('o tremor da chama é determinístico e fica numa faixa segura', () => {
    let min = 2;
    let max = 0;
    for (let seed = 0; seed < 20; seed++) {
      for (let now = 0; now < 5000; now += 37) {
        const f = torchFlicker(now, seed);
        expect(f).toBe(torchFlicker(now, seed));
        expect(f).toBeGreaterThanOrEqual(0.8);
        expect(f).toBeLessThanOrEqual(1.2);
        min = Math.min(min, f);
        max = Math.max(max, f);
      }
    }
    // treme de verdade, mas sem apagar nem estourar
    expect(max - min).toBeGreaterThan(0.05);
  });

  it('com movimento reduzido a chama fica parada', () => {
    for (const now of [0, 800, 2400]) expect(torchFlicker(now, 3, true)).toBe(1);
  });

  it('a cor da poça é quente (mais vermelho que azul)', () => {
    const c = torchColor(ambientAt(18));
    expect(c[0]).toBeGreaterThanOrEqual(c[1]);
    expect(c[1]).toBeGreaterThanOrEqual(c[2]);
  });

  it('os tetos de luz por quadro são modestos (perf)', () => {
    expect(TORCH_HALO_MAX).toBeGreaterThan(8);
    expect(TORCH_HALO_MAX).toBeLessThanOrEqual(64);
    expect(TORCH_GLOW_MAX).toBeGreaterThanOrEqual(TORCH_HALO_MAX);
    expect(TORCH_GLOW_MAX).toBeLessThanOrEqual(96);
  });
});
