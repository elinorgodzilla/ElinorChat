import { useCallback } from 'react';
import { mergeFileConfig, getEndpointFileConfig } from 'librechat-data-provider';
import { useGetFileConfig } from '~/data-provider';
import { getViableUploadOptions } from '~/utils';
import { useDragDropContext } from '~/Providers';

export default function useUploadOptions() {
  const { endpoint, endpointType, useResponsesApi } = useDragDropContext();
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const endpointFileConfig = getEndpointFileConfig({ fileConfig, endpoint, endpointType });
  const uploadsDisabled = endpointFileConfig.disabled === true;
  const endpointSupportedMimeTypes = endpointFileConfig.supportedMimeTypes;

  const getOptions = useCallback(
    (files: File[]) =>
      uploadsDisabled
        ? []
        : getViableUploadOptions(files, {
            endpoint,
            endpointType,
            useResponsesApi,
            endpointSupportedMimeTypes,
          }),
    [endpoint, endpointType, useResponsesApi, endpointSupportedMimeTypes, uploadsDisabled],
  );

  return { getOptions, uploadsDisabled };
}
