import { AIMessageChunk } from '@librechat/agents/langchain/messages';
import {
  Providers,
  GraphEvents,
  getChatModelClass,
  ChatModelStreamHandler,
} from '@librechat/agents';
import type { AgentInputs, EventHandler } from '@librechat/agents';

type PatchedGooglePrototype = {
  invocationParams?: (options?: Record<string, unknown>, extra?: unknown) => Record<string, unknown>;
  __librechatResponseSchemaPatched?: boolean;
  __librechatOpenRouterZdrPatched?: boolean;
};

/**
 * Ensures `CustomChatGoogleGenerativeAI.prototype.invocationParams` forwards
 * `responseSchema` onto `generationConfig` when supplied via constructor
 * fields (`json: { responseSchema }` or `responseSchema`) or call options,
 * and enforces `store: false` on Google and `provider.zdr: true` on OpenRouter
 * (excluding Fable/Mythos models).
 */
export function ensureGoogleResponseSchemaSupport(): void {
  try {
    const GoogleModelClass = getChatModelClass(Providers.GOOGLE) as unknown as {
      prototype?: PatchedGooglePrototype;
    };
    const proto = GoogleModelClass?.prototype;
    if (proto?.invocationParams && !proto.__librechatResponseSchemaPatched) {
      const origInvocationParams = proto.invocationParams;
      proto.invocationParams = function (
        this: { responseSchema?: unknown; json?: unknown; store?: boolean },
        options?: Record<string, unknown>,
      ) {
        const params = origInvocationParams.call(this, options) as {
          generationConfig?: Record<string, unknown>;
          store?: boolean;
        };
        if (params.store === undefined) {
          params.store = (options?.store as boolean | undefined) ?? this.store ?? false;
        }
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
    }

    const OpenRouterModelClass = getChatModelClass(Providers.OPENROUTER) as unknown as {
      prototype?: PatchedGooglePrototype;
    };
    const orProto = OpenRouterModelClass?.prototype;
    if (orProto?.invocationParams && !orProto.__librechatOpenRouterZdrPatched) {
      const origOrInvocationParams = orProto.invocationParams;
      orProto.invocationParams = function (
        this: { model?: string },
        options?: Record<string, unknown>,
        extra?: unknown,
      ) {
        const params = origOrInvocationParams.call(this, options, extra) as {
          model?: string;
          provider?: Record<string, unknown>;
        };
        const modelName = params.model ?? this.model ?? '';
        const isCoveredModel = /\b(?:fable|mythos)\b/i.test(modelName);
        if (isCoveredModel) {
          if (params.provider && typeof params.provider === 'object') {
            const nextProvider = { ...params.provider };
            delete nextProvider.zdr;
            if (Object.keys(nextProvider).length > 0) {
              params.provider = nextProvider;
            } else {
              delete params.provider;
            }
          }
        } else {
          const existingProvider =
            params.provider && typeof params.provider === 'object' ? params.provider : {};
          if (existingProvider.zdr === undefined) {
            params.provider = { ...existingProvider, zdr: true };
          }
        }
        return params;
      };
      orProto.__librechatOpenRouterZdrPatched = true;
    }
  } catch {
    // Ignore if model classes are unavailable in isolated test mocks
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
