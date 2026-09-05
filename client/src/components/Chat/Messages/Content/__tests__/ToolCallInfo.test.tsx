import React from 'react';
import { Tools } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import ToolCallInfo from '../ToolCallInfo';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useExpandCollapse: () => ({ style: {}, ref: { current: null } }),
}));

const attachment = (resources: UIResource[]): TAttachment => ({
  type: Tools.ui_resources,
  messageId: 'message',
  toolCallId: 'tool',
  conversationId: 'conversation',
  [Tools.ui_resources]: resources,
});

describe('ToolCallInfo', () => {
  it('preserves output and expandable parameters', () => {
    render(<ToolCallInfo input='{"query":"weather"}' output="Saved forecast" />);
    expect(screen.getByText('Saved forecast')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'com_ui_parameters' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('weather')).toBeInTheDocument();
  });

  it.each(['', '{}', '  '])('omits empty parameters: %s', (input) => {
    render(<ToolCallInfo input={input} output="Saved output" />);
    expect(screen.queryByRole('button', { name: 'com_ui_parameters' })).toBeNull();
    expect(screen.getByText('Saved output')).toBeInTheDocument();
  });

  it('renders old UI resources as escaped text with URI fallback, never as HTML', () => {
    const resources: UIResource[] = [
      {
        resourceId: 'saved',
        uri: 'ui://saved',
        mimeType: 'text/html',
        text: '<h1>Saved forecast</h1>',
      },
      { resourceId: 'binary', uri: 'ui://binary', mimeType: 'text/html', blob: 'YQ==' },
    ];
    const { container } = render(<ToolCallInfo input="" attachments={[attachment(resources)]} />);
    expect(screen.getByText('<h1>Saved forecast</h1>').tagName).toBe('PRE');
    expect(screen.getByText('ui://binary')).toBeInTheDocument();
    expect(container.querySelector('iframe, h1')).toBeNull();
  });

  it.each([undefined, []])('handles absent UI resources: %s', (attachments) => {
    render(<ToolCallInfo input="" output="Saved output" attachments={attachments} />);
    expect(screen.getByText('Saved output')).toBeInTheDocument();
  });

  it('preserves plain-text parameters', () => {
    render(<ToolCallInfo input="old tool input" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('old tool input').tagName).toBe('PRE');
  });
});
