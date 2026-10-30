// Testes da arte dos encontros (skin de fantasia): monstrinhos e efeitos desenhados em PixelBuf puro.
// Garantem que todo quadro tem pixels visíveis, margem transparente para o contorno e quadros
// realmente diferentes entre si (sem "animação" que não anima).
import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_FRAMES,
  MONSTER_KINDS,
  encounterFrame,
  renderEncounterArt,
  type EncounterArt,
} from './monsters';

const ARTS = Object.keys(ENCOUNTER_FRAMES) as EncounterArt[];

describe('arte dos encontros de RPG', () => {
  it('todo quadro tem pixels visíveis e cabe no buffer com margem para o contorno', () => {
    for (const name of ARTS) {
      for (let frame = 0; frame < ENCOUNTER_FRAMES[name]; frame++) {
        const { buf, ax, ay } = renderEncounterArt(name, frame);
        const bounds = buf.bounds();
        expect(bounds, `${name}#${frame}`).not.toBeNull();
        expect(buf.countOpaque(), `${name}#${frame}`).toBeGreaterThan(8);
        // margem de 1px em pelo menos um lado para o contorno não ser cortado
        expect(bounds!.x + bounds!.w, `${name}#${frame}`).toBeLessThanOrEqual(buf.w);
        expect(bounds!.y + bounds!.h, `${name}#${frame}`).toBeLessThanOrEqual(buf.h);
        // âncora = pés do sprite: dentro da folha e encostada na base
        expect(ax).toBeGreaterThan(0);
        expect(ax).toBeLessThan(buf.w);
        expect(ay).toBeGreaterThan(0);
        expect(ay).toBeLessThanOrEqual(buf.h);
        // a âncora fica junto da base do desenho (o morcego voa, então a folga é maior)
        expect(bounds!.y + bounds!.h).toBeGreaterThan(ay - 8);
        expect(bounds!.y).toBeLessThan(ay);
      }
    }
  });

  it('os quadros de cada peça são diferentes (a animação existe de verdade)', () => {
    for (const name of ARTS) {
      const frames = ENCOUNTER_FRAMES[name];
      expect(frames, name).toBeGreaterThanOrEqual(2);
      const base = renderEncounterArt(name, 0).buf;
      for (let frame = 1; frame < frames; frame++) {
        const other = renderEncounterArt(name, frame).buf;
        expect(base.data.some((byte, i) => byte !== other.data[i]), `${name}#${frame}`).toBe(true);
      }
    }
  });

  it('os três monstrinhos têm quadros de animação e desenho próprio', () => {
    expect(MONSTER_KINDS).toEqual(['slime', 'bat', 'golem']);
    const first = MONSTER_KINDS.map((k) => renderEncounterArt(k, 0).buf);
    for (let i = 1; i < first.length; i++) {
      expect(first[i].data.some((b, j) => b !== first[0].data[j])).toBe(true);
    }
    for (const kind of MONSTER_KINDS) expect(ENCOUNTER_FRAMES[kind]).toBe(3);
  });

  it('o quadro pedido é normalizado dentro do ciclo (aceita qualquer inteiro)', () => {
    for (const name of ARTS) {
      const n = ENCOUNTER_FRAMES[name];
      expect(encounterFrame(name, 0)).toBe(0);
      expect(encounterFrame(name, n)).toBe(0);
      expect(encounterFrame(name, n + 1)).toBe(1 % n);
      expect(encounterFrame(name, -1)).toBe(n - 1);
      expect(encounterFrame(name, 7.9)).toBe(7 % n);
    }
    // renderizar um quadro fora do ciclo devolve o mesmo desenho do quadro normalizado
    expect(renderEncounterArt('slime', 3).buf.data).toEqual(renderEncounterArt('slime', 0).buf.data);
  });

  it('o baú tem três estágios (fechado, abrindo, aberto)', () => {
    const closed = renderEncounterArt('chest', 0).buf;
    const open = renderEncounterArt('chest', 2).buf;
    // o aberto mostra o interior escuro: menos pixels dourados no topo do que o fechado
    const topGold = (buf: typeof closed) => {
      let n = 0;
      for (let y = 2; y < 8; y++) for (let x = 0; x < buf.w; x++) if (buf.data[(y * buf.w + x) * 4 + 3] > 0) n++;
      return n;
    };
    expect(topGold(open)).toBeGreaterThan(topGold(closed));
  });
});
