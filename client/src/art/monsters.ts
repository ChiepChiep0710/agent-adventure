// Monstrinhos e efeitos dos "encontros" da skin de fantasia: o agente vira herói e a atividade real
// vira uma cena de RPG (luta contra um slime ao editar, forja ao rodar comando, runas ao ler, morcego
// ao navegar, baú ao terminar). Tudo é puramente decorativo: nada aqui volta para o mundo nem para o
// Habblaud World.
//
// Desenho em PixelBuf (puro, testável em Node), mesma escala dos personagens. A âncora fica no pé do
// sprite (ax = centro, ay = base) para o renderizador colar a cena nos pés de quem a protagoniza.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

/** Monstrinhos que aparecem na cena. */
export type MonsterKind = 'slime' | 'bat' | 'golem';

/** Efeitos da cena (um por tipo de encontro, além do "poof" de derrota). */
export type EncounterFx = 'slash' | 'spark' | 'hammer' | 'runes' | 'chest' | 'glint' | 'campfire' | 'poof';

/** Qualquer peça desenhável de um encontro. */
export type EncounterArt = MonsterKind | EncounterFx;

export const MONSTER_KINDS: readonly MonsterKind[] = ['slime', 'bat', 'golem'];

/** Quadros de animação por peça (ciclo curto e legível no tamanho pequeno). */
export const ENCOUNTER_FRAMES: Readonly<Record<EncounterArt, number>> = {
  slime: 3,
  bat: 3,
  golem: 3,
  slash: 3,
  spark: 3,
  hammer: 3,
  runes: 3,
  chest: 3,
  glint: 2,
  campfire: 3,
  poof: 3,
};

/** Resolve o quadro pedido dentro do ciclo (aceita qualquer inteiro, inclusive negativo). */
export function encounterFrame(name: EncounterArt, frame: number): number {
  const n = ENCOUNTER_FRAMES[name];
  return ((Math.trunc(frame) % n) + n) % n;
}

// ------------------------------------------------------------------ monstrinhos

/** Slime: bola verde que quica. O quadro muda altura e largura (sem sorteio). */
function slime(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  // [raio x, raio y, centro y] por quadro: alto, achatado no pouso, meio.
  const shape: readonly [number, number, number][] = [
    [5.2, 5, 9.5],
    [6, 3.4, 11],
    [5.6, 4.4, 10.2],
  ];
  const [rx, ry, cy] = shape[frame];
  b.shadow(8, 15, 5.5, 1.4, '#1c2034', 0.2);
  b.ellipse(8, cy, rx, ry, '#2f8a52');
  b.ellipse(8, cy - 0.7, rx - 1, ry - 0.8, '#4fc273');
  // brilho superior esquerdo
  b.ellipse(6, cy - ry + 1.7, 1.6, 1.1, '#9bec9f');
  const eyeY = Math.round(cy - 1);
  b.rect(5, eyeY, 1, 2, '#1b2430');
  b.rect(10, eyeY, 1, 2, '#1b2430');
  b.set(5, eyeY, '#eafff0');
  b.set(10, eyeY, '#eafff0');
  // boquinha: muda com o quadro para dar vida
  if (frame === 1) b.hline(7, 8, eyeY + 2, '#1b2430');
  else b.set(8, eyeY + 2, '#1b2430');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Morcego: asas em três posições (para cima, na linha, para baixo). */
function bat(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  // asa: centro (x, y) e raios da membrana, espelhados nos dois lados
  const wings: readonly (readonly [number, number, number, number])[] = [
    [4, 5.5, 2.6, 2],
    [4, 9, 3, 1.3],
    [4.5, 11.5, 2.4, 1.7],
  ];
  const wing = wings[frame];
  const [wx, wy, rx, ry] = wing;
  for (const s of [-1, 1]) {
    const cx = 8 + s * (8 - wx);
    b.ellipse(cx, wy, rx, ry, '#42345a'); // membrana
    b.ellipse(cx, wy - 0.5, rx - 0.8, ry - 0.6, '#5b4477');
    // borda ondulada (dois dentinhos) da ponta da asa
    b.set(Math.round(cx + s * 0.6), Math.round(wy + ry), '#7d61a0');
    b.set(Math.round(cx - s * 1.6), Math.round(wy + ry - 0.5), '#7d61a0');
  }
  // corpo e orelhinhas
  b.ellipse(8, 9.3, 2.2, 2.6, '#3c2f52');
  b.ellipse(8, 9.1, 1.6, 2, '#5b4477');
  b.vline(6, 5, 6, '#3c2f52');
  b.vline(9, 5, 6, '#3c2f52');
  // olhos amarelos e presas
  b.set(7, 8, '#ffd45e');
  b.set(9, 8, '#ffd45e');
  b.set(7, 11, '#f4ecff');
  b.set(9, 11, '#f4ecff');
  b.outline();
  return { buf: b, ax: 8, ay: 14 };
}

/** Golem de pedra: baixinho, olhos que acendem. Os braços trocam de altura por quadro. */
function golem(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  const armY = [7, 9, 8][frame];
  b.shadow(8, 15, 5, 1.3, '#1c2034', 0.22);
  // pernas
  b.rect(5, 12, 2, 3, '#565b6b');
  b.rect(9, 12, 2, 3, '#565b6b');
  // tronco e cabeça
  b.rect(4, 6, 8, 7, '#6b7080');
  b.rect(4, 6, 8, 2, '#818799');
  b.rect(5, 3, 6, 4, '#757b8c');
  b.rect(5, 3, 6, 1, '#8d93a5');
  // braços
  b.rect(2, armY, 2, 5, '#5d6273');
  b.rect(12, armY + 1, 2, 5, '#5d6273');
  b.set(2, armY + 5, '#767c8e');
  b.set(13, armY + 6, '#767c8e');
  // rachaduras
  b.set(7, 8, '#4a4f5e');
  b.set(8, 9, '#4a4f5e');
  b.set(10, 7, '#4a4f5e');
  // olhos (o quadro 2 pisca mais forte)
  const eye = frame === 2 ? '#c8fff0' : '#7ff2d0';
  b.set(6, 5, eye);
  b.set(9, 5, eye);
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

// ------------------------------------------------------------------ efeitos

/** Arco de espada (do alto à direita para baixo à esquerda), 3 quadros de varredura. */
function slash(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  const sweep = [
    [[13, 2], [11, 5], [8, 7]],
    [[11, 3], [8, 6], [4, 8]],
    [[8, 5], [5, 8], [2, 12]],
  ][frame];
  for (const [x, y] of sweep) b.rect(x, y, 2, 2, '#eaf6ff');
  // rastro mais claro atrás do gume
  for (const [x, y] of sweep) b.set(x + 1, y - 1, 'rgba(180,235,255,0.65)');
  b.set(sweep[0][0] + 1, sweep[0][1] + 1, '#ffffff');
  if (frame === 2) {
    // faíscas do impacto
    for (const [x, y] of [[1, 10], [3, 14], [6, 11]]) b.set(x, y, '#ffd45e');
  }
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Projétil mágico: orbe que cresce e estoura. */
function spark(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  const r = [1.4, 2.2, 2.8][frame];
  const cx = [3, 7, 11][frame];
  const cy = [11, 9, 7][frame];
  // rastro
  for (let i = 1; i <= 4; i++) b.set(cx - i * 2, cy + i, `rgba(150,120,255,${0.5 - i * 0.1})`);
  b.ellipse(cx, cy, r, r, '#8a63ff');
  b.ellipse(cx, cy, r - 0.9, r - 0.9, '#e8d7ff');
  b.set(cx, cy, '#ffffff');
  if (frame === 2) {
    // estrela de impacto
    b.hline(cx - 4, cx + 4, cy, '#c9b2ff');
    b.vline(cx, cy - 4, cy + 4, '#c9b2ff');
    b.set(cx - 3, cy - 3, '#ffe9a8');
    b.set(cx + 3, cy - 3, '#ffe9a8');
  }
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Faíscas de forja: bigorna pequena e fagulhas subindo. */
function hammer(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  // bigorna
  b.rect(3, 12, 7, 2, '#4b5263');
  b.rect(4, 10, 6, 2, '#6a7182');
  b.rect(2, 9, 3, 2, '#6a7182');
  b.rect(5, 14, 4, 1, '#3d4353');
  // fagulhas (mudam de posição por quadro)
  const specks: readonly (readonly [number, number, string])[][] = [
    [[10, 8, '#ffe9a8'], [12, 6, '#ffa53d']],
    [[11, 5, '#fff2c4'], [14, 4, '#ffb347'], [9, 4, '#ffd45e']],
    [[12, 2, '#fff2c4'], [15, 7, '#ff9a2e'], [8, 1, '#ffd45e'], [10, 1, 'rgba(255,200,110,0.7)']],
  ];
  for (const [x, y, c] of specks[frame]) b.set(x, y, c);
  if (frame > 0) b.set(13, frame === 2 ? 1 : 3, '#ffe9a8');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Runas flutuando sobre um livro aberto (estudioso lendo/escrevendo planos). */
function runes(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  // livro
  b.rect(3, 12, 10, 2, '#8a5b3c');
  b.rect(4, 10, 4, 2, '#e6dcc0');
  b.rect(8, 10, 4, 2, '#f2ead2');
  b.set(7, 11, '#8a5b3c');
  // páginas com linha de texto
  b.hline(5, 6, 10, '#a89878');
  b.hline(9, 10, 10, '#a89878');
  // glifos flutuando (giram entre os quadros)
  const glyphs: readonly (readonly [number, number])[][] = [
    [[5, 6], [10, 5]],
    [[4, 4], [11, 3], [7, 2]],
    [[6, 1], [12, 6], [3, 3]],
  ];
  for (const [x, y] of glyphs[frame]) {
    b.set(x, y, '#8ef2ff');
    b.set(x + 1, y, 'rgba(142,242,255,0.55)');
    b.set(x, y + 1, 'rgba(142,242,255,0.55)');
  }
  b.set(8, 4, 'rgba(160,230,255,0.35)');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Baú: fechado, abrindo, aberto com brilho e moedas. */
function chest(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  b.shadow(8, 15, 5, 1.3, '#1c2034', 0.22);
  // corpo de madeira escura com cantoneiras douradas (contraste com a tampa clara)
  b.rect(3, 9, 10, 5, '#6d4420');
  b.rect(3, 12, 10, 2, '#583516');
  b.rect(3, 9, 1, 5, '#8a5b2c');
  b.rect(4, 13, 8, 1, '#3d2410');
  b.rect(5, 9, 1, 5, '#c48f4d');
  b.rect(10, 9, 1, 5, '#c48f4d');
  // tampa: fechada (0), entreaberta (1), aberta jogada para trás (2)
  if (frame === 0) {
    b.rect(3, 6, 10, 3, '#a9723a');
    b.rect(3, 6, 10, 1, '#d3a15c');
  } else if (frame === 1) {
    b.rect(3, 4, 10, 2, '#a9723a');
    b.rect(3, 4, 10, 1, '#d3a15c');
    b.rect(4, 6, 8, 1, '#241609'); // fresta escura da luz saindo
  } else {
    b.rect(2, 2, 12, 2, '#a9723a');
    b.rect(2, 2, 12, 1, '#d3a15c');
    b.rect(4, 5, 8, 4, '#1e1206'); // interior na sombra
    b.rect(5, 6, 3, 2, '#ffd45e'); // moedas
    b.rect(9, 7, 2, 1, '#ffe9a8');
    b.set(5, 5, '#fff3c4');
  }
  // fecho dourado na frente
  b.rect(7, 8, 2, 2, '#e8b45a');
  b.set(7, 8, '#fff0c2');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Brilho no escudo do guarda (esperando o usuário). */
function glint(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  b.rect(4, 4, 8, 7, '#6f7f92');
  b.rect(4, 4, 8, 1, '#98a8bb');
  b.rect(5, 11, 6, 2, '#5a6879');
  b.rect(6, 13, 4, 1, '#4b5766');
  b.rect(7, 5, 2, 5, '#c8d6e6');
  b.hline(5, 10, 7, '#c8d6e6');
  if (frame === 0) {
    b.set(10, 3, '#ffffff');
    b.set(9, 3, 'rgba(255,255,255,0.5)');
    b.set(10, 2, 'rgba(255,255,255,0.5)');
  } else {
    b.set(2, 2, '#ffffff');
    b.set(3, 2, 'rgba(255,255,255,0.55)');
    b.set(2, 3, 'rgba(255,255,255,0.55)');
    b.set(13, 10, '#fff3c0');
  }
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Fogueira pequena do descanso (quadros alternam a chama). */
function campfire(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  b.shadow(8, 15, 5.5, 1.4, '#1c2034', 0.2);
  // lenha
  b.rect(3, 12, 10, 2, '#6b4a30');
  b.rect(5, 11, 6, 1, '#7f5a3a');
  b.set(3, 13, '#4f3622');
  b.set(12, 13, '#4f3622');
  // chama: três quadros de altura/curvatura
  const h = [5, 6, 4][frame];
  const sway = [0, 1, -1][frame];
  b.ellipse(8 + sway * 0.5, 12 - h / 2, 2.6, h / 2, '#d9541f');
  b.ellipse(8 + sway, 12 - h / 2 + 1, 1.7, h / 2 - 0.8, '#f59135');
  b.ellipse(8 + sway, 11.4, 1, 1.4, '#ffe9a8');
  b.set(8 + sway, 12 - h, '#ffd45e');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Nuvem do "poof": o monstro derrotado some e volta no ciclo seguinte. */
function poof(frame: number): BufSprite {
  const b = new PixelBuf(16, 16);
  const r = [2.8, 4.6, 6][frame];
  const alpha = [0.85, 0.6, 0.32][frame];
  b.ellipse(8, 10, r, r * 0.75, `rgba(232,226,246,${alpha})`);
  b.ellipse(8, 9, r - 1.4, r * 0.55, `rgba(255,255,255,${alpha + 0.1})`);
  // bolinhas da fumaça: acompanham o raio para o "poof" crescer como nuvem
  for (const s of [-1, 1]) {
    b.set(Math.round(8 + s * (r - 0.5)), Math.round(10 - r * 0.35), `rgba(255,255,255,${alpha * 0.8})`);
    b.set(Math.round(8 + s * (r - 2)), Math.round(10 - r * 0.8), `rgba(240,235,250,${alpha * 0.7})`);
  }
  return { buf: b, ax: 8, ay: 15 };
}

const RENDERERS: Readonly<Record<EncounterArt, (frame: number) => BufSprite>> = {
  slime,
  bat,
  golem,
  slash,
  spark,
  hammer,
  runes,
  chest,
  glint,
  campfire,
  poof,
};

/** Desenha uma peça do encontro no quadro pedido (normalizado pelo ciclo da peça). */
export function renderEncounterArt(name: EncounterArt, frame = 0): BufSprite {
  return RENDERERS[name](encounterFrame(name, frame));
}
