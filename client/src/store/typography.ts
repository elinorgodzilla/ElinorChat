import { z } from 'zod';
import { atom, getDefaultStore } from 'jotai';

export const FONT_FAMILIES = ['inter', 'source-sans-3', 'system', 'jost', 'readex-pro'] as const;
export const FONT_WEIGHTS = [300, 400, 500] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];
export type FontWeight = (typeof FONT_WEIGHTS)[number];
export type TypographyPreferences = { fontFamily: FontFamily; fontWeight: FontWeight };

export const DEFAULT_TYPOGRAPHY: TypographyPreferences = {
  fontFamily: 'readex-pro',
  fontWeight: 300,
};

const STORAGE_KEY = 'typography';
const typographySchema = z.object({
  fontFamily: z.enum(FONT_FAMILIES),
  fontWeight: z
    .number()
    .refine((value): value is FontWeight => FONT_WEIGHTS.some((weight) => weight === value)),
});

function parseTypography(value: string | null): TypographyPreferences {
  try {
    const parsed = typographySchema.safeParse(JSON.parse(value ?? 'null'));
    return parsed.success ? parsed.data : DEFAULT_TYPOGRAPHY;
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

function readTypography(): TypographyPreferences {
  try {
    return parseTypography(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

const preferencesAtom = atom<TypographyPreferences>(readTypography());

preferencesAtom.onMount = (setPreferences) => {
  if (typeof window === 'undefined') {
    return;
  }

  setPreferences(readTypography());
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY && event.key !== null) {
      return;
    }
    try {
      if (event.storageArea !== window.localStorage) {
        return;
      }
    } catch {
      return;
    }
    setPreferences(parseTypography(event.newValue));
  };

  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
};

export const typographyAtom = atom(
  (get) => get(preferencesAtom),
  (
    get,
    set,
    update: TypographyPreferences | ((previous: TypographyPreferences) => TypographyPreferences),
  ) => {
    const preferences = typeof update === 'function' ? update(get(preferencesAtom)) : update;
    set(preferencesAtom, preferences);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage can be blocked or full; the live preference must still update.
    }
  },
);

export function applyTypography(preferences: TypographyPreferences): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.fontFamily = preferences.fontFamily;
  document.documentElement.dataset.fontWeight = String(preferences.fontWeight);
}

export function initializeTypography(): void {
  const preferences = readTypography();
  getDefaultStore().set(preferencesAtom, preferences);
  applyTypography(preferences);
}
