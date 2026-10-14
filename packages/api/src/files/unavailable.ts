import { promises as fs } from 'node:fs';
import { types } from 'node:util';
import type { IMongoFile } from '@librechat/data-schemas';

type LocalImageResult =
  | { base64: string; fileContext?: never }
  | { base64: null; fileContext: string };

/** Only a failed local byte read may become an unavailable attachment. */
export async function readLocalImage(
  filepath: string,
  file: Pick<IMongoFile, 'filename'>,
): Promise<LocalImageResult> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filepath);
  } catch (error) {
    if (!types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }

    const filename = (file.filename ?? '').split(/[\\/]/).pop() ?? '';
    const label =
      filename
        .replace(/[\p{Cc}\p{Cf}[\]]/gu, ' ')
        .trim()
        .slice(0, 160) || 'image';
    return {
      base64: null,
      fileContext: `[Attachment unavailable: ${label}. The stored image could not be found.]`,
    };
  }

  return { base64: buffer.toString('base64') };
}
