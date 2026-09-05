import type { UploadOptionContext } from '../files';
import { getViableUploadOptions } from '../files';

const file = (type: string, name = 'file') => new File(['x'], name, { type });
const base: UploadOptionContext = { endpoint: 'anthropic', endpointType: 'anthropic' };
const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('direct upload options', () => {
  it('rejects empty and unknown file sets', () => {
    expect(getViableUploadOptions([], base)).toEqual([]);
    expect(getViableUploadOptions([file('', 'mystery.unknownext')], base)).toEqual([]);
  });

  it.each(['image/png', 'image/jpeg', 'application/pdf'])(
    'attaches %s directly without tool destinations',
    (type) => expect(getViableUploadOptions([file(type)], base)).toEqual([undefined]),
  );

  it('infers image MIME types for clipboard/drop files', () => {
    expect(getViableUploadOptions([file('', 'photo.png')], base)).toEqual([undefined]);
  });

  it.each([xlsx, 'application/zip', 'text/plain', 'video/mp4'])(
    'does not fall back to code, retrieval or text extraction for %s',
    (type) => expect(getViableUploadOptions([file(type)], base)).toEqual([]),
  );

  it('rejects mixed sets when any attachment is unsupported', () => {
    expect(getViableUploadOptions([file('image/png'), file('application/zip')], base)).toEqual([]);
  });

  it.each(['google', 'openrouter'])('keeps direct media for %s', (endpoint) => {
    expect(getViableUploadOptions([file('video/mp4'), file('audio/mpeg')], { endpoint })).toEqual([
      undefined,
    ]);
  });

  it('keeps Bedrock document support', () => {
    expect(getViableUploadOptions([file(xlsx)], { endpoint: 'bedrock' })).toEqual([undefined]);
  });

  it('requires Responses API for Azure direct PDFs', () => {
    const ctx = { endpoint: 'azureOpenAI' };
    expect(getViableUploadOptions([file('application/pdf')], ctx)).toEqual([]);
    expect(
      getViableUploadOptions([file('application/pdf')], { ...ctx, useResponsesApi: true }),
    ).toEqual([undefined]);
  });

  it('honors permissive custom endpoints without adding tool routes', () => {
    expect(
      getViableUploadOptions([file(xlsx)], {
        endpoint: 'MyGateway',
        endpointType: 'custom',
        endpointSupportedMimeTypes: [/.*/],
      }),
    ).toEqual([undefined]);
  });

  it('honors restrictive endpoint MIME configuration', () => {
    const ctx = { ...base, endpointSupportedMimeTypes: [/^application\/pdf$/] };
    expect(getViableUploadOptions([file('image/png')], ctx)).toEqual([]);
    expect(getViableUploadOptions([file('application/pdf')], ctx)).toEqual([undefined]);
    expect(getViableUploadOptions([file(xlsx)], { ...ctx, endpointType: 'custom' })).toEqual([]);
  });
});
