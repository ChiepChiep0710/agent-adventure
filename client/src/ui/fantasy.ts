// Skin de fantasia (RPG clássico): o uso do plano vira pontos de vida (HP, sessão de 5 h) e de magia (MP, semana).
// Puro (sem DOM), testado em ui/fantasy.test.ts. A diferença de leitura importa: o cartão do escritório mostra o
// CONSUMIDO (barra enchendo), e a fantasia mostra o que RESTA (barra esvaziando), para o HP drenar conforme a cota
// é gasta — é o que se espera de uma barra de vida.
import { tr } from '../../../shared/i18n';

/** HP: sessão de 5 horas; MP: limite semanal. */
export type GaugeKind = 'hp' | 'mp';

/** ok: ainda dá para gastar; warn: resto baixo; crit: resto crítico (pisca no CSS); none: sem números. */
export type GaugeTone = 'ok' | 'warn' | 'crit' | 'none';

export interface FantasyGauge {
  /** Parte preenchida da barra (0..100): o que resta da cota. */
  fill: number;
  tone: GaugeTone;
  /** Resto abaixo do limite crítico: a barra pisca (CSS `.is-critical`). */
  critical: boolean;
}

/** Abaixo disto o resto já está baixo (âmbar). */
export const FANTASY_WARN_LEFT = 50;
/** Abaixo disto o resto é crítico (vermelho piscando). */
export const FANTASY_CRIT_LEFT = 20;

/**
 * Converte o uso consumido (0..100, como no cartão do escritório) na barra de HP/MP: preenchimento = o que resta.
 * Fora da faixa é preso em 0..100; sem número (`null`/`NaN`) não há barra (`tone: 'none'`).
 */
export function fantasyGauge(usedPct: number | null | undefined): FantasyGauge {
  if (usedPct === null || usedPct === undefined || !Number.isFinite(usedPct)) return { fill: 0, tone: 'none', critical: false };
  const used = Math.min(100, Math.max(0, usedPct));
  const fill = Math.round(100 - used);
  const tone: GaugeTone = fill < FANTASY_CRIT_LEFT ? 'crit' : fill < FANTASY_WARN_LEFT ? 'warn' : 'ok';
  return { fill, tone, critical: tone === 'crit' };
}

/** Rótulo curto da barra na fantasia. */
export function gaugeLabel(kind: GaugeKind): string {
  return kind === 'hp' ? tr('HP') : tr('MP');
}

// ------------------------------------------------------------------ títulos dos painéis

/** Título do feed de atividade: na fantasia, o diário de missões da guilda. */
export function feedTitle(fantasy: boolean): string {
  return fantasy ? tr('Diário de missões') : tr('Atividade');
}

/** Título do painel lateral: na fantasia, a guilda. */
export function sidebarTitle(fantasy: boolean): string {
  return fantasy ? tr('Guilda') : tr('Escritório');
}
