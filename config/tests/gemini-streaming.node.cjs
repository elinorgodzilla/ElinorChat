// Run with: node --test config/tests/gemini-streaming.node.cjs
const path = require('node:path');
const { test } = require('node:test');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { pathToFileURL } = require('node:url');
const { readFileSync, statSync } = require('node:fs');
const { HumanMessage } = require('@langchain/core/messages');

require('../patch-agents.cjs');

const agentsDir = path.dirname(require.resolve('@librechat/agents'));
const { CustomChatGoogleGenerativeAI } = require(path.join(agentsDir, 'llm/google/index.cjs'));

const imageData =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=';
const imagePrompt = [
  new HumanMessage({
    content: [
      { type: 'text', text: 'Describe this image' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${imageData}` } },
    ],
  }),
];

async function getGoogleConstructor(format) {
  if (format === 'cjs') {
    return CustomChatGoogleGenerativeAI;
  }
  const moduleUrl = pathToFileURL(path.join(agentsDir, '..', 'esm', 'llm', 'google', 'index.mjs'));
  return (await import(moduleUrl.href)).CustomChatGoogleGenerativeAI;
}

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

for (const format of ['cjs', 'esm']) {
  test(`${format}: unknown models still reject image input`, async () => {
    const Google = await getGoogleConstructor(format);
    for (const modelName of [
      'unknown-model',
      'gemini-5-pro',
      'gemini-40-pro',
      'gemini40-pro',
      'gemini-4foo',
      'gemini4foo',
      'not-gemini-4',
      'not-gemini4',
      'gemma-3-1b',
    ]) {
      const model = new Google({ model: modelName, apiKey: 'local-test-key', maxRetries: 0 });
      assert.equal(model._isMultimodalModel, false, modelName);
      await assert.rejects(model.invoke(imagePrompt), /This model does not support images/);
    }
  });

  for (const modelName of [
    'gemini-4',
    'gemini4',
    'gemini-4.0-pro',
    'gemini4-flash',
    'GeMiNi-4.1-Pro',
    'GeMiNi4.0-Pro',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-3-pro-preview',
    'gemma-3-27b-it',
  ]) {
    for (const mode of ['stream', 'invoke', 'disabled-stream']) {
      const name = `${format}: ${modelName} ${mode} sends images and separates thoughts`;
      test(name, { timeout: 10000 }, async (t) => {
        const Google = await getGoogleConstructor(format);
        const requests = [];
        const streaming = mode === 'stream';
        const requestUrl = `/v1beta/models/${modelName}:${
          streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'
        }`;
        const response = (parts, finished) => ({
          candidates: [
            {
              index: 0,
              content: { role: 'model', parts },
              ...(finished ? { finishReason: 'STOP' } : {}),
            },
          ],
        });
        const thought = { text: 'Inspecting the image. ', thought: true };
        const moreThought = { text: 'It is tiny.', thought: true };
        const answer = { text: 'A tiny PNG.', thought: false };
        const server = createServer(async (req, res) => {
          const body = [];
          for await (const chunk of req) {
            body.push(chunk);
          }
          requests.push({
            method: req.method,
            url: req.url,
            body: JSON.parse(Buffer.concat(body)),
          });
          if (streaming) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.write(`data: ${JSON.stringify(response([thought], false))}\n\n`);
            res.end(`data: ${JSON.stringify(response([moreThought, answer], true))}\n\n`);
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response([thought, moreThought, answer], true)));
          }
        });
        t.after(async () => {
          server.closeAllConnections();
          await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');

        const thinkingConfig =
          /^gemini-?4(?:[.-]|$)/i.test(modelName) || modelName.startsWith('gemini-3')
            ? { includeThoughts: true, thinkingLevel: 'HIGH' }
            : { includeThoughts: true, thinkingBudget: 1024 };
        const model = new Google({
          model: modelName,
          apiKey: 'dummy-local-test-key',
          apiVersion: 'v1beta',
          baseUrl: `http://127.0.0.1:${server.address().port}`,
          maxRetries: 0,
          disableStreaming: mode === 'disabled-stream',
          thinkingConfig,
          maxOutputTokens: 2048,
          temperature: 0.4,
        });
        assert.equal(model.model, modelName);
        const messages = [];
        if (mode === 'invoke') {
          messages.push(await model.invoke(imagePrompt, { signal: t.signal }));
        } else {
          for await (const chunk of await model.stream(imagePrompt, { signal: t.signal })) {
            messages.push(chunk);
          }
        }

        assert.equal(requests.length, 1);
        assert.equal(requests[0].method, 'POST');
        assert.equal(requests[0].url, requestUrl);
        assert.deepEqual(requests[0].body.contents, [
          {
            role: 'user',
            parts: [
              { text: 'Describe this image' },
              { inlineData: { mimeType: 'image/png', data: imageData } },
            ],
          },
        ]);
        assert.deepEqual(requests[0].body.generationConfig.thinkingConfig, thinkingConfig);
        assert.equal(requests[0].body.generationConfig.maxOutputTokens, 2048);
        assert.equal(requests[0].body.generationConfig.temperature, 0.4);
        assert.equal(messages.map((message) => message.text).join(''), 'A tiny PNG.');
        assert.equal(
          messages.map((message) => message.additional_kwargs.reasoning ?? '').join(''),
          'Inspecting the image. It is tiny.',
        );
        for (const message of messages) {
          assert.doesNotMatch(JSON.stringify(message.content), /Inspecting|It is tiny/);
        }
      });
    }
  }
}

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
