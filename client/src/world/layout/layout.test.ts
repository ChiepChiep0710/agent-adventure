import { describe, expect, it } from 'vitest';
import { FURNITURE, TILE, type FurnitureKind, type RoomTheme } from '../../art/api';
import { setSkinForTests } from '../../art/skin';
import { BUILDING_H, COL_W, CORRIDOR_Y, SOUTH_Y } from '../constants';
import { assembleBuilding, coreAreas } from './building';
import { campVariant, layoutProjectCamp } from './camp';
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
const TALL_FLOOR = new Set<FurnitureKind>(['plant_tall', 'bookshelf', 'binder_shelf', 'fridge', 'vending_machine', 'arcade', 'water_cooler', 'floor_lamp', 'toilet_stall']);
const WALL_DECOR = new Set<FurnitureKind>(['painting', 'poster', 'window', 'tv', 'whiteboard', 'sign', 'clock', 'mirror', 'door_frame']);

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

describe('acampamento de aventureiros (skin de fantasia)', () => {
  /** Tema de fantasia (zona de floresta com musgo) — o acampamento usa o acento para a lona. */
  const campTheme: RoomTheme = { ...theme, carpet: '#67705a', carpet2: '#5c6552', accent: '#8fbf6a', wall: { base: '#7c8371', trim: '#4d5344', pattern: 'plain' } };
  const camp = (slot: number, seed: number) => layoutProjectCamp({ id: `/camp/${slot}/${seed}`, slot, seed }, campTheme);

  it('mantém o contrato da sala: mesma porta, 6 lugares de trabalho e os lugares extras', () => {
    for (const slot of [0, 1, 2, 3]) {
      const room = layoutProjectRoom({ id: `/r/${slot}`, slot, seed: 900 + slot }, campTheme);
      const c = camp(slot, 900 + slot);
      expect(c.rect, `slot ${slot}`).toEqual(room.rect);
      expect(c.door).toEqual(room.door);
      expect(c.side).toBe(room.side);
      expect(c.kind).toBe('room');
      const desks = c.spots.filter((s) => s.kind === 'desk');
      expect(desks).toHaveLength(6);
      expect(new Set(desks.map((d) => d.rank))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
      expect(desks.filter((d) => d.side === 'N')).toHaveLength(3);
      for (const d of desks) expect(c.furniture.some((f) => f.id === d.deskId)).toBe(true);
      expect(c.spots.filter((s) => s.kind === 'stool' || s.kind === 'nook').length).toBeGreaterThanOrEqual(4);
      expect(c.spots.filter((s) => s.kind === 'stand').length).toBeGreaterThanOrEqual(3);
      expect(c.spots.filter((s) => s.kind === 'switch')).toHaveLength(1);
      expect(c.spots.some((s) => s.kind === 'whiteboard')).toBe(true);
      expect(c.wallItems.some((w) => w.kind === 'sign')).toBe(true);
      expect(c.signId).toBe(c.wallItems.find((w) => w.kind === 'sign')?.id);
    }
  });

  it('vira um campo ao ar livre: grama, trilha, fogueira, bancadas, barracas e quadro de missões', () => {
    const c = camp(0, 1234);
    expect(c.floors.some((f) => f.kind === 'grass')).toBe(true);
    expect(c.floors.some((f) => f.kind === 'sidewalk')).toBe(true);
    // nada de piso de escritório no campo
    const indoor = c.floors.filter((f) => ['marble', 'carpet', 'tile_check', 'tile_white', 'concrete'].includes(f.kind));
    expect(indoor).toEqual([]);
    expect(c.floorTint).toBeUndefined();
    const kinds = new Set(c.furniture.map((f) => f.kind));
    for (const k of ['campfire', 'camp_table', 'camp_table_back', 'stump', 'tent', 'quest_board', 'bedroll', 'crate', 'camp_tree', 'lantern_post'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    // os 6 lugares de trabalho sentam em tocos, à volta das bancadas/fogueira
    expect(c.furniture.filter((f) => f.kind === 'stump')).toHaveLength(6);
    // as barracas têm lonas de cores diferentes (a segunda nunca repete a primeira)
    const tents = c.furniture.filter((f) => f.kind === 'tent');
    expect(tents).toHaveLength(2);
    expect(tents[0].variant).not.toBe(tents[1].variant);
  });

  it('não tem parede de castelo: mata densa na face norte e cerca viva no limite sul', () => {
    for (const slot of [0, 1]) {
      const c = camp(slot, 77 + slot);
      const patterns = c.walls.map((w) => w.style.pattern);
      expect(patterns.every((p) => p === 'treeline' || p === 'hedge'), `slot ${slot}`).toBe(true);
      expect(c.walls.some((w) => w.kind === 'face' && w.style.pattern === 'treeline')).toBe(true);
      expect(c.walls.some((w) => w.kind === 'south')).toBe(true);
      // a face norte continua mostrando a passagem da porta nas salas ao sul
      if (slot % 2 === 1) expect(c.walls.find((w) => w.kind === 'face')?.doorways?.length).toBe(1);
    }
  });

  it('toda semente é válida: sem sobreposição, tudo alcançável e nenhum móvel fora do campo', () => {
    const seeds = Array.from({ length: 60 }, (_, i) => (i * 7919 + 29) >>> 0);
    for (const slot of [0, 1]) {
      for (const seed of seeds) {
        const c = camp(slot, seed);
        const b = assembleBuilding(columnsFor([slot]), [c]);
        const used = new Map<string, string>();
        for (const f of c.furniture) {
          const def = FURNITURE[f.kind];
          expect(def.mount, f.id).toBe('floor');
          for (let y = f.ty; y < f.ty + def.footprint.h; y++)
            for (let x = f.tx; x < f.tx + def.footprint.w; x++) {
              expect(x >= c.rect.x + 1 && x < c.rect.x + 15 && y >= c.rect.y + 2 && y < c.rect.y + 11, `${f.id} fora do campo`).toBe(true);
              if (!def.blocks) continue;
              expect(used.get(`${x},${y}`), `${f.id} sobre ${used.get(`${x},${y}`)}`).toBeUndefined();
              used.set(`${x},${y}`, f.id);
            }
        }
        const door = c.door!;
        const reach = b.grid.reachableFrom(door.x, door.y);
        for (const sp of c.spots) expect(reach[sp.ty * b.grid.w + sp.tx], `${sp.id} inalcançável (semente ${seed})`).toBe(1);
        const r = c.rect;
        for (let y = r.y + 2; y < r.y + 11; y++)
          for (let x = r.x + 1; x < r.x + 15; x++) if (b.grid.walkable(x, y)) expect(reach[y * b.grid.w + x], `tile ${x},${y} isolado (semente ${seed})`).toBe(1);
        // spots de uso não caem em cima de móvel que bloqueia
        for (const sp of c.spots) expect(b.grid.walkable(sp.tx, sp.ty), `${sp.id} sobre móvel`).toBe(true);
        expect(hiddenWallItems(c)).toEqual([]);
      }
    }
  });

  it('varia por semente: espelhamento e cor da lona vêm do tema', () => {
    const seeds = Array.from({ length: 60 }, (_, i) => (i * 7919 + 13) >>> 0);
    const vs = seeds.map((s) => campVariant(s, campTheme));
    expect(new Set(vs.map((v) => v.mirror)).size).toBe(2);
    expect(new Set(vs.map((v) => v.tree)).size).toBe(2);
    expect(new Set(vs.map((v) => v.bush)).size).toBe(2);
    // acento esverdeado do tema -> lona verde; acento azul -> lona azul
    expect(campVariant(1, campTheme).tent).toBe('green');
    expect(campVariant(1, { ...campTheme, accent: '#5a4fd8' }).tent).toBe('blue');
    expect(campVariant(1, { ...campTheme, accent: '#d9453f' }).tent).toBe('red');
    for (const v of vs) expect(v.tent).not.toBe(v.tent2);
  });
});

describe('layoutProject: a skin decide o cenário do projeto', () => {
  it('escritório mantém a sala; fantasia devolve o acampamento no mesmo lote', () => {
    const input = { id: '/p/0', slot: 0, seed: 4242 };
    setSkinForTests('office');
    const office = layoutProject(input, theme);
    setSkinForTests('fantasy');
    const fantasy = layoutProject(input, theme);
    setSkinForTests(undefined);
    expect(office.furniture.some((f) => f.kind === 'desk')).toBe(true);
    expect(office.furniture.some((f) => f.kind === 'campfire')).toBe(false);
    expect(fantasy.furniture.some((f) => f.kind === 'campfire')).toBe(true);
    expect(fantasy.furniture.some((f) => f.kind === 'desk')).toBe(false);
    expect(fantasy.door).toEqual(office.door);
    expect(fantasy.rect).toEqual(office.rect);
  });
});

describe('núcleo e corredor ao ar livre (skin de fantasia)', () => {
  it('recepção, banheiros, copa e lounge ficam em pátios de grama com mata/cerca viva', () => {
    setSkinForTests('fantasy');
    try {
      const areas = [layoutReception(), layoutRestroom(), layoutCafe(), layoutLounge()];
      for (const a of areas) {
        expect(a.floors.some((f) => f.kind === 'grass'), a.id).toBe(true);
        expect(a.floors.some((f) => f.kind === 'sidewalk'), a.id).toBe(true);
        // a recepção guarda a parede do portal (wood_panel) onde ficam os elevadores; o resto é mata/cerca viva
        const patterns = a.walls.map((w) => w.style.pattern).filter((p) => !(a.id === RECEPTION_ID && p === 'wood_panel'));
        expect(patterns.every((p) => p === 'treeline' || p === 'hedge'), a.id).toBe(true);
      }
      // a recepção mantém a parede de pedra do portal (é onde ficam os elevadores)
      expect(layoutReception().walls[0].style.pattern).toBe('wood_panel');
      // a copa não pendura janelas na mata
      expect(layoutCafe().wallItems.some((w) => w.kind === 'window')).toBe(false);
      // as portas do núcleo continuam onde estavam
      expect(layoutRestroom().door).toEqual({ x: 7, y: SOUTH_Y, w: 2, h: 2 });
      // corredor: estrada de terra com grama nas margens
      const corr = layoutCorridor(4);
      expect(corr.floors.some((f) => f.kind === 'sidewalk')).toBe(true);
      expect(corr.floors.filter((f) => f.kind === 'grass')).toHaveLength(2);
      expect(corr.floors.some((f) => f.kind === 'concrete')).toBe(false);
      // entorno: cerca viva/mata no lugar da fachada de tijolo
      const shell = slotShell(5, true);
      expect(shell.walls.every((w) => w.style.pattern === 'treeline' || w.style.pattern === 'hedge')).toBe(true);
    } finally {
      setSkinForTests(undefined);
    }
  });
});
