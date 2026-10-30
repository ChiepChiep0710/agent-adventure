import { describe, expect, it } from 'vitest';
import { fantasyGauge, feedTitle, gaugeLabel, sidebarTitle } from './fantasy';

describe('fantasyGauge', () => {
  it('cota intacta: barra cheia', () => {
    expect(fantasyGauge(0)).toEqual({ fill: 100, tone: 'ok', critical: false });
  });

  it('mostra o que RESTA, não o que foi gasto', () => {
    // 45% gasto -> 55% de vida sobrando.
    expect(fantasyGauge(45)).toEqual({ fill: 55, tone: 'ok', critical: false });
  });

  it('resto abaixo de 50% fica em âmbar', () => {
    expect(fantasyGauge(51)).toEqual({ fill: 49, tone: 'warn', critical: false });
    // 50% de resto ainda é ok (o limite é "abaixo de").
    expect(fantasyGauge(50).tone).toBe('ok');
  });

  it('resto abaixo de 20% é crítico (pisca)', () => {
    expect(fantasyGauge(81)).toEqual({ fill: 19, tone: 'crit', critical: true });
    expect(fantasyGauge(80).critical).toBe(false);
  });

  it('cota esgotada: barra vazia e crítica', () => {
    expect(fantasyGauge(100)).toEqual({ fill: 0, tone: 'crit', critical: true });
  });

  it('prende valores fora da faixa', () => {
    expect(fantasyGauge(150).fill).toBe(0);
    expect(fantasyGauge(-20).fill).toBe(100);
  });

  it('arredonda o resto para o segmento mais próximo', () => {
    expect(fantasyGauge(33.4).fill).toBe(67);
    expect(fantasyGauge(33.6).fill).toBe(66);
  });

  it('sem números não há barra', () => {
    expect(fantasyGauge(null)).toEqual({ fill: 0, tone: 'none', critical: false });
    expect(fantasyGauge(undefined)).toEqual({ fill: 0, tone: 'none', critical: false });
    expect(fantasyGauge(Number.NaN).tone).toBe('none');
  });
});

describe('rótulos e títulos da fantasia', () => {
  it('HP e MP em qualquer idioma', () => {
    expect(gaugeLabel('hp')).toBe('HP');
    expect(gaugeLabel('mp')).toBe('MP');
  });

  it('fora da fantasia, os títulos de sempre', () => {
    expect(feedTitle(false)).toBe('Atividade');
    expect(sidebarTitle(false)).toBe('Escritório');
  });

  it('na fantasia, diário de missões e guilda', () => {
    expect(feedTitle(true)).toBe('Diário de missões');
    expect(sidebarTitle(true)).toBe('Guilda');
  });
});
