import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import type { MessagesViewContextValue } from '~/Providers/MessagesViewContext';
import { MessagesViewContext } from '~/Providers/MessagesViewContext';

type MockScrollToBottom = jest.Mock & {
  cancel: jest.Mock;
  flush: jest.Mock;
};

const mockScrollToBottom = jest.fn() as MockScrollToBottom;
mockScrollToBottom.cancel = jest.fn();
mockScrollToBottom.flush = jest.fn();
const mockHandleSmoothToRef = jest.fn();
let mockScrollCallback: (() => void) | undefined;

jest.mock('~/hooks/useScrollToRef', () => ({
  __esModule: true,
  default: ({ callback }: { callback: () => void }) => {
    mockScrollCallback = callback;
    return {
      scrollToRef: mockScrollToBottom,
      handleSmoothToRef: mockHandleSmoothToRef,
    };
  },
}));

jest.mock('../messageLayout', () => ({
  reconcileMessageContentLayout: jest.fn(),
}));

import useMessageScrolling from '../useMessageScrolling';
import { reconcileMessageContentLayout } from '../messageLayout';

const mockReconcileMessageContentLayout = reconcileMessageContentLayout as jest.Mock;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  static reset() {
    MockResizeObserver.instances = [];
  }

  static last(): MockResizeObserver | undefined {
    return MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
  }

  readonly callback: ResizeObserverCallback;
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this);
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  static reset() {
    MockIntersectionObserver.instances = [];
  }

  readonly callback: IntersectionObserverCallback;
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0.85];
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(target: Element, isIntersecting: boolean) {
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: performance.now(),
        },
      ],
      this,
    );
  }
}

const originalResizeObserver = global.ResizeObserver;
const originalIntersectionObserver = global.IntersectionObserver;

function setRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  element.getBoundingClientRect = jest.fn(
    () =>
      ({
        x: rect.x ?? 0,
        y: rect.y ?? 0,
        top: rect.top ?? 0,
        left: rect.left ?? 0,
        right: rect.right ?? 0,
        bottom: rect.bottom ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

const message = {
  messageId: 'message-1',
  conversationId: conversation.conversationId,
  isCreatedByUser: false,
} as TMessage;

function createContextValue(
  overrides: Partial<MessagesViewContextValue> = {},
): MessagesViewContextValue {
  return {
    conversation,
    conversationId: conversation.conversationId,
    isSubmitting: true,
    abortScroll: false,
    setAbortScroll: jest.fn(),
    ask: jest.fn(),
    regenerate: jest.fn(),
    handleContinue: jest.fn(),
    index: 0,
    latestMessageId: message.messageId,
    latestMessageDepth: 0,
    getMessages: jest.fn(),
    setMessages: jest.fn(),
    ...overrides,
  } as MessagesViewContextValue;
}

function ScrollingHarness({ messagesTree }: { messagesTree?: TMessage[] | null }) {
  const {
    contentRef,
    scrollableRef,
    messagesEndRef,
    debouncedHandleScroll,
    handleScrollToBottom,
    showScrollButton,
  } = useMessageScrolling(messagesTree);

  return (
    <>
      <div ref={scrollableRef} onScroll={debouncedHandleScroll} data-testid="scrollable">
        <div ref={contentRef} data-testid="content">
          <div ref={messagesEndRef} data-testid="end" />
        </div>
      </div>
      <button
        type="button"
        aria-label="Scroll to bottom"
        onClick={handleScrollToBottom}
        data-testid="scroll-button"
      />
      <output data-testid="show-scroll-button">{String(showScrollButton)}</output>
    </>
  );
}

function renderScrolling({
  contextOverrides,
  messagesTree,
}: {
  contextOverrides?: Partial<MessagesViewContextValue>;
  messagesTree?: TMessage[] | null;
} = {}) {
  return render(
    <RecoilRoot>
      <MessagesViewContext.Provider value={createContextValue(contextOverrides)}>
        <ScrollingHarness messagesTree={messagesTree} />
      </MessagesViewContext.Provider>
    </RecoilRoot>,
  );
}

describe('useMessageScrolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockResizeObserver.reset();
    MockIntersectionObserver.reset();
    mockScrollToBottom.mockClear();
    mockScrollToBottom.cancel.mockClear();
    mockScrollToBottom.flush.mockClear();
    mockHandleSmoothToRef.mockClear();
    mockReconcileMessageContentLayout.mockClear();
    mockScrollCallback = undefined;
    global.ResizeObserver = MockResizeObserver;
    global.IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
    global.IntersectionObserver = originalIntersectionObserver;
    jest.useRealTimers();
  });

  it('scrolls only the current container instantly and reconciles layout without smooth scrolling', () => {
    const setAbortScroll = jest.fn();
    renderScrolling({ contextOverrides: { abortScroll: true, setAbortScroll } });
    const scrollable = screen.getByTestId('scrollable');
    scrollable.scrollTo = jest.fn();
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });

    fireEvent.click(screen.getByTestId('scroll-button'));

    expect(scrollable.scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollable.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'instant' });
    expect(mockReconcileMessageContentLayout).toHaveBeenCalledWith(scrollable);
    expect(mockReconcileMessageContentLayout.mock.invocationCallOrder[0]).toBeGreaterThan(
      jest.mocked(scrollable.scrollTo).mock.invocationCallOrder[0],
    );
    expect(setAbortScroll).toHaveBeenCalledWith(false);
    expect(mockHandleSmoothToRef).not.toHaveBeenCalled();
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('reuses one intersection observer across repeated scroll events and disconnects on unmount', () => {
    const { unmount } = renderScrolling();
    const scrollable = screen.getByTestId('scrollable');
    const end = screen.getByTestId('end');
    const observer = MockIntersectionObserver.instances[0];

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(end);

    for (let i = 0; i < 300; i++) {
      fireEvent.scroll(scrollable);
    }

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    expect(observer.disconnect).not.toHaveBeenCalled();

    act(() => {
      observer.trigger(end, false);
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('show-scroll-button')).toHaveTextContent('true');

    act(() => {
      observer.trigger(end, true);
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('show-scroll-button')).toHaveTextContent('false');

    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('cancels pending observer visibility updates on unmount', () => {
    const { unmount } = renderScrolling();
    const observer = MockIntersectionObserver.instances[0];
    const timerCount = jest.getTimerCount();

    act(() => observer.trigger(screen.getByTestId('end'), false));
    expect(jest.getTimerCount()).toBe(timerCount + 1);

    unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(timerCount);
  });

  it('hides immediately and cancels a pending visibility debounce', () => {
    renderScrolling();
    screen.getByTestId('scrollable').scrollTo = jest.fn();
    const observer = MockIntersectionObserver.instances[0];
    const end = screen.getByTestId('end');

    act(() => {
      observer.trigger(end, false);
      jest.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('show-scroll-button')).toHaveTextContent('true');

    act(() => observer.trigger(end, false));
    fireEvent.click(screen.getByTestId('scroll-button'));

    expect(screen.getByTestId('show-scroll-button')).toHaveTextContent('false');
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByTestId('show-scroll-button')).toHaveTextContent('false');
  });

  it('resumes streaming resize follow after aborting, scrolling away, and interacting with content', () => {
    function StreamingHarness() {
      const [abortScroll, setAbortScroll] = React.useState(true);
      return (
        <MessagesViewContext.Provider value={createContextValue({ abortScroll, setAbortScroll })}>
          <ScrollingHarness />
        </MessagesViewContext.Provider>
      );
    }

    render(
      <RecoilRoot>
        <StreamingHarness />
      </RecoilRoot>,
    );
    const scrollable = screen.getByTestId('scrollable');
    scrollable.scrollTo = jest.fn();
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 100;
    fireEvent.scroll(scrollable);
    act(() => MockResizeObserver.last()?.trigger());
    expect(mockScrollToBottom).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTestId('content'));
    fireEvent.click(screen.getByTestId('scroll-button'));
    expect(mockScrollToBottom).not.toHaveBeenCalled();

    act(() => MockResizeObserver.last()?.trigger());
    expect(mockScrollToBottom).toHaveBeenCalledTimes(1);
    act(() => MockResizeObserver.last()?.trigger());
    expect(mockScrollToBottom).toHaveBeenCalledTimes(2);
  });

  it('handles repeated clicks immediately using the latest height without throttling', () => {
    renderScrolling();
    const scrollable = screen.getByTestId('scrollable');
    scrollable.scrollTo = jest.fn();
    const button = screen.getByTestId('scroll-button');

    for (const height of [1000, 1200, 1400]) {
      Object.defineProperty(scrollable, 'scrollHeight', { value: height, configurable: true });
      fireEvent.click(button);
      expect(scrollable.scrollTo).toHaveBeenLastCalledWith({ top: height, behavior: 'instant' });
    }

    expect(scrollable.scrollTo).toHaveBeenCalledTimes(3);
    act(() => jest.advanceTimersByTime(1000));
    expect(scrollable.scrollTo).toHaveBeenCalledTimes(3);
    expect(mockHandleSmoothToRef).not.toHaveBeenCalled();
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('keeps explicit scrolling and abort state scoped to the clicked chat view', () => {
    const firstContext = createContextValue({ abortScroll: true });
    const secondContext = createContextValue({ abortScroll: true, index: 1 });
    render(
      <RecoilRoot>
        <MessagesViewContext.Provider value={firstContext}>
          <ScrollingHarness />
        </MessagesViewContext.Provider>
        <MessagesViewContext.Provider value={secondContext}>
          <ScrollingHarness />
        </MessagesViewContext.Provider>
      </RecoilRoot>,
    );
    const [firstScrollable, secondScrollable] = screen.getAllByTestId('scrollable');
    firstScrollable.scrollTo = jest.fn();
    secondScrollable.scrollTo = jest.fn();
    Object.defineProperty(firstScrollable, 'scrollHeight', { value: 1000 });
    Object.defineProperty(secondScrollable, 'scrollHeight', { value: 2000 });

    fireEvent.click(screen.getAllByTestId('scroll-button')[1]);

    expect(secondScrollable.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'instant' });
    expect(secondContext.setAbortScroll).toHaveBeenCalledWith(false);
    expect(firstScrollable.scrollTo).not.toHaveBeenCalled();
    expect(firstContext.setAbortScroll).not.toHaveBeenCalled();
    expect(mockReconcileMessageContentLayout).toHaveBeenCalledTimes(1);
    expect(mockReconcileMessageContentLayout).toHaveBeenCalledWith(secondScrollable);
    expect(mockScrollToBottom).not.toHaveBeenCalled();
    expect(mockHandleSmoothToRef).not.toHaveBeenCalled();
  });

  it('scrolls to the bottom when streaming content resizes and auto-scroll is active', () => {
    renderScrolling();

    const observer = MockResizeObserver.last();
    expect(observer?.observe).toHaveBeenCalledWith(screen.getByTestId('content'));

    act(() => {
      observer?.trigger();
    });

    expect(mockScrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('reconciles message layout after an explicit scroll to bottom', () => {
    renderScrolling();

    const scrollable = screen.getByTestId('scrollable');
    act(() => {
      mockScrollCallback?.();
    });

    expect(mockReconcileMessageContentLayout).toHaveBeenCalledWith(scrollable);
  });

  it('does not follow resizes after the user aborts streaming auto-scroll', () => {
    renderScrolling({ contextOverrides: { abortScroll: true } });

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('does not follow resizes after the user scrolls away from the bottom', () => {
    renderScrolling();

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 100;

    fireEvent.scroll(scrollable);

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('resumes resize follow when scrolling back near the bottom without a new intersection', () => {
    renderScrolling();
    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });

    scrollable.scrollTop = 100;
    fireEvent.scroll(scrollable);
    act(() => MockResizeObserver.last()?.trigger());
    expect(mockScrollToBottom).not.toHaveBeenCalled();

    scrollable.scrollTop = 700;
    fireEvent.scroll(scrollable);
    act(() => MockResizeObserver.last()?.trigger());

    expect(mockScrollToBottom).toHaveBeenCalledTimes(1);
    expect(MockIntersectionObserver.instances).toHaveLength(1);
  });

  it('does not follow the next resize after user interaction inside message content', () => {
    renderScrolling();

    fireEvent.pointerDown(screen.getByTestId('content'));

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('clamps the scroll position back to content after a resize shrink', () => {
    renderScrolling({ contextOverrides: { abortScroll: true } });

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 450;

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(scrollable.scrollTop).toBe(300);
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('does not clamp to rendered content bottom during general resize reconciliation', () => {
    renderScrolling({ contextOverrides: { abortScroll: true } });

    const scrollable = screen.getByTestId('scrollable');
    const content = screen.getByTestId('content');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 700;
    setRect(scrollable, { top: 0, bottom: 200, height: 200 });
    setRect(content, { top: -700, bottom: -200, height: 500 });

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(scrollable.scrollTop).toBe(700);
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });
});
