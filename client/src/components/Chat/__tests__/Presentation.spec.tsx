import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { FileSources, LocalStorageKeys } from 'librechat-data-provider';
import Presentation from '../Presentation';

const mockDeleteFiles = jest.fn().mockResolvedValue(undefined);
const mockSetFilesToDelete = jest.fn();
let mockOnSuccess: () => void;
let mockOnError: (error: Error) => void;

jest.mock('~/data-provider', () => ({
  useDeleteFilesMutation: (options: { onSuccess: () => void; onError: (error: Error) => void }) => {
    mockOnSuccess = options.onSuccess;
    mockOnError = options.onError;
    return { mutateAsync: mockDeleteFiles };
  },
}));

jest.mock('~/hooks', () => ({
  useSetFilesToDelete: () => mockSetFilesToDelete,
}));

jest.mock('~/components/Chat/Input/Files/DragDropWrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drop-area">{children}</div>
  ),
}));

describe('Presentation', () => {
  beforeEach(() => {
    localStorage.removeItem(LocalStorageKeys.FILES_TO_DELETE);
  });

  it('keeps chat inside the drag-and-drop wrapper without panel providers', () => {
    render(
      <Presentation>
        <div data-testid="chat-content" />
      </Presentation>,
    );

    const main = within(screen.getByTestId('drop-area')).getByRole('main');
    expect(within(main).getByTestId('chat-content')).toBeInTheDocument();
    expect(main).toHaveClass('min-w-0', 'flex-1');
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('deletes only eligible temporary files and clears the queue on success', () => {
    const temporary = {
      file_id: 'temporary',
      filepath: '/uploads/image.png',
      source: FileSources.local,
      temp_file_id: 'temp-id',
    };
    localStorage.setItem(
      LocalStorageKeys.FILES_TO_DELETE,
      JSON.stringify({
        temporary,
        permanent: { ...temporary, file_id: 'permanent', temp_file_id: undefined },
        embedded: { ...temporary, file_id: 'embedded', embedded: true },
        missingPath: { ...temporary, file_id: 'missing-path', filepath: undefined },
        missingSource: { ...temporary, file_id: 'missing-source', source: undefined },
      }),
    );

    render(<Presentation>{null}</Presentation>);

    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
    expect(mockDeleteFiles).toHaveBeenCalledWith({
      files: [
        {
          file_id: temporary.file_id,
          filepath: temporary.filepath,
          source: temporary.source,
          embedded: false,
        },
      ],
    });
    expect(mockSetFilesToDelete).not.toHaveBeenCalled();
    mockOnSuccess();
    expect(mockSetFilesToDelete).toHaveBeenCalledWith({});
  });

  it('retains the cleanup queue when deletion fails', () => {
    const queue = JSON.stringify({
      temporary: {
        file_id: 'temporary',
        filepath: '/uploads/image.png',
        source: FileSources.local,
        temp_file_id: 'temp-id',
      },
    });
    localStorage.setItem(LocalStorageKeys.FILES_TO_DELETE, queue);
    render(<Presentation>{null}</Presentation>);

    mockOnError(new Error('Offline'));

    expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
    expect(mockSetFilesToDelete).not.toHaveBeenCalled();
    expect(localStorage.getItem(LocalStorageKeys.FILES_TO_DELETE)).toBe(queue);
  });
});
