// Run with: node --test config/tests/gemini-streaming.node.cjs
const path = require('node:path');
const { test } = require('node:test');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync, statSync } = require('node:fs');

require('../patch-agents.cjs');

const agentsDir = path.dirname(require.resolve('@librechat/agents'));
const { CustomChatGoogleGenerativeAI } = require(path.join(agentsDir, 'llm/google/index.cjs'));

test('reapplying the Google and Vertex patch leaves CJS and ESM files unchanged', () => {
  const files = Object.entries({ cjs: 'cjs', esm: 'mjs' }).flatMap(([format, extension]) =>
    ['google', 'vertexai'].map((provider) =>
      path.join(agentsDir, '..', format, 'llm', provider, `index.${extension}`),
    ),
  );
  const before = files.map((file) => ({
    source: readFileSync(file, 'utf8'),
    mtimeMs: statSync(file).mtimeMs,
  }));

  delete require.cache[require.resolve('../patch-agents.cjs')];
  require('../patch-agents.cjs');

  files.forEach((file, index) => {
    assert.equal(readFileSync(file, 'utf8'), before[index].source, file);
    assert.equal(statSync(file).mtimeMs, before[index].mtimeMs, file);
  });
});

for (const scenario of [
  { name: 'true', fields: { disableStreaming: true }, streaming: false },
  { name: 'false', fields: { disableStreaming: false }, streaming: true },
  { name: 'omitted', fields: {}, streaming: true },
]) {
  test(`model.stream with disableStreaming ${scenario.name}`, { timeout: 10000 }, async (t) => {
    const requests = [];
    const server = createServer((req, res) => {
      requests.push({ method: req.method, url: req.url });
      req.resume();

      const response = (text, finished) => ({
        candidates: [
          {
            index: 0,
            content: { role: 'model', parts: [{ text }] },
            ...(finished ? { finishReason: 'STOP' } : {}),
          },
        ],
      });

      if (req.url === '/v1beta/models/gemini-2.0-flash:generateContent') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response('Hello Gemini', true)));
        return;
      }

      if (req.url === '/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify(response('Hello ', false))}\n\n`);
        res.end(`data: ${JSON.stringify(response('Gemini', true))}\n\n`);
        return;
      }

      res.writeHead(404);
      res.end();
    });
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const model = new CustomChatGoogleGenerativeAI({
      model: 'gemini-2.0-flash',
      apiKey: 'dummy-local-test-key',
      apiVersion: 'v1beta',
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      maxRetries: 0,
      ...scenario.fields,
    });
    const chunks = [];
    for await (const chunk of await model.stream('Say hello', { signal: t.signal })) {
      chunks.push(chunk.content);
    }

    assert.deepEqual(requests, [
      {
        method: 'POST',
        url: `/v1beta/models/gemini-2.0-flash:${
          scenario.streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'
        }`,
      },
    ]);
    assert.deepEqual(chunks, scenario.streaming ? ['Hello ', 'Gemini'] : ['Hello Gemini']);
  });
}
