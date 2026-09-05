import React from 'react';
import { render, screen } from '@testing-library/react';
import { Tools, Constants, ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { ComponentProps } from 'react';
import type { TMessageContentParts } from 'librechat-data-provider';
import Part from '../Part';
import WebSearch from '../WebSearch';

jest.mock('../Parts', () => ({
  ImageGen: () => <div data-testid="image-gen" />,
  AgentUpdate: () => <div data-testid="agent-update" />,
  EmptyText: () => <div data-testid="empty-text" />,
  Reasoning: () => <div data-testid="reasoning" />,
  Summary: () => <div data-testid="summary" />,
  Text: ({ text }: { text?: string }) => <div data-testid="text">{text}</div>,
  SubagentCall: () => <div data-testid="subagent-call" />,
}));

jest.mock('../MessageContent', () => ({
  ErrorMessage: () => <div data-testid="error-message" />,
}));

jest.mock('../RetrievalCall', () => ({
  __esModule: true,
  default: () => <div data-testid="retrieval-call" />,
}));

jest.mock('../AgentHandoff', () => ({
  __esModule: true,
  default: () => <div data-testid="agent-handoff" />,
}));

jest.mock('../CodeAnalyze', () => ({
  __esModule: true,
  default: () => <div data-testid="code-analyze" />,
}));

jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../WebSearch', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="web-search" />),
}));

jest.mock('../ToolCall', () => ({
  __esModule: true,
  default: ({ name, args, output }: { name: string; args: string; output: string }) => (
    <div data-testid="tool-call">
      {name} {args} {output}
    </div>
  ),
}));

jest.mock('../Image', () => ({
  __esModule: true,
  default: () => <div data-testid="image" />,
}));

jest.mock('~/utils', () => ({
  getCachedPreview: jest.fn(),
}));

const renderPart = (part: TMessageContentParts, props: Partial<ComponentProps<typeof Part>> = {}) =>
  render(
    <Part part={part} isSubmitting={false} showCursor={false} isCreatedByUser={false} {...props} />,
  );

const toolCallPart = (name: string, args = '{"code":"echo hi"}'): TMessageContentParts => ({
  type: ContentTypes.TOOL_CALL,
  [ContentTypes.TOOL_CALL]: {
    type: ToolCallTypes.TOOL_CALL,
    id: 'call_1',
    name,
    args,
    output: 'hi',
    progress: 1,
  },
});

describe('Part tool renderer selection', () => {
  it.each([
    String(Constants.BASH_PROGRAMMATIC_TOOL_CALLING),
    String(Constants.PROGRAMMATIC_TOOL_CALLING),
    Tools.execute_code,
    Tools.bash_tool,
    'skill',
    'read_file',
    'create_file',
    'edit_file',
  ])('keeps historical %s input and output in a generic tool record', (name) => {
    renderPart(toolCallPart(name));
    expect(screen.getByTestId('tool-call')).toHaveTextContent(name);
    expect(screen.getByTestId('tool-call')).toHaveTextContent('{"code":"echo hi"} hi');
  });

  it('preserves web search attachments and expansion callbacks', () => {
    const attachments: NonNullable<ComponentProps<typeof Part>['attachments']> = [];
    const onToolExpand = jest.fn();
    renderPart(toolCallPart(Tools.web_search), { attachments, onToolExpand });
    expect(jest.mocked(WebSearch)).toHaveBeenCalledWith(
      expect.objectContaining({ attachments, onExpand: onToolExpand, output: 'hi' }),
      expect.anything(),
    );
  });

  it('keeps legacy code-interpreter input and logs readable as a generic record', () => {
    renderPart({
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'old-code',
        type: ToolCallTypes.CODE_INTERPRETER,
        code_interpreter: {
          input: 'print("saved")',
          outputs: [{ type: 'logs', logs: 'saved result' }],
        },
      },
    });
    expect(screen.getByTestId('tool-call')).toHaveTextContent('print("saved")');
    expect(screen.getByTestId('tool-call')).toHaveTextContent('saved result');
  });

  it.each(['image_gen_oai', 'image_edit_oai', 'gemini_image_gen'])(
    'preserves %s images',
    (name) => {
      renderPart(toolCallPart(name));
      expect(screen.getByTestId('image-gen')).toBeInTheDocument();
    },
  );
});
