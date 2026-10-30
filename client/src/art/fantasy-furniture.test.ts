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
];

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

  it('é determinístico: mesma seed, mesmo sprite', () => {
    setSkinForTests('fantasy');
    for (const kind of ['desk', 'bookshelf', 'meeting_table', 'painting'] as const) {
      const a = renderFurniture(kind, undefined, 0, 3).base.buf.data;
      const b = renderFurniture(kind, undefined, 0, 3).base.buf.data;
      expect(digest(a)).toBe(digest(b));
    }
  });
});
