// Atmosfera de masmorra da skin de fantasia (puro, testável em Node): o ambiente do ciclo dia/noite
// fica mais escuro e frio (pedra) e as fontes de fogo (braseiro, fogueira do acampamento, poste de
// lanterna, tocha de parede) ganham poças de luz quente que tremulam.
//
// O desenho (mapa de luz e brilhos aditivos) fica em `lighting.ts`; aqui só entram as contas, para
// que a regra de escurecer/tremer seja determinística e não dependa do DOM.
import { mixRgb, type Ambient, type Rgb } from './daylight';

/** Peças que fazem fogo/luz quente. Comparadas por nome para aceitar kinds novos sem quebrar tipos. */
export const TORCH_KINDS: readonly string[] = [
  'campfire',
  'brazier',
  'wall_torch',
  'torch',
  'lantern_post',
  'floor_lamp',
  'camp_lamp',
  'brazier_kit',
];

/** Teto de poças de luz quente no mapa (custo do desenho). */
export const TORCH_HALO_MAX = 48;
/** Teto de brilhos tremulantes por quadro. */
export const TORCH_GLOW_MAX = 64;
/** Noite mínima da masmorra: mesmo de dia o reino fica na penumbra das tochas. */
export const DUNGEON_NIGHT = 0.66;

const OUTSIDE: Rgb = [132, 140, 178]; // pátio/pedra sob a luz fria
const INSIDE: Rgb = [152, 160, 188]; // salas de pedra
const DIM: Rgb = [120, 128, 164]; // cantos e corredores

/** Alguma peça é fonte de luz quente? */
export function isTorchKind(kind: string): boolean {
  return TORCH_KINDS.includes(kind);
}

/** Escurece uma cor pela fração `k` (0 = preto, 1 = original), sem estourar 255. */
function shade(c: Rgb, k: number): Rgb {
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return [ch(c[0]), ch(c[1]), ch(c[2])];
}

/**
 * Ambiente da masmorra: puxa o ciclo real para a penumbra de pedra (nunca clareia de dia) e mantém
 * a noite fechada ainda mais escura. A hora e a fase continuam as reais (o céu das janelas segue).
 */
export function dungeonAmbient(a: Ambient): Ambient {
  const night = Math.max(a.night, DUNGEON_NIGHT);
  // mais noite = mais escuro (a masmorra nunca clareia de dia e fecha ainda mais à noite)
  const k = 0.92 - 0.37 * night;
  return {
    hour: a.hour,
    phase: a.phase,
    night,
    warm: a.warm * 0.4,
    outside: shade(OUTSIDE, k),
    inside: shade(INSIDE, k),
    dim: shade(DIM, k),
  };
}

/**
 * Tremor da chama: 0,82–1,18 em torno de 1 (brilho e raio da poça de luz). Com movimento reduzido a
 * chama fica parada (1), como manda a preferência do sistema.
 */
export function torchFlicker(now: number, seed: number, reduced = false): number {
  if (reduced) return 1;
  const t = now / 1000;
  const ph = (Math.abs(seed) % 97) * 0.31;
  const s = Math.sin(t * 3.1 + ph) * 0.55 + Math.sin(t * 7.3 + ph * 2.1) * 0.3;
  return 1 + s * 0.16;
}

export interface TorchPool {
  /** Largura/altura da poça de luz no mapa (px de mundo). */
  w: number;
  h: number;
  /** Altura do foco acima da âncora do móvel (px). */
  lift: number;
  /** Força relativa da poça (0..1). */
  alpha: number;
}

/** Poça de luz por tipo de fonte (fogueira grande, lanterna alta, tocha pequena). */
export function torchPool(kind: string): TorchPool {
  switch (kind) {
    case 'campfire':
      return { w: 150, h: 112, lift: 10, alpha: 1 };
    case 'brazier':
    case 'brazier_kit':
      return { w: 96, h: 74, lift: 14, alpha: 0.9 };
    case 'lantern_post':
      return { w: 84, h: 64, lift: 34, alpha: 0.95 };
    case 'wall_torch':
    case 'torch':
      return { w: 78, h: 58, lift: 22, alpha: 0.85 };
    case 'camp_lamp':
      return { w: 70, h: 54, lift: 18, alpha: 0.8 };
    default:
      // floor_lamp e afins
      return { w: 92, h: 66, lift: 6, alpha: 0.85 };
  }
}

/** Cor da poça quente, misturada com um resto do sol baixo do amanhecer/entardecer. */
export function torchColor(a: Ambient): Rgb {
  return mixRgb([255, 214, 150], [255, 168, 96], a.warm * 0.6);
}
