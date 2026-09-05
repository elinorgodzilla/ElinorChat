import { renderHook } from '@testing-library/react';
import useFileHandling from '../useFileHandling';
import useFileUploadRouter from '../useFileUploadRouter';

jest.mock('../useFileHandling', () => ({ __esModule: true, default: jest.fn() }));

it('routes pasted/dropped images and supported documents directly', () => {
  const handleFiles = jest.fn();
  jest.mocked(useFileHandling).mockReturnValue({
    handleFiles,
    handleFileChange: jest.fn(),
    abortUpload: jest.fn(),
    setFiles: jest.fn(),
    files: new Map(),
  });
  const { result } = renderHook(() => useFileUploadRouter());
  const files = [
    new File(['image'], 'image.png', { type: 'image/png' }),
    new File(['pdf'], 'document.pdf', { type: 'application/pdf' }),
  ];
  result.current(files);
  expect(handleFiles).toHaveBeenCalledWith(files);
});
