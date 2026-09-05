import { RecoilRoot, useRecoilState } from 'recoil';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen } from 'test/layout-test-utils';
import type { ComponentProps } from 'react';
import translationEn from '~/locales/en/translation.json';
import { ChatContext } from '~/Providers/ChatContext';
import { changeLanguageSafely } from '~/locales/i18n';
import MessagesView from '../MessagesView';
import store from '~/store';

const originalIntersectionObserver = global.IntersectionObserver;

class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0.85];
  private targets = new Set<Element>();

  constructor(private callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  intersect(target: Element, isIntersecting: boolean) {
    if (!this.targets.has(target)) {
      return;
    }
    const rect = target.getBoundingClientRect();
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: Number(isIntersecting),
          time: 0,
          boundingClientRect: rect,
          intersectionRect: rect,
          rootBounds: null,
        },
      ],
      this,
    );
  }
}

function PreferenceToggle() {
  const [enabled, setEnabled] = useRecoilState(store.showScrollButton);
  return (
    <input
      type="checkbox"
      aria-label="Scroll button preference"
      checked={enabled}
      onChange={(event) => setEnabled(event.target.checked)}
    />
  );
}

function renderMessagesView(preference = true) {
  const setAbortScroll = jest.fn();
  const chatContext: ComponentProps<typeof ChatContext.Provider>['value'] = {
    index: 0,
    conversation: null,
    isSubmitting: false,
    abortScroll: true,
    setAbortScroll,
    latestMessageId: undefined,
    latestMessageDepth: undefined,
    getMessages: () => [],
    setMessages: jest.fn(),
    ask: jest.fn(),
    regenerate: jest.fn(),
    handleContinue: jest.fn(),
    newConversation: jest.fn(),
    setConversation: jest.fn(),
    setIsSubmitting: jest.fn(),
    setSiblingIdx: jest.fn(),
    stopGenerating: jest.fn(),
    handleStopGenerating: jest.fn(),
    handleRegenerate: jest.fn(),
    showPopover: false,
    setShowPopover: jest.fn(),
    preset: null,
    setPreset: jest.fn(),
    optionSettings: {},
    setOptionSettings: jest.fn(),
    files: new Map(),
    setFiles: jest.fn(),
    filesLoading: false,
    setFilesLoading: jest.fn(),
  };
  const result = render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.showScrollButton, preference);
        set(store.autoScroll, false);
      }}
    >
      <ChatContext.Provider value={chatContext}>
        <PreferenceToggle />
        <MessagesView messagesTree={[]} />
      </ChatContext.Provider>
    </RecoilRoot>,
  );
  const end = result.container.querySelector<HTMLDivElement>('#messages-end')!;
  const viewport = result.container.querySelector<HTMLDivElement>('.chat-messages-viewport')!;
  const scrollTo = jest.fn();
  const scrollIntoView = jest.fn();
  viewport.scrollTo = scrollTo;
  end.scrollIntoView = scrollIntoView;
  Object.defineProperty(viewport, 'scrollHeight', { value: 2400, configurable: true });

  function setBottomVisible(visible: boolean) {
    act(() => {
      for (const observer of TestIntersectionObserver.instances) {
        observer.intersect(end, visible);
      }
      jest.advanceTimersByTime(150);
    });
  }

  return { ...result, setBottomVisible, scrollTo, scrollIntoView, setAbortScroll };
}

describe('MessagesView scroll button', () => {
  beforeEach(async () => {
    await changeLanguageSafely('en');
    jest.useFakeTimers();
    TestIntersectionObserver.instances = [];
    global.IntersectionObserver = TestIntersectionObserver;
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    global.IntersectionObserver = originalIntersectionObserver;
  });

  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, true],
    [true, true, false],
  ])(
    'preference=%s and bottomVisible=%s yields button=%s',
    (preference, bottomVisible, expected) => {
      const { setBottomVisible } = renderMessagesView(preference);
      setBottomVisible(bottomVisible);

      expect(
        screen.queryAllByRole('button', {
          name: translationEn.com_ui_scroll_to_bottom,
          hidden: true,
        }),
      ).toHaveLength(Number(expected));
    },
  );

  it('keeps the viewport sibling structure stable when scroll controls appear and disappear', () => {
    const { container, setBottomVisible } = renderMessagesView();
    const viewport = container.querySelector('.chat-messages-viewport');
    const slot = container.querySelector('.chat-scroll-button-slot');
    const parent = viewport?.parentElement;
    expect(slot).toBeInTheDocument();
    expect(slot?.parentElement).toBe(parent);
    const siblings = Array.from(parent?.children ?? []);

    for (let i = 0; i < 5; i++) {
      setBottomVisible(false);
      const button = screen.getByRole('button', { name: translationEn.com_ui_scroll_to_bottom });
      expect(slot).toContainElement(button);
      expect(Array.from(parent?.children ?? [])).toEqual(siblings);

      setBottomVisible(true);
      expect(button).not.toBeInTheDocument();
      expect(slot).toBeEmptyDOMElement();
      expect(Array.from(parent?.children ?? [])).toEqual(siblings);
    }
  });

  it('responds to preference changes and unmounts when the bottom becomes visible', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { setBottomVisible } = renderMessagesView();
    setBottomVisible(false);
    const button = screen.getByRole('button', { name: translationEn.com_ui_scroll_to_bottom });
    expect(button).toBeVisible();

    await user.click(screen.getByRole('checkbox'));
    expect(button).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    const restoredButton = screen.getByRole('button', {
      name: translationEn.com_ui_scroll_to_bottom,
    });

    setBottomVisible(true);
    expect(restoredButton).not.toBeInTheDocument();
  });

  it('clicks through to the instant viewport handler and immediately removes the button', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { setBottomVisible, scrollTo, scrollIntoView, setAbortScroll } = renderMessagesView();
    setBottomVisible(false);
    const button = screen.getByRole('button', { name: translationEn.com_ui_scroll_to_bottom });

    await user.click(button);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 2400, behavior: 'instant' });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(setAbortScroll).toHaveBeenCalledWith(false);
    expect(button).not.toBeInTheDocument();
  });
});
