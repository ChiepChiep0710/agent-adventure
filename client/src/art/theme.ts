// Temas de sala (puros): paletas claras e bem distintas. Sementes consecutivas (slots vizinhos)
// recebem temas diferentes; a ordem da lista alterna famílias de cor de propósito.
//
// Com a skin de fantasia (`?skin=fantasy`), a mesma semente escolhe uma zona de RPG clássico:
// pedra de castelo, floresta com musgo, templo no deserto, torre do mago, salão real, taverna,
// masmorra, floresta élfica, biblioteca arcana e fortaleza do gelo.
import type { RoomTheme } from './api';
import { isFantasy } from './skin';

const THEMES: readonly RoomTheme[] = [
  { carpet: '#c9d1dc', carpet2: '#bdc6d3', wall: { base: '#eef1f4', trim: '#9fb0c4', pattern: 'plain' }, accent: '#3f7fd8', deskVariant: 'white', chairVariant: 'blue' },
  { carpet: '#dbcfba', carpet2: '#d0c2ab', wall: { base: '#f6f0e5', trim: '#b99f7a', pattern: 'stripes' }, accent: '#ec8a3c', deskVariant: 'wood', chairVariant: 'black' },
  { carpet: '#c4cfbb', carpet2: '#b8c5af', wall: { base: '#f1f3ea', trim: '#93a487', pattern: 'wood_panel' }, accent: '#4cae6a', deskVariant: 'wood', chairVariant: 'green' },
  { carpet: '#cdc8de', carpet2: '#c2bbd5', wall: { base: '#f3f1f8', trim: '#a59cc4', pattern: 'plain' }, accent: '#8d66cf', deskVariant: 'white', chairVariant: 'gray' },
  { carpet: '#e4cdbe', carpet2: '#dbc1b0', wall: { base: '#f8f1eb', trim: '#c99a83', pattern: 'plain' }, accent: '#e2604f', deskVariant: 'wood', chairVariant: 'red' },
  { carpet: '#bfd9d2', carpet2: '#b2cfc7', wall: { base: '#eef6f4', trim: '#7fb3a6', pattern: 'stripes' }, accent: '#36b0b0', deskVariant: 'white', chairVariant: 'green' },
  { carpet: '#aab1bd', carpet2: '#9fa7b4', wall: { base: '#e8eaee', trim: '#6d7583', pattern: 'brick' }, accent: '#f2c14e', deskVariant: 'dark', chairVariant: 'black' },
  { carpet: '#e0cad2', carpet2: '#d6bdc6', wall: { base: '#f9f2f4', trim: '#c08ea0', pattern: 'stripes' }, accent: '#e47aa8', deskVariant: 'white', chairVariant: 'black' },
  { carpet: '#c0d2e7', carpet2: '#b3c7e0', wall: { base: '#eef4fa', trim: '#8aa6c8', pattern: 'wood_panel' }, accent: '#5b8fe0', deskVariant: 'wood', chairVariant: 'blue' },
  { carpet: '#d1c5b8', carpet2: '#c5b8aa', wall: { base: '#f4efe8', trim: '#8a6a52', pattern: 'wood_panel' }, accent: '#c9713f', deskVariant: 'dark', chairVariant: 'gray' },
];

/** Zonas de fantasia: todos os tons ficam abaixo de ~0,75 de luminância para a pedra não ser
 *  "clareada" pelo remapeamento de paredes claras (`fantasyStoneBase`). */
const FANTASY_THEMES: readonly RoomTheme[] = [
  // 1. Fortaleza de pedra cinza (castelo): lajes frias, estandartes dourados.
  { carpet: '#6c7076', carpet2: '#5f6369', wall: { base: '#8a8b84', trim: '#5c5b55', pattern: 'plain' }, accent: '#c8b06a', deskVariant: 'wood', chairVariant: 'gray' },
  // 2. Pedra coberta de musgo (floresta): pedra esverdeada, taquara de madeira escura.
  { carpet: '#67705a', carpet2: '#5c6552', wall: { base: '#7c8371', trim: '#4d5344', pattern: 'plain' }, accent: '#8fbf6a', deskVariant: 'dark', chairVariant: 'green' },
  // 3. Templo de arenito no deserto: arenito em tijolos largos, ouro velho.
  { carpet: '#ac956c', carpet2: '#a08a63', wall: { base: '#b89c70', trim: '#7f6340', pattern: 'brick' }, accent: '#e0b45a', deskVariant: 'wood', chairVariant: 'gray' },
  // 4. Torre do mago: pedra azul profunda, runas claras.
  { carpet: '#4b5a86', carpet2: '#41507a', wall: { base: '#4a5578', trim: '#2f3550', pattern: 'tiles' }, accent: '#8fb6ff', deskVariant: 'dark', chairVariant: 'blue' },
  // 5. Salão real com estandartes vermelhos: pedra nobre, faixa carmesim.
  { carpet: '#7a2f33', carpet2: '#6b272b', wall: { base: '#8c7f74', trim: '#8c3b36', pattern: 'brick' }, accent: '#d9453f', deskVariant: 'wood', chairVariant: 'red' },
  // 6. Taverna: reboco e vigas (wood_panel => enxaimel), chão de tábuas velhas.
  { carpet: '#8a6a48', carpet2: '#7d5f40', wall: { base: '#b8ab8c', trim: '#6b4a32', pattern: 'wood_panel' }, accent: '#d98b3a', deskVariant: 'wood', chairVariant: 'black' },
  // 7. Masmorra: pedra escura e úmida, tochas avermelhadas.
  { carpet: '#43464a', carpet2: '#3b3e42', wall: { base: '#5d5f60', trim: '#3a3c3d', pattern: 'plain' }, accent: '#b04a3a', deskVariant: 'dark', chairVariant: 'black' },
  // 8. Bosque élfico: pedra esverdeada com veios de água, prata e turquesa.
  { carpet: '#3d6b64', carpet2: '#35605a', wall: { base: '#6f9a94', trim: '#3f5f5a', pattern: 'tiles' }, accent: '#7fe0c8', deskVariant: 'dark', chairVariant: 'green' },
  // 9. Biblioteca arcana: pedra arroxeada, tomos e velas.
  { carpet: '#584a70', carpet2: '#4f4265', wall: { base: '#6b5f80', trim: '#453a58', pattern: 'marble' }, accent: '#b98ff0', deskVariant: 'dark', chairVariant: 'gray' },
  // 10. Fortaleza do gelo: pedra gélida, neve nas frestas.
  { carpet: '#7f93a8', carpet2: '#73879b', wall: { base: '#93a3b3', trim: '#5b6b7a', pattern: 'plain' }, accent: '#a8e0f5', deskVariant: 'wood', chairVariant: 'blue' },
];

export const THEME_COUNT = THEMES.length;
export const FANTASY_THEME_COUNT = FANTASY_THEMES.length;

function pick(list: readonly RoomTheme[], seed: number): RoomTheme {
  const t = list[((Math.floor(seed) % list.length) + list.length) % list.length];
  return { ...t, wall: { ...t.wall } };
}

export function roomTheme(seed: number): RoomTheme {
  return pick(isFantasy() ? FANTASY_THEMES : THEMES, seed);
}

/** Tema de fantasia da semente (para a prévia de arte e para os testes). */
export function fantasyRoomTheme(seed: number): RoomTheme {
  return pick(FANTASY_THEMES, seed);
}
