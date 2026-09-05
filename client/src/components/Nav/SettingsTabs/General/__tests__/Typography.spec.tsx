import { createInstance } from 'i18next';
import { Provider, createStore } from 'jotai';
import { I18nextProvider } from 'react-i18next';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, within, waitFor } from 'test/layout-test-utils';
import { FontFamilySetting, FontWeightSetting } from '../Typography';
import TypographySync from '~/components/System/Typography';
import { typographyAtom } from '~/store/typography';
import en from '~/locales/en/translation.json';

jest.unmock('react-i18next');

const i18n = createInstance();

async function renderSettings() {
  const store = createStore();
  const view = render(
    <I18nextProvider i18n={i18n}>
      <Provider store={store}>
        <TypographySync />
        <div className="font-medium">
          <FontFamilySetting />
          <FontWeightSetting />
        </div>
      </Provider>
    </I18nextProvider>,
  );
  await act(async () => {});
  return { ...view, store, user: userEvent.setup() };
}

describe('typography settings', () => {
  beforeAll(async () => {
    await i18n.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-font-family');
    document.documentElement.removeAttribute('data-font-weight');
  });

  it('defaults to Readex Pro Light and offers exactly the supported choices', async () => {
    const { user } = await renderSettings();
    const family = screen.getByRole('combobox', { name: 'Font Family' });
    const weight = screen.getByRole('combobox', { name: 'Base Font Weight' });
    expect(family).toHaveTextContent('Readex Pro');
    expect(weight).toHaveTextContent('Light (300)');

    await user.click(family);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Inter',
      'Source Sans 3',
      'System (Segoe UI on Windows)',
      'Jost',
      'Readex Pro',
    ]);
    expect(screen.getByRole('option', { name: 'Readex Pro' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    await user.click(weight);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Light (300)',
      'Regular (400)',
      'Medium (500)',
    ]);
    expect(screen.getByRole('option', { name: 'Light (300)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it.each([
    ['Inter', 'inter'],
    ['Source Sans 3', 'source-sans-3'],
    ['System (Segoe UI on Windows)', 'system'],
    ['Jost', 'jost'],
    ['Readex Pro', 'readex-pro'],
  ])('applies and persists %s immediately without changing weight', async (label, fontFamily) => {
    localStorage.setItem('typography', JSON.stringify({ fontFamily: 'system', fontWeight: 500 }));
    const { store, user } = await renderSettings();
    const family = screen.getByRole('combobox', { name: 'Font Family' });
    await user.click(family);
    await user.click(screen.getByRole('option', { name: label }));

    expect(family).toHaveTextContent(label);
    expect(store.get(typographyAtom)).toEqual({ fontFamily, fontWeight: 500 });
    expect(JSON.parse(localStorage.getItem('typography') ?? 'null')).toEqual({
      fontFamily,
      fontWeight: 500,
    });
    expect(document.documentElement).toHaveAttribute('data-font-family', fontFamily);
    expect(document.documentElement).toHaveAttribute('data-font-weight', '500');
    expect(screen.getByRole('combobox', { name: 'Base Font Weight' })).toHaveTextContent(
      'Medium (500)',
    );
  });

  it.each([
    ['Light (300)', 300],
    ['Regular (400)', 400],
    ['Medium (500)', 500],
  ])('applies and persists %s immediately without changing family', async (label, fontWeight) => {
    localStorage.setItem('typography', JSON.stringify({ fontFamily: 'jost', fontWeight: 400 }));
    const { store, user } = await renderSettings();
    const weight = screen.getByRole('combobox', { name: 'Base Font Weight' });
    await user.click(weight);
    await user.click(screen.getByRole('option', { name: label }));

    expect(weight).toHaveTextContent(label);
    expect(store.get(typographyAtom)).toEqual({ fontFamily: 'jost', fontWeight });
    expect(JSON.parse(localStorage.getItem('typography') ?? 'null')).toEqual({
      fontFamily: 'jost',
      fontWeight,
    });
    expect(document.documentElement).toHaveAttribute('data-font-family', 'jost');
    expect(document.documentElement).toHaveAttribute('data-font-weight', String(fontWeight));
    expect(screen.getByRole('combobox', { name: 'Font Family' })).toHaveTextContent('Jost');
  });

  it('supports keyboard selection and restores both preferences in a fresh provider', async () => {
    // JSDOM has no layout; Ariakit checks visibility before restoring focus.
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.closest('[hidden]') ? 0 : 30;
    });
    const { user, unmount } = await renderSettings();
    const family = screen.getByRole('combobox', { name: 'Font Family' });
    await user.tab();
    expect(family).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(family).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());
    await user.keyboard('{Home}');
    await user.keyboard('{Enter}');
    expect(family).toHaveTextContent('Inter');
    await waitFor(() => expect(family).toHaveFocus());

    await user.tab();
    const weight = screen.getByRole('combobox', { name: 'Base Font Weight' });
    expect(weight).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(weight).toHaveTextContent('Regular (400)');
    await waitFor(() => expect(weight).toHaveFocus());
    expect(document.documentElement).toHaveAttribute('data-font-family', 'inter');
    expect(document.documentElement).toHaveAttribute('data-font-weight', '400');

    unmount();
    const { store } = await renderSettings();
    expect(store.get(typographyAtom)).toEqual({ fontFamily: 'inter', fontWeight: 400 });
    expect(screen.getByRole('combobox', { name: 'Font Family' })).toHaveTextContent('Inter');
    expect(screen.getByRole('combobox', { name: 'Base Font Weight' })).toHaveTextContent(
      'Regular (400)',
    );
  });

  it('uses unique accessible labels across mounted instances', async () => {
    await renderSettings();
    await renderSettings();
    const controls = screen.getAllByRole('combobox');
    const labels = controls.map((control) => control.getAttribute('aria-labelledby'));
    expect(new Set(labels).size).toBe(4);
    expect(screen.getAllByRole('combobox', { name: 'Font Family' })).toHaveLength(2);
    expect(screen.getAllByRole('combobox', { name: 'Base Font Weight' })).toHaveLength(2);
  });

  it('shows localized help and a base-weight preview with semantic bold and italic text', async () => {
    await renderSettings();
    expect(screen.getByText(en.com_ui_typography_help)).toBeInTheDocument();
    const preview = screen.getByText(/^Preview: Everyday text with/);
    expect(preview).toHaveTextContent(
      'Preview: Everyday text with bold emphasis and an italic phrase.',
    );
    expect(within(preview).getByText('bold emphasis').tagName).toBe('STRONG');
    expect(within(preview).getByText('an italic phrase').tagName).toBe('EM');
    expect(preview.style.fontWeight).toBe('var(--app-font-weight)');
    expect(preview.style.fontFamily).toBe('var(--app-font-family)');
  });
});
