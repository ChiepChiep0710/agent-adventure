// Monstros e efeitos dos "encontros" da skin de fantasia: o agente vira herói e a atividade real
// vira uma cena de RPG (o mago lança fogo no slime ao editar, o ferreiro martela o golem ao rodar
// comando, o estudioso fere o espectro com luz ao ler, o ladino atira adagas no morcego ao navegar,
// o cavaleiro segura o monstro ao esperar você e o baú se abre ao terminar). Tudo é puramente
// decorativo: nada aqui volta para o mundo nem para o Habblaud World.
//
// Desenho em PixelBuf (puro, testável em Node), mesma escala dos personagens. A âncora fica no pé do
// sprite (ax = centro, ay = base) para o renderizador colar a cena nos pés de quem a protagoniza.
//
// Os monstros têm 24x24 px (bem maiores que os props de 16 px do escritório) e 4 quadros:
// 0 = parado, 1 = se armando, 2 = atacando (para a esquerda: o herói fica desse lado no desenho
// local e o espelhamento do render cuida do outro lado), 3 = ferido. Todos têm contorno automático.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

/** Monstros que aparecem na cena. */
export type MonsterKind = 'slime' | 'bat' | 'golem' | 'skeleton' | 'goblin' | 'whelp' | 'mimic' | 'wisp';

/** Efeitos da cena (um por estilo de ataque, além do baú, do brilho e do "poof"). */
export type EncounterFx =
  | 'slash'
  | 'spark'
  | 'hammer'
  | 'runes'
  | 'chest'
  | 'glint'
  | 'campfire'
  | 'poof'
  | 'fireball'
  | 'dagger'
  | 'lightbeam'
  | 'smash'
  | 'goldburst'
  | 'victory';

/** Qualquer peça desenhável de um encontro. */
export type EncounterArt = MonsterKind | EncounterFx;

export const MONSTER_KINDS: readonly MonsterKind[] = ['slime', 'bat', 'golem', 'skeleton', 'goblin', 'whelp', 'mimic', 'wisp'];

/** Monstros andam no chão (têm sombra de contato); morcego e espectro voam. */
const FLYING: ReadonlySet<MonsterKind> = new Set<MonsterKind>(['bat', 'wisp']);

/** Quadros de animação por peça (ciclo curto e legível no tamanho pequeno). */
export const ENCOUNTER_FRAMES: Readonly<Record<EncounterArt, number>> = {
  slime: 4,
  bat: 4,
  golem: 4,
  skeleton: 4,
  goblin: 4,
  whelp: 4,
  mimic: 4,
  wisp: 4,
  slash: 3,
  spark: 3,
  hammer: 3,
  runes: 3,
  chest: 3,
  glint: 2,
  campfire: 3,
  poof: 3,
  fireball: 3,
  dagger: 3,
  lightbeam: 3,
  smash: 3,
  goldburst: 3,
  victory: 3,
};

/** Resolve o quadro pedido dentro do ciclo (aceita qualquer inteiro, inclusive negativo). */
export function encounterFrame(name: EncounterArt, frame: number): number {
  const n = ENCOUNTER_FRAMES[name];
  return ((Math.trunc(frame) % n) + n) % n;
}

/** Lado do sprite (24 px de monstro; 16 px de efeito). Serve aos testes e ao posicionamento. */
export function encounterArtSize(name: EncounterArt): number {
  return name in ENCOUNTER_FRAMES && (MONSTER_KINDS as readonly string[]).includes(name) ? MONSTER : FX;
}

/** Um monstro é voador? (a cena usa para escolher a altura da barra de vida). */
export function isFlyingMonster(kind: MonsterKind): boolean {
  return FLYING.has(kind);
}

const MONSTER = 24;
const FX = 16;

function monsterBuf(): PixelBuf {
  return new PixelBuf(MONSTER, MONSTER);
}

/** Sombra de contato no chão (pé do sprite em y = 23). */
function feetShadow(b: PixelBuf, rx = 7): void {
  b.shadow(12, 22, rx, 1.7, '#151a2b', 0.3);
}

// ------------------------------------------------------------------ monstros

/** Slime: bola verde que respira, se arma e dá o bote. Quadros mudam forma e inclinação. */
function slime(frame: number): BufSprite {
  const b = monsterBuf();
  feetShadow(b, 7.4);
  // [raio x, raio y, centro y, deslocamento x]
  const shape: readonly (readonly [number, number, number, number])[] = [
    [7, 5.6, 16.6, 0],
    [6.2, 6.6, 16.2, 1.4], // encolhe e se inclina para trás
    [8.1, 4.7, 17.5, -1.6], // esticado para o herói (à esquerda)
    [8.4, 3.6, 18.3, 1.2], // achatado pelo golpe
  ];
  const [rx, ry, cy, dx] = shape[frame];
  const cx = 12 + dx;
  b.ellipse(cx, cy, rx, ry, '#2f8a52');
  b.ellipse(cx, cy - 0.8, rx - 1.2, ry - 1, '#4fc273');
  b.ellipse(cx, cy + ry * 0.45, rx - 2, 1.2, '#267044'); // barriga na sombra
  b.ellipse(cx - rx * 0.4, cy - ry + 2, 2.2, 1.4, '#9bec9f');
  // bolhas/gosma
  b.set(Math.round(cx + rx * 0.55), Math.round(cy - ry * 0.2), '#7fdc9a');
  b.set(Math.round(cx - rx * 0.62), Math.round(cy + 1), '#7fdc9a');
  const ex = Math.round(cx);
  const ey = Math.round(cy - 1.6);
  if (frame === 3) {
    // olhos em X (ferido) e gotas voando
    for (const s of [-1, 1]) {
      b.set(ex + s * 3 - 1, ey, '#1b2430');
      b.set(ex + s * 3 + 1, ey, '#1b2430');
      b.set(ex + s * 3, ey + 1, '#1b2430');
      b.set(ex + s * 3 - 1, ey + 2, '#1b2430');
      b.set(ex + s * 3 + 1, ey + 2, '#1b2430');
    }
    b.set(2, 12, 'rgba(127,220,154,0.8)');
    b.set(21, 10, 'rgba(127,220,154,0.8)');
  } else {
    for (const s of [-1, 1]) {
      b.rect(ex + s * 3 - 1, ey, 2, 3, '#1b2430');
      b.set(ex + s * 3 - 1, ey, '#eafff0');
    }
    if (frame === 2) {
      // bocarra aberta no bote
      b.ellipse(ex - 2, ey + 4, 3.2, 2.2, '#1b2430');
      b.ellipse(ex - 2, ey + 4.4, 2.2, 1.2, '#c8446b');
    } else {
      b.hline(ex - 2, ex + 2, ey + 4, '#1b2430');
    }
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Morcego: asas de membrana em quatro posições, presas e olhos amarelos. */
function bat(frame: number): BufSprite {
  const b = monsterBuf();
  // [altura do ombro da asa, envergadura, queda da membrana, inclinação do corpo]
  const pose: readonly (readonly [number, number, number, number])[] = [
    [10, 9.4, 3.2, 0],
    [7, 8.8, 4.2, -1], // asas para cima (se armando)
    [8, 8.2, 2.6, -2], // asas à frente, corpo inclinado para o bote
    [12, 6.2, 3.6, 2], // asas dobradas (ferido)
  ];
  const [wy, span, drop, lean] = pose[frame];
  const bx = 12 + lean;
  for (const s of [-1, 1]) {
    const cx = bx + s * (span * 0.52);
    b.ellipse(cx, wy, span * 0.5, drop, '#42345a');
    b.ellipse(cx, wy - 0.6, span * 0.44, drop - 0.8, '#5b4477');
    // borda ondulada (dois dentinhos na ponta da asa)
    b.set(Math.round(cx + s * span * 0.36), Math.round(wy + drop), '#8a6cb0');
    b.set(Math.round(cx + s * span * 0.16), Math.round(wy + drop - 0.4), '#8a6cb0');
  }
  // corpo, cabeça e orelhas
  b.ellipse(bx, 15.4, 3, 4, '#3c2f52');
  b.ellipse(bx, 15, 2.2, 3.2, '#5b4477');
  b.ellipse(bx, 12.2, 2.8, 2.6, '#4a3a63');
  b.vline(bx - 2, 8, 10, '#3c2f52');
  b.vline(bx + 1, 8, 10, '#3c2f52');
  b.set(bx - 2, 8, '#8a6cb0');
  b.set(bx + 1, 8, '#8a6cb0');
  // olhos: amarelos vivos (ferido, riscados)
  if (frame === 3) {
    b.set(bx - 2, 12, '#ffb3b3');
    b.set(bx + 1, 12, '#ffb3b3');
    b.set(bx - 1, 13, '#ffb3b3');
  } else {
    b.set(bx - 2, 12, '#ffd45e');
    b.set(bx + 1, 12, '#ffd45e');
    b.set(bx - 2, 11, '#fff3c4');
    b.set(bx + 1, 11, '#fff3c4');
  }
  // presas e garras
  b.set(bx - 1, 14, '#f4ecff');
  b.set(bx, 14, '#f4ecff');
  if (frame === 2) {
    b.hline(bx - 4, bx + 3, 15, '#1b1226');
    b.line(bx - 4, 11, bx - 7, 9, '#7d61a0'); // garra à frente
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Golem de pedra: tronco largo, braços enormes, veios de energia nos olhos e nas rachaduras. */
function golem(frame: number): BufSprite {
  const b = monsterBuf();
  feetShadow(b, 8.2);
  const lean = [0, 0, -1, 1][frame];
  const x = 6 + lean;
  // pernas e pés
  b.rect(x + 1, 17, 4, 5, '#565b6b');
  b.rect(x + 8, 17, 4, 5, '#565b6b');
  b.rect(x, 21, 5, 2, '#4a4f5e');
  b.rect(x + 8, 21, 5, 2, '#4a4f5e');
  // tronco e cabeça
  b.rect(x, 8, 13, 10, '#6b7080');
  b.rect(x, 8, 13, 2, '#818799');
  b.rect(x + 2, 3, 9, 6, '#757b8c');
  b.rect(x + 2, 3, 9, 1, '#8d93a5');
  // braços: parado, erguido, soco para a esquerda, ferido
  const arms: readonly (readonly [number, number, number, number])[] = [
    [x - 3, 9, 4, 9],
    [x - 3, 5, 4, 11],
    [x - 3, 11, 7, 5],
    [x - 2, 11, 3, 8],
  ];
  const [ax, ay, aw, ah] = arms[frame];
  b.rect(ax, ay, aw, ah, '#5d6273');
  b.rect(ax, ay + ah - 2, aw, 2, '#7b8194'); // punho
  // braço direito (sempre um pouco atrás)
  b.rect(x + 12, 10, 3, 8, '#535868');
  b.rect(x + 12, 16, 3, 2, '#7b8194');
  // rachaduras com veio de energia
  b.line(x + 4, 9, x + 6, 13, '#4a4f5e');
  b.line(x + 9, 10, x + 7, 15, '#4a4f5e');
  b.set(x + 6, 13, '#7ff2d0');
  b.set(x + 7, 15, '#7ff2d0');
  // olhos: acendem no ataque, apagam no ferido
  const eye = frame === 3 ? '#c9a0a0' : frame === 2 ? '#eafff8' : '#7ff2d0';
  b.rect(x + 4, 5, 2, 2, eye);
  b.rect(x + 8, 5, 2, 2, eye);
  if (frame === 2) {
    // faíscas do soco (dentro da folha, junto do punho)
    b.set(2, 12, '#ffe9a8');
    b.set(3, 15, '#ffd45e');
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Esqueleto guerreiro: caveira, costelas, espada enferrujada e olhos vermelhos. */
function skeleton(frame: number): BufSprite {
  const b = monsterBuf();
  feetShadow(b, 6.2);
  const lean = [0, -1, 1, 2][frame];
  const x = 9 + lean;
  // pernas e pés
  b.rect(x - 1, 18, 2, 4, '#d9d2bd');
  b.rect(x + 4, 18, 2, 4, '#d9d2bd');
  b.rect(x - 3, 21, 4, 1, '#bdb5a0');
  b.rect(x + 3, 21, 4, 1, '#bdb5a0');
  // bacia e coluna
  b.rect(x, 16, 5, 2, '#cfc7b2');
  b.vline(x + 2, 10, 16, '#cfc7b2');
  // costelas (três pares, alternando o comprimento)
  for (let i = 0; i < 3; i++) {
    b.hline(x - 2, x + 6, 11 + i * 2, i === 1 ? '#e6dfc9' : '#d9d2bd');
    b.set(x - 2, 12 + i * 2, '#bdb5a0');
    b.set(x + 6, 12 + i * 2, '#bdb5a0');
  }
  // caveira
  b.rect(x, 4, 6, 5, '#efe8d2');
  b.rect(x + 1, 3, 4, 1, '#f6f0dc');
  b.rect(x + 1, 8, 4, 1, '#d9d2bd'); // maxilar
  b.set(x + 1, 6, '#b4232f');
  b.set(x + 4, 6, '#b4232f');
  b.set(x + 1, 6, '#ff5a5a');
  b.set(x + 4, 6, '#ff5a5a');
  b.set(x + 2, 9, '#bdb5a0');
  b.set(x + 3, 9, '#bdb5a0');
  // espada: [ponta x, ponta y] por quadro (erguida, alta, descendo, caída)
  const tip: readonly (readonly [number, number])[] = [
    [1, 12],
    [1, 9],
    [5, 16],
    [1, 18],
  ];
  const [tx, ty] = tip[frame];
  b.line(x - 1, 15, tx, ty, '#b9c2cf', 2);
  b.set(tx, ty, '#eef4ff');
  b.rect(x - 3, 15, 5, 1, '#8a5b2c'); // guarda
  b.rect(x - 1, 16, 2, 2, '#6d4420'); // cabo
  if (frame === 2) {
    b.set(tx - 2, ty + 2, '#ffe9a8');
    b.set(tx + 2, ty + 3, '#ffd45e');
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Goblin: orelhas pontudas, túnica de couro e adaga. Baixinho, ágil, sempre inclinado. */
function goblin(frame: number): BufSprite {
  const b = monsterBuf();
  feetShadow(b, 6);
  const lean = [0, 1, -2, 2][frame];
  const x = 10 + lean;
  // pernas
  b.rect(x - 1, 18, 2, 4, '#3f6b2f');
  b.rect(x + 4, 18, 2, 4, '#3f6b2f');
  b.rect(x - 3, 21, 4, 1, '#2f5223');
  b.rect(x + 3, 21, 4, 1, '#2f5223');
  // túnica e cinto
  b.rect(x - 1, 11, 7, 7, '#7a4a2a');
  b.rect(x - 1, 11, 7, 1, '#94603a');
  b.hline(x - 1, x + 5, 15, '#4a2a16');
  b.set(x + 2, 15, '#d9a44c');
  // braços
  b.rect(x - 3, 12, 2, 5, '#4f8f3a');
  b.rect(x + 6, 12, 2, 5, '#4f8f3a');
  // cabeça, orelhas pontudas e olhos
  b.ellipse(x + 2, 7.6, 4, 4, '#4f8f3a');
  b.line(x - 2, 7, x - 6, 4, '#4f8f3a');
  b.line(x - 6, 4, x - 4, 8, '#4f8f3a');
  b.line(x + 6, 7, x + 9, 4, '#4f8f3a');
  b.line(x + 9, 4, x + 8, 8, '#4f8f3a');
  b.set(x - 5, 5, '#79bf5c');
  b.set(x + 8, 5, '#79bf5c');
  b.rect(x, 6, 2, 2, '#ffd45e');
  b.rect(x + 3, 6, 2, 2, '#ffd45e');
  b.set(x, 6, '#fff3c4');
  b.set(x + 3, 6, '#fff3c4');
  b.hline(x, x + 4, 10, '#2f5223'); // boca
  b.set(x, 10, '#f4ecff');
  b.set(x + 4, 10, '#f4ecff');
  // adaga: [ponta x, ponta y] (guardada, erguida, cravada à frente, caída)
  const tip: readonly (readonly [number, number])[] = [
    [x - 4, 13],
    [x - 6, 6],
    [x - 7, 12],
    [x - 4, 17],
  ];
  const [tx, ty] = tip[frame];
  b.line(x - 3, 13, tx, ty, '#cfd7e4', 2);
  b.set(tx, ty, '#ffffff');
  b.rect(x - 5, 13, 4, 1, '#6d4420');
  if (frame === 2) {
    b.set(tx + 1, ty + 2, '#ffe9a8');
    b.set(tx + 3, ty - 2, '#ffd45e');
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Dragonete: corpo baixo, asa de membrana, cauda e baforada de brasas no bote. */
function whelp(frame: number): BufSprite {
  const b = monsterBuf();
  feetShadow(b, 8.4);
  const lean = [0, 1, -1, 2][frame];
  // cauda (para a direita/detrás)
  b.line(17 + lean, 18, 20, 14 + lean, '#8a3c2e', 2);
  b.set(20, 13 + lean, '#d9a05a');
  // corpo
  b.ellipse(14 + lean, 17, 6.4, 4.6, '#8a3c2e');
  b.ellipse(14 + lean, 18.4, 4.6, 2.4, '#d9a05a'); // barriga
  // pernas
  b.rect(10 + lean, 20, 3, 2, '#6f2f24');
  b.rect(16 + lean, 20, 3, 2, '#6f2f24');
  // asa: [centro x, centro y, raio x, raio y] por quadro
  const wings: readonly (readonly [number, number, number, number])[] = [
    [17, 10, 3.8, 3.2],
    [17, 6, 4, 4],
    [16, 9, 4.8, 3],
    [18, 12, 2, 2.4],
  ];
  const [wx, wy, wrx, wry] = wings[frame];
  b.ellipse(wx + lean, wy, wrx, wry, '#b4553c');
  b.ellipse(wx + lean, wy - 0.6, wrx - 1.2, wry - 0.8, '#cf6b4a');
  b.line(wx + lean + wrx - 1, wy - wry + 1, wx + lean + wrx - 1, wy + wry - 1, '#8a3c2e');
  // pescoço e cabeça à esquerda (o herói fica desse lado)
  b.ellipse(8 + lean, 14, 3.4, 2.8, '#8a3c2e');
  b.ellipse(6 + lean, 12.6, 4, 3.2, '#9c4634');
  // focinho e chifre
  b.rect(2 + lean, 13, 4, 2, '#9c4634');
  b.set(2 + lean, 14, '#d9a05a');
  b.line(8 + lean, 9, 6 + lean, 6, '#e8d9b0');
  b.line(5 + lean, 10, 3 + lean, 8, '#e8d9b0');
  // olho
  b.rect(6 + lean, 11, 2, 2, frame === 3 ? '#ffb3b3' : '#ffd45e');
  b.set(6 + lean, 11, '#fff6d2');
  // escamas
  b.set(13 + lean, 13, '#6f2f24');
  b.set(16 + lean, 15, '#6f2f24');
  if (frame === 2) {
    // baforada de brasas saindo do focinho
    b.set(2, 13, '#ffe9a8');
    b.set(2, 12, '#ffb347');
    b.set(3, 15, '#ff8a2e');
    b.set(2, 15, 'rgba(255,180,90,0.8)');
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Mímico: baú vivo com dentes, língua e olhos na tampa. Finge de tesouro. */
function mimic(frame: number): BufSprite {
  const b = monsterBuf();
  feetShadow(b, 8.4);
  const open = frame === 2;
  // pés/raízes
  b.rect(4, 21, 4, 2, '#4a2a10');
  b.rect(15, 21, 4, 2, '#4a2a10');
  b.set(3, 21, '#6d4420');
  b.set(20, 21, '#6d4420');
  // corpo de madeira e cantoneiras
  b.rect(3, 12, 18, 10, '#7a4a1e');
  b.rect(3, 19, 18, 3, '#5c3514');
  b.rect(3, 12, 1, 10, '#9a6030');
  b.rect(20, 12, 1, 10, '#9a6030');
  b.rect(6, 12, 1, 10, '#d9a44c');
  b.rect(17, 12, 1, 10, '#d9a44c');
  // interior (tampa entreaberta/aberta)
  if (open) {
    b.rect(5, 9, 14, 5, '#241206');
    b.rect(5, 12, 14, 2, '#c8446b'); // língua
    b.rect(2, 10, 5, 3, '#d9556b'); // língua para fora, à esquerda
    b.set(1, 11, '#f08aa0');
  }
  // tampa: [y do topo, altura, inclinação]
  const lid: readonly (readonly [number, number, number])[] = [
    [8, 4, 0],
    [6, 4, 0],
    [2, 3, 0],
    [9, 3, 0],
  ];
  const [ly, lh] = lid[frame];
  b.rect(3, ly, 18, lh, '#a06a34');
  b.rect(3, ly, 18, 1, '#c99257');
  b.rect(6, ly, 1, lh, '#d9a44c');
  b.rect(17, ly, 1, lh, '#d9a44c');
  // dentes na boca (na borda de baixo da tampa)
  if (open || frame === 1) {
    for (let i = 5; i < 19; i += 3) b.rect(i, ly + lh, 1, 1, '#f4ecd0');
    for (let i = 6; i < 17; i += 3) b.set(i, 12, '#f4ecd0');
  }
  // olhos na tampa
  const eyeY = Math.min(ly + 1, 6);
  if (frame === 3) {
    b.hline(7, 9, eyeY, '#2a1408');
    b.hline(14, 16, eyeY, '#2a1408');
  } else {
    b.rect(7, eyeY, 3, 2, '#ffd45e');
    b.rect(14, eyeY, 3, 2, '#ffd45e');
    b.set(7, eyeY, '#fff3c4');
    b.set(14, eyeY, '#fff3c4');
    b.set(9, eyeY + 1, '#7a4a1e');
    b.set(16, eyeY + 1, '#7a4a1e');
  }
  // fecho e moedas coladas (isca)
  b.rect(11, 14, 2, 3, '#e8b45a');
  b.set(11, 14, '#fff0c2');
  b.set(4, 17, '#ffd45e');
  b.set(19, 16, '#ffe9a8');
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

/** Espectro (fogo-fátuo): chama fria flutuante, olhos vazios e rastro de fumaça. */
function wisp(frame: number): BufSprite {
  const b = monsterBuf();
  const bob = [0, -1, 1, 2][frame];
  const cy = 13 + bob;
  // rastro de fumaça fria
  b.ellipse(12, cy + 6, 3.6, 2.4, 'rgba(120,200,255,0.22)');
  for (const s of [-1, 1]) {
    b.set(12 + s * 4, cy + 8 + bob, 'rgba(160,230,255,0.35)');
    b.set(12 + s * 2, cy + 10 + bob, 'rgba(160,230,255,0.25)');
  }
  // chama externa e núcleo
  b.ellipse(12, cy, 5.7, 6.6, 'rgba(120,200,255,0.55)');
  b.ellipse(12, cy, 3.6, 5.2, '#8fdcff');
  b.ellipse(12, cy + 0.6, 2.3, 3.6, '#e6faff');
  // pontas da chama mudam com o quadro
  const tips: readonly (readonly [number, number])[] = [
    [12, cy - 8],
    [10, cy - 9],
    [14, cy - 8],
    [9, cy - 6],
  ];
  const [tx, ty] = tips[frame];
  b.line(12, cy - 5, tx, ty, '#bfe9ff');
  b.set(tx, ty, '#ffffff');
  // olhos vazios (dois buracos escuros) e boca
  const eye = frame === 3 ? '#6b7f9a' : '#1b2a3a';
  b.rect(10, cy - 1, 1, 2, eye);
  b.rect(14, cy - 1, 1, 2, eye);
  b.hline(11, 13, cy + 3, eye);
  if (frame === 2) {
    // garras de névoa avançando para a esquerda
    b.set(6, cy, 'rgba(200,240,255,0.9)');
    b.set(5, cy + 2, 'rgba(200,240,255,0.7)');
    b.set(7, cy - 2, 'rgba(200,240,255,0.7)');
  }
  b.outline();
  return { buf: b, ax: 12, ay: 23 };
}

// ------------------------------------------------------------------ efeitos

/** Arco de espada (do alto à direita para baixo à esquerda), 3 quadros de varredura. */
function slash(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  const sweep = (
    [
      [[12, 3], [10, 6], [7, 8]],
      [[10, 4], [7, 7], [3, 9]],
      [[7, 6], [4, 9], [1, 13]],
    ] as const
  )[frame];
  for (const [x, y] of sweep) b.rect(x, y, 2, 2, '#eaf6ff');
  for (const [x, y] of sweep) b.set(x + 1, y - 1, 'rgba(180,235,255,0.65)');
  b.set(sweep[0][0] + 1, sweep[0][1] + 1, '#ffffff');
  if (frame === 2) for (const [x, y] of [[1, 11], [3, 14], [6, 12]]) b.set(x, y, '#ffd45e');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Projétil mágico: orbe que cresce e estoura. */
function spark(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  const r = [1.4, 2.2, 2.8][frame];
  const cx = [2, 6, 9][frame];
  const cy = [11, 9, 7][frame];
  for (let i = 1; i <= 4; i++) b.set(cx - i * 2, cy + i, `rgba(150,120,255,${0.5 - i * 0.1})`);
  b.ellipse(cx, cy, r, r, '#8a63ff');
  b.ellipse(cx, cy, r - 0.9, r - 0.9, '#e8d7ff');
  b.set(cx, cy, '#ffffff');
  if (frame === 2) {
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
  const b = new PixelBuf(FX, FX);
  b.rect(3, 12, 7, 2, '#4b5263');
  b.rect(4, 10, 6, 2, '#6a7182');
  b.rect(2, 9, 3, 2, '#6a7182');
  b.rect(5, 14, 4, 1, '#3d4353');
  const specks = (
    [
      [[10, 8, '#ffe9a8'], [12, 6, '#ffa53d']],
      [[11, 5, '#fff2c4'], [13, 4, '#ffb347'], [9, 4, '#ffd45e']],
      [[12, 3, '#fff2c4'], [13, 7, '#ff9a2e'], [8, 2, '#ffd45e'], [10, 2, 'rgba(255,200,110,0.7)']],
    ] as const
  )[frame];
  for (const [x, y, c] of specks) b.set(x, y, c);
  if (frame > 0) b.set(13, frame === 2 ? 2 : 3, '#ffe9a8');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Runas flutuando sobre um livro aberto (estudioso lendo/escrevendo planos). */
function runes(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  b.rect(3, 12, 10, 2, '#8a5b3c');
  b.rect(4, 10, 4, 2, '#e6dcc0');
  b.rect(8, 10, 4, 2, '#f2ead2');
  b.set(7, 11, '#8a5b3c');
  b.hline(5, 6, 10, '#a89878');
  b.hline(9, 10, 10, '#a89878');
  const glyphs = (
    [
      [[5, 6], [10, 5]],
      [[4, 4], [11, 3], [7, 2]],
      [[6, 2], [12, 6], [3, 3]],
    ] as const
  )[frame];
  for (const [x, y] of glyphs) {
    b.set(x, y, '#8ef2ff');
    b.set(x + 1, y, 'rgba(142,242,255,0.55)');
    b.set(x, y + 1, 'rgba(142,242,255,0.55)');
  }
  b.set(8, 4, 'rgba(160,230,255,0.35)');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Baú: fechado, abrindo, aberto com ouro. Anchora nos pés, como os monstros. */
function chest(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  b.shadow(8, 15, 5, 1.3, '#1c2034', 0.22);
  b.rect(3, 9, 10, 5, '#6d4420');
  b.rect(3, 12, 10, 2, '#583516');
  b.rect(3, 9, 1, 5, '#8a5b2c');
  b.rect(4, 13, 8, 1, '#3d2410');
  b.rect(5, 9, 1, 5, '#c48f4d');
  b.rect(10, 9, 1, 5, '#c48f4d');
  if (frame === 0) {
    b.rect(3, 6, 10, 3, '#a9723a');
    b.rect(3, 6, 10, 1, '#d3a15c');
  } else if (frame === 1) {
    b.rect(3, 4, 10, 2, '#a9723a');
    b.rect(3, 4, 10, 1, '#d3a15c');
    b.rect(4, 6, 8, 1, '#241609');
  } else {
    b.rect(2, 2, 12, 2, '#a9723a');
    b.rect(2, 2, 12, 1, '#d3a15c');
    b.rect(4, 5, 8, 4, '#1e1206');
    b.rect(5, 6, 3, 2, '#ffd45e');
    b.rect(9, 7, 2, 1, '#ffe9a8');
    b.set(5, 5, '#fff3c4');
  }
  b.rect(7, 8, 2, 2, '#e8b45a');
  b.set(7, 8, '#fff0c2');
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Brilho no escudo do guarda (esperando o usuário). */
function glint(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
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

/** Fogueira/braseiro do descanso (quadros alternam a chama). */
function campfire(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  b.shadow(8, 15, 5.5, 1.4, '#1c2034', 0.2);
  b.rect(3, 12, 10, 2, '#6b4a30');
  b.rect(5, 11, 6, 1, '#7f5a3a');
  b.set(3, 13, '#4f3622');
  b.set(12, 13, '#4f3622');
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
  const b = new PixelBuf(FX, FX);
  const r = [2.8, 4.6, 6][frame];
  const alpha = [0.85, 0.6, 0.32][frame];
  b.ellipse(8, 10, r, r * 0.75, `rgba(232,226,246,${alpha})`);
  b.ellipse(8, 9, r - 1.4, r * 0.55, `rgba(255,255,255,${alpha + 0.1})`);
  for (const s of [-1, 1]) {
    b.set(Math.round(8 + s * (r - 0.5)), Math.round(10 - r * 0.35), `rgba(255,255,255,${alpha * 0.8})`);
    b.set(Math.round(8 + s * (r - 2)), Math.round(10 - r * 0.8), `rgba(240,235,250,${alpha * 0.7})`);
  }
  return { buf: b, ax: 8, ay: 15 };
}

/** Bola de fogo do mago: núcleo branco, chama laranja e rastro. */
function fireball(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  const r = [2.2, 2.9, 3.6][frame];
  const cx = [11, 9, 7][frame];
  const cy = 8;
  // rastro (para a esquerda: no desenho local o projétil vem do herói)
  for (let i = 1; i <= 4; i++) {
    if (cx + 3 + i * 2 <= 13) b.set(cx + 3 + i * 2, cy + (i % 2), `rgba(255,${150 - i * 18},60,${0.55 - i * 0.1})`);
    if (cx + 4 + i * 2 <= 13) b.set(cx + 4 + i * 2, cy - (i % 2), `rgba(255,110,40,${0.4 - i * 0.08})`);
  }
  b.ellipse(cx, cy, r, r, '#f2681f');
  b.ellipse(cx, cy, r - 0.9, r - 0.9, '#ffb347');
  b.ellipse(cx + 0.3, cy - 0.3, r - 1.8, r - 1.8, '#fff3c4');
  b.set(cx + 1, cy - 1, '#ffffff');
  // faíscas soltas
  b.set(cx - 1, cy - r - 1, '#ffd45e');
  b.set(cx + 2, cy + r + 1, 'rgba(255,170,80,0.8)');
  b.outline();
  return { buf: b, ax: 8, ay: 8 };
}

/** Adaga do ladino girando no ar (3 posições da lâmina). */
function dagger(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  // [deltas da ponta em relação ao punho] — gira em torno do centro
  const spin = (
    [
      [-6, -5],
      [1, -7],
      [6, -3],
    ] as const
  )[frame];
  const hx = 7;
  const hy = 10;
  b.line(hx, hy, hx + spin[0], hy + spin[1], '#dbe4f2', 1);
  b.set(hx + spin[0], hy + spin[1], '#ffffff');
  b.rect(hx - 1, hy - 1, 2, 2, '#9aa7bb'); // guarda
  b.line(hx, hy + 1, hx + 2, hy + 2, '#6d4420'); // cabo
  b.set(hx + spin[0] - 1, hy + spin[1] + 1, 'rgba(190,220,255,0.6)');
  b.outline();
  return { buf: b, ax: 8, ay: 8 };
}

/** Feixe de luz/runa do estudioso: coluna de glifos que se abre no alvo. */
function lightbeam(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  const cx = [2, 6, 9][frame];
  // coluna de luz com halo
  b.vline(cx, 2, 13, 'rgba(160,235,255,0.5)');
  b.vline(cx + 1, 3, 12, 'rgba(220,250,255,0.75)');
  b.vline(cx - 1, 4, 11, 'rgba(140,220,255,0.35)');
  // glifos subindo
  b.set(cx - 2, 6, '#8ef2ff');
  b.set(cx + 2, 8, '#8ef2ff');
  b.set(cx - 1, 10, '#e6faff');
  b.set(cx + 1, 5, '#e6faff');
  if (frame === 2) {
    // estrela de impacto
    b.hline(cx - 4, cx + 4, 8, '#c9f4ff');
    b.vline(cx, 4, 12, '#ffffff');
    b.set(cx - 3, 5, '#ffffff');
    b.set(cx + 3, 11, '#ffffff');
  }
  b.outline();
  return { buf: b, ax: 8, ay: 8 };
}

/** Martelo do ferreiro baixando: cabo, cabeça de ferro e estilhaços no impacto. */
function smash(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  // [cabeça x, cabeça y, cabo x, cabo y]
  const hit = (
    [
      [8, 3, 6, 8],
      [7, 6, 9, 10],
      [3, 10, 9, 13],
    ] as const
  )[frame];
  const [hx, hy, gx, gy] = hit;
  b.rect(hx, hy, 5, 3, '#8b93a6');
  b.rect(hx, hy, 5, 1, '#c3cad8');
  b.rect(hx + 1, hy + 2, 3, 1, '#6a7182');
  b.line(hx + 4, hy + 1, gx, gy, '#7a4a2a', 2);
  b.set(gx, gy, '#94603a');
  if (frame > 0) {
    // estilhaços/faíscas no ponto de impacto (canto inferior esquerdo)
    b.set(hx - 2, hy + 4, '#ffe9a8');
    b.set(hx - 4, hy + 2, '#ffd45e');
    if (frame === 2) {
      b.hline(hx - 5, hx + 1, hy + 5, '#fff3c4');
      b.set(hx - 1, hy + 7, '#ffb347');
      b.set(hx + 3, hy + 6, 'rgba(255,200,110,0.8)');
    }
  }
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Explosão de moedas do baú: três quadros de moedas voando para fora. */
function goldburst(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  const spread = [2, 3, 4][frame];
  const rise = [3, 4, 5][frame];
  const coins: readonly (readonly [number, number, number])[] = [
    [8, 10, 0],
    [8 - spread, 10 - rise, 1],
    [8 + spread, 10 - rise + 1, 0],
    [8 - spread * 0.5, 10 - rise - 2, 1],
    [8 + spread * 0.5, 10 - rise - 1, 0],
  ];
  for (const [cx, cy, edge] of coins) {
    if (edge) {
      b.rect(cx, cy - 1, 1, 3, '#ffcf3a');
      b.set(cx, cy - 1, '#fff6c2');
    } else {
      b.rect(cx - 1, cy - 1, 3, 3, '#c98a12');
      b.rect(cx - 1, cy - 1, 2, 2, '#ffcf3a');
      b.set(cx - 1, cy - 1, '#fff6c2');
    }
  }
  if (frame === 2) {
    b.set(8, 2, '#ffffff');
    b.set(2, 5, '#ffe9a8');
    b.set(13, 4, '#ffe9a8');
  }
  b.outline();
  return { buf: b, ax: 8, ay: 15 };
}

/** Brilho de vitória: estrela de quatro pontas que cresce (sem texto). */
function victory(frame: number): BufSprite {
  const b = new PixelBuf(FX, FX);
  const r = [2, 3, 5][frame];
  const cy = 8;
  b.hline(8 - r, 8 + r, cy, '#fff3c4');
  b.vline(8, cy - r, cy + r, '#fff3c4');
  b.set(8, cy, '#ffffff');
  for (const s of [-1, 1]) {
    b.set(8 + s * Math.max(1, r - 1), cy + s, 'rgba(255,240,180,0.8)');
    b.set(8 + s, cy + s * Math.max(1, r - 1), 'rgba(255,240,180,0.8)');
  }
  if (frame === 2) {
    b.set(2, 2, '#ffffff');
    b.set(13, 3, '#ffe9a8');
    b.set(3, 13, '#ffe9a8');
    b.set(12, 12, '#ffffff');
  }
  b.outline();
  return { buf: b, ax: 8, ay: 8 };
}

const RENDERERS: Readonly<Record<EncounterArt, (frame: number) => BufSprite>> = {
  slime,
  bat,
  golem,
  skeleton,
  goblin,
  whelp,
  mimic,
  wisp,
  slash,
  spark,
  hammer,
  runes,
  chest,
  glint,
  campfire,
  poof,
  fireball,
  dagger,
  lightbeam,
  smash,
  goldburst,
  victory,
};

/** Desenha uma peça do encontro no quadro pedido (normalizado pelo ciclo da peça). */
export function renderEncounterArt(name: EncounterArt, frame = 0): BufSprite {
  return RENDERERS[name](encounterFrame(name, frame));
}
