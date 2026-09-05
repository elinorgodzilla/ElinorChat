import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

const excludedPackages =
  /\/node_modules\/(?:@codesandbox\/sandpack[^/]*|@monaco-editor\/[^/]+|monaco-editor|@mcp-ui\/[^/]+)\//;

/** Prevent removed interactive tool UIs from returning through a shared import. */
export default function leanBundle(): Plugin {
  return {
    name: 'lean-chat-bundle',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks: Array<{ file: string; bytes: number; gzipBytes: number }> = [];
      let javascriptBytes = 0;
      let javascriptGzipBytes = 0;

      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
          continue;
        }
        for (const [id, module] of Object.entries(output.modules)) {
          if (module.renderedLength > 0 && excludedPackages.test(id.replace(/\\/g, '/'))) {
            this.error(`Removed feature dependency is still rendered in ${output.fileName}: ${id}`);
          }
        }
        if (output.fileName.startsWith('assets/locale-')) {
          continue;
        }
        const bytes = Buffer.byteLength(output.code);
        const gzipBytes = gzipSync(output.code).byteLength;
        javascriptBytes += bytes;
        javascriptGzipBytes += gzipBytes;
        chunks.push({ file: output.fileName, bytes, gzipBytes });
      }

      this.emitFile({
        type: 'asset',
        fileName: 'lean-build.json',
        source: JSON.stringify(
          {
            profile: 'chat-search',
            excludesLocaleChunks: true,
            javascriptBytes,
            javascriptGzipBytes,
            chunks: chunks.sort((a, b) => b.bytes - a.bytes),
          },
          null,
          2,
        ),
      });
    },
  };
}
