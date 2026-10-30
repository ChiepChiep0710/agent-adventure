// Pele dos sprites da área externa e das marcas da pista (puro, sem DOM): a skin de fantasia troca
// o poste de luz por lanterna de ferro, a mesa de guarda-sol por barraca de feira, o banco por
// banco de tronco, o totem por pedra rúnica e o carro por carroça — e a rua deixa de ter faixa
// tracejada e faixas de pedestres pintadas. A skin é escolhida uma vez por carga da página (ver
// art/skin.ts), então as chaves de cache abaixo só existem para o caso da prévia de arte.
import { getSkin, isFantasy, type Skin } from '../../art/skin';
import type { ExteriorProp } from '../layout/types';

/** Kinds da área externa que têm arte própria na skin de fantasia. */
export const SKINNED_PROP_KINDS: readonly ExteriorProp['kind'][] = ['lamp', 'bench', 'parasol', 'totem'];

/** Skin atual: entra na chave do cache de sprites (a prévia de arte troca sem recarregar). */
export function propSkin(): Skin {
  return getSkin();
}

/** `true` quando o prop tem versão de fantasia (poste → lanterna, guarda-sol → barraca...). */
export function propHasFantasyArt(kind: ExteriorProp['kind']): boolean {
  return isFantasy() && SKINNED_PROP_KINDS.includes(kind);
}

/**
 * Chave do cache de sprite do prop: mesma composição do original (kind + seed) com a skin na frente.
 * Dentro de uma carga a skin é fixa, mas a chave com skin evita servir arpão de escritório na
 * fantasia quando a prévia de arte troca a pele na mesma página.
 */
export function propCacheKey(prop: Pick<ExteriorProp, 'kind' | 'seed'>): string {
  const key = prop.kind === 'lamp' || prop.kind === 'bench' || prop.kind === 'totem' ? prop.kind : `${prop.kind}:${prop.seed % 7}`;
  return `${propSkin()}:${key}`;
}

/** Chave do cache do carro (vira carroça na fantasia). */
export function carCacheKey(variant: number, flip: boolean): string {
  return `${propSkin()}:car:${variant}:${flip ? 1 : 0}`;
}

/**
 * A pista da fantasia é de pedra: sem faixa central tracejada nem faixas de pedestres pintadas
 * (o resto do chão — meio-fio, sarjeta, bueiros — continua igual).
 */
export function shouldDrawRoadMarkings(): boolean {
  return !isFantasy();
}
