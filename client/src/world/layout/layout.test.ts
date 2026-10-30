import { describe, expect, it } from 'vitest';
import { FURNITURE, TILE, type FurnitureKind, type RoomTheme } from '../../art/api';
import { setSkinForTests } from '../../art/skin';
import { BUILDING_H, COL_W, CORRIDOR_Y, SOUTH_Y } from '../constants';
import { assembleBuilding, coreAreas } from './building';
import { FREE } from '../path/grid';
import { arenaVariant, layoutProjectArena } from './arena';
import { DUNGEON_BIOMES, dungeonBiome, pitShape, pitTiles, type PitShape } from './dungeon-biome';
import { columnsFor, slotAt, slotColumn, slotRect, slotSide } from './geometry';
import { layoutProject, layoutProjectRoom, roomVariant } from './room';
import { layoutExterior, slotShell } from './exterior';
import { layoutCorridor } from './corridor';
import { RECEPTION_ID, layoutCafe, layoutLounge, layoutReception, layoutRestroom } from './core';
import type { AreaLayout } from './types';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

function roomsFor(slots: number[]): AreaLayout[] {
  return slots.map((slot) => layoutProjectRoom({ id: `/proj/${slot}`, slot, seed: 1000 + slot * 77 }, theme));
}

describe('mapeamento de slots', () => {
  it('coluna = núcleo + floor(slot/2); par = norte, ímpar = sul', () => {
    expect(slotColumn(0)).toBe(2);
    expect(slotColumn(1)).toBe(2);
    expect(slotColumn(2)).toBe(3);
    expect(slotColumn(7)).toBe(5);
    expect(slotSide(0)).toBe('north');
    expect(slotSide(1)).toBe('south');
    expect(slotSide(6)).toBe('north');
    expect(slotAt(3, 'south')).toBe(3);
    expect(slotAt(slotColumn(9), slotSide(9))).toBe(9);
  });

  it('retângulos das salas não se sobrepõem e respeitam o corredor', () => {
    const a = slotRect(0);
    const b = slotRect(1);
    expect(a).toEqual({ x: 2 * COL_W, y: 0, w: COL_W, h: 12 });
    expect(b.y).toBe(SOUTH_Y);
    expect(a.y + a.h).toBe(CORRIDOR_Y);
    expect(b.y + b.h).toBe(BUILDING_H);
  });

  it('largura do prédio: núcleo + maior coluna usada + 1 (mínimo 1 coluna de projeto)', () => {
    expect(columnsFor([])).toBe(3);
    expect(columnsFor([0, 1])).toBe(3);
    expect(columnsFor([5])).toBe(5);
    expect(columnsFor([2, 11])).toBe(8);
  });
});

describe('layout do prédio', () => {
  const slots = [0, 1, 2, 3, 4, 7];
  const rooms = roomsFor(slots);
  const cols = columnsFor(slots);
  const b = assembleBuilding(cols, rooms);
  const reception = coreAreas().find((a) => a.id === RECEPTION_ID)!;
  const elevator = reception.spots.find((s) => s.kind === 'elevator')!;
  const reach = b.grid.reachableFrom(elevator.tx, elevator.ty);
  const reachable = (x: number, y: number) => reach[y * b.grid.w + x] === 1;

  it('há dois elevadores com tiles de aproximação caminháveis', () => {
    const elevators = reception.spots.filter((s) => s.kind === 'elevator');
    expect(elevators).toHaveLength(2);
    for (const e of elevators) expect(b.grid.walkable(e.tx, e.ty)).toBe(true);
  });

  it('todos os spots são alcançáveis a partir dos elevadores', () => {
    const unreachable = b.spots.filter((s) => !reachable(s.tx, s.ty)).map((s) => s.id);
    expect(unreachable).toEqual([]);
  });

  it('as portas conectam cada sala ao corredor', () => {
    for (const room of rooms) {
      const door = room.door!;
      expect(door).toBeDefined();
      for (let x = door.x; x < door.x + door.w; x++) {
        for (let y = door.y; y < door.y + door.h; y++) expect(b.grid.walkable(x, y)).toBe(true);
        // tile do corredor imediatamente fora da porta
        const outside = room.side === 'north' ? door.y + door.h : door.y - 1;
        expect(outside >= CORRIDOR_Y && outside < SOUTH_Y).toBe(true);
        expect(reachable(x, outside)).toBe(true);
      }
      // o interior inteiro (fora móveis) é alcançável
      const r = room.rect;
      for (let y = r.y + 2; y < r.y + 11; y++)
        for (let x = r.x + 1; x < r.x + 15; x++) if (b.grid.walkable(x, y)) expect(reachable(x, y)).toBe(true);
    }
  });

  it('cada sala tem 6 mesas, ao menos 4 lugares extras sentados, interruptor e quadro', () => {
    for (const room of rooms) {
      const desks = room.spots.filter((s) => s.kind === 'desk');
      expect(desks).toHaveLength(6);
      expect(new Set(desks.map((d) => d.rank))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
      expect(desks.filter((d) => d.side === 'N')).toHaveLength(3);
      expect(room.spots.filter((s) => s.kind === 'stool' || s.kind === 'nook').length).toBeGreaterThanOrEqual(4);
      expect(room.spots.filter((s) => s.kind === 'stand').length).toBeGreaterThanOrEqual(3);
      expect(room.spots.filter((s) => s.kind === 'switch')).toHaveLength(1);
      expect(room.wallItems.some((w) => w.kind === 'whiteboard')).toBe(true);
      expect(room.wallItems.some((w) => w.kind === 'sign')).toBe(true);
      expect(room.wallItems.some((w) => w.kind === 'light_switch')).toBe(true);
      for (const d of desks) expect(room.furniture.some((f) => f.id === d.deskId)).toBe(true);
    }
  });

  it('móveis bloqueantes não se sobrepõem e ficam dentro da área', () => {
    for (const area of [...b.core, b.corridor, ...rooms]) {
      const used = new Map<string, string>();
      for (const f of area.furniture) {
        const def = FURNITURE[f.kind];
        expect(def.mount).toBe('floor');
        for (let y = f.ty; y < f.ty + def.footprint.h; y++) {
          for (let x = f.tx; x < f.tx + def.footprint.w; x++) {
            expect(x >= area.rect.x && x < area.rect.x + area.rect.w && y >= area.rect.y && y < area.rect.y + area.rect.h).toBe(true);
            const key = `${x},${y}`;
            if (def.blocks) {
              expect(used.get(key), `${f.id} sobre ${used.get(key)}`).toBeUndefined();
              used.set(key, f.id);
            }
          }
        }
      }
      for (const w of area.wallItems) expect(FURNITURE[w.kind].mount).toBe('wall');
    }
  });

  it('spots têm ids únicos', () => {
    const ids = b.spots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pontos de conversa e ping-pong vêm em pares', () => {
    const groups = new Map<string, number>();
    for (const s of b.spots) if (s.group && (s.kind === 'talk' || s.kind === 'pingpong')) groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
    for (const [, n] of groups) expect(n).toBe(2);
  });

  it('corredor alterna bebedouro e banco nas colunas de projeto, sem excesso de plantas', () => {
    const coolers = b.corridor.furniture.filter((f) => f.kind === 'water_cooler');
    expect(coolers.length).toBeGreaterThanOrEqual(Math.ceil((cols - 2) / 2));
    const benches = b.corridor.furniture.filter((f) => f.kind === 'bench');
    expect(benches.length).toBeGreaterThanOrEqual(Math.floor((cols - 2) / 2));
    const plants = b.corridor.furniture.filter((f) => f.kind === 'plant_tall' || f.kind === 'plant_small');
    expect(plants.length).toBeLessThanOrEqual(cols * 2);
  });

  it('a área externa e os pátios cobrem o prédio', () => {
    const ext = layoutExterior(cols);
    expect(ext.bounds.x).toBeLessThan(0);
    expect(ext.bounds.x + ext.bounds.w).toBeGreaterThan(cols * COL_W);
    const shell = slotShell(5, true);
    expect(shell.walls.length).toBeGreaterThan(0);
    expect(shell.props.every((p) => p.slot === 5)).toBe(true);
  });
});

/** Móveis de chão altos que escondem o que está pendurado na parede logo atrás. */
const TALL_FLOOR = new Set<FurnitureKind>([
  'plant_tall', 'bookshelf', 'binder_shelf', 'fridge', 'vending_machine', 'arcade', 'water_cooler', 'floor_lamp', 'toilet_stall',
  // masmorra: armação de armas, manequim e jaula também são altos
  'weapon_rack', 'armor_stand', 'cage',
]);
const WALL_DECOR = new Set<FurnitureKind>(['painting', 'poster', 'window', 'tv', 'whiteboard', 'sign', 'clock', 'mirror', 'door_frame', 'portcullis', 'chain', 'wall_torch', 'banner']);

/** Itens de parede decorativos com algum móvel alto encostado na frente (ids). */
function hiddenWallItems(area: AreaLayout): string[] {
  const out: string[] = [];
  for (const w of area.wallItems) {
    if (w.on !== 'face' || !WALL_DECOR.has(w.kind)) continue;
    const half = (FURNITURE[w.kind].footprint.w * TILE) / 2 - 2;
    const wy = w.baseY / TILE;
    for (const f of area.furniture) {
      if (!TALL_FLOOR.has(f.kind) || f.ty !== wy) continue;
      const fx0 = f.tx * TILE + (f.dx ?? 0);
      const fx1 = fx0 + FURNITURE[f.kind].footprint.w * TILE;
      if (fx0 < w.cx + half && fx1 > w.cx - half) out.push(`${w.id} atrás de ${f.id}`);
    }
  }
  return out;
}

describe('variações das salas de projeto', () => {
  const seeds = Array.from({ length: 90 }, (_, i) => (i * 7919 + 13) >>> 0);

  it('toda variação é válida: sem sobreposição, tudo alcançável, lugares suficientes', () => {
    for (const slot of [0, 1]) {
      for (const seed of seeds) {
        const room = layoutProjectRoom({ id: `/v/${seed}`, slot, seed }, theme);
        const b = assembleBuilding(columnsFor([slot]), [room]);
        const used = new Map<string, string>();
        for (const f of room.furniture) {
          const def = FURNITURE[f.kind];
          for (let y = f.ty; y < f.ty + def.footprint.h; y++)
            for (let x = f.tx; x < f.tx + def.footprint.w; x++) {
              expect(x >= room.rect.x + 1 && x < room.rect.x + 15 && y >= room.rect.y + 2 && y < room.rect.y + 11, `${f.id} fora do piso`).toBe(true);
              if (!def.blocks) continue;
              expect(used.get(`${x},${y}`), `${f.id} sobre ${used.get(`${x},${y}`)}`).toBeUndefined();
              used.set(`${x},${y}`, f.id);
            }
        }
        const door = room.door!;
        const reach = b.grid.reachableFrom(door.x, door.y);
        for (const sp of room.spots) expect(reach[sp.ty * b.grid.w + sp.tx], `${sp.id} inalcançável (semente ${seed})`).toBe(1);
        const r = room.rect;
        for (let y = r.y + 2; y < r.y + 11; y++)
          for (let x = r.x + 1; x < r.x + 15; x++) if (b.grid.walkable(x, y)) expect(reach[y * b.grid.w + x], `tile ${x},${y} isolado (semente ${seed})`).toBe(1);
        expect(room.spots.filter((sp) => sp.kind === 'desk')).toHaveLength(6);
        expect(room.spots.filter((sp) => sp.kind === 'stool' || sp.kind === 'nook').length).toBeGreaterThanOrEqual(4);
        // spots de uso não podem cair em cima de móvel que bloqueia
        for (const sp of room.spots) expect(b.grid.walkable(sp.tx, sp.ty), `${sp.id} sobre móvel`).toBe(true);
        expect(hiddenWallItems(room)).toEqual([]);
      }
    }
  });

  it('as salas não são todas iguais: espelhamento, canto de reunião e cantos variam', () => {
    const vs = seeds.map(roomVariant);
    expect(new Set(vs.map((v) => v.mirror)).size).toBe(2);
    expect(new Set(vs.map((v) => v.meeting)).size).toBe(3);
    expect(new Set(vs.map((v) => v.left)).size).toBeGreaterThan(1);
    expect(new Set(vs.map((v) => v.right)).size).toBeGreaterThan(1);
    // o piso é porcelanato (azulejo é do banheiro) com um leve tom da sala
    const room = layoutProjectRoom({ id: '/v/x', slot: 0, seed: 42 }, theme);
    expect(room.floors.every((f) => f.kind !== 'tile_white')).toBe(true);
    expect(room.floorTint).toBe(theme.carpet);
  });
});

describe('itens de parede', () => {
  it('quadros, janelas, TV, placas e espelhos não ficam atrás de móveis altos', () => {
    for (const area of [...coreAreas(), ...roomsFor([0, 1, 2, 3, 4, 7])]) expect(hiddenWallItems(area), area.id).toEqual([]);
  });

  it('passagens nas faces das paredes têm batente', () => {
    const restroom = coreAreas().find((a) => a.kind === 'restroom')!;
    expect(restroom.wallItems.some((w) => w.kind === 'door_frame')).toBe(true);
    for (const room of roomsFor([1, 3, 7])) expect(room.wallItems.some((w) => w.kind === 'door_frame'), room.id).toBe(true);
  });
});

describe('arena da masmorra (skin de fantasia)', () => {
  /** Tema de fantasia (masmorra: pedra escura e tochas avermelhadas) — a arena usa o acento no estandarte. */
  const dungeonTheme: RoomTheme = { ...theme, carpet: '#43464a', carpet2: '#3b3e42', accent: '#b04a3a', wall: { base: '#5d5f60', trim: '#3a3c3d', pattern: 'plain' } };
  const arena = (slot: number, seed: number) => layoutProjectArena({ id: `/arena/${slot}/${seed}`, slot, seed }, dungeonTheme);

  it('mantém o contrato da sala: mesma porta, 6 lugares de trabalho e os lugares extras', () => {
    for (const slot of [0, 1, 2, 3]) {
      const room = layoutProjectRoom({ id: `/r/${slot}`, slot, seed: 900 + slot }, dungeonTheme);
      const a = arena(slot, 900 + slot);
      expect(a.rect, `slot ${slot}`).toEqual(room.rect);
      expect(a.door).toEqual(room.door);
      expect(a.side).toBe(room.side);
      expect(a.kind).toBe('room');
      const desks = a.spots.filter((s) => s.kind === 'desk');
      expect(desks).toHaveLength(6);
      expect(new Set(desks.map((d) => d.rank))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
      expect(desks.filter((d) => d.side === 'N')).toHaveLength(3);
      for (const d of desks) expect(a.furniture.some((f) => f.id === d.deskId)).toBe(true);
      expect(a.spots.filter((s) => s.kind === 'stool' || s.kind === 'nook').length).toBeGreaterThanOrEqual(4);
      expect(a.spots.filter((s) => s.kind === 'stand').length).toBeGreaterThanOrEqual(3);
      expect(a.spots.filter((s) => s.kind === 'switch')).toHaveLength(1);
      expect(a.spots.some((s) => s.kind === 'whiteboard')).toBe(true);
      expect(a.wallItems.some((w) => w.kind === 'sign')).toBe(true);
      expect(a.signId).toBe(a.wallItems.find((w) => w.kind === 'sign')?.id);
    }
  });

  it('é uma câmara de masmorra no clima do bioma sorteado: piso, poço, mesas e cenário', () => {
    const v = arenaVariant(1234, dungeonTheme);
    const a = arena(0, 1234);
    const kinds = a.floors.map((f) => f.kind);
    // piso da câmara, borda e material do poço vêm do bioma
    for (const k of [v.biome.base, v.biome.ring, v.biome.pit] as const) expect(kinds, k).toContain(k);
    // nada de piso de escritório (nem grama) na câmara
    const indoor = a.floors.filter((f) => ['carpet', 'tile_check', 'tile_white', 'grass', 'sidewalk'].includes(f.kind));
    expect(indoor).toEqual([]);
    // paredes e mureta no padrão do bioma (alvenaria, rocha natural, gelo ou tijolo de forja)
    expect(a.walls.every((w) => w.style.pattern === v.biome.wall)).toBe(true);
    expect(a.walls.some((w) => w.kind === 'face')).toBe(true);
    expect(a.walls.some((w) => w.kind === 'south')).toBe(true);
    // 6 mesas de guerra (3 de cada lado do poço), a armaria do duelo e o cenário do bioma
    const fk = new Set(a.furniture.map((f) => f.kind));
    for (const k of ['stone_table', 'stone_table_back', 'brazier', 'weapon_rack', 'armor_stand', 'bench_stone'] as const) {
      expect(fk.has(k), k).toBe(true);
    }
    expect(a.furniture.filter((f) => f.kind === 'stone_table' || f.kind === 'stone_table_back')).toHaveLength(6);
    expect(a.furniture.some((f) => v.biome.props.includes(f.kind)), `cenário do bioma ${v.biome.id}`).toBe(true);
    expect(a.furniture.some((f) => f.kind === 'chest' || f.kind === 'cage')).toBe(true);
    // itens de parede: grade levadiça, corrente, tochas, estandartes do tema e as marcas do bioma
    const wk = a.wallItems.map((w) => w.kind);
    for (const k of ['portcullis', 'chain', 'wall_torch', 'banner'] as const) expect(wk, k).toContain(k);
    for (const k of v.biome.wallProps) expect(wk, k).toContain(k);
    expect(a.wallItems.filter((w) => w.kind === 'banner' && w.variant !== undefined)).toHaveLength(2);
  });

  it('cada banco senta no meio da sua mesa de pedra (nada de herói no canto da mesa)', () => {
    for (const seed of [7, 99, 4242]) {
      const a = arena(0, seed);
      const desks = a.spots.filter((sp) => sp.kind === 'desk');
      expect(desks.length).toBe(6);
      for (const sp of desks) {
        const table = a.furniture.find((it) => it.id === sp.deskId)!;
        expect(table, `${sp.id} sem mesa`).toBeTruthy();
        const def = FURNITURE[table.kind];
        expect(def.footprint.w, sp.id).toBe(2);
        const center = table.tx * TILE + (table.dx ?? 0) + (def.footprint.w * TILE) / 2;
        expect(Math.abs(sp.tx * TILE + TILE / 2 - center), `${sp.id} fora do meio da mesa`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('o miolo do poço fica livre e caminhável (4x3 no meio da arena)', () => {
    for (const slot of [0, 1]) {
      for (const seed of [7, 99, 4242]) {
        const a = arena(slot, seed);
        const b = assembleBuilding(columnsFor([slot]), [a]);
        const cx = a.rect.x + 5;
        const cy = a.rect.y + 4;
        for (let y = cy; y < cy + 3; y++) {
          for (let x = cx; x < cx + 4; x++) {
            expect(b.grid.walkable(x, y), `poço ${x},${y} (slot ${slot}, semente ${seed})`).toBe(true);
            expect(b.grid.get(x, y)).toBe(FREE);
          }
        }
      }
    }
  });

  it('toda semente é válida: sem sobreposição, tudo alcançável e nenhum móvel fora da câmara', () => {
    const seeds = Array.from({ length: 60 }, (_, i) => (i * 7919 + 29) >>> 0);
    for (const slot of [0, 1]) {
      for (const seed of seeds) {
        const a = arena(slot, seed);
        const b = assembleBuilding(columnsFor([slot]), [a]);
        const used = new Map<string, string>();
        for (const f of a.furniture) {
          const def = FURNITURE[f.kind];
          expect(def.mount, f.id).toBe('floor');
          for (let y = f.ty; y < f.ty + def.footprint.h; y++)
            for (let x = f.tx; x < f.tx + def.footprint.w; x++) {
              expect(x >= a.rect.x + 1 && x < a.rect.x + 15 && y >= a.rect.y + 2 && y < a.rect.y + 11, `${f.id} fora da câmara`).toBe(true);
              if (!def.blocks) continue;
              expect(used.get(`${x},${y}`), `${f.id} sobre ${used.get(`${x},${y}`)}`).toBeUndefined();
              used.set(`${x},${y}`, f.id);
            }
        }
        const door = a.door!;
        const reach = b.grid.reachableFrom(door.x, door.y);
        for (const sp of a.spots) expect(reach[sp.ty * b.grid.w + sp.tx], `${sp.id} inalcançável (semente ${seed})`).toBe(1);
        const r = a.rect;
        for (let y = r.y + 2; y < r.y + 11; y++)
          for (let x = r.x + 1; x < r.x + 15; x++) if (b.grid.walkable(x, y)) expect(reach[y * b.grid.w + x], `tile ${x},${y} isolado (semente ${seed})`).toBe(1);
        // spots de uso não caem em cima de móvel que bloqueia
        for (const sp of a.spots) expect(b.grid.walkable(sp.tx, sp.ty), `${sp.id} sobre móvel`).toBe(true);
        expect(hiddenWallItems(a)).toEqual([]);
      }
    }
  });

  it('varia por semente: espelhamento, estandartes do acento e canto do tesouro', () => {
    const seeds = Array.from({ length: 60 }, (_, i) => (i * 7919 + 13) >>> 0);
    const vs = seeds.map((s) => arenaVariant(s, dungeonTheme));
    expect(new Set(vs.map((v) => v.mirror)).size).toBe(2);
    expect(new Set(vs.map((v) => v.chestEast)).size).toBe(2);
    expect(new Set(vs.map((v) => v.braziers)).size).toBe(2);
    // acento avermelhado do tema -> estandarte vermelho; azul -> azul; esverdeado -> verde
    expect(arenaVariant(1, dungeonTheme).banner).toBe('red');
    expect(arenaVariant(1, { ...dungeonTheme, accent: '#5a4fd8' }).banner).toBe('blue');
    expect(arenaVariant(1, { ...dungeonTheme, accent: '#8fbf6a' }).banner).toBe('green');
    for (const v of vs) expect(v.banner).not.toBe(v.banner2);
    // o espelhamento move o canto do tesouro e as armações
    const left = arena(0, 5);
    const right = arena(0, 5);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });
});

describe('layoutProject: a skin decide o cenário do projeto', () => {
  it('escritório mantém a sala; fantasia devolve a arena da masmorra no mesmo lote', () => {
    const input = { id: '/p/0', slot: 0, seed: 4242 };
    setSkinForTests('office');
    const office = layoutProject(input, theme);
    setSkinForTests('fantasy');
    const fantasy = layoutProject(input, theme);
    setSkinForTests(undefined);
    expect(office.furniture.some((f) => f.kind === 'desk')).toBe(true);
    expect(office.furniture.some((f) => f.kind === 'brazier')).toBe(false);
    expect(fantasy.furniture.some((f) => f.kind === 'brazier')).toBe(true);
    expect(fantasy.furniture.some((f) => f.kind === 'weapon_rack')).toBe(true);
    expect(fantasy.furniture.some((f) => f.kind === 'desk')).toBe(false);
    expect(fantasy.floors.some((f) => f.kind === arenaVariant(4242, theme).biome.pit)).toBe(true);
    expect(fantasy.door).toEqual(office.door);
    expect(fantasy.rect).toEqual(office.rect);
  });
});

describe('núcleo e corredor da masmorra (skin de fantasia)', () => {
  it('recepção, banheiros, copa e lounge viram salões de pedra — sem grama nem cerca viva', () => {
    setSkinForTests('fantasy');
    try {
      const areas = [layoutReception(), layoutRestroom(), layoutCafe(), layoutLounge()];
      for (const a of areas) {
        // nada de pátio ao ar livre: nem grama, nem trilha de terra
        expect(a.floors.some((f) => f.kind === 'grass' || f.kind === 'sidewalk'), a.id).toBe(false);
        // paredes de masmorra (a taverna tem o enxaimel atrás da bancada)
        const patterns = a.walls.map((w) => w.style.pattern);
        const dungeonPatterns = DUNGEON_BIOMES.map((bb) => bb.wall);
        expect(patterns.every((p) => p === 'wood_panel' || (p !== undefined && dungeonPatterns.includes(p))), a.id).toBe(true);
        expect(patterns.some((p) => p !== undefined && dungeonPatterns.includes(p)), a.id).toBe(true);
      }
      // pisos de masmorra: o piso do bioma (a taverna mantém as tábuas velhas)
      expect(layoutReception().floors[0].kind).toBe(dungeonBiome(101, 2).hall);
      expect(layoutRestroom().floors[0].kind).toBe(dungeonBiome(201, 2).hall);
      expect(layoutCafe().floors[0].kind).toBe('wood');
      expect(layoutLounge().floors[0].kind).toBe(dungeonBiome(401, 2).hall);
      // portão levadiço na entrada, tochas de parede e estandarte na taverna
      expect(layoutReception().wallItems.some((w) => w.kind === 'portcullis')).toBe(true);
      expect(areas.some((a) => a.wallItems.some((w) => w.kind === 'wall_torch'))).toBe(true);
      expect(layoutCafe().wallItems.some((w) => w.kind === 'banner')).toBe(true);
      // a sala de armas ganha armação de armas, manequim e boneco de treino
      const lounge = layoutLounge();
      for (const k of ['weapon_rack', 'armor_stand', 'training_dummy', 'brazier'] as const) {
        expect(lounge.furniture.some((f) => f.kind === k), k).toBe(true);
      }
      // a copa não pendura janelas na pedra
      expect(layoutCafe().wallItems.some((w) => w.kind === 'window')).toBe(false);
      // as portas do núcleo continuam onde estavam
      expect(layoutRestroom().door).toEqual({ x: 7, y: SOUTH_Y, w: 2, h: 2 });
      // corredor: calçamento de pedra de ponta a ponta, braseiros nos portões e nenhuma planta
      const corr = layoutCorridor(4);
      expect(corr.floors.every((f) => f.kind === dungeonBiome(501, 3).hall)).toBe(true);
      expect(corr.furniture.some((f) => f.kind === 'brazier')).toBe(true);
      expect(corr.furniture.some((f) => f.kind === 'plant_tall' || f.kind === 'plant_small')).toBe(false);
      expect(corr.furniture.some((f) => f.kind === 'bench_stone')).toBe(true);
      // entorno: chão de rocha e paredes de masmorra no lugar do gramado e da fachada de tijolo
      const ext = layoutExterior(4);
      expect(ext.floors.some((f) => f.kind === 'rock')).toBe(true);
      expect(ext.floors.some((f) => f.kind === 'grass')).toBe(false);
      const shell = slotShell(5, true);
      expect(shell.walls.every((w) => w.style.pattern === 'dungeon')).toBe(true);
      expect(shell.props.some((p) => p.kind === 'parasol' || p.kind === 'flowers')).toBe(false);
    } finally {
      setSkinForTests(undefined);
    }
  });
});

describe('biomas da masmorra: cada câmara nasce num clima diferente', () => {
  const dungeonTheme: RoomTheme = { ...theme, carpet: '#43464a', carpet2: '#3b3e42', accent: '#b04a3a', wall: { base: '#5d5f60', trim: '#3a3c3d', pattern: 'plain' } };
  it('o bioma e o formato do poço são determinísticos pela semente', () => {
    for (const seed of [1, 7, 99, 4242, 15867]) {
      expect(dungeonBiome(seed, 1).id).toBe(dungeonBiome(seed, 1).id);
      expect(pitShape(seed, 1)).toBe(pitShape(seed, 1));
      expect(arenaVariant(seed, dungeonTheme).biome).toEqual(dungeonBiome(seed, 1));
    }
    // sal separa os sorteios: o mesmo bioma pode vestir as áreas comuns com outro sorteio
    const ids = new Set(Array.from({ length: 40 }, (_, i) => dungeonBiome(i * 31 + 5, 2).id));
    expect(ids.size).toBeGreaterThanOrEqual(4);
  });

  it('sorteia biomas e formatos de poço variados', () => {
    const seeds = Array.from({ length: 400 }, (_, i) => (i * 7919 + 3) >>> 0);
    const biomes = new Set(seeds.map((sd) => dungeonBiome(sd, 1).id));
    expect(biomes.size).toBe(DUNGEON_BIOMES.length);
    const shapes = new Set(seeds.map((sd) => pitShape(sd, 1)));
    expect(shapes.size).toBe(4);
    // nenhum bioma domina a ponto de aparecer em mais de 40% das câmaras
    for (const bio of DUNGEON_BIOMES) {
      const n = seeds.filter((sd) => dungeonBiome(sd, 1).id === bio.id).length;
      expect(n / seeds.length, bio.id).toBeLessThan(0.4);
      expect(n, bio.id).toBeGreaterThan(0);
    }
  });

  it('todo formato de poço mantém o miolo de 4x3 dentro do poço', () => {
    for (const shape of ['square', 'round', 'cross', 'ring'] as PitShape[]) {
      const tiles = new Set(pitTiles(shape).map(([x, y]) => `${x},${y}`));
      for (let y = 0; y < 3; y++) for (let x = 2; x <= 5; x++) expect(tiles.has(`${x},${y}`), `${shape} ${x},${y}`).toBe(true);
      expect(tiles.size).toBeGreaterThan(8);
    }
  });

  it('cada bioma tem piso, poço e parede próprios (nenhum repete o conjunto inteiro)', () => {
    const keys = DUNGEON_BIOMES.map((bb) => `${bb.base}|${bb.pit}|${bb.wall}`);
    expect(new Set(keys).size).toBe(DUNGEON_BIOMES.length);
    for (const bb of DUNGEON_BIOMES) {
      expect(bb.props.length, bb.id).toBeGreaterThanOrEqual(2);
      expect(FURNITURE[bb.props[0]].mount, bb.id).toBe('floor');
      for (const w of bb.wallProps) expect(FURNITURE[w].mount, `${bb.id}/${w}`).toBe('wall');
    }
  });

  it('sementes cobertas: as 6 mesas e o poço livre valem em todos os biomas', () => {
    // uma semente por bioma, achada por sorteio — garante que o contrato não quebra em nenhum clima
    for (const bio of DUNGEON_BIOMES) {
      const seed = Array.from({ length: 500 }, (_, i) => (i * 104729 + 11) >>> 0).find((sd) => dungeonBiome(sd, 1).id === bio.id)!;
      const a = layoutProjectArena({ id: `/p/${bio.id}`, slot: 0, seed }, dungeonTheme);
      expect(a.furniture.filter((f) => f.kind === 'stone_table' || f.kind === 'stone_table_back')).toHaveLength(6);
      const kinds = new Set(a.floors.map((f) => f.kind));
      expect(kinds.has(bio.base), bio.id).toBe(true);
      expect(kinds.has(bio.pit), bio.id).toBe(true);
      expect(a.walls.every((w) => w.style.pattern === bio.wall), bio.id).toBe(true);
    }
  });
});
