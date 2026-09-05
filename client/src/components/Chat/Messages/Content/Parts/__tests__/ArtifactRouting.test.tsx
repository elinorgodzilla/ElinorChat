import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TAttachment } from 'librechat-data-provider';
import Attachment, { AttachmentGroup } from '../Attachment';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useExpandCollapse: () => ({ style: {}, ref: { current: null } }),
}));
jest.mock('../LogLink', () => ({
  useAttachmentLink: () => ({ handleDownload: jest.fn() }),
}));
jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ displayName }: { displayName: string }) => (
    <div data-testid="file">{displayName}</div>
  ),
}));
jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({ altText }: { altText: string }) => <img alt={altText} />,
}));
jest.mock('~/components/Messages/Content/Mermaid/Mermaid', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="mermaid">{children}</div>,
}));

const file = (overrides: Partial<TAttachment> = {}): TAttachment =>
  ({
    file_id: 'file',
    filename: 'saved.zip',
    filepath: '/files/saved',
    type: 'application/octet-stream',
    ...overrides,
  }) as TAttachment;

const renderWith = (children: React.ReactNode) => render(<RecoilRoot>{children}</RecoilRoot>);

describe('historical attachments without artifact UI', () => {
  it.each([
    ['index.html', '<h1>Saved HTML</h1>'],
    ['App.tsx', 'export default () => null;'],
    ['notes.md', '# Saved Markdown'],
    ['report.docx', 'Extracted document text'],
    ['slides.pptx', '<html><body>Saved slides</body></html>'],
    ['sheet.csv', 'a,b\n1,2'],
    ['data.json', '{"saved":true}'],
  ])('renders %s as ordinary escaped text', (filename, text) => {
    const { container } = renderWith(<Attachment attachment={file({ filename, text })} />);
    expect(container.querySelector('pre')?.textContent).toBe(text);
    expect(screen.getByTestId('file')).toHaveTextContent(filename);
    expect(container.querySelector('iframe, .monaco-editor, .sp-wrapper')).toBeNull();
    expect(screen.queryByRole('button', { pressed: true })).toBeNull();
  });

  it.each(['pending', 'failed'] as const)(
    'keeps %s preview files downloadable without polling UI',
    (status) => {
      renderWith(<Attachment attachment={file({ filename: 'report.docx', status })} />);
      expect(screen.getByTestId('file')).toHaveTextContent('report.docx');
      expect(screen.queryByText('com_ui_preview_preparing')).toBeNull();
    },
  );

  it('keeps Mermaid attachments inline', () => {
    renderWith(<Attachment attachment={file({ filename: 'flow.mmd', text: 'graph TD\nA-->B' })} />);
    expect(screen.getByTestId('mermaid')).toHaveTextContent('graph TD');
  });

  it('filters only internal empty sandbox placeholders', () => {
    renderWith(
      <AttachmentGroup
        attachments={[
          file({ filename: '_.dirkeep-abcdef', bytes: 0 }),
          file({ file_id: 'real', filename: 'saved.txt', text: 'Saved text' }),
        ]}
      />,
    );
    expect(screen.queryByText(/dirkeep/)).toBeNull();
    expect(screen.getByText('Saved text')).toBeInTheDocument();
  });

  it('keeps images outside collapsed downloadable-file groups', () => {
    const { container } = renderWith(
      <AttachmentGroup
        attachments={[
          file({ file_id: 'html', filename: 'index.html', text: '<h1>Saved</h1>' }),
          file({ file_id: 'archive', filename: 'archive.zip' }),
          file({ file_id: 'image', filename: 'photo.png', width: 16, height: 16 }),
        ]}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'com_ui_show_n_files' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('img', { name: 'photo.png' })).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('pre')?.textContent).toBe('<h1>Saved</h1>');
  });

  it('sorts non-empty downloads before empty files', () => {
    renderWith(
      <AttachmentGroup
        attachments={[
          file({ filename: 'empty.zip', bytes: 0 }),
          file({ file_id: 'full', filename: 'full.zip', bytes: 123 }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_show_n_files' }));
    expect(screen.getAllByTestId('file').map((item) => item.textContent)).toEqual([
      'full.zip',
      'empty.zip',
    ]);
  });

  it.each([
    ['archive-deadbe.zip', 'archive-deadbe.zip'],
    ['_.config-abcdef.zip', '.config.zip'],
  ])('preserves filename display rules: %s', (filename, displayName) => {
    renderWith(<Attachment attachment={file({ filename })} />);
    expect(screen.getByTestId('file')).toHaveTextContent(displayName);
  });
});
