import React, { useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ImageUpIcon, FileImageIcon } from 'lucide-react';
import { FileUpload, TooltipAnchor, DropdownPopup, AttachmentIcon } from '@librechat/client';
import {
  Providers,
  EModelEndpoint,
  getConfiguredMimeAccept,
  bedrockDocumentMimeTypes,
  bedrockDocumentExtensions,
  isDocumentSupportedProvider,
} from 'librechat-data-provider';
import type {
  TConversation,
  EndpointFileConfig,
  MimeUploadCapability,
} from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useFileHandlingNoChatContext, useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface AttachFileMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  conversation: TConversation | null;
}

function AttachFileMenu({
  endpoint,
  disabled,
  endpointType,
  endpointFileConfig,
  useResponsesApi,
  files,
  setFiles,
  setFilesLoading,
  conversation,
}: AttachFileMenuProps) {
  const localize = useLocalize();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isUploadDisabled = disabled === true || endpointFileConfig?.disabled === true;
  const uploadFileTooltip = useShortcutHint('uploadFile', localize('com_sidepanel_attach_files'));
  const uploadFileAriaKey = useShortcutAriaKey('uploadFile');
  const { handleFileChange } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });
  const provider =
    endpoint?.toLowerCase() === Providers.OPENROUTER ? Providers.OPENROUTER : endpoint;
  const supportsDocuments =
    isDocumentSupportedProvider(endpointType) ||
    isDocumentSupportedProvider(provider) ||
    ((provider === EModelEndpoint.azureOpenAI || endpointType === EModelEndpoint.azureOpenAI) &&
      useResponsesApi === true);

  const handleUploadClick = () => {
    if (!inputRef.current || isUploadDisabled) {
      return;
    }
    let capability: MimeUploadCapability = { categories: ['image'] };
    let accept = 'image/*,.heif,.heic';
    if (supportsDocuments) {
      capability = { categories: ['image', 'document'] };
      accept += ',.pdf,application/pdf';
      if (
        provider === Providers.GOOGLE ||
        endpointType === EModelEndpoint.google ||
        provider === Providers.OPENROUTER
      ) {
        capability = {
          categories: ['image', 'document', 'audio', 'video'],
          documentMimeTypes: ['application/pdf'],
        };
        accept += ',video/*,audio/*';
      } else if (provider === Providers.BEDROCK || endpointType === EModelEndpoint.bedrock) {
        capability.documentMimeTypes = bedrockDocumentMimeTypes;
        accept = `image/*,.heif,.heic,${bedrockDocumentExtensions}`;
      }
    }
    inputRef.current.value = '';
    inputRef.current.accept =
      getConfiguredMimeAccept(endpointFileConfig?.supportedMimeTypes, capability) ?? accept;
    inputRef.current.click();
    inputRef.current.accept = '';
  };

  return (
    <FileUpload ref={inputRef} handleFileChange={(event) => handleFileChange(event)}>
      <DropdownPopup
        menuId="attach-file-menu"
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        modal={true}
        unmountOnHide={true}
        iconClassName="mr-0"
        items={[
          {
            label: localize(
              supportsDocuments ? 'com_ui_upload_provider' : 'com_ui_upload_image_input',
            ),
            onClick: handleUploadClick,
            icon: supportsDocuments ? (
              <FileImageIcon className="icon-md" />
            ) : (
              <ImageUpIcon className="icon-md" />
            ),
          },
        ]}
        trigger={
          <TooltipAnchor
            id="attach-file-menu-button"
            description={uploadFileTooltip}
            disabled={isUploadDisabled}
            render={
              <Ariakit.MenuButton
                disabled={isUploadDisabled}
                id="attach-file-menu-button"
                aria-label={localize('com_sidepanel_attach_files')}
                aria-keyshortcuts={uploadFileAriaKey}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
                  isOpen && 'bg-surface-hover',
                )}
              >
                <AttachmentIcon />
              </Ariakit.MenuButton>
            }
          />
        }
      />
    </FileUpload>
  );
}

export default React.memo(AttachFileMenu);
