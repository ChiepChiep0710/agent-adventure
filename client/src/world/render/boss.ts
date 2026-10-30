// Chefe de cada câmara da masmorra (skin de fantasia).
//
// Diferente dos "encontros", que aparecem colados nos pés de um agente e o seguem, aqui cada SALA tem
// o seu dono: um chefe grande, parado no centro do poço da arena, que faz parte do cenário do bioma.
// Ele dorme (respira) quando ninguém está trabalhando e "acorda" — pose de golpe, aura e barra de vida
// — quando há gente trabalhando de verdade naquela sala. Nada é inventado: a única entrada é o
// número de agentes com status 'working' na sala, que o renderizador já conhece.
import { renderBossArt, type BossKind } from '../../art/bosses';
import { pixelText, pixelTextWidth } from '../../art/pixelfont';
import { tr } from '../../../../shared/i18n';
import type { DungeonBiomeId } from '../layout/dungeon-biome';

/** Bioma -> chefe que mora nele. */
const BOSS_BY_BIOME: Readonly<Record<DungeonBiomeId, BossKind>> = {
  sandstone: 'sand_mummy',
  crypt: 'bone_lord',
  forge: 'magma_golem',
  ice: 'frost_warden',
  grotto: 'moss_horror',
  crystal: 'crystal_queen',
  cistern: 'drowned_king',
};

/** Nome do chefe (fonte do letreiro). */
export function bossName(kind: BossKind): string {
  switch (kind) {
    case 'sand_mummy':
      return tr('Múmia de Arenito');
    case 'bone_lord':
      return tr('Rei dos Ossos');
    case 'magma_golem':
      return tr('Golem de Magma');
    case 'frost_warden':
      return tr('Guardião de Gelo');
    case 'moss_horror':
      return tr('Horror de Musgo');
    case 'crystal_queen':
      return tr('Rainha de Cristal');
    case 'drowned_king':
      return tr('Rei Afogado');
  }
}

export function bossKindFor(biome: DungeonBiomeId): BossKind {
  return BOSS_BY_BIOME[biome];
}

/** Vida que o chefe ainda mostra enquanto a sala luta (1 = intacto). */
export function bossHp(activeHeroes: number): number {
  const n = Math.max(0, Math.min(8, Math.floor(activeHeroes)));
  return Math.max(0.12, 1 - n * 0.16);
}

export interface BossPose {
  kind: BossKind;
  /** 0 = parado, 1 = golpe, 2 = ferido. */
  frame: 0 | 1 | 2;
  /** Fração da barra de vida (decorativa: cai com o número de heróis lutando na sala). */
  hp: number;
  /** Tem alguém trabalhando na sala: aura, barra e pose de golpe. */
  engaged: boolean;
}

/** Estado do chefe da sala: puro e determinístico (mesma entrada -> mesma pose). */
export function bossPose(biome: DungeonBiomeId, seed: number, activeHeroes: number, now: number): BossPose {
  const engaged = activeHeroes > 0;
  const hp = bossHp(activeHeroes);
  // ciclo de golpe: começa num instante diferente por sala (a semente) para as salas não sincronizarem
  const phase = ((now + (seed % 900)) % 1800) / 1800;
  const frame: 0 | 1 | 2 = !engaged ? 0 : phase < 0.22 ? 1 : 0;
  return { kind: bossKindFor(biome), frame, hp, engaged };
}

/**
 * Desenha o chefe com o pé em (x, y). `alpha` acompanha o fade da sala (construção/desmonte) e
 * `showLabel` esconde o letreiro quando a sala está longe do zoom (evita poluição).
 */
/** Canvas do sprite (uma vez por tipo/quadro: o desenho é caro para refazer a cada quadro). */
const canvases = new Map<string, HTMLCanvasElement>();

function bossCanvas(kind: BossKind, frame: number): { canvas: HTMLCanvasElement; ax: number; ay: number } {
  const key = `${kind}|${frame}`;
  const hit = canvases.get(key);
  const s = renderBossArt(kind, frame);
  if (hit) return { canvas: hit, ax: s.ax, ay: s.ay };
  const canvas = document.createElement('canvas');
  canvas.width = s.buf.w;
  canvas.height = s.buf.h;
  canvas.getContext('2d')!.putImageData(new ImageData(s.buf.data, s.buf.w, s.buf.h), 0, 0);
  canvases.set(key, canvas);
  return { canvas, ax: s.ax, ay: s.ay };
}

export function drawRoomBoss(
  ctx: CanvasRenderingContext2D,
  boss: BossPose,
  x: number,
  y: number,
  now: number,
  alpha: number,
  showLabel: boolean,
): void {
  const sprite = bossCanvas(boss.kind, boss.frame);
  const bob = boss.engaged ? 0 : Math.round(Math.sin(now / 700 + x) * 0.6);
  const px = Math.round(x);
  const py = Math.round(y) + bob;

  ctx.save();
  ctx.globalAlpha = alpha;
  // sombra de contato (o chefe é grande: sombra maior que a dos personagens)
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(px, py - 1, 13, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // aura de "acordado"
  if (boss.engaged && boss.frame === 1) {
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = '#ff6a3d';
    ctx.beginPath();
    ctx.ellipse(px, py - 2, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
  }
  ctx.drawImage(sprite.canvas, px - sprite.ax, py - sprite.ay);
  ctx.restore();

  if (!showLabel) return;
  const name = bossName(boss.kind);
  // letreiro escuro atrás do nome (legível sobre qualquer piso), logo acima da cabeça
  const textY = py - sprite.ay - 6;
  const w = pixelTextWidth(name) + 6;
  ctx.save();
  ctx.globalAlpha = alpha * 0.8;
  ctx.fillStyle = 'rgba(10,8,14,0.72)';
  ctx.fillRect(Math.round(px - w / 2), textY - 3, w, 9);
  ctx.restore();
  ctx.globalAlpha = alpha;
  pixelText(ctx, name, Math.round(px - pixelTextWidth(name) / 2), textY, '#f3e6c8');
  bossBar(ctx, px, textY - 9, boss.hp, alpha);
  ctx.globalAlpha = 1;
}

/** Barra de vida do chefe: mais larga que a dos monstros (é o dono da sala). */
function bossBar(ctx: CanvasRenderingContext2D, cx: number, y: number, hp: number, alpha: number): void {
  const w = 26;
  const h = 4;
  const left = Math.round(cx - w / 2);
  const top = Math.round(y);
  const filled = Math.max(1, Math.round(w * Math.max(0, Math.min(1, hp))));
  ctx.save();
  ctx.globalAlpha = alpha;
  // moldura escura + fundo de "vida perdida" (dá para ver quanto já foi tirado)
  ctx.fillStyle = '#1b1310';
  ctx.fillRect(left - 2, top - 2, w + 4, h + 4);
  ctx.fillStyle = '#40201e';
  ctx.fillRect(left - 1, top - 1, w + 2, h + 2);
  ctx.fillStyle = hp > 0.55 ? '#63d97a' : hp > 0.28 ? '#ffce4a' : '#ff5f5f';
  ctx.fillRect(left, top, filled, h);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(left, top, filled, 1);
  ctx.restore();
}
