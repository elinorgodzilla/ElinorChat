const { test } = require('node:test');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const {
  Run,
  Providers,
  GraphEvents,
  createContentAggregator,
} = require('@librechat/agents');
const { HumanMessage, AIMessage } = require('@librechat/agents/langchain/messages');
const {
  applyPrefillToRun,
  resolvePrefillStrategy,
  PrefillJsonStreamUnwrapper,
  withGoogleStreamHandler,
} = require('../../packages/api/dist/index.cjs');

test('PrefillJsonStreamUnwrapper handles arbitrary chunk boundaries, escapes, and dedup', () => {
  const prefillText = 'The door swung open and ';
  const unwrapper = new PrefillJsonStreamUnwrapper({
    prefillText,
    hasExistingPrefixInTarget: false,
  });

  const rawJson = JSON.stringify({
    opening: prefillText,
    continuation: 'reveals a "hidden" passage.\nLine two \u2014 end.',
  });

  // Feed 3 characters at a time
  let output = '';
  for (let i = 0; i < rawJson.length; i += 3) {
    output += unwrapper.push(rawJson.slice(i, i + 3));
  }
  output += unwrapper.flush();

  assert.equal(
    output,
    'The door swung open and reveals a "hidden" passage.\nLine two \u2014 end.',
  );

  // When hasExistingPrefixInTarget is true (Option A: assistant bubble edit), only continuation is emitted
  const editUnwrapper = new PrefillJsonStreamUnwrapper({
    prefillText,
    hasExistingPrefixInTarget: true,
  });
  const editOut = editUnwrapper.push(rawJson) + editUnwrapper.flush();
  assert.equal(editOut, 'reveals a "hidden" passage.\nLine two \u2014 end.');

  // Dedup when model accidentally repeats opening inside continuation
  const dupUnwrapper = new PrefillJsonStreamUnwrapper({
    prefillText,
    hasExistingPrefixInTarget: true,
  });
  const dupJson = JSON.stringify({
    opening: prefillText,
    continuation: `${prefillText}then the lights flickered.`,
  });
  assert.equal(dupUnwrapper.push(dupJson) + dupUnwrapper.flush(), 'then the lights flickered.');
});

test('resolvePrefillStrategy selects expected strategy across providers and models', () => {
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.GOOGLE, model: 'gemini-4-argon' }),
    'schema_google',
  );
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.ANTHROPIC, model: 'claude-opus-4-6' }),
    'schema_anthropic',
  );
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.ANTHROPIC, model: 'claude-sonnet-4-6' }),
    'schema_anthropic',
  );
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.ANTHROPIC, model: 'claude-sonnet-4-5-20250929' }),
    'native_assistant',
  );
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.OPENAI, model: 'gpt-4o' }),
    'schema_openai',
  );
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.OPENAI, model: 'kimi-k2.5', endpoint: 'Moonshot' }),
    'native_kimi_partial',
  );
  assert.equal(
    resolvePrefillStrategy({ provider: Providers.DEEPSEEK, model: 'deepseek-chat' }),
    'native_deepseek_prefix',
  );
});

for (const disableStreaming of [false, true]) {
  for (const mode of ['composer_prefill', 'assistant_edit']) {
    const label = `gemini-4-argon/${disableStreaming ? 'non-stream' : 'stream'}/${mode}`;
    test(`real Run ${label}`, { timeout: 15000 }, async (t) => {
      const prefillText = 'The storm broke over the ridge, ';
      const continuationText = 'lighting up the dark valley below.';
      const requests = [];

      const server = createServer(async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        requests.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks)) });

        const payloadChunks = [
          '{"opening": "The storm broke over the ridge, ", "contin',
          `uation": ${JSON.stringify(continuationText)}}`,
        ];

        if (disableStreaming) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              candidates: [
                {
                  index: 0,
                  content: {
                    role: 'model',
                    parts: [{ text: 'thought process', thought: true }, { text: payloadChunks.join('') }],
                  },
                  finishReason: 'STOP',
                },
              ],
            }),
          );
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        for (let i = 0; i < payloadChunks.length; i++) {
          const eventPayload = {
            candidates: [
              {
                index: 0,
                content: {
                  role: 'model',
                  parts: [{ text: payloadChunks[i] }],
                },
                ...(i === payloadChunks.length - 1 ? { finishReason: 'STOP' } : {}),
              },
            ],
          };
          res.write(`data: ${JSON.stringify(eventPayload)}\n\n`);
        }
        res.end();
      });

      t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const origFetch = globalThis.fetch;
      t.mock.method(globalThis, 'fetch', (input, init) => {
        const url = new URL(typeof input === 'string' ? input : (input.url ?? input));
        assert.equal(url.origin, baseUrl);
        return origFetch(input, init);
      });

      const messages =
        mode === 'composer_prefill'
          ? [new HumanMessage('Write the opening scene.')]
          : [new HumanMessage('Write the opening scene.'), new AIMessage(prefillText)];

      const requestBody =
        mode === 'composer_prefill'
          ? { responsePrefill: prefillText }
          : { editedContent: { index: 0, type: 'text', text: prefillText } };

      const agentInputs = [
        {
          agentId: 'google-prefill-agent',
          provider: Providers.GOOGLE,
          reasoningKey: 'reasoning',
          clientOptions: {
            model: 'gemini-4-argon',
            apiKey: 'synthetic-key',
            baseUrl,
            apiVersion: 'v1beta',
            maxRetries: 0,
            disableStreaming,
          },
        },
      ];

      const { contentParts, aggregateContent } = createContentAggregator();
      let customHandlers = {};
      for (const event of [
        GraphEvents.ON_RUN_STEP,
        GraphEvents.ON_RUN_STEP_DELTA,
        GraphEvents.ON_RUN_STEP_COMPLETED,
        GraphEvents.ON_MESSAGE_DELTA,
        GraphEvents.ON_REASONING_DELTA,
      ]) {
        customHandlers[event] = {
          async handle(ev, data) {
            aggregateContent({ event: ev, data });
            await delay(1);
          },
        };
      }

      customHandlers = applyPrefillToRun({
        agentInputs,
        messages,
        requestBody,
        customHandlers: withGoogleStreamHandler(agentInputs, customHandlers),
      });

      const runId = `test-${label}`;
      const run = await Run.create({
        runId,
        returnContent: true,
        graphConfig: {
          type: 'standard',
          agents: agentInputs,
        },
        customHandlers,
      });

      await run.processStream(
        { messages },
        { configurable: { thread_id: runId }, streamMode: 'values', version: 'v2' },
      );

      assert.equal(requests.length, 1);
      const wireReq = requests[0].body;
      // Trailing model turn must not be sent to Gemini
      assert.equal(wireReq.contents[wireReq.contents.length - 1].role, 'user');
      // Schema must lock opening to enum [prefillText]
      assert.equal(wireReq.generationConfig.responseMimeType, 'application/json');
      assert.equal(wireReq.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
      assert.equal(wireReq.generationConfig.thinkingConfig.includeThoughts, false);
      assert.deepEqual(
        wireReq.generationConfig.responseSchema.properties.opening.enum,
        [prefillText],
      );
      assert.deepEqual(wireReq.generationConfig.responseSchema.propertyOrdering, [
        'opening',
        'continuation',
      ]);

      const aggregatedText = contentParts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('');

      if (mode === 'composer_prefill') {
        assert.equal(aggregatedText, prefillText + continuationText);
      } else {
        // In assistant_edit mode, the UI/BaseClient already holds prefillText and appends aggregatedText
        assert.equal(aggregatedText, continuationText);
        assert.equal(prefillText + aggregatedText, prefillText + continuationText);
        // Reasoning must be suppressed on text-edit continuation so it doesn't split the text block
        assert.equal(contentParts.filter((p) => p.type === 'think').length, 0);
      }
    });
  }
}

test('Kimi native partial mode attaches partial: true on final assistant message', async () => {
  const prefillText = 'Here is the continuation: ';
  const capturedBodies = [];
  const fakeFetch = async (_input, init) => {
    capturedBodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const messages = [new HumanMessage('Start the story')];
  const agentInputs = [
    {
      agentId: 'kimi-agent',
      provider: Providers.OPENAI,
      clientOptions: {
        model: 'kimi-k2.5',
        configuration: {
          baseURL: 'https://api.moonshot.ai/v1',
          fetch: fakeFetch,
        },
      },
    },
  ];

  applyPrefillToRun({
    agentInputs,
    messages,
    requestBody: { responsePrefill: prefillText },
    agentEndpoint: 'Moonshot',
  });

  // Composer prefill should have pushed a trailing AIMessage
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, prefillText);

  // Trigger the wrapped fetch with a simulated OpenAI chat completion payload
  await agentInputs[0].clientOptions.configuration.fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: 'kimi-k2.5',
      messages: [
        { role: 'user', content: 'Start the story' },
        { role: 'assistant', content: prefillText },
      ],
    }),
  });

  assert.equal(capturedBodies.length, 1);
  assert.equal(capturedBodies[0].messages[1].partial, true);
});
