import React from 'react';
import axios from 'axios';
import userEvent from '@testing-library/user-event';
import { QueryKeys, Tools } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ToolCallResponse } from 'librechat-data-provider';
import { act, fireEvent, render, screen, waitFor, within } from 'test/layout-test-utils';
import { MessageContext, ToolCallsMapProvider } from '~/Providers';
import FloatingCodeBar from '../FloatingCodeBar';
import CodeBlock from '../CodeBlock';
import RunCode from '../RunCode';

const code = 'print("hello")';
const conversationId = 'code-controls-conversation';
const messageId = 'code-controls-message';

function renderCode(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData([QueryKeys.toolCalls, conversationId], []);
  const wrap = (children: React.ReactElement) => (
    <QueryClientProvider client={client}>
      <MessageContext.Provider
        value={{ messageId, conversationId, partIndex: 0, isExpanded: true }}
      >
        <ToolCallsMapProvider conversationId={conversationId}>{children}</ToolCallsMapProvider>
      </MessageContext.Provider>
    </QueryClientProvider>
  );
  const result = render(wrap(ui));
  return {
    ...result,
    client,
    rerender: (children: React.ReactElement) => result.rerender(wrap(children)),
  };
}

describe('code control mounting', () => {
  let setHeaderVisible: (visible: boolean) => void;
  const execCommand = jest.fn(() => true);

  beforeEach(() => {
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: jest.fn((callback: IntersectionObserverCallback) => {
        const observer = {
          root: null,
          rootMargin: '0px',
          thresholds: [0],
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn(),
          takeRecords: () => [],
        };
        setHeaderVisible = (visible) => {
          act(() => callback([{ isIntersecting: visible } as IntersectionObserverEntry], observer));
        };
        return observer;
      }),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'execCommand');
    Reflect.deleteProperty(window, 'IntersectionObserver');
  });

  it.each([false, true])(
    'mounts a spinner only during execution (iconOnly=%s)',
    async (iconOnly) => {
      const pending = Promise.withResolvers<ToolCallResponse>();
      const post = jest
        .spyOn(axios, 'post')
        .mockReturnValue(pending.promise.then((data) => ({ data })));
      const codeRef = { current: document.createElement('code') };
      codeRef.current.textContent = code;
      const { container, client } = renderCode(
        <RunCode lang="python" codeRef={codeRef} blockIndex={0} iconOnly={iconOnly} />,
      );
      const run = screen.getByRole('button', { name: 'Run Code' });
      expect(container.querySelectorAll('.animate-spin')).toHaveLength(0);

      fireEvent.click(run);
      await waitFor(() => expect(run).toHaveAttribute('aria-busy', 'true'));
      expect(run).toBeDisabled();
      expect(container.querySelectorAll('.animate-spin')).toHaveLength(1);
      expect(post).toHaveBeenCalledWith(
        expect.stringContaining(`/tools/${Tools.execute_code}/call`),
        expect.any(String),
        expect.any(Object),
      );
      expect(JSON.parse(post.mock.calls[0][1] as string)).toEqual(
        expect.objectContaining({ code, lang: 'py', messageId, conversationId }),
      );

      await act(async () => pending.resolve({ result: 'hello' }));
      await waitFor(() => expect(run).not.toHaveAttribute('aria-busy'));
      expect(run).toBeEnabled();
      expect(container.querySelectorAll('.animate-spin')).toHaveLength(0);
      expect(client.getQueryData([QueryKeys.toolCalls, conversationId])).toEqual([
        expect.objectContaining({ result: 'hello' }),
      ]);
    },
  );

  it('removes the spinner after a failed execution', async () => {
    const pending = Promise.withResolvers<ToolCallResponse>();
    jest.spyOn(axios, 'post').mockReturnValue(pending.promise.then((data) => ({ data })));
    const codeRef = { current: document.createElement('code') };
    codeRef.current.textContent = code;
    const { container } = renderCode(<RunCode lang="python" codeRef={codeRef} />);
    const run = screen.getByRole('button', { name: 'Run Code' });
    fireEvent.click(run);
    await waitFor(() => expect(run).toBeDisabled());
    await act(async () => pending.reject(new Error('External execution failed')));
    await waitFor(() => expect(run).toBeEnabled());
    expect(container.querySelectorAll('.animate-spin')).toHaveLength(0);
    expect(screen.getByText('Failed')).toHaveClass('opacity-100');
  });

  it('mounts no idle spinners or floating controls across 180 code blocks', () => {
    const { container } = renderCode(
      <>
        {Array.from({ length: 180 }, (_, blockIndex) => (
          <CodeBlock key={blockIndex} lang="python" blockIndex={blockIndex} codeChildren={code} />
        ))}
      </>,
    );
    expect(container.querySelectorAll('.animate-spin')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Run Code' })).toHaveLength(180);
    for (const block of container.children) {
      expect(block.children[2]).toBeEmptyDOMElement();
    }
  });

  it('keeps the floating wrapper and copy feedback while unmounting inactive controls', async () => {
    const codeRef = { current: document.createElement('code') };
    codeRef.current.textContent = `  ${code}\n`;
    const bar = (isVisible: boolean) => (
      <FloatingCodeBar lang="python" codeRef={codeRef} isVisible={isVisible} />
    );
    const { container, rerender } = renderCode(bar(false));
    const wrapper = container.firstElementChild;
    expect(wrapper).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(bar(true));
    expect(container.firstElementChild).toBe(wrapper);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    rerender(bar(false));
    expect(wrapper).toBeEmptyDOMElement();
    rerender(bar(true));
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument(), {
      timeout: 4000,
    });
  });

  it('reveals controls on hover or keyboard focus without changing code/result siblings', async () => {
    const user = userEvent.setup();
    const onUnmount = jest.fn();
    function CodeContent() {
      React.useEffect(() => onUnmount, []);
      return <span>{code.repeat(1000)}</span>;
    }
    const { container } = renderCode(
      <>
        <CodeBlock lang="python" blockIndex={0} codeChildren={<CodeContent />} />
        <button>{'Outside'}</button>
      </>,
    );
    const block = container.firstElementChild as HTMLElement;
    const children = Array.from(block.children);
    const wrapper = children[2] as HTMLElement;
    const content = block.querySelector('code');
    expect(wrapper).toBeEmptyDOMElement();
    expect(block.querySelectorAll('.animate-spin')).toHaveLength(0);
    fireEvent.mouseEnter(block);
    expect(wrapper).toBeEmptyDOMElement();
    fireEvent.mouseLeave(block);
    setHeaderVisible(false);
    expect(wrapper).toBeEmptyDOMElement();

    fireEvent.mouseEnter(block);
    expect(within(wrapper).getByRole('button', { name: 'Run Code' })).toBeInTheDocument();
    fireEvent.mouseLeave(block);
    expect(wrapper).toBeEmptyDOMElement();

    await user.tab();
    expect(screen.getAllByRole('button', { name: 'Run Code' })[0]).toHaveFocus();
    const floatingRun = within(wrapper).getByRole('button', { name: 'Run Code' });
    await user.tab();
    await user.tab();
    expect(floatingRun).toHaveFocus();
    fireEvent.mouseLeave(block);
    setHeaderVisible(true);
    expect(floatingRun).toHaveFocus();
    expect(wrapper).toHaveClass('opacity-100');
    await user.tab();
    const copy = within(wrapper).getByRole('button', { name: 'Copy' });
    expect(copy).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(within(wrapper).getByRole('button', { name: 'Copied!' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
    expect(wrapper).toBeEmptyDOMElement();
    expect(Array.from(block.children)).toEqual(children);
    expect(block.querySelector('code')).toBe(content);
    expect(onUnmount).not.toHaveBeenCalled();
  });

  it('keeps an in-flight floating execution and result history after controls hide', async () => {
    const pending = Promise.withResolvers<ToolCallResponse>();
    jest.spyOn(axios, 'post').mockReturnValue(pending.promise.then((data) => ({ data })));
    const { container, client } = renderCode(
      <CodeBlock lang="python" blockIndex={0} codeChildren={code} />,
    );
    act(() => {
      client.setQueryData(
        [QueryKeys.toolCalls, conversationId],
        [
          {
            toolId: Tools.execute_code,
            messageId,
            conversationId,
            partIndex: 0,
            blockIndex: 0,
            result: 'old result',
          },
        ],
      );
    });
    await screen.findByText('old result');
    const block = container.firstElementChild as HTMLElement;
    const content = block.querySelector('code');
    const output = screen.getByText('old result');
    const wrapper = block.children[2] as HTMLElement;
    setHeaderVisible(false);
    fireEvent.mouseEnter(block);
    fireEvent.click(within(wrapper).getByRole('button', { name: 'Run Code' }));
    await waitFor(() => expect(wrapper.querySelectorAll('.animate-spin')).toHaveLength(1));
    fireEvent.mouseLeave(block);
    expect(wrapper).toBeEmptyDOMElement();
    expect(screen.getByText('old result')).toBe(output);
    fireEvent.mouseEnter(block);
    expect(within(wrapper).getByRole('button', { name: 'Run Code' })).toBeDisabled();
    expect(wrapper.querySelectorAll('.animate-spin')).toHaveLength(1);
    fireEvent.mouseLeave(block);
    expect(wrapper).toBeEmptyDOMElement();
    await act(async () => pending.resolve({ result: 'new result' }));
    await screen.findByText('new result');
    fireEvent.click(screen.getByRole('button', { name: /previous result/i }));
    expect(screen.getByText('old result')).toBeInTheDocument();
    expect(block.querySelector('code')).toBe(content);
    expect(block.children[2]).toBe(wrapper);
  });
});
