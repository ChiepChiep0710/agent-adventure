import { describe, expect, it } from 'vitest';
import { BOSS_FRAMES, BOSS_KINDS, bossPalette, renderBossArt } from './bosses';

/** Conjunto de pixels opacos: assinatura da silhueta. */
function signature(kind: (typeof BOSS_KINDS)[number], frame = 0): string {
  const s = renderBossArt(kind, frame);
  const out: string[] = [];
  for (let y = 0; y < s.buf.h; y++) {
    for (let x = 0; x < s.buf.w; x++) if (s.buf.alpha(x - s.buf.ox, y - s.buf.oy) > 0) out.push(`${x},${y}`);
  }
  return out.join(';');
}

describe('chefes da masmorra (arte)', () => {
  it('todo chefe desenha um sprite com pixels e âncora nos pés', () => {
    for (const k of BOSS_KINDS) {
      const s = renderBossArt(k, 0);
      expect(s.buf.w).toBeGreaterThan(16);
      expect(s.buf.h).toBeGreaterThan(24);
      // âncora = centro inferior do footprint de 2x2 tiles
      expect(s.ax).toBe(s.buf.w / 2);
      const b = s.buf.bounds();
      expect(b, k).toBeTruthy();
      expect(b!.h, k).toBeGreaterThan(20);
    }
  });

  it('é determinístico: mesma peça e mesmo quadro dão o mesmo desenho', () => {
    for (const k of BOSS_KINDS) expect(signature(k)).toBe(signature(k));
  });

  it('as sete silhuetas são diferentes entre si (dá para reconhecer o bioma)', () => {
    const sigs = new Map<string, string>();
    for (const k of BOSS_KINDS) {
      const sig = signature(k);
      expect(sigs.has(sig), `silhueta repetida: ${k} = ${sigs.get(sig)}`).toBe(false);
      sigs.set(sig, k);
    }
  });

  it('cada chefe tem os quadros parado, golpe e ferido, diferentes entre si', () => {
    expect(BOSS_FRAMES).toBe(3);
    for (const k of BOSS_KINDS) {
      const idle = signature(k, 0);
      const hit = signature(k, 1);
      expect(hit, k).not.toBe(idle);
      expect(signature(k, 2), k).not.toBe(idle);
    }
  });

  it('a paleta do chefe é a do bioma (olho aceso bem diferente do corpo)', () => {
    for (const k of BOSS_KINDS) {
      const p = bossPalette(k);
      expect(p.eye).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.eye).not.toBe(p.base);
    }
  });
});
