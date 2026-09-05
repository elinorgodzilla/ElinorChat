import React from 'react';
import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TFile, TMessage } from 'librechat-data-provider';
import type { MessagesViewContextValue } from '~/Providers/MessagesViewContext';
import { MessagesViewContext } from '~/Providers/MessagesViewContext';
import MessageRender, { areMessageFilesEqual } from '../MessageRender';
import ContentRender from '~/components/Messages/ContentRender';
import { render, screen } from 'test/layout-test-utils';
import MessageParts from '../../MessageParts';
import store from '~/store';

const file = (overrides: Partial<TFile> = {}): TFile =>
  ({
    file_id: 'file-1',
    filename: 'sample.pdf',
    filepath: '/uploads/sample.pdf',
    type: 'application/pdf',
    bytes: 100,
    embedded: false,
    object: 'file',
    usage: 1,
    user: 'user-1',
    ...overrides,
  }) as TFile;

describe('areMessageFilesEqual', () => {
  it('detects when a raw message file is replaced by its hydrated file-map entry', () => {
    const rawFile = file({ filename: 'raw.pdf', preview: undefined });
    const hydratedFile = file({ filename: 'hydrated.pdf', preview: '/previews/sample.png' });

    expect(areMessageFilesEqual([rawFile], [hydratedFile])).toBe(false);
  });

  it('keeps equivalent file entries memoized when buildTree creates a new array', () => {
    const hydratedFile = file({ preview: '/previews/sample.png' });

    expect(areMessageFilesEqual([hydratedFile], [hydratedFile])).toBe(true);
  });

  it('detects attachment additions and removals', () => {
    const hydratedFile = file();

    expect(areMessageFilesEqual([], [hydratedFile])).toBe(false);
    expect(areMessageFilesEqual([hydratedFile], [])).toBe(false);
  });

  it('treats absent and empty file lists as equivalent', () => {
    expect(areMessageFilesEqual(undefined, [])).toBe(true);
  });
});

describe.each([
  { name: 'ContentRender', Renderer: ContentRender },
  { name: 'MessageRender', Renderer: MessageRender },
  { name: 'MessageParts', Renderer: MessageParts },
])('$name wrapper', ({ Renderer }) => {
  it.each([
    { maximize: false, parallel: false, width: 'md:max-w-[47rem] xl:max-w-[55rem]' },
    { maximize: false, parallel: true, width: 'md:max-w-[58rem] xl:max-w-[70rem]' },
    { maximize: true, parallel: false, width: 'w-full max-w-full md:px-5 lg:px-1 xl:px-5' },
    { maximize: true, parallel: true, width: 'w-full max-w-full md:px-5 lg:px-1 xl:px-5' },
  ])(
    'preserves layout without GPU/transition classes (maximize=$maximize, parallel=$parallel)',
    ({ maximize, parallel, width }) => {
      const client = new QueryClient({
        defaultOptions: { queries: { enabled: false, retry: false } },
      });
      const chatContext: MessagesViewContextValue = {
        ask: jest.fn(),
        index: 0,
        regenerate: jest.fn(),
        conversation: null,
        conversationId: null,
        latestMessageId: 'message-1',
        latestMessageDepth: 0,
        handleContinue: jest.fn(),
        isSubmitting: false,
        abortScroll: false,
        setAbortScroll: jest.fn(),
        getMessages: jest.fn(),
        setMessages: jest.fn(),
      };
      const message: TMessage = {
        messageId: 'message-1',
        conversationId: 'conversation-1',
        parentMessageId: null,
        sender: 'Assistant',
        text: 'Rendered response',
        isCreatedByUser: false,
        createdAt: '2026-09-05T12:00:00.000Z',
        content: [
          {
            type: ContentTypes.TEXT,
            text: 'Rendered response',
            ...(parallel ? { groupId: 1 } : {}),
          },
        ],
      };

      const { unmount } = render(
        <QueryClientProvider client={client}>
          <RecoilRoot initializeState={({ set }) => set(store.maximizeChatSpace, maximize)}>
            <MessagesViewContext.Provider value={chatContext}>
              <Renderer message={message} currentEditId={null} chatContext={chatContext} />
            </MessagesViewContext.Provider>
          </RecoilRoot>
        </QueryClientProvider>,
      );

      const wrapper = screen.getByText('Rendered response').closest('.message-render');
      expect(wrapper).toHaveAttribute('id', message.messageId);
      expect(wrapper).toHaveAttribute('aria-label');
      expect(wrapper).toHaveClass('group mx-auto flex flex-1 gap-3', width);
      expect(wrapper).toHaveClass(
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
      );
      expect(wrapper).not.toHaveClass('transform-gpu');
      expect(wrapper).not.toHaveClass('transition-all');
      expect(wrapper).not.toHaveClass('duration-300');
      expect(wrapper?.querySelector('.agent-turn')).toHaveClass(
        'relative flex flex-col',
        parallel ? 'w-full' : 'w-11/12',
      );
      expect(wrapper?.querySelector('h2 > time')?.className).toEqual(
        parallel ? undefined : expect.stringContaining('transition-opacity duration-200'),
      );
      unmount();
      client.clear();
    },
  );
});
