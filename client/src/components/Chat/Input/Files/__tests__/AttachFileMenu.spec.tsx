import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useFileHandlingNoChatContext } from '~/hooks';
import AttachFileMenu from '../AttachFileMenu';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFileHandlingNoChatContext: jest.fn(),
}));
jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutHint: (_key: string, label: string) => label,
  useShortcutAriaKey: () => undefined,
}));
jest.mock('~/utils', () => ({ cn: (...classes: string[]) => classes.filter(Boolean).join(' ') }));
jest.mock('@ariakit/react', () => ({
  MenuButton: (props: React.ComponentProps<'button'>) => <button {...props} />,
}));
jest.mock('@librechat/client', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    FileUpload: React.forwardRef<
      HTMLInputElement,
      { children: React.ReactNode; handleFileChange: React.ChangeEventHandler<HTMLInputElement> }
    >(({ children, handleFileChange }, ref) => (
      <div>
        {children}
        <input type="file" ref={ref} data-testid="file-input" onChange={handleFileChange} />
      </div>
    )),
    TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
    AttachmentIcon: () => null,
    DropdownPopup: ({
      trigger,
      items,
    }: {
      trigger: React.ReactNode;
      items: { label: string; onClick: () => void }[];
    }) => (
      <div>
        {trigger}
        {items.map((item) => (
          <button key={item.label} onClick={item.onClick}>
            {item.label}
          </button>
        ))}
      </div>
    ),
  };
});

const handleFileChange = jest.fn();
function renderMenu(props: Partial<React.ComponentProps<typeof AttachFileMenu>> = {}) {
  return render(
    <AttachFileMenu
      conversationId="conversation"
      conversation={null}
      files={new Map()}
      setFiles={jest.fn()}
      setFilesLoading={jest.fn()}
      {...props}
    />,
  );
}

describe('direct attachment menu', () => {
  beforeEach(() => {
    jest.mocked(useFileHandlingNoChatContext).mockReturnValue({
      handleFileChange,
      handleFiles: jest.fn(),
      abortUpload: jest.fn(),
      setFiles: jest.fn(),
      files: new Map(),
    });
  });

  it.each([EModelEndpoint.openAI, EModelEndpoint.anthropic, EModelEndpoint.custom])(
    'offers only direct provider upload for %s',
    (endpointType) => {
      renderMenu({ endpointType });
      expect(screen.getByText('com_ui_upload_provider')).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(2);
      expect(screen.queryByText('com_ui_upload_file_search')).not.toBeInTheDocument();
      expect(screen.queryByText('com_ui_upload_code_environment')).not.toBeInTheDocument();
      expect(screen.queryByText('com_ui_upload_ocr_text')).not.toBeInTheDocument();
    },
  );

  it('keeps the direct image picker for other endpoints', () => {
    renderMenu();
    expect(screen.getByText('com_ui_upload_image_input')).toBeInTheDocument();
    const click = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.accept).toBe('image/*,.heif,.heic');
    });
    fireEvent.click(screen.getByText('com_ui_upload_image_input'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each([
    { endpointType: EModelEndpoint.google, expected: 'video/*' },
    { endpointType: EModelEndpoint.bedrock, expected: '.docx' },
    { endpointType: EModelEndpoint.azureOpenAI, useResponsesApi: true, expected: '.pdf' },
  ])('preserves direct provider file types: %j', ({ expected, ...props }) => {
    renderMenu(props);
    const click = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.accept).toContain(expected);
    });
    fireEvent.click(screen.getByText('com_ui_upload_provider'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('retains configured picker MIME restrictions', () => {
    renderMenu({
      endpointType: EModelEndpoint.openAI,
      endpointFileConfig: { supportedMimeTypes: [/^application\/pdf$/] },
    });
    const click = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.accept).toContain('application/pdf');
      expect(this.accept).not.toContain('image/*');
    });
    fireEvent.click(screen.getByText('com_ui_upload_provider'));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('sends input changes directly without a tool resource', () => {
    renderMenu({ endpointType: EModelEndpoint.openAI });
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] },
    });
    expect(handleFileChange).toHaveBeenCalledWith(expect.any(Object));
  });

  it.each([{ disabled: true }, { endpointFileConfig: { disabled: true } }])(
    'respects disabled uploads: %j',
    (props) => {
      renderMenu(props);
      expect(screen.getByRole('button', { name: 'com_sidepanel_attach_files' })).toBeDisabled();
      const click = jest.spyOn(HTMLInputElement.prototype, 'click');
      fireEvent.click(screen.getByText('com_ui_upload_image_input'));
      expect(click).not.toHaveBeenCalled();
    },
  );
});
