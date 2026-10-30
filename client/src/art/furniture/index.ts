// Despacho dos móveis por kind (puro). Cada combinação (kind, variant, state, variação) é gerada uma
// vez e guardada em cache por quem chama (ver art/index.ts).
import { FURNITURE, type FurnitureKind } from '../api';
import { isFantasy } from '../skin';
import { trim, type BufFurniture } from '../core/sprite';
import * as C from './common';
import { fantasyBuild } from './fantasy';
import * as O from './office';
import * as W from './wall';

/** Quantas variações de detalhes (seed) cada kind tem; os demais ignoram a seed. */
export const SEED_VARIATIONS: Partial<Record<FurnitureKind, number>> = {
  desk: 6,
  desk_back: 4,
  bookshelf: 4,
  binder_shelf: 4,
  meeting_table: 2,
  shelf_wall: 3,
  painting: 2,
  coffee_table: 2,
  plant_small: 3,
  plant_tall: 3,
};

/** Normaliza variante/estado para valores válidos do catálogo. */
export function normalizeFurniture(kind: FurnitureKind, variant?: string, state?: number, seed?: number): { variant: string | undefined; state: number; vseed: number } {
  const def = FURNITURE[kind];
  const v = def.variants ? (variant && def.variants.includes(variant) ? variant : def.variants[0]) : undefined;
  const states = def.states ?? 1;
  const st = Math.max(0, Math.min(states - 1, Math.floor(state ?? 0)));
  const n = SEED_VARIATIONS[kind] ?? 1;
  const vseed = n > 1 ? (((Math.floor(seed ?? 0) % n) + n) % n) : 0;
  return { variant: v, state: st, vseed };
}

function build(kind: FurnitureKind, variant: string | undefined, state: number, seed: number): BufFurniture {
  switch (kind) {
    case 'desk':
      return O.desk(variant, seed);
    case 'desk_back':
      return O.deskBack(variant, seed);
    case 'office_chair':
      return O.officeChair(variant);
    case 'office_chair_front':
      return O.officeChairFront(variant);
    case 'bookshelf':
      return O.bookshelf(seed);
    case 'filing_cabinet':
      return O.filingCabinet();
    case 'printer':
      return O.printer();
    case 'trash_bin':
      return O.trashBin();
    case 'plant_small':
      return O.plantSmall(variant, seed);
    case 'plant_tall':
      return O.plantTall(variant, seed);
    case 'glass_partition':
      return O.glassPartition(variant);
    case 'binder_shelf':
      return O.binderShelf(seed);
    case 'meeting_table':
      return O.meetingTable(seed);
    case 'stool':
      return O.stool();
    case 'floor_lamp':
      return O.floorLamp();
    case 'water_cooler':
      return O.waterCooler();
    case 'whiteboard':
      return W.whiteboard();
    case 'window':
      return W.windowItem();
    case 'clock':
      return W.clock();
    case 'poster':
      return W.poster(variant);
    case 'painting':
      return W.painting(seed);
    case 'tv':
      return W.tv();
    case 'light_switch':
      return W.lightSwitch(variant);
    case 'elevator':
      return W.elevator(state);
    case 'door_frame':
      return W.doorFrame();
    case 'sign':
      return W.sign();
    case 'mirror':
      return W.mirror();
    case 'shelf_wall':
      return W.shelfWall(seed);
    case 'counter':
      return C.counter(variant);
    case 'counter_sink':
      return C.counterSink();
    case 'coffee_machine':
      return C.coffeeMachine(state);
    case 'microwave':
      return C.microwave();
    case 'fridge':
      return C.fridge();
    case 'vending_machine':
      return C.vendingMachine();
    case 'cafe_table':
      return C.cafeTable();
    case 'cafe_chair':
      return C.cafeChair(variant);
    case 'sofa':
      return C.sofa(variant);
    case 'armchair':
      return C.armchair(variant);
    case 'coffee_table':
      return C.coffeeTable(seed);
    case 'pingpong_table':
      return C.pingpongTable();
    case 'beanbag':
      return C.beanbag(variant);
    case 'arcade':
      return C.arcade();
    case 'toilet_stall':
      return C.toiletStall(state);
    case 'sink':
      return C.sink();
    case 'reception_desk':
      return C.receptionDesk(seed);
    case 'bench':
      return C.bench();
    // Móveis que só existem no acampamento da skin de fantasia (o escritório nunca os usa):
    // ficam com um móvel equivalente do escritório, do mesmo footprint, para o switch ser total.
    case 'campfire':
      return C.toiletStall(0);
    case 'camp_table':
      return O.desk('wood', 0);
    case 'camp_table_back':
      return O.deskBack('wood', 0);
    case 'stump':
    case 'log_seat':
      return O.stool();
    case 'tent':
      return O.meetingTable(0);
    case 'quest_board':
      return O.bookshelf(0);
    case 'bedroll':
      return C.beanbag('red');
    case 'crate':
      return O.filingCabinet();
    case 'barrel':
      return C.fridge();
    case 'camp_tree':
      return O.plantTall('palm', 0);
    case 'camp_bush':
      return O.plantSmall('fern', 0);
    case 'lantern_post':
      return O.floorLamp();
    // Móveis que só existem na arena da masmorra (skin de fantasia): o escritório nunca os usa,
    // mas o switch precisa ser total — daí o equivalente de mesmo footprint.
    case 'brazier':
      return O.trashBin();
    case 'weapon_rack':
      return O.bookshelf(0);
    case 'armor_stand':
      return O.filingCabinet();
    case 'training_dummy':
      return O.printer();
    case 'cage':
      return O.filingCabinet();
    case 'chest':
      return O.filingCabinet();
    case 'bench_stone':
      return C.bench();
    case 'portcullis':
      return W.doorFrame();
    case 'chain':
      return W.clock();
    case 'wall_torch':
      return W.clock();
    case 'banner':
      return W.poster('code');
    // Props dos biomas da masmorra: no escritório (skin padrão) caem no móvel mais próximo.
    case 'sarcophagus':
      return O.meetingTable(seed);
    case 'bone_pile':
      return O.trashBin();
    case 'mushroom_cluster':
      return O.plantSmall(variant, seed);
    case 'crystal_shard':
      return O.plantSmall('crystal', seed);
    case 'ice_spike':
      return O.plantSmall('ice', seed);
    case 'lava_pool':
      return O.meetingTable(seed);
    case 'web_wall':
      return W.poster('code');
  }
}

// A skin de fantasia troca o móvel por um objeto de RPG; kinds sem versão de fantasia caem no escritório.
export function renderFurniture(kind: FurnitureKind, variant?: string, state?: number, seed?: number): BufFurniture {
  const n = normalizeFurniture(kind, variant, state, seed);
  if (isFantasy()) {
    const f = fantasyBuild(kind, n.variant, n.state, n.vseed);
    if (f) return { base: trim(f.base), front: f.front ? trim(f.front) : undefined };
  }
  const f = build(kind, n.variant, n.state, n.vseed);
  return { base: trim(f.base), front: f.front ? trim(f.front) : undefined };
}
