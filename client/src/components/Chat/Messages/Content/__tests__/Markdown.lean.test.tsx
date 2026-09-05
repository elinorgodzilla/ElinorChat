import React from 'react';
import { RecoilRoot } from 'recoil';
import copy from 'copy-to-clipboard';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchContext } from '~/Providers';
import Markdown from '../Markdown';
import MarkdownLite from '../MarkdownLite';

jest.mock('copy-to-clipboard', () => jest.fn());

const renderMarkdown = (content: string, lite: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecoilRoot>
        {lite ? (
          <MarkdownLite content={content} />
        ) : (
          <Markdown content={content} isLatestMessage={false} />
        )}
      </RecoilRoot>
    </QueryClientProvider>,
  );

beforeEach(() => {
  window.IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
    takeRecords: () => [],
    root: null,
    rootMargin: '',
    thresholds: [],
  }));
});

it('preserves web citations through the real Markdown pipeline', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecoilRoot>
        <SearchContext.Provider
          value={{
            searchResults: {
              '0': {
                organic: [
                  {
                    link: 'https://example.com/source',
                    title: 'Saved source',
                    attribution: 'example.com',
                  },
                ],
              },
            },
          }}
        >
          <Markdown
            content={'Saved answer \uE200cite\uE202turn0search0\uE201'}
            isLatestMessage={false}
          />
        </SearchContext.Provider>
      </RecoilRoot>
    </QueryClientProvider>,
  );
  expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
    'href',
    'https://example.com/source',
  );
});

describe.each([false, true])('lean Markdown (lite=%s)', (lite) => {
  it('preserves text, links, images, tables and math', () => {
    const { container } = renderMarkdown(
      '# Heading\n\n**Readable** with `inline` code and [docs](https://example.com).\n\n' +
        '![Photo](/images/photo.png)\n\n| A | B |\n| - | - |\n| one | two |\n\n$$x^2$$',
      lite,
    );
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByText('Readable').tagName).toBe('STRONG');
    expect(screen.getByText('inline').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.getByRole('img', { name: 'Photo' }).getAttribute('src')).toMatch(
      /\/images\/photo.png$/,
    );
    expect(screen.getByRole('table').parentElement).toHaveClass(
      'markdown-table-wrapper',
      'w-full',
      'max-w-full',
    );
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('renders highlighted code with copy controls but no execution controls', () => {
    const { container } = renderMarkdown('```python\nprint("hello")\n```', lite);
    expect(container.querySelector('code.language-python')).toHaveTextContent('print("hello")');
    expect(container.querySelector('.hljs-string')).not.toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName(/copy/i);
    expect(buttons[1]).toHaveAttribute('tabindex', '-1');
    fireEvent.click(buttons[0]);
    expect(copy).toHaveBeenCalledWith('print("hello")', { format: 'text/plain' });
    expect(screen.queryByRole('button', { name: /run|execute|next|previous/i })).toBeNull();
  });

  it('keeps historical artifact source readable without mounting an editor or preview', () => {
    const content =
      'Before\n\n:::artifact{identifier="old" type="text/html" title="Old"}\n```html\n<h1>Saved source</h1>\n```\n:::\n\nAfter';
    const { container } = renderMarkdown(content, lite);
    expect(container.querySelector('code.language-html')).toHaveTextContent(
      '<h1>Saved source</h1>',
    );
    expect(container).toHaveTextContent('Before');
    expect(container).toHaveTextContent('After');
    expect(container.querySelector('iframe, .monaco-editor, .sp-wrapper, artifact')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Saved source' })).toBeNull();
  });

  it('leaves old MCP markers as text rather than interactive resources', () => {
    const marker = '\\ui{oldresource}';
    const { container } = renderMarkdown(`Saved weather summary ${marker}`, lite);
    expect(container).toHaveTextContent(`Saved weather summary ${marker}`);
    expect(container.querySelector('iframe, mcp-ui-resource, mcp-ui-carousel')).toBeNull();
  });
});
