// Biomas da masmorra (skin de fantasia): cada câmara nasce num clima diferente.
//
// Antes todas as câmaras eram iguais (pedra escura + poço de areia). Aqui a semente sorteia um
// BIOMA — tumba de arenito, cripta de ossos, forja vulcânica, caverna de gelo, gruta de musgo,
// caverna de cristal ou cisterna alagada — e o layout usa o piso, o padrão de parede e o cenário
// daquele bioma. O mesmo bioma também veste o resto da masmorra (recepção, taverna, corredor,
// entorno), então o nível inteiro ganha variedade sem perder a identidade.
//
// Nada aqui toca em caminhabilidade: bioma só escolhe MATÉRIA (FloorKind) e MOBÍLIA (FurnitureKind)
// que o layout já sabe posicionar. O contrato da arena (mesmo retângulo, mesma porta, 6 lugares de
// trabalho) continua igual em todos os biomas.
import type { FloorKind, FurnitureKind, WallPattern, WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';

/** Clima da câmara. */
export type DungeonBiomeId = 'sandstone' | 'crypt' | 'forge' | 'ice' | 'grotto' | 'crystal' | 'cistern';

/** Formato do poço da arena (o miolo continua livre em todos). */
export type PitShape = 'square' | 'round' | 'cross' | 'ring';

export interface DungeonBiome {
  id: DungeonBiomeId;
  /** Material do poço de duelo. */
  pit: FloorKind;
  /** Borda em volta do poço. */
  ring: FloorKind;
  /** Piso da câmara (fora do poço). */
  base: FloorKind;
  /** Piso das áreas comuns da masmorra (recepção, taverna, corredor). */
  hall: FloorKind;
  /** Padrão da parede. */
  wall: WallPattern;
  /** Matiz que o tema da sala mistura na pedra (cada bioma puxa a parede para um lado). */
  wallTint: string;
  /** Cenário típico do bioma (substitui a armaria genérica). */
  props: FurnitureKind[];
  /** Itens de parede extras do bioma. */
  wallProps: FurnitureKind[];
}

/** Os biomas. A ordem é fixa: o sorteio por semente escolhe um índice. */
export const DUNGEON_BIOMES: readonly DungeonBiome[] = [
  {
    id: 'sandstone',
    pit: 'sand',
    ring: 'concrete',
    base: 'marble',
    hall: 'marble',
    wall: 'dungeon',
    wallTint: '#b9965e',
    props: ['sarcophagus', 'bone_pile', 'crate'],
    wallProps: ['chain', 'wall_torch'],
  },
  {
    id: 'crypt',
    pit: 'bone',
    ring: 'rock',
    base: 'concrete',
    hall: 'concrete',
    wall: 'dungeon',
    wallTint: '#7d8a7a',
    props: ['sarcophagus', 'bone_pile', 'cage'],
    wallProps: ['web_wall', 'chain'],
  },
  {
    id: 'forge',
    pit: 'ash',
    ring: 'rock',
    base: 'rock',
    hall: 'rock',
    wall: 'forge',
    wallTint: '#a0522d',
    props: ['lava_pool', 'brazier', 'crate'],
    wallProps: ['chain', 'portcullis'],
  },
  {
    id: 'ice',
    pit: 'ice',
    ring: 'rock',
    base: 'rock',
    hall: 'rock',
    wall: 'ice',
    wallTint: '#9fc6dc',
    props: ['ice_spike', 'crystal_shard'],
    wallProps: ['wall_torch'],
  },
  {
    id: 'grotto',
    pit: 'moss',
    ring: 'rock',
    base: 'rock',
    hall: 'rock',
    wall: 'cave',
    wallTint: '#6f8f5a',
    props: ['mushroom_cluster', 'bone_pile', 'barrel'],
    wallProps: ['web_wall', 'wall_torch'],
  },
  {
    id: 'crystal',
    pit: 'water',
    ring: 'rock',
    base: 'rock',
    hall: 'concrete',
    wall: 'cave',
    wallTint: '#8f7fd6',
    props: ['crystal_shard', 'mushroom_cluster', 'crate'],
    wallProps: ['chain'],
  },
  {
    id: 'cistern',
    pit: 'water',
    ring: 'concrete',
    base: 'concrete',
    hall: 'concrete',
    wall: 'dungeon',
    wallTint: '#5f8f96',
    props: ['barrel', 'bone_pile', 'cage'],
    wallProps: ['chain', 'wall_torch'],
  },
];

/** Bioma sorteado pela semente (determinístico; `salt` separa os sorteios de um mesmo nível). */
export function dungeonBiome(seed: number, salt = 0): DungeonBiome {
  const rng = mulberry32((seed ^ 0x9e37 + salt * 0x45d9) >>> 0);
  const i = Math.floor(rng() * DUNGEON_BIOMES.length);
  return DUNGEON_BIOMES[Math.min(DUNGEON_BIOMES.length - 1, i)];
}

/** Formato do poço sorteado pela semente. */
export function pitShape(seed: number, salt = 0): PitShape {
  const rng = mulberry32((seed ^ 0x51f0) + salt * 977);
  const all: PitShape[] = ['square', 'round', 'cross', 'ring'];
  return all[Math.floor(rng() * all.length) % all.length];
}

/**
 * Tiles do poço (coordenadas locais ao retângulo do poço, largura 8 e altura 3).
 * O miolo (4x3 do centro da câmara) está SEMPRE no poço: é ali que o render desenha os duelos.
 */
export function pitTiles(shape: PitShape, w = 8, h = 3): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const edgeRow = (y: number) => y === 0 || y === h - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const corner = (x === 0 || x === w - 1) && edgeRow(y);
      if (shape === 'round' && corner) continue;
      // 'cross': nas linhas de fora só o miolo (o poço fica com braços).
      if (shape === 'cross' && edgeRow(y) && (x < 2 || x > w - 3)) continue;
      // 'ring': nas linhas de fora falta o tile vizinho do canto (poço com as pontas recortadas).
      if (shape === 'ring' && edgeRow(y) && (x === 1 || x === w - 2)) continue;
      out.push([x, y]);
    }
  }
  return out;
}

/** Mistura simples de duas cores hex (0 = a, 1 = b). */
function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const na = parseInt(pa[1], 16);
  const nb = parseInt(pb[1], 16);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = ch((na >> 16) & 255, (nb >> 16) & 255);
  const g = ch((na >> 8) & 255, (nb >> 8) & 255);
  const bl = ch(na & 255, nb & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/**
 * Parede da masmorra no clima do bioma: pedra escura puxada para o matiz do bioma, com o
 * padrão de parede dele (alvenaria, rocha natural, gelo ou tijolo de forja).
 * `dark` 0..1 escurece (parapeito, mureta sul, parede externa).
 */
export function biomeWall(biome: DungeonBiome, dark = 0): WallStyle {
  const base = mixHex('#4c4842', biome.wallTint, 0.26 + dark * 0.06);
  const trim = mixHex('#262420', biome.wallTint, 0.12);
  const k = 1 - dark * 0.22;
  const sc = (hex: string) => mixHex('#000000', hex, k);
  return { base: sc(base), trim: sc(trim), pattern: biome.wall };
}
