const fs = require('fs');
const { FileSources, VisionModes } = require('librechat-data-provider');

jest.mock('~/models', () => ({ updateFile: jest.fn(), updateUser: jest.fn() }));
jest.mock('~/server/services/Files/strategies', () => ({ getStrategyFunctions: jest.fn() }));

const { updateFile } = require('~/models');
const { getStrategyFunctions } = require('../strategies');
const { prepareImagesLocal } = require('../Local/images');
const { encodeAndFormat } = require('./encode');

const image = Object.freeze({
  source: FileSources.local,
  file_id: 'missing-image',
  filename: 'photo.png',
  filepath: '/images/user/photo.png',
  type: 'image/png',
  width: 1,
  height: 1,
  bytes: 68,
  metadata: Object.freeze({ description: 'retained' }),
});
const req = {
  body: {},
  user: { id: 'user' },
  config: { paths: { publicPath: '/app/client/public' } },
};
const missing = () => Object.assign(new Error('missing image'), { code: 'ENOENT' });
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9e0AAAAASUVORK5CYII=',
  'base64',
);

describe('missing local images', () => {
  beforeEach(() => {
    getStrategyFunctions.mockReturnValue({ prepareImagePayload: prepareImagesLocal });
    updateFile.mockImplementation(async ({ file_id }) => ({ ...image, file_id }));
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([FileSources.local, undefined])('preserves metadata when source=%s', async (source) => {
    jest.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(missing());
    const file = Object.freeze({ ...image, source });
    const result = await encodeAndFormat(req, [file], { endpoint: 'openAI' }, VisionModes.agents);

    expect(result.image_urls).toEqual([]);
    expect(result.fileContext).toContain('Attachment unavailable: photo.png');
    expect(result.files).toEqual([
      expect.objectContaining({
        file_id: image.file_id,
        filename: image.filename,
        filepath: image.filepath,
        metadata: image.metadata,
        width: 1,
        height: 1,
      }),
    ]);
    expect(updateFile).not.toHaveBeenCalled();
    expect(file).not.toHaveProperty('fileContext');
  });

  it('keeps a healthy image alongside the unavailable notice', async () => {
    jest.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(missing()).mockResolvedValueOnce(png);
    const result = await encodeAndFormat(
      req,
      [image, { ...image, file_id: 'healthy-image' }],
      { endpoint: 'openAI' },
      VisionModes.agents,
    );
    expect(result.files.map((file) => file.file_id)).toEqual(['missing-image', 'healthy-image']);
    expect(result.image_urls).toHaveLength(1);
    expect(result.image_urls[0].image_url.url).toBe(
      `data:image/png;base64,${png.toString('base64')}`,
    );
    expect(updateFile).toHaveBeenCalledTimes(1);
    expect(updateFile).toHaveBeenCalledWith({ file_id: 'healthy-image' });
  });

  it.each(['EACCES', 'EPERM', 'EIO'])('propagates local %s errors', async (code) => {
    const error = Object.assign(new Error('read failed'), { code });
    jest.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(error);
    await expect(encodeAndFormat(req, [image], { endpoint: 'openAI' })).rejects.toBe(error);
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('does not turn a database ENOENT into an unavailable image', async () => {
    jest.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(png);
    const error = missing();
    updateFile.mockRejectedValueOnce(error);
    await expect(encodeAndFormat(req, [image], { endpoint: 'openAI' })).rejects.toBe(error);
  });

  it('does not suppress image validation errors', async () => {
    jest.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(Buffer.from('bad'));
    await expect(encodeAndFormat(req, [image], { endpoint: 'openAI' })).rejects.toThrow();
  });

  it('does not convert remote strategy errors into local unavailable notices', async () => {
    const error = Object.assign(new Error('remote denied'), { code: 'EACCES' });
    getStrategyFunctions.mockReturnValue({
      prepareImagePayload: jest.fn().mockRejectedValue(error),
    });
    await expect(
      encodeAndFormat(req, [{ ...image, source: FileSources.firebase }], { endpoint: 'openAI' }),
    ).rejects.toBe(error);
  });
});
