// Skin visual (pele) do escritório: 'office' (padrão) ou 'fantasy' (RPG de fantasia clássica).
// Escolhida uma vez por carga da página: `?skin=fantasy` / `?skin=office` na URL (fica salvo no localStorage),
// senão o valor salvo. Trocar de skin recarrega a página, então os caches de arte não precisam da skin na chave.
export type Skin = 'office' | 'fantasy';

export const SKIN_STORAGE_KEY = 'habblaud.skin';

let current: Skin | undefined;

export function normalizeSkin(v: string | null | undefined): Skin | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'fantasy' || s === 'rpg') return 'fantasy';
  if (s === 'office' || s === 'default') return 'office';
  return undefined;
}

function detect(): Skin {
  const g = globalThis as {
    window?: unknown;
    location?: { search?: string };
    localStorage?: { getItem(k: string): string | null; setItem?(k: string, v: string): void };
  };
  if (g.window === undefined) return 'office';
  const fromUrl = normalizeSkin(new URLSearchParams(g.location?.search ?? '').get('skin'));
  if (fromUrl) {
    try {
      g.localStorage?.setItem?.(SKIN_STORAGE_KEY, fromUrl);
    } catch {
      // localStorage bloqueado: vale só nesta carga.
    }
    return fromUrl;
  }
  try {
    return normalizeSkin(g.localStorage?.getItem(SKIN_STORAGE_KEY)) ?? 'office';
  } catch {
    return 'office';
  }
}

export function getSkin(): Skin {
  return (current ??= detect());
}

/** Só para testes (e para a prévia de arte): fixa a skin sem passar pela URL. */
export function setSkinForTests(s: Skin | undefined): void {
  current = s;
}

export function isFantasy(): boolean {
  return getSkin() === 'fantasy';
}
