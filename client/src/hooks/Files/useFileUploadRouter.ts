import { useCallback } from 'react';
import useFileHandling from './useFileHandling';

export default function useFileUploadRouter() {
  const { handleFiles } = useFileHandling();
  return useCallback((files: File[]) => handleFiles(files), [handleFiles]);
}
