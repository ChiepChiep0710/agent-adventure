// Testes da arte dos encontros (skin de fantasia): monstros e efeitos desenhados em PixelBuf puro.
// Garantem que todo quadro tem pixels visíveis, margem transparente para o contorno, tamanho de
// monstro de verdade (24 px) e quadros realmente diferentes entre si (sem "animação" que não anima).
import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_FRAMES,
  MONSTER_KINDS,
  encounterArtSize,
  encounterFrame,
  isFlyingMonster,
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
        // margem de 1px para o contorno não ser cortado (o contorno é automático, 4-vizinhos)
        expect(bounds!.x, `${name}#${frame}`).toBeGreaterThanOrEqual(0);
        expect(bounds!.y, `${name}#${frame}`).toBeGreaterThanOrEqual(1);
        expect(bounds!.x + bounds!.w, `${name}#${frame}`).toBeLessThanOrEqual(buf.w - 1);
        expect(bounds!.y + bounds!.h, `${name}#${frame}`).toBeLessThanOrEqual(buf.h);
        // âncora = pés do sprite: dentro da folha e encostada na base
        expect(ax, name).toBeGreaterThan(0);
        expect(ax, name).toBeLessThan(buf.w);
        expect(ay, name).toBeGreaterThan(0);
        expect(ay, name).toBeLessThanOrEqual(buf.h);
        // A âncora fica junto da base do desenho — só vale para o que pisa no chão (monstros e efeitos
        // com âncora nos pés). Projéteis (bola de fogo, adaga, feixe, estrela) são centrados na âncora.
        if (ay === buf.h - 1) {
          expect(bounds!.y + bounds!.h, `${name}#${frame}`).toBeGreaterThan(ay - 14);
          expect(bounds!.y, `${name}#${frame}`).toBeLessThan(ay - 2);
        }
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

  it('são oito monstros, cada um com 4 quadros e 24 px de folha', () => {
    expect(MONSTER_KINDS).toEqual(['slime', 'bat', 'golem', 'skeleton', 'goblin', 'whelp', 'mimic', 'wisp']);
    for (const kind of MONSTER_KINDS) {
      expect(ENCOUNTER_FRAMES[kind], kind).toBe(4);
      expect(encounterArtSize(kind), kind).toBe(24);
      const { buf } = renderEncounterArt(kind, 0);
      expect(buf.w, kind).toBe(24);
      expect(buf.h, kind).toBe(24);
    }
  });

  it('cada monstro tem silhueta própria e é legível (não é um borrão de poucos pixels)', () => {
    const first = MONSTER_KINDS.map((k) => renderEncounterArt(k, 0).buf);
    for (let i = 0; i < first.length; i++) {
      // tamanho visível suficiente para ler no zoom padrão
      const b = first[i].bounds()!;
      expect(b.w, MONSTER_KINDS[i]).toBeGreaterThanOrEqual(11);
      expect(b.h, MONSTER_KINDS[i]).toBeGreaterThanOrEqual(9);
      expect(first[i].countOpaque(), MONSTER_KINDS[i]).toBeGreaterThan(60);
      for (let j = i + 1; j < first.length; j++) {
        expect(first[i].data.some((byte, k) => byte !== first[j].data[k]), `${MONSTER_KINDS[i]} x ${MONSTER_KINDS[j]}`).toBe(true);
      }
    }
  });

  it('morcego e espectro voam; o resto anda no chão', () => {
    expect(isFlyingMonster('bat')).toBe(true);
    expect(isFlyingMonster('wisp')).toBe(true);
    for (const k of ['slime', 'golem', 'skeleton', 'goblin', 'whelp', 'mimic'] as const) expect(isFlyingMonster(k)).toBe(false);
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
    expect(renderEncounterArt('slime', 4).buf.data).toEqual(renderEncounterArt('slime', 0).buf.data);
  });

  it('o baú tem três estágios (fechado, abrindo, aberto)', () => {
    const closed = renderEncounterArt('chest', 0).buf;
    const open = renderEncounterArt('chest', 2).buf;
    const topOpaque = (buf: typeof closed) => {
      let n = 0;
      for (let y = 2; y < 8; y++) for (let x = 0; x < buf.w; x++) if (buf.data[(y * buf.w + x) * 4 + 3] > 0) n++;
      return n;
    };
    expect(topOpaque(open)).toBeGreaterThan(topOpaque(closed));
  });

  it('as peças de combate novas existem e animam (fogo, adaga, luz, martelo, ouro, vitória)', () => {
    for (const art of ['fireball', 'dagger', 'lightbeam', 'smash', 'goldburst', 'victory'] as const) {
      expect(ENCOUNTER_FRAMES[art], art).toBe(3);
      const a = renderEncounterArt(art, 0).buf;
      const b = renderEncounterArt(art, 2).buf;
      expect(a.countOpaque(), art).toBeGreaterThan(3);
      expect(a.data.some((byte, i) => byte !== b.data[i]), art).toBe(true);
    }
  });
});
