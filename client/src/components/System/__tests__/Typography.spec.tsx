import React from 'react';
import { Provider, createStore } from 'jotai';
import { act, render } from '@testing-library/react';
import { DEFAULT_TYPOGRAPHY, initializeTypography, typographyAtom } from '~/store/typography';
import Typography from '../Typography';

describe('Typography live document sync', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-font-family');
    document.documentElement.removeAttribute('data-font-weight');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-font-family');
    document.documentElement.removeAttribute('data-font-weight');
    document.documentElement.removeAttribute('style');
  });

  it('applies defaults without router, auth, or settings providers', () => {
    render(
      <Provider store={createStore()}>
        <Typography />
      </Provider>,
    );

    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '300');
    expect(document.documentElement).not.toHaveAttribute('style');
  });

  it('preserves bootstrapped settings in the default app store', () => {
    localStorage.setItem('typography', JSON.stringify({ fontFamily: 'system', fontWeight: 400 }));
    initializeTypography();
    expect(document.documentElement).toHaveAttribute('data-font-family', 'system');
    render(<Typography />);

    expect(document.documentElement).toHaveAttribute('data-font-family', 'system');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '400');
  });

  it('updates attributes live, survives theme style resets, and can return to defaults', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Typography />
      </Provider>,
    );
    document.documentElement.style.setProperty('--theme-test', 'blue');

    act(() => store.set(typographyAtom, { fontFamily: 'inter', fontWeight: 500 }));
    expect(document.documentElement).toHaveAttribute('data-font-family', 'inter');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '500');
    expect(document.documentElement.style.getPropertyValue('--theme-test')).toBe('blue');
    expect(document.documentElement.style.fontFamily).toBe('');
    expect(document.documentElement.style.fontWeight).toBe('');

    document.documentElement.removeAttribute('style');
    expect(document.documentElement).toHaveAttribute('data-font-family', 'inter');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '500');
    act(() => store.set(typographyAtom, (previous) => ({ ...previous, fontWeight: 400 })));
    expect(document.documentElement).toHaveAttribute('data-font-family', 'inter');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '400');

    act(() => store.set(typographyAtom, DEFAULT_TYPOGRAPHY));
    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '300');
  });

  it('still updates attributes when persistence fails', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Typography />
      </Provider>,
    );
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    act(() => store.set(typographyAtom, { fontFamily: 'source-sans-3', fontWeight: 500 }));
    expect(document.documentElement).toHaveAttribute('data-font-family', 'source-sans-3');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '500');
  });

  it.each(['typography', null])('syncs cross-tab updates and clearing (key: %s)', (key) => {
    const store = createStore();
    render(
      <Provider store={store}>
        <Typography />
      </Provider>,
    );
    const newValue = JSON.stringify({ fontFamily: 'jost', fontWeight: 400 });

    act(() => {
      localStorage.setItem('typography', newValue);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'typography',
          newValue,
          storageArea: localStorage,
        }),
      );
    });
    expect(document.documentElement).toHaveAttribute('data-font-family', 'jost');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '400');

    act(() => {
      if (key === null) {
        localStorage.clear();
      } else {
        localStorage.removeItem(key);
      }
      window.dispatchEvent(
        new StorageEvent('storage', { key, newValue: null, storageArea: localStorage }),
      );
    });
    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '300');
  });

  it('cleans up storage listeners on unmount, including StrictMode remounts', () => {
    const store = createStore();
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <React.StrictMode>
        <Provider store={store}>
          <Typography />
        </Provider>
      </React.StrictMode>,
    );
    unmount();

    const listeners = add.mock.calls.filter(([event]) => event === 'storage');
    expect(listeners.length).toBeGreaterThan(0);
    expect(remove.mock.calls.filter(([event]) => event === 'storage')).toHaveLength(
      listeners.length,
    );
    for (const [, listener] of listeners) {
      expect(remove).toHaveBeenCalledWith('storage', listener);
    }

    act(() => store.set(typographyAtom, { fontFamily: 'inter', fontWeight: 500 }));
    expect(document.documentElement).toHaveAttribute('data-font-family', 'readex-pro');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '300');
  });
});
