import { AIMessageChunk } from '@librechat/agents/langchain/messages';
import {
  Providers,
  GraphEvents,
  getChatModelClass,
  ChatModelStreamHandler,
} from '@librechat/agents';
import type { AgentInputs, EventHandler } from '@librechat/agents';

type PatchedGooglePrototype = {
  invocationParams?: (options?: Record<string, unknown>) => Record<string, unknown>;
  __librechatResponseSchemaPatched?: boolean;
};

/**
 * Ensures `CustomChatGoogleGenerativeAI.prototype.invocationParams` forwards
 * `responseSchema` onto `generationConfig` when supplied via constructor
 * fields (`json: { responseSchema }` or `responseSchema`) or call options.
 */
export function ensureGoogleResponseSchemaSupport(): void {
  try {
    const GoogleModelClass = getChatModelClass(Providers.GOOGLE) as unknown as {
      prototype?: PatchedGooglePrototype;
    };
    const proto = GoogleModelClass?.prototype;
    if (!proto?.invocationParams || proto.__librechatResponseSchemaPatched) {
      return;
    }
    const origInvocationParams = proto.invocationParams;
    proto.invocationParams = function (
      this: { responseSchema?: unknown; json?: unknown },
      options?: Record<string, unknown>,
    ) {
      const params = origInvocationParams.call(this, options) as {
        generationConfig?: Record<string, unknown>;
      };
      const responseSchema =
        options?.responseSchema ??
        this.responseSchema ??
        (typeof this.json === 'object' && this.json !== null
          ? (this.json as { responseSchema?: unknown }).responseSchema
          : undefined);
      if (responseSchema != null) {
        params.generationConfig = {
          ...(params.generationConfig ?? {}),
          responseMimeType: 'application/json',
          responseSchema,
        };
      }
      return params;
    };
    proto.__librechatResponseSchemaPatched = true;
  } catch {
    // Ignore if Google model class is unavailable in isolated test mocks
  }
}

ensureGoogleResponseSchemaSupport();

/** Subclassing retains the SDK's instanceof-based dispatch deduplication. */
export class GoogleChatModelStreamHandler extends ChatModelStreamHandler {
  async handle(...args: Parameters<ChatModelStreamHandler['handle']>): Promise<void> {
    const [event, data, metadata, graph] = args;
    const context = graph?.getAgentContext(metadata);
    if (context?.provider !== Providers.GOOGLE) {
      return super.handle(...args);
    }

    /** Google's nonstream token callback omits reasoning; the graph dispatches the complete response. */
    if (context.clientOptions?.disableStreaming === true) {
      return;
    }

    const chunk = data.chunk;
    if (!(chunk instanceof AIMessageChunk)) {
      return super.handle(...args);
    }

    const reasoning = chunk.additional_kwargs?.[context.reasoningKey];
    const hasText =
      typeof chunk.content === 'string'
        ? chunk.content !== ''
        : chunk.content.some((part) => part.type === 'text' && part.text !== '');
    if (typeof reasoning !== 'string' || reasoning === '' || !hasText) {
      return super.handle(...args);
    }

    await super.handle(
      event,
      {
        ...data,
        chunk: new AIMessageChunk({
          id: chunk.id,
          content: '',
          additional_kwargs: { [context.reasoningKey]: reasoning },
        }),
      },
      metadata,
      graph,
    );

    const additionalKwargs = { ...chunk.additional_kwargs };
    delete additionalKwargs[context.reasoningKey];
    await super.handle(
      event,
      { ...data, chunk: new AIMessageChunk({ ...chunk, additional_kwargs: additionalKwargs }) },
      metadata,
      graph,
    );
  }
}

/** Preserve custom stream protocols and replace only the SDK's default handler. */
export function withGoogleStreamHandler(
  agents: AgentInputs[],
  handlers?: Record<string, EventHandler>,
): Record<string, EventHandler> | undefined {
  if (!agents.some(usesGoogle)) {
    return handlers;
  }
  const streamHandler = handlers?.[GraphEvents.CHAT_MODEL_STREAM];
  if (streamHandler != null && streamHandler.constructor !== ChatModelStreamHandler) {
    return handlers;
  }
  return {
    ...handlers,
    [GraphEvents.CHAT_MODEL_STREAM]: new GoogleChatModelStreamHandler(),
  };
}

function usesGoogle(agent: AgentInputs): boolean {
  return (
    agent.provider === Providers.GOOGLE ||
    agent.subagentConfigs?.some(
      (config) => config.agentInputs && usesGoogle(config.agentInputs),
    ) === true
  );
}
