import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import ContentParts from '../ContentParts';

jest.mock('~/utils', () => ({
  mapAttachments: () => ({}),
  groupSequentialToolCalls: (parts: Array<{ part: TMessageContentParts; idx: number }>) =>
    parts.map((part) => ({ type: 'single', part })),
}));
jest.mock('~/Providers', () => ({
  MessageContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
  SearchContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
}));
jest.mock('../Parts', () => ({
  EditTextPart: () => <div data-testid="edit" />,
  EmptyText: () => <div data-testid="empty" />,
}));
jest.mock('../MemoryArtifacts', () => ({ __esModule: true, default: () => null }));
jest.mock('../ToolCallGroup', () => ({ __esModule: true, default: () => null }));
jest.mock('../Container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../Part', () => ({
  __esModule: true,
  default: () => <div data-testid="part" />,
}));
jest.mock('../ParallelContent', () => ({
  ParallelContentRenderer: () => <div data-testid="parallel" />,
}));

const baseProps = {
  messageId: 'message',
  isLast: false,
  isSubmitting: false,
  isCreatedByUser: false,
  manualSkills: ['old-skill'],
};

describe('ContentParts without skill UI', () => {
  it('does not render pending skills when there is no content', () => {
    const { container } = render(<ContentParts {...baseProps} content={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([true, false])(
    'preserves sequential content (user=%s) without skill cards',
    (isCreatedByUser) => {
      render(
        <ContentParts
          {...baseProps}
          isCreatedByUser={isCreatedByUser}
          content={[{ type: ContentTypes.TEXT, text: 'Saved text' }]}
        />,
      );
      expect(screen.getByTestId('part')).toBeInTheDocument();
      expect(screen.queryByText('old-skill')).toBeNull();
    },
  );

  it('preserves parallel historical content without skill cards', () => {
    render(
      <ContentParts
        {...baseProps}
        content={[{ type: ContentTypes.TEXT, text: 'Saved text', groupId: 1 }]}
      />,
    );
    expect(screen.getByTestId('parallel')).toBeInTheDocument();
    expect(screen.queryByText('old-skill')).toBeNull();
  });
});
