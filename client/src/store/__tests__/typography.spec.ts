import { createStore, getDefaultStore } from 'jotai';
import type { TypographyPreferences } from '../typography';
import {
  FONT_FAMILIES,
  FONT_WEIGHTS,
  DEFAULT_TYPOGRAPHY,
  initializeTypography,
  typographyAtom,
} from '../typography';

const custom: TypographyPreferences = { fontFamily: 'jost', fontWeight: 500 };
const invalidValues = [
  '{broken',
  'null',
  '[]',
  '["jost",500]',
  '"jost"',
  '500',
  'true',
  '{}',
  '{"fontFamily":"jost"}',
  '{"fontWeight":400}',
  '{"fontFamily":"comic-sans","fontWeight":400}',
  '{"fontFamily":"inter","fontWeight":600}',
  '{"fontFamily":"inter","fontWeight":"300"}',
  '{"fontFamily":null,"fontWeight":null}',
];

describe('typography state and bootstrap', () => {
  let store: ReturnType<typeof createStore>;
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    store = createStore();
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    jest.restoreAllMocks();
    localStorage.clear();
    initializeTypography();
    document.documentElement.removeAttribute('data-font-family');
    document.documentElement.removeAttribute('data-font-weight');
  });

  function mount(): void {
    unsubscribe = store.sub(typographyAtom, () => {});
  }

  function storageEvent(value: string | null, key: string | null = 'typography'): void {
    if (key === null) {
      localStorage.clear();
    } else if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }),
    );
  }

  it('initializes defaults before mounting without writing storage', () => {
    const write = jest.spyOn(Storage.prototype, 'setItem');
    initializeTypography();

    expect(getDefaultStore().get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '300');
    expect(write).not.toHaveBeenCalled();
  });

  it.each(FONT_FAMILIES)('initializes saved %s preferences before mounting', (fontFamily) => {
    const preferences: TypographyPreferences = { fontFamily, fontWeight: 400 };
    localStorage.setItem('typography', JSON.stringify(preferences));
    initializeTypography();

    expect(getDefaultStore().get(typographyAtom)).toEqual(preferences);
    expect(document.documentElement).toHaveAttribute('data-font-family', fontFamily);
    expect(document.documentElement).toHaveAttribute('data-font-weight', '400');
    mount();
    expect(store.get(typographyAtom)).toEqual(preferences);
  });

  it.each(FONT_WEIGHTS)('loads weight %s', (fontWeight) => {
    const preferences: TypographyPreferences = { fontFamily: 'inter', fontWeight };
    localStorage.setItem('typography', JSON.stringify(preferences));
    mount();
    expect(store.get(typographyAtom)).toEqual(preferences);
  });

  it.each(invalidValues)('falls back for invalid saved JSON: %s', (value) => {
    localStorage.setItem('typography', value);
    initializeTypography();
    mount();

    expect(store.get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(getDefaultStore().get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '300');
  });

  it('persists full objects and functional updates without losing the other field', () => {
    mount();
    store.set(typographyAtom, custom);
    expect(localStorage.getItem('typography')).toBe(JSON.stringify(custom));

    store.set(typographyAtom, (previous) => ({ ...previous, fontWeight: 300 }));
    store.set(typographyAtom, (previous) => ({ ...previous, fontFamily: 'source-sans-3' }));
    const updated: TypographyPreferences = { fontFamily: 'source-sans-3', fontWeight: 300 };
    expect(store.get(typographyAtom)).toEqual(updated);
    expect(localStorage.getItem('typography')).toBe(JSON.stringify(updated));

    unsubscribe?.();
    store = createStore();
    mount();
    expect(store.get(typographyAtom)).toEqual(updated);
  });

  it('falls back when reading storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(initializeTypography).not.toThrow();
    mount();
    expect(store.get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
  });

  it('keeps in-memory writes working when storage access is unavailable', () => {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(initializeTypography).not.toThrow();
    mount();
    expect(store.get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(() => store.set(typographyAtom, custom)).not.toThrow();
    expect(store.get(typographyAtom)).toEqual(custom);
    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
  });

  it('keeps in-memory and functional updates when storage writes fail', () => {
    mount();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(() => store.set(typographyAtom, custom)).not.toThrow();
    store.set(typographyAtom, (previous) => ({ ...previous, fontWeight: 400 }));
    expect(store.get(typographyAtom)).toEqual({ ...custom, fontWeight: 400 });
    expect(localStorage.getItem('typography')).toBeNull();
  });

  it('syncs cross-tab changes without echoing writes', () => {
    mount();
    localStorage.setItem('typography', JSON.stringify(custom));
    const write = jest.spyOn(Storage.prototype, 'setItem');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'typography',
        newValue: JSON.stringify(custom),
        storageArea: localStorage,
      }),
    );

    expect(store.get(typographyAtom)).toEqual(custom);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(invalidValues)('resets invalid cross-tab data: %s', (value) => {
    mount();
    store.set(typographyAtom, custom);
    storageEvent(value);
    expect(store.get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
  });

  it.each(['typography', null])('resets on cross-tab removal/clear (key: %s)', (key) => {
    mount();
    store.set(typographyAtom, custom);
    storageEvent(null, key);
    expect(store.get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(localStorage.getItem('typography')).toBeNull();
  });

  it('ignores other keys, session storage, and events without a storage area', () => {
    mount();
    store.set(typographyAtom, custom);
    storageEvent(null, 'fontSize');
    for (const storageArea of [sessionStorage, null]) {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'typography',
          newValue: null,
          storageArea,
        }),
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: null,
          newValue: null,
          storageArea,
        }),
      );
    }
    expect(store.get(typographyAtom)).toEqual(custom);
  });

  it('removes its listener after the last subscriber unmounts and refreshes on remount', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    mount();
    const listener = add.mock.calls.find(([event]) => event === 'storage')?.[1];
    expect(listener).toBeDefined();
    unsubscribe?.();
    expect(remove).toHaveBeenCalledWith('storage', listener);

    storageEvent(JSON.stringify(custom));
    expect(store.get(typographyAtom)).toEqual(DEFAULT_TYPOGRAPHY);
    mount();
    expect(store.get(typographyAtom)).toEqual(custom);
  });
});
