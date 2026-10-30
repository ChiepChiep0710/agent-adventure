// Classe de RPG do personagem na skin de fantasia: o herói é a "profissão" que a atividade atual sugere.
// Só vale na skin de fantasia — no escritório continuam os acessórios sazonais (ver `seasonal.ts`).
//
// Sem piscar entre classes: a classe BASE vem da semente (o mesmo agente é sempre o mesmo herói) e a
// atividade atual só troca o papel por cima, sem sorteio por quadro. A troca acontece quando o agente
// muda de tipo de atividade (editar -> rodar comando), não a cada frame.
import type { ActivityKind, AgentKind, AgentStatus } from '../../../../shared/types';
import type { Costume } from '../../art/api';
import { isFantasy } from '../../art/skin';
import type { SeasonalTheme } from '../api';
import { seasonalCostume } from './seasonal';

/** Classes desenhadas em `art/character/render.ts` (drawCostume). */
export type FantasyClass = Extract<Costume, 'mage' | 'knight' | 'rogue' | 'cleric' | 'smith' | 'scholar'>;

/** Ordem estável: a semente escolhe a classe de repouso por índice aqui. */
export const FANTASY_CLASSES: readonly FantasyClass[] = ['mage', 'knight', 'rogue', 'cleric', 'smith', 'scholar'];

export interface FantasyClassInput {
  seed: number;
  status?: AgentStatus;
  /** 'sub' = subagente: mesma classe do pai (o tamanho menor já vem da aparência). */
  kind?: AgentKind;
  activityKind?: ActivityKind;
}

/** Classe de repouso: depende só da semente, então o agente nunca troca de herói sozinho. */
export function baseFantasyClass(seed: number): FantasyClass {
  const n = FANTASY_CLASSES.length;
  return FANTASY_CLASSES[Math.abs(Math.trunc(seed)) % n];
}

/**
 * Classe pela atividade atual (`null` = sem palpite: fica a de repouso).
 * A ideia é ler o que o agente faz como um papel de RPG: tecer código é magia, forjar no terminal é
 * ofício de ferreiro, ler e procurar é coisa de estudioso, sair para a web é batedor, falar/pedir é
 * clérigo e esperar uma resposta sua é ficar de guarda.
 */
export function classForActivity(kind: ActivityKind | undefined): FantasyClass | null {
  switch (kind) {
    case 'edit':
    case 'write':
      return 'mage';
    case 'run':
    case 'test':
    case 'git':
    case 'mcp':
      return 'smith';
    case 'read':
    case 'search':
    case 'plan':
    case 'skill':
    case 'think':
    case 'compact':
      return 'scholar';
    case 'web':
    case 'browser':
      return 'rogue';
    case 'ask':
    case 'wait':
    case 'error':
      return 'knight';
    case 'respond':
    case 'prompt':
    case 'communicate':
    case 'delegate':
      return 'cleric';
    default:
      return null;
  }
}

/** Classe final: espera/espera de shell mandam mais que a atividade; parado, fica a de repouso. */
export function fantasyClassFor(info: FantasyClassInput): FantasyClass {
  const base = baseFantasyClass(info.seed);
  if (info.status === 'waiting') return 'knight'; // de guarda, esperando você
  if (info.status === 'shell') return 'smith'; // esperando a forja terminar
  if (info.status === 'done' || info.status === 'offline') return base;
  return classForActivity(info.activityKind) ?? base;
}

/**
 * Traje do personagem. Na skin de fantasia a classe de RPG VENCE o acessório sazonal (mesmo no
 * Halloween/Natal: o escritório é o reino, não a festa); na skin de escritório vale o de sempre.
 */
export function characterCostume(info: FantasyClassInput, theme: SeasonalTheme): Costume | undefined {
  return isFantasy() ? fantasyClassFor(info) : seasonalCostume(theme, info.seed);
}
