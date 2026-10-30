// Testes dos móveis da skin de fantasia (puros): com `setSkinForTests('fantasy')` todo kind
// continua renderizando, os kinds substituídos mudam de sprite e mantêm tamanho/âncora/`front`
// parecidos com os do escritório (senão colisões, assentos e profundidade quebram).
import { afterEach, describe, expect, it } from 'vitest';
import { FURNITURE, TILE, type FurnitureKind } from './api';
import { renderFurniture } from './furniture';
import { setSkinForTests } from './skin';

const KINDS = Object.keys(FURNITURE) as FurnitureKind[];

/** Kinds com versão de fantasia (o resto cai no móvel de escritório). */
const REPLACED: FurnitureKind[] = [
  'desk', 'desk_back', 'office_chair', 'office_chair_front', 'bookshelf', 'binder_shelf',
  'filing_cabinet', 'printer', 'trash_bin', 'plant_small', 'plant_tall', 'floor_lamp', 'water_cooler',
  'meeting_table', 'whiteboard', 'window', 'poster', 'painting', 'tv', 'clock', 'coffee_machine',
  'fridge', 'vending_machine', 'microwave', 'sofa', 'armchair', 'beanbag', 'arcade', 'pingpong_table',
  'stool', 'cafe_table', 'coffee_table',
  // segunda leva: o resto dos móveis modernos (divisória, copa, banheiro, recepção e parede)
  'glass_partition', 'counter', 'counter_sink', 'cafe_chair', 'toilet_stall', 'sink', 'reception_desk',
  'bench', 'mirror', 'shelf_wall', 'sign', 'door_frame', 'light_switch', 'elevator',
];

/** Kinds só do acampamento (sem equivalente no escritório): só precisam renderizar na fantasia. */
const CAMP_ONLY: FurnitureKind[] = ['campfire', 'camp_table', 'camp_table_back', 'stump', 'log_seat', 'tent', 'quest_board', 'bedroll', 'crate', 'barrel', 'camp_tree', 'camp_bush', 'lantern_post'];

/** Resumo FNV-1a dos bytes (sprites iguais byte a byte dão o mesmo resumo). */
function digest(data: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 0x01000193);
  return (h >>> 0).toString(16);
}

afterEach(() => setSkinForTests(undefined));

describe('móveis da skin de fantasia', () => {
  it('todo kind renderiza e os substituídos trocam de sprite sem mudar de tamanho', () => {
    for (const kind of KINDS) {
      const def = FURNITURE[kind];
      const variants = def.variants ?? [undefined];
      for (const v of variants) {
        for (let st = 0; st < (def.states ?? 1); st++) {
          const tag = `${kind}/${v ?? '-'}/${st}`;
          setSkinForTests('office');
          const office = renderFurniture(kind, v, st);
          setSkinForTests('fantasy');
          const fantasy = renderFurniture(kind, v, st);
          expect(fantasy.base.buf.countOpaque(), tag).toBeGreaterThan(0);
          // Âncora dentro do sprite e regiões dinâmicas dentro do buffer (contrato do art/api).
          expect(fantasy.base.ax, tag).toBeGreaterThanOrEqual(0);
          expect(fantasy.base.ax, tag).toBeLessThanOrEqual(fantasy.base.buf.w);
          for (const r of Object.values(fantasy.base.rects ?? {})) {
            if (!r) continue;
            expect(r.x + r.w, tag).toBeLessThanOrEqual(fantasy.base.buf.w);
            expect(r.y + r.h, tag).toBeLessThanOrEqual(fantasy.base.buf.h);
          }
          // O sprite não afunda mais que a sombra abaixo da base nem sobe além da face da parede.
          if (def.mount === 'floor') {
            expect(fantasy.base.buf.h - fantasy.base.ay, tag).toBeLessThanOrEqual(5);
          } else {
            expect(fantasy.base.ay, tag).toBeGreaterThan(0);
            expect(fantasy.base.ay - fantasy.base.buf.h, tag).toBeLessThanOrEqual(2 * TILE);
          }
          if (CAMP_ONLY.includes(kind)) continue;
          if (!REPLACED.includes(kind)) {
            // Kind sem versão de fantasia: continua idêntico ao do escritório.
            expect(digest(fantasy.base.buf.data), tag).toBe(digest(office.base.buf.data));
            continue;
          }
          expect(digest(fantasy.base.buf.data), `${tag} deveria mudar na fantasia`).not.toBe(digest(office.base.buf.data));
          // Silhueta parecida: ±40% na largura e na altura recortadas.
          expect(Math.abs(fantasy.base.buf.w - office.base.buf.w) / office.base.buf.w, `${tag} largura`).toBeLessThanOrEqual(0.4);
          expect(Math.abs(fantasy.base.buf.h - office.base.buf.h) / office.base.buf.h, `${tag} altura`).toBeLessThanOrEqual(0.4);
          // Mesma divisão base/front do original (quem senta continua atrás do encosto).
          if (office.front) expect(fantasy.front, `${tag} front`).toBeDefined();
        }
      }
    }
  });

  it('a mesa vira atril com tomo e não expõe mais a região de tela', () => {
    setSkinForTests('office');
    expect(renderFurniture('desk', 'wood').base.rects?.screen).toBeDefined();
    setSkinForTests('fantasy');
    // Sem `screen`: o render não desenha a tela animada por cima do tomo aberto.
    expect(renderFurniture('desk', 'wood').base.rects?.screen).toBeUndefined();
  });

  it('mantém as regiões dinâmicas que o mundo usa na fantasia', () => {
    setSkinForTests('fantasy');
    expect(renderFurniture('whiteboard').base.rects?.board).toBeDefined();
    expect(renderFurniture('window').base.rects?.glass).toBeDefined();
    expect(renderFurniture('clock').base.rects?.face).toBeDefined();
    expect(renderFurniture('tv').base.rects?.tv).toBeDefined();
    expect(renderFurniture('painting').base.rects?.art).toBeDefined();
    expect(renderFurniture('floor_lamp').base.rects?.glow).toBeDefined();
    expect(renderFurniture('arcade').base.rects?.screen).toBeDefined();
  });

  it('a placa vira tabuleta com área de texto clara (o render escreve o nome escuro) e mantém rects.sign', () => {
    setSkinForTests('fantasy');
    const s = renderFurniture('sign').base;
    const r = s.rects?.sign;
    expect(r).toBeDefined();
    if (!r) return;
    // Média de luminância dentro do pergaminho: tem que ser clara (> 120) para o texto escuro.
    const d = s.buf.data;
    let sum = 0;
    let n = 0;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = (y * s.buf.w + x) * 4;
        if (d[i + 3] < 128) continue;
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(sum / n).toBeGreaterThan(120);
  });

  it('o espelho mantém a região refletora (rects.glass), como o original', () => {
    setSkinForTests('office');
    expect(renderFurniture('mirror').base.rects?.glass).toBeDefined();
    setSkinForTests('fantasy');
    const g = renderFurniture('mirror').base.rects?.glass;
    expect(g).toBeDefined();
    if (g) expect(g.w * g.h).toBeGreaterThan(40);
  });

  it('elevador e privada guardam a semântica de estado (portão sobe, porta abre)', () => {
    setSkinForTests('office');
    const officeElevator = [0, 4].map((st) => digest(renderFurniture('elevator', undefined, st).base.buf.data));
    setSkinForTests('fantasy');
    const closed = renderFurniture('elevator', undefined, 0).base;
    const open = renderFurniture('elevator', undefined, 4).base;
    expect(digest(closed.buf.data)).not.toBe(digest(open.buf.data));
    // Cada estado do elevador muda o sprite (as folhas/grade andam) e nenhum é o do escritório.
    for (let st = 0; st < 5; st++) {
      const d = digest(renderFurniture('elevator', undefined, st).base.buf.data);
      expect(d).not.toBe(officeElevator[st === 4 ? 1 : 0]);
    }
    setSkinForTests('office');
    const officeStall = renderFurniture('toilet_stall', undefined, 1);
    setSkinForTests('fantasy');
    const free = renderFurniture('toilet_stall', undefined, 0);
    const busy = renderFurniture('toilet_stall', undefined, 1);
    expect(free.front).toBeDefined();
    expect(busy.front).toBeDefined();
    expect(digest(free.front!.buf.data)).not.toBe(digest(busy.front!.buf.data));
    expect(officeStall.front).toBeDefined();
    expect(digest(busy.front!.buf.data)).not.toBe(digest(officeStall.front!.buf.data));
  });

  it('variantes da divisória e da bancada têm desenhos próprios', () => {
    setSkinForTests('fantasy');
    const g = (v: string) => digest(renderFurniture('glass_partition', v).base.buf.data);
    expect(g('h')).not.toBe(g('v'));
    expect(g('v')).not.toBe(g('end'));
    const c = (v: string) => digest(renderFurniture('counter', v).base.buf.data);
    expect(c('plain')).not.toBe(c('drawers'));
  });

  it('é determinístico: mesma seed, mesmo sprite', () => {
    setSkinForTests('fantasy');
    for (const kind of ['desk', 'bookshelf', 'meeting_table', 'painting', 'shelf_wall', 'reception_desk'] as const) {
      const a = renderFurniture(kind, undefined, 0, 3).base.buf.data;
      const b = renderFurniture(kind, undefined, 0, 3).base.buf.data;
      expect(digest(a)).toBe(digest(b));
    }
  });
});
