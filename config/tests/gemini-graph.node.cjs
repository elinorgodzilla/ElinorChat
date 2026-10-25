const { test } = require('node:test');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { registerHooks } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');
const {
  Run,
  Providers,
  GraphEvents,
  ChatModelStreamHandler,
  createContentAggregator,
} = require('@librechat/agents');
const { HumanMessage } = require('@librechat/agents/langchain/messages');
const { tool } = require('@librechat/agents/langchain/tools');
const { z } = require('zod');

const hooks = registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('/packages/api/src/agents/google.ts')) return loaded;
    return {
      ...loaded,
      format: 'commonjs',
      source: transpileModule(String(loaded.source), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
      }).outputText,
    };
  },
});
const {
  withGoogleStreamHandler,
  GoogleChatModelStreamHandler,
} = require('../../packages/api/src/agents/google.ts');
hooks.deregister();

const model = 'gemini-4-argon';
const thought = (text) => ({ text, thought: true });
const answer = (text) => ({ text });
const signature = 'synthetic-tool-signature';
const scenarios = [
  { name: 'mixed-only', turns: [[[thought('AB'), answer('C')]]], summary: 'AB' },
  {
    name: 'thought-then-mixed',
    turns: [[[thought('A')], [thought('B'), answer('C')]]],
    summary: 'AB',
  },
  {
    name: 'disabled-stream-array',
    disableStreaming: true,
    turns: [[[thought('AB'), answer('C')]]],
    summary: 'AB',
  },
  { name: 'no-summary', turns: [[[answer('C')]]], summary: '' },
  {
    name: 'disabled-stream-no-summary',
    disableStreaming: true,
    turns: [[[answer('C')]]],
    summary: '',
  },
  {
    name: 'tool-signature',
    turns: [
      [
        [
          thought('AB'),
          {
            functionCall: { id: 'call-echo', name: 'echo', args: { value: 'tool-input' } },
            thoughtSignature: signature,
          },
        ],
      ],
      [[answer('C')]],
    ],
    summary: 'AB',
    tools: true,
  },
];
scenarios.push({
  ...scenarios.find((scenario) => scenario.name === 'tool-signature'),
  name: 'disabled-stream-tool-signature',
  disableStreaming: true,
});

const cases = scenarios.flatMap((scenario) =>
  [false, true].map((registered) => ({ scenario, registered })),
);
for (const { scenario, registered } of cases) {
  const name = `${scenario.name}/${registered ? 'registered-handler' : 'default-local-handler'}`;
  test(`${model}: real Run ${name}`, { timeout: 15000 }, async (t) => {
    const requests = [];
    const events = [];
    const modelOutputs = [];
    const toolInputs = [];
    const server = createServer(async (req, res) => {
      const body = [];
      for await (const chunk of req) body.push(chunk);
      const turn = scenario.turns[requests.length];
      requests.push({ url: req.url, body: JSON.parse(Buffer.concat(body)) });
      if (!turn) {
        res.writeHead(400);
        res.end('Unexpected extra model turn');
        return;
      }
      const responses = turn.map((parts, index) => ({
        candidates: [
          {
            index: 0,
            content: { role: 'model', parts },
            ...(index === turn.length - 1 ? { finishReason: 'STOP' } : {}),
          },
        ],
      }));
      if (scenario.disableStreaming) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responses[0]));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const response of responses) res.write(`data: ${JSON.stringify(response)}\n\n`);
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
    const fetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (input, init) => {
      const url = new URL(typeof input === 'string' ? input : (input.url ?? input));
      assert.equal(url.origin, baseUrl, 'Only this local HTTP fixture may be called');
      return fetch(input, init);
    });

    const { contentParts, aggregateContent } = createContentAggregator();
    const customHandlers = {
      [GraphEvents.CHAT_MODEL_END]: {
        handle(_event, data) {
          modelOutputs.push(data.output);
        },
      },
    };
    if (registered) {
      customHandlers[GraphEvents.CHAT_MODEL_STREAM] = new ChatModelStreamHandler();
    }
    for (const event of [
      GraphEvents.ON_RUN_STEP,
      GraphEvents.ON_RUN_STEP_DELTA,
      GraphEvents.ON_RUN_STEP_COMPLETED,
      GraphEvents.ON_MESSAGE_DELTA,
      GraphEvents.ON_REASONING_DELTA,
    ]) {
      customHandlers[event] = {
        async handle(event, data) {
          events.push({ event, data: structuredClone(data) });
          aggregateContent({ event, data });
          await delay(2);
        },
      };
    }
    const tools = scenario.tools
      ? [
          tool(
            ({ value }) => {
              toolInputs.push(value);
              return 'tool-result';
            },
            {
              name: 'echo',
              description: 'Return a synthetic result',
              schema: z.object({ value: z.string() }),
            },
          ),
        ]
      : [];
    const runId = `gemini-graph-${name}`;
    const agents = [
      {
        agentId: 'google-agent',
        provider: Providers.GOOGLE,
        reasoningKey: 'reasoning',
        tools,
        clientOptions: {
          model,
          apiKey: 'synthetic-local-key',
          baseUrl,
          apiVersion: 'v1beta',
          maxRetries: 0,
          disableStreaming: scenario.disableStreaming ?? false,
          thinkingConfig: { includeThoughts: true },
        },
      },
    ];
    const run = await Run.create({
      runId,
      returnContent: true,
      graphConfig: {
        type: 'standard',
        agents,
      },
      customHandlers:
        process.env.GEMINI_GRAPH_BASELINE === '1'
          ? customHandlers
          : withGoogleStreamHandler(agents, customHandlers),
    });
    const finalContent = await run.processStream(
      { messages: [new HumanMessage('Return the synthetic answer')] },
      { configurable: { thread_id: runId }, streamMode: 'values', version: 'v2' },
    );
    const visible = contentParts.filter((part) => part.type === 'think' || part.type === 'text');
    t.diagnostic(JSON.stringify({ scenario: name, visible, finalContent }));
    assert.equal(requests.length, scenario.turns.length);
    assert.equal(modelOutputs.length, scenario.turns.length);
    if (scenario.name === 'disabled-stream-array') {
      assert.deepEqual(modelOutputs[0].content, [{ type: 'text', text: 'C' }]);
      assert.equal(modelOutputs[0].additional_kwargs.reasoning, 'AB');
    }
    for (const request of requests) {
      assert.equal(
        request.url,
        `/v1beta/models/${model}:${scenario.disableStreaming ? 'generateContent' : 'streamGenerateContent?alt=sse'}`,
      );
      assert.equal(request.body.generationConfig.thinkingConfig.includeThoughts, true);
    }
    if (scenario.tools) {
      assert.deepEqual(toolInputs, ['tool-input']);
      const replay = requests[1].body.contents
        .flatMap((content) => content.parts)
        .find((part) => part.functionCall);
      assert.equal(replay.thoughtSignature, signature);
      assert.deepEqual(replay.functionCall.args, { value: 'tool-input' });
      assert.equal(contentParts.filter((part) => part.type === 'tool_call').length, 1);
    }
    assert.equal(
      visible
        .filter((part) => part.type === 'think')
        .map((part) => part.think)
        .join(''),
      scenario.summary,
    );
    assert.equal(
      visible
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(''),
      'C',
    );
    assert.deepEqual(
      visible.map((part) => part.type),
      scenario.summary ? ['think', 'text'] : ['text'],
    );
    const reasoningDeltas = events.filter(({ event }) => event === GraphEvents.ON_REASONING_DELTA);
    assert.equal(
      reasoningDeltas
        .flatMap(({ data }) => data.delta.content)
        .map((part) => part.think)
        .join(''),
      scenario.summary,
    );
    assert.equal(
      finalContent
        .filter((part) => part.type === 'think')
        .map((part) => part.think)
        .join(''),
      scenario.summary,
    );
    assert.equal(
      finalContent
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join(''),
      'C',
    );
  });
}

test('registration preserves other providers and custom stream protocols', () => {
  const google = [{ provider: Providers.GOOGLE }];
  const nonGoogle = [{ provider: Providers.OPENAI }];
  const defaults = { [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler() };
  const custom = { [GraphEvents.CHAT_MODEL_STREAM]: { handle() {} } };
  assert.equal(withGoogleStreamHandler(nonGoogle, defaults), defaults);
  assert.equal(withGoogleStreamHandler(nonGoogle), undefined);
  assert.equal(withGoogleStreamHandler(google, custom), custom);
  const handlers = withGoogleStreamHandler(google, defaults);
  assert.ok(handlers[GraphEvents.CHAT_MODEL_STREAM] instanceof GoogleChatModelStreamHandler);
  assert.ok(handlers[GraphEvents.CHAT_MODEL_STREAM] instanceof ChatModelStreamHandler);
  assert.equal(withGoogleStreamHandler(google, handlers), handlers);
  assert.ok(
    withGoogleStreamHandler(google)[GraphEvents.CHAT_MODEL_STREAM] instanceof
      ChatModelStreamHandler,
  );
  const nested = [
    {
      provider: Providers.OPENAI,
      subagentConfigs: [{ agentInputs: google[0] }],
    },
  ];
  assert.ok(
    withGoogleStreamHandler(nested, defaults)[GraphEvents.CHAT_MODEL_STREAM] instanceof
      GoogleChatModelStreamHandler,
  );
});
