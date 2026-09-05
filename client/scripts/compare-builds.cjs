const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

function measure(directory) {
  const assets = path.join(directory, 'assets');
  const result = { chunks: 0, javascriptBytes: 0, javascriptGzipBytes: 0 };
  for (const name of fs.readdirSync(assets)) {
    if (!name.endsWith('.js') || name.startsWith('locale-')) {
      continue;
    }
    const code = fs.readFileSync(path.join(assets, name));
    result.chunks++;
    result.javascriptBytes += code.byteLength;
    result.javascriptGzipBytes += gzipSync(code).byteLength;
  }
  return result;
}

const [beforeDirectory, afterDirectory] = process.argv.slice(2);
if (!beforeDirectory || !afterDirectory) {
  console.error('Usage: node client/scripts/compare-builds.cjs <before-dist> <after-dist>');
  process.exitCode = 1;
} else {
  const before = measure(beforeDirectory);
  const after = measure(afterDirectory);
  console.log(
    JSON.stringify(
      {
        excludesLocaleChunks: true,
        before,
        after,
        javascriptReductionPercent: (1 - after.javascriptBytes / before.javascriptBytes) * 100,
        gzipReductionPercent: (1 - after.javascriptGzipBytes / before.javascriptGzipBytes) * 100,
      },
      null,
      2,
    ),
  );
}
