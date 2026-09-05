import { RecoilRoot } from 'recoil';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from 'test/layout-test-utils';
import type { FormEvent } from 'react';
import translationEn from '~/locales/en/translation.json';
import translationDe from '~/locales/de/translation.json';
import { changeLanguageSafely } from '~/locales/i18n';
import ScrollToBottom from '../ScrollToBottom';
import store from '~/store';

describe('ScrollToBottom', () => {
  beforeEach(async () => {
    await changeLanguageSafely('en');
  });

  afterEach(async () => {
    await changeLanguageSafely('en');
  });

  it.each([
    ['en', translationEn.com_ui_scroll_to_bottom],
    ['de', translationDe.com_ui_scroll_to_bottom],
  ])('renders a visible label and matching accessible name in %s', async (language, label) => {
    await changeLanguageSafely(language);
    render(<ScrollToBottom scrollHandler={jest.fn()} />);

    const button = screen.getByRole('button', { name: label });
    expect(within(button).getByText(label)).toBeVisible();
    expect(button).toHaveAttribute('aria-label', label);
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(['click', 'Enter', 'Space'])(
    '%s calls the handler once without submitting a form',
    async (activation) => {
      const user = userEvent.setup();
      const scrollHandler = jest.fn();
      const onSubmit = jest.fn((event: FormEvent) => event.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <ScrollToBottom scrollHandler={scrollHandler} />
        </form>,
      );

      const button = screen.getByRole('button', { name: translationEn.com_ui_scroll_to_bottom });
      expect(button.tagName).toBe('BUTTON');
      expect(button).toHaveAttribute('type', 'button');

      if (activation === 'click') {
        await user.click(button);
      } else {
        await user.tab();
        expect(button).toHaveFocus();
        await user.keyboard(activation === 'Enter' ? '{Enter}' : ' ');
      }

      expect(scrollHandler).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it.each([
    [false, 'md:max-w-3xl xl:max-w-4xl', 'max-w-full'],
    [true, 'max-w-full', 'md:max-w-3xl xl:max-w-4xl'],
  ])('uses the chat width when maximizeChatSpace is %s', (maximized, expected, excluded) => {
    render(
      <RecoilRoot initializeState={({ set }) => set(store.maximizeChatSpace, maximized)}>
        <ScrollToBottom scrollHandler={jest.fn()} />
      </RecoilRoot>,
    );

    const button = screen.getByRole('button', { name: translationEn.com_ui_scroll_to_bottom });
    expect(button).toHaveClass('chat-scroll-button', 'pointer-events-auto');
    expect(button.parentElement).toHaveClass('pointer-events-none', expected);
    expect(button.parentElement).not.toHaveClass(excluded);
  });
});
