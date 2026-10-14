import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readLocalImage } from './unavailable';

describe('readLocalImage', () => {
  it('represents an actual missing local file without creating it', async () => {
    const result = await readLocalImage(
      path.join(__dirname, '__missing_local_image_fixture__.png'),
      {
        filename: 'photo.png',
      },
    );
    expect(result).toEqual({
      base64: null,
      fileContext: '[Attachment unavailable: photo.png. The stored image could not be found.]',
    });
  });

  it('encodes readable bytes without adding a notice', async () => {
    const expected = await fs.readFile(__filename);
    await expect(readLocalImage(__filename, { filename: 'fixture' })).resolves.toEqual({
      base64: expected.toString('base64'),
    });
  });

  it.each(['EACCES', 'EPERM', 'EIO', 'ENOTDIR'])('propagates %s unchanged', async (code) => {
    const error = Object.assign(new Error('read failed'), { code });
    jest.spyOn(fs, 'readFile').mockRejectedValueOnce(error);
    await expect(readLocalImage('image.png', { filename: 'photo.png' })).rejects.toBe(error);
  });

  it('does not infer absence from error text or a status', async () => {
    const error = Object.assign(new Error('ENOENT: no such file'), { status: 404 });
    jest.spyOn(fs, 'readFile').mockRejectedValueOnce(error);
    await expect(readLocalImage('image.png', { filename: 'photo.png' })).rejects.toBe(error);
  });

  it('sanitizes and bounds the display name without exposing the path', async () => {
    jest
      .spyOn(fs, 'readFile')
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const result = await readLocalImage('/private/path/image.png', {
      filename: `C:\\private\\[name]\n\u202e${'x'.repeat(200)}`,
    });
    expect(result.fileContext).not.toMatch(/private|\n|\u202e|\[name\]/);
    expect(result.fileContext?.length).toBeLessThan(240);
  });

  it('retries on the next read rather than caching unavailability', async () => {
    jest
      .spyOn(fs, 'readFile')
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(Buffer.from('restored'));
    expect((await readLocalImage('image.png', { filename: 'photo.png' })).base64).toBeNull();
    expect((await readLocalImage('image.png', { filename: 'photo.png' })).base64).toBe(
      Buffer.from('restored').toString('base64'),
    );
  });
});
