import {
  AIMessage,
  HumanMessage,
  AIMessageChunk,
} from '@librechat/agents/langchain/messages';
import { Providers, GraphEvents, ChatModelStreamHandler } from '@librechat/agents';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { AgentInputs, EventHandler } from '@librechat/agents';
import { GoogleChatModelStreamHandler, ensureGoogleResponseSchemaSupport } from './google';
import type * as t from '~/types';

export type PrefillStrategy =
  | 'schema_google'
  | 'schema_anthropic'
  | 'schema_openai'
  | 'native_assistant'
  | 'native_kimi_partial'
  | 'native_deepseek_prefix';

export interface PrefillContext {
  prefillText: string;
  enumAnchor: string;
  hasExistingPrefixInTarget: boolean;
  source: 'composer' | 'trailing_ai';
  strategy: PrefillStrategy;
}

const MAX_ENUM_ANCHOR_CHARS = 280;

const CLAUDE_4_RELEASE_DATE_MODEL_PATTERN = /claude-(?:opus|sonnet|haiku)-4-\d{8}(?:[-.@]|$)/i;
const CLAUDE_4_MINOR_MODEL_PATTERN = /claude-(?:opus|sonnet|haiku)-4[-.](\d+)(?:[-.@]|$)/i;
const CLAUDE_5_PLUS_MODEL_PATTERN = /claude-(?:opus|sonnet|haiku)-[5-9]/i;

export function isClaudePrefillDisallowed(model?: string): boolean {
  const modelId = model ?? '';
  if (CLAUDE_4_RELEASE_DATE_MODEL_PATTERN.test(modelId)) {
    return false;
  }
  if (CLAUDE_5_PLUS_MODEL_PATTERN.test(modelId)) {
    return true;
  }
  const match = CLAUDE_4_MINOR_MODEL_PATTERN.exec(modelId);
  if (!match) {
    return false;
  }
  return Number(match[1]) >= 6;
}

export function extractMessageText(message?: BaseMessage): string {
  if (!message) {
    return '';
  }
  const { content } = message;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (part != null && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }
      return '';
    })
    .join('');
}

function isAssistantMessageWithoutTools(message?: BaseMessage): boolean {
  if (!message) {
    return false;
  }
  const isAI =
    message instanceof AIMessage ||
    message instanceof AIMessageChunk ||
    message._getType?.() === 'ai' ||
    (message as unknown as { role?: string }).role === 'assistant';
  if (!isAI) {
    return false;
  }
  const toolCalls = (message as AIMessage).tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return false;
  }
  if (Array.isArray(message.content)) {
    const hasToolUse = message.content.some(
      (part) =>
        part != null &&
        typeof part === 'object' &&
        ('type' in part && (part.type === 'tool_use' || part.type === 'tool_call')),
    );
    if (hasToolUse) {
      return false;
    }
  }
  return true;
}

export function resolvePrefillStrategy({
  provider,
  model,
  endpoint,
  clientOptions,
}: {
  provider?: string;
  model?: string;
  endpoint?: string;
  clientOptions?: Record<string, unknown>;
}): PrefillStrategy {
  const modelStr = String(model ?? '');
  const endpointStr = String(endpoint ?? '');
  const baseUrlStr = String(
    (clientOptions?.configuration as { baseURL?: string } | undefined)?.baseURL ??
      (clientOptions?.clientConfig as { baseURL?: string } | undefined)?.baseURL ??
      clientOptions?.baseUrl ??
      '',
  );

  if (provider === Providers.GOOGLE || provider === Providers.VERTEXAI) {
    return 'schema_google';
  }

  if (provider === Providers.ANTHROPIC) {
    return isClaudePrefillDisallowed(modelStr) ? 'schema_anthropic' : 'native_assistant';
  }

  if (
    provider === Providers.MOONSHOT ||
    /moonshot|kimi/i.test(endpointStr) ||
    /moonshot|kimi/i.test(modelStr) ||
    /api\.moonshot\./i.test(baseUrlStr)
  ) {
    return 'native_kimi_partial';
  }

  if (
    provider === Providers.DEEPSEEK ||
    /deepseek/i.test(endpointStr) ||
    /deepseek/i.test(modelStr) ||
    /api\.deepseek\./i.test(baseUrlStr)
  ) {
    return 'native_deepseek_prefix';
  }

  if (provider === Providers.OPENROUTER) {
    if (
      /(?:^|\/)(?:gemini-|claude-(?:opus|sonnet|haiku)-4[-.](?:[6-9]|\d{2,})|claude-(?:opus|sonnet|haiku)-[5-9]|gpt-|o[134])/i.test(
        modelStr,
      )
    ) {
      return 'schema_openai';
    }
    return 'native_assistant';
  }

  if (provider === Providers.OPENAI || provider === Providers.AZURE) {
    return 'schema_openai';
  }

  return 'native_assistant';
}

export function computeEnumAnchor(prefillText: string): string {
  if (prefillText.length <= MAX_ENUM_ANCHOR_CHARS) {
    return prefillText;
  }
  return prefillText.slice(-MAX_ENUM_ANCHOR_CHARS);
}

export function buildPrefillSchemaObject(
  enumAnchor: string,
  kind: 'google' | 'json_schema',
): Record<string, unknown> {
  const openingProperty: Record<string, unknown> = {
    type: 'string',
    ...(kind === 'google' ? { format: 'enum' } : {}),
    enum: [enumAnchor],
    description:
      'Verbatim opening excerpt of the fictional character dialogue or creative story manuscript.',
  };

  const continuationProperty: Record<string, unknown> = {
    type: 'string',
    description:
      'Seamless in-character prose or dialogue continuation that immediately follows the opening excerpt in the exact same fictional voice, slang, tone, and sentence flow without breaking character or adding out-of-character commentary.',
  };

  if (kind === 'google') {
    return {
      type: 'object',
      properties: {
        opening: openingProperty,
        continuation: continuationProperty,
      },
      required: ['opening', 'continuation'],
      propertyOrdering: ['opening', 'continuation'],
    };
  }

  return {
    type: 'object',
    properties: {
      opening: openingProperty,
      continuation: continuationProperty,
    },
    required: ['opening', 'continuation'],
    additionalProperties: false,
  };
}

type JsonParseState =
  | 'SEEK_KEY'
  | 'READ_KEY'
  | 'SEEK_COLON'
  | 'SKIP_VALUE_START'
  | 'SKIP_STRING'
  | 'SKIP_PRIMITIVE'
  | 'SEEK_COMMA_OR_KEY'
  | 'SEEK_CONT_START'
  | 'STREAM_CONT'
  | 'DONE';

/**
 * Stateful character-level streaming unwrapper for `{ opening, continuation }`
 * JSON schema responses. Emits decoded characters from the `"continuation"`
 * string field in real time while stripping the JSON wrapper and deduplicating
 * accidental opening repeats.
 */
export class PrefillJsonStreamUnwrapper {
  private readonly prefillText: string;
  private readonly enumAnchor: string;
  private readonly hasExistingPrefixInTarget: boolean;
  private prefixEmitted = false;
  private mode: 'undecided' | 'json' | 'passthrough' = 'undecided';
  private jsonState: JsonParseState = 'SEEK_KEY';
  private currentKey = '';
  private inEscape = false;
  private unicodeRemaining = 0;
  private unicodeHex = '';
  private dedupChecked = false;
  private dedupBuffer = '';
  private pendingOut = '';

  constructor({
    prefillText,
    enumAnchor,
    hasExistingPrefixInTarget,
  }: {
    prefillText: string;
    enumAnchor?: string;
    hasExistingPrefixInTarget: boolean;
  }) {
    this.prefillText = prefillText;
    this.enumAnchor = enumAnchor ?? computeEnumAnchor(prefillText);
    this.hasExistingPrefixInTarget = hasExistingPrefixInTarget;
    if (this.enumAnchor === '') {
      this.dedupChecked = true;
    }
  }

  push(rawChunk: string): string {
    if (!rawChunk) {
      return '';
    }

    if (!this.hasExistingPrefixInTarget && !this.prefixEmitted) {
      this.prefixEmitted = true;
      this.pendingOut += this.prefillText;
    }

    for (let i = 0; i < rawChunk.length; i++) {
      const ch = rawChunk[i];

      if (this.mode === 'undecided') {
        if (/\s/.test(ch)) {
          continue;
        }
        if (ch === '{') {
          this.mode = 'json';
          this.jsonState = 'SEEK_KEY';
          continue;
        }
        this.mode = 'passthrough';
        this.emitContinuationChar(ch);
        continue;
      }

      if (this.mode === 'passthrough') {
        this.emitContinuationChar(ch);
        continue;
      }

      switch (this.jsonState) {
        case 'SEEK_KEY': {
          if (ch === '"') {
            this.jsonState = 'READ_KEY';
            this.currentKey = '';
            this.inEscape = false;
          }
          break;
        }
        case 'READ_KEY': {
          if (this.inEscape) {
            this.currentKey += ch;
            this.inEscape = false;
          } else if (ch === '\\') {
            this.inEscape = true;
          } else if (ch === '"') {
            this.jsonState = 'SEEK_COLON';
          } else {
            this.currentKey += ch;
          }
          break;
        }
        case 'SEEK_COLON': {
          if (ch === ':') {
            if (this.currentKey === 'continuation') {
              this.jsonState = 'SEEK_CONT_START';
            } else {
              this.jsonState = 'SKIP_VALUE_START';
            }
          }
          break;
        }
        case 'SKIP_VALUE_START': {
          if (/\s/.test(ch)) {
            break;
          }
          if (ch === '"') {
            this.jsonState = 'SKIP_STRING';
            this.inEscape = false;
          } else {
            this.jsonState = 'SKIP_PRIMITIVE';
          }
          break;
        }
        case 'SKIP_STRING': {
          if (this.inEscape) {
            this.inEscape = false;
          } else if (ch === '\\') {
            this.inEscape = true;
          } else if (ch === '"') {
            this.jsonState = 'SEEK_COMMA_OR_KEY';
          }
          break;
        }
        case 'SKIP_PRIMITIVE': {
          if (ch === ',') {
            this.jsonState = 'SEEK_KEY';
          }
          break;
        }
        case 'SEEK_COMMA_OR_KEY': {
          if (ch === ',') {
            this.jsonState = 'SEEK_KEY';
          } else if (ch === '"') {
            this.jsonState = 'READ_KEY';
            this.currentKey = '';
            this.inEscape = false;
          }
          break;
        }
        case 'SEEK_CONT_START': {
          if (/\s/.test(ch)) {
            break;
          }
          if (ch === '"') {
            this.jsonState = 'STREAM_CONT';
            this.inEscape = false;
            this.unicodeRemaining = 0;
            this.unicodeHex = '';
          }
          break;
        }
        case 'STREAM_CONT': {
          if (this.unicodeRemaining > 0) {
            this.unicodeHex += ch;
            this.unicodeRemaining -= 1;
            if (this.unicodeRemaining === 0) {
              const code = Number.parseInt(this.unicodeHex, 16);
              if (Number.isFinite(code)) {
                this.emitContinuationChar(String.fromCharCode(code));
              }
            }
          } else if (this.inEscape) {
            this.inEscape = false;
            switch (ch) {
              case 'n':
                this.emitContinuationChar('\n');
                break;
              case 'r':
                this.emitContinuationChar('\r');
                break;
              case 't':
                this.emitContinuationChar('\t');
                break;
              case 'b':
                this.emitContinuationChar('\b');
                break;
              case 'f':
                this.emitContinuationChar('\f');
                break;
              case '"':
                this.emitContinuationChar('"');
                break;
              case '\\':
                this.emitContinuationChar('\\');
                break;
              case '/':
                this.emitContinuationChar('/');
                break;
              case 'u':
                this.unicodeRemaining = 4;
                this.unicodeHex = '';
                break;
              default:
                this.emitContinuationChar(ch);
                break;
            }
          } else if (ch === '\\') {
            this.inEscape = true;
          } else if (ch === '"') {
            this.jsonState = 'DONE';
            this.flushDedupBuffer();
          } else {
            this.emitContinuationChar(ch);
          }
          break;
        }
        case 'DONE':
          break;
      }
    }

    const result = this.pendingOut;
    this.pendingOut = '';
    return result;
  }

  flush(): string {
    if (!this.hasExistingPrefixInTarget && !this.prefixEmitted) {
      this.prefixEmitted = true;
      this.pendingOut += this.prefillText;
    }
    this.flushDedupBuffer();
    const result = this.pendingOut;
    this.pendingOut = '';
    return result;
  }

  private emitContinuationChar(str: string): void {
    if (this.dedupChecked) {
      this.pendingOut += str;
      return;
    }

    this.dedupBuffer += str;
    if (!this.enumAnchor.startsWith(this.dedupBuffer)) {
      if (this.dedupBuffer.startsWith(this.enumAnchor)) {
        this.dedupChecked = true;
        this.pendingOut += this.dedupBuffer.slice(this.enumAnchor.length);
        this.dedupBuffer = '';
      } else {
        this.dedupChecked = true;
        this.pendingOut += this.dedupBuffer;
        this.dedupBuffer = '';
      }
    } else if (this.dedupBuffer === this.enumAnchor) {
      this.dedupChecked = true;
      this.dedupBuffer = '';
    }
  }

  private flushDedupBuffer(): void {
    if (!this.dedupChecked && this.dedupBuffer.length > 0) {
      if (this.dedupBuffer !== this.enumAnchor) {
        this.pendingOut += this.dedupBuffer;
      }
      this.dedupBuffer = '';
      this.dedupChecked = true;
    }
  }
}

export function unwrapCompletePrefillOutput(
  rawText: string,
  prefill: Pick<PrefillContext, 'prefillText' | 'enumAnchor' | 'hasExistingPrefixInTarget' | 'strategy'>,
): string {
  const isSchemaStrategy =
    prefill.strategy === 'schema_google' ||
    prefill.strategy === 'schema_anthropic' ||
    prefill.strategy === 'schema_openai';

  if (!isSchemaStrategy) {
    let suffix = rawText;
    if (suffix.startsWith(prefill.prefillText)) {
      suffix = suffix.slice(prefill.prefillText.length);
    } else if (prefill.enumAnchor && suffix.startsWith(prefill.enumAnchor)) {
      suffix = suffix.slice(prefill.enumAnchor.length);
    }
    return prefill.hasExistingPrefixInTarget ? suffix : prefill.prefillText + suffix;
  }

  const unwrapper = new PrefillJsonStreamUnwrapper({
    prefillText: prefill.prefillText,
    enumAnchor: prefill.enumAnchor,
    hasExistingPrefixInTarget: prefill.hasExistingPrefixInTarget,
  });
  return unwrapper.push(rawText) + unwrapper.flush();
}

function replaceChunkTextContent(chunk: AIMessageChunk, newText: string): void {
  if (typeof chunk.content === 'string') {
    chunk.content = newText;
    return;
  }
  if (Array.isArray(chunk.content)) {
    let replacedFirst = false;
    chunk.content = chunk.content
      .map((part) => {
        if (part != null && typeof part === 'object' && 'type' in part && part.type === 'text') {
          if (!replacedFirst) {
            replacedFirst = true;
            return { ...part, text: newText };
          }
          return { ...part, text: '' };
        }
        return part;
      })
      .filter(
        (part) =>
          !(
            part != null &&
            typeof part === 'object' &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part &&
            part.text === ''
          ),
      );
    if (!replacedFirst && newText !== '') {
      chunk.content.push({ type: 'text', text: newText });
    }
  }
}

export class PrefillChatModelStreamHandler extends GoogleChatModelStreamHandler {
  private readonly prefill: PrefillContext;
  private readonly unwrapper: PrefillJsonStreamUnwrapper;
  private nativePrefixEmitted = false;

  constructor(prefill: PrefillContext) {
    super();
    this.prefill = prefill;
    this.unwrapper = new PrefillJsonStreamUnwrapper({
      prefillText: prefill.prefillText,
      enumAnchor: prefill.enumAnchor,
      hasExistingPrefixInTarget: prefill.hasExistingPrefixInTarget,
    });
  }

  async handle(...args: Parameters<ChatModelStreamHandler['handle']>): Promise<void> {
    const [event, data, metadata, graph] = args;
    const context = graph?.getAgentContext(metadata);

    if (context?.provider === Providers.GOOGLE && context.clientOptions?.disableStreaming === true) {
      return;
    }

    const chunk = data.chunk;
    if (!(chunk instanceof AIMessageChunk)) {
      return super.handle(...args);
    }

    const reasoningKey = context?.reasoningKey ?? 'reasoning_content';
    if (this.prefill.hasExistingPrefixInTarget && chunk.additional_kwargs?.[reasoningKey] != null) {
      const cleanedKwargs = { ...chunk.additional_kwargs };
      delete cleanedKwargs[reasoningKey];
      chunk.additional_kwargs = cleanedKwargs;
    }

    const rawText = extractMessageText(chunk);
    const isSchemaStrategy =
      this.prefill.strategy === 'schema_google' ||
      this.prefill.strategy === 'schema_anthropic' ||
      this.prefill.strategy === 'schema_openai';

    if (rawText !== '') {
      let transformedText: string;
      if (isSchemaStrategy) {
        transformedText = this.unwrapper.push(rawText);
      } else if (!this.prefill.hasExistingPrefixInTarget && !this.nativePrefixEmitted) {
        this.nativePrefixEmitted = true;
        const deduped = rawText.startsWith(this.prefill.prefillText)
          ? rawText.slice(this.prefill.prefillText.length)
          : rawText;
        transformedText = this.prefill.prefillText + deduped;
      } else {
        transformedText = rawText;
      }

      replaceChunkTextContent(chunk, transformedText);

      const hasReasoning =
        typeof chunk.additional_kwargs?.[reasoningKey] === 'string' &&
        chunk.additional_kwargs[reasoningKey] !== '';
      const hasToolCalls =
        (Array.isArray(chunk.tool_calls) && chunk.tool_calls.length > 0) ||
        (Array.isArray(chunk.tool_call_chunks) && chunk.tool_call_chunks.length > 0);
      const hasUsage = chunk.usage_metadata != null;

      if (transformedText === '' && !hasReasoning && !hasToolCalls && !hasUsage) {
        return;
      }
    }

    return super.handle(event, data, metadata, graph);
  }
}

function appendLongDraftPrefixToMessages(messages: BaseMessage[], prefillText: string): void {
  // Only needed when prefillText exceeds MAX_ENUM_ANCHOR_CHARS so the earlier
  // paragraphs of a long story draft remain visible in context while the tail
  // sentence is locked in the schema enum. Short prefills stay strictly inside
  // the schema enum and never pollute the user message.
  if (prefillText.length <= MAX_ENUM_ANCHOR_CHARS) {
    if (messages.length === 0) {
      messages.push(new HumanMessage('Continue.'));
    }
    return;
  }

  const earlierDraft = prefillText.slice(0, prefillText.length - MAX_ENUM_ANCHOR_CHARS);
  const draftBlock = `\n\n${earlierDraft}`;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const isHuman =
      msg instanceof HumanMessage ||
      msg._getType?.() === 'human' ||
      (msg as unknown as { role?: string }).role === 'user';
    if (!isHuman) {
      continue;
    }

    if (typeof msg.content === 'string') {
      messages[i] = new HumanMessage({
        content: msg.content + draftBlock,
        name: msg.name,
        additional_kwargs: { ...msg.additional_kwargs },
      });
      return;
    }

    if (Array.isArray(msg.content)) {
      const clonedContent = [...msg.content];
      let appended = false;
      for (let j = clonedContent.length - 1; j >= 0; j--) {
        const part = clonedContent[j];
        if (
          part != null &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part
        ) {
          clonedContent[j] = {
            ...part,
            text: `${part.text ?? ''}${draftBlock}`,
          };
          appended = true;
          break;
        }
      }
      if (!appended) {
        clonedContent.push({ type: 'text', text: draftBlock });
      }
      messages[i] = new HumanMessage({
        content: clonedContent,
        name: msg.name,
        additional_kwargs: { ...msg.additional_kwargs },
      });
      return;
    }
  }

  messages.push(new HumanMessage(earlierDraft));
}

type FetchFn = (
  ...args: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;

function attachNativePartialFetchWrapper(
  clientOptions: Record<string, unknown>,
  fieldKey: 'partial' | 'prefix',
): void {
  const configObj = ((clientOptions.configuration as Record<string, unknown> | undefined) ??
    {}) as Record<string, unknown>;
  const existingFetch: FetchFn = (configObj.fetch as FetchFn | undefined) ?? globalThis.fetch;
  let appliedOnce = false;

  const wrappedFetch: FetchFn = async (input, init) => {
    if (!appliedOnce && init?.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as {
          messages?: Array<Record<string, unknown>>;
        };
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          const lastMsg = parsed.messages[parsed.messages.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg[fieldKey] = true;
            appliedOnce = true;
            init = {
              ...init,
              body: JSON.stringify(parsed),
            };
          }
        }
      } catch {
        // Leave non-JSON bodies untouched
      }
    }
    return existingFetch(input, init);
  };

  clientOptions.configuration = {
    ...configObj,
    fetch: wrappedFetch,
  };
}

export function extractPrefillContext({
  messages,
  requestBody,
  agentInput,
  agentEndpoint,
}: {
  messages?: BaseMessage[];
  requestBody?: t.RequestBody;
  agentInput?: AgentInputs;
  agentEndpoint?: string;
}): PrefillContext | undefined {
  const clientOptions = (agentInput?.clientOptions ?? {}) as Record<string, unknown>;
  const model =
    (clientOptions.model as string | undefined) ??
    (clientOptions.modelName as string | undefined) ??
    requestBody?.model;
  const provider = agentInput?.provider;

  const composerPrefill =
    typeof requestBody?.responsePrefill === 'string' ? requestBody.responsePrefill : '';
  if (composerPrefill.length > 0) {
    const strategy = resolvePrefillStrategy({
      provider,
      model,
      endpoint: agentEndpoint ?? requestBody?.endpoint,
      clientOptions,
    });
    return {
      prefillText: composerPrefill,
      enumAnchor: computeEnumAnchor(composerPrefill),
      hasExistingPrefixInTarget: Boolean(requestBody?.editedContent),
      source: 'composer',
      strategy,
    };
  }

  if (Array.isArray(messages) && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (isAssistantMessageWithoutTools(lastMessage)) {
      const prefillText = extractMessageText(lastMessage);
      if (prefillText.length > 0) {
        const strategy = resolvePrefillStrategy({
          provider,
          model,
          endpoint: agentEndpoint ?? requestBody?.endpoint,
          clientOptions,
        });
        return {
          prefillText,
          enumAnchor: computeEnumAnchor(prefillText),
          hasExistingPrefixInTarget: Boolean(requestBody?.editedContent),
          source: 'trailing_ai',
          strategy,
        };
      }
    }
  }

  return undefined;
}

function applyMinimalGoogleThinkingForPrefill(clientOptions: Record<string, unknown>): void {
  const model = String(clientOptions.model ?? clientOptions.modelName ?? '').toLowerCase();
  if (/gemini-?[34]|gemma-?4/i.test(model)) {
    const isFlash = model.includes('flash');
    clientOptions.thinkingConfig = {
      includeThoughts: false,
      thinkingLevel: isFlash ? 'MINIMAL' : 'LOW',
    };
  } else if (/gemini-?2\.5/i.test(model)) {
    clientOptions.thinkingConfig = {
      includeThoughts: false,
      thinkingBudget: 0,
    };
  } else {
    delete clientOptions.thinkingConfig;
  }
}

export function applyPrefillToRun({
  agentInputs,
  messages,
  indexTokenCountMap,
  requestBody,
  customHandlers,
  agentEndpoint,
}: {
  agentInputs: AgentInputs[];
  messages?: BaseMessage[];
  indexTokenCountMap?: Record<number, number>;
  requestBody?: t.RequestBody;
  customHandlers?: Record<string, EventHandler>;
  agentEndpoint?: string;
}): Record<string, EventHandler> | undefined {
  const primaryAgent = agentInputs[0];
  if (!primaryAgent) {
    return customHandlers;
  }

  const prefill = extractPrefillContext({
    messages,
    requestBody,
    agentInput: primaryAgent,
    agentEndpoint,
  });

  if (!prefill) {
    return customHandlers;
  }

  const clientOptions = ((primaryAgent.clientOptions ?? {}) as Record<string, unknown>);
  primaryAgent.clientOptions = clientOptions as AgentInputs['clientOptions'];
  primaryAgent.summarizationEnabled = false;

  const isSchemaStrategy =
    prefill.strategy === 'schema_google' ||
    prefill.strategy === 'schema_anthropic' ||
    prefill.strategy === 'schema_openai';

  if (isSchemaStrategy) {
    if (Array.isArray(messages)) {
      if (prefill.source === 'trailing_ai' && messages.length > 0) {
        const poppedIndex = messages.length - 1;
        messages.pop();
        if (indexTokenCountMap && poppedIndex in indexTokenCountMap) {
          delete indexTokenCountMap[poppedIndex];
        }
      }
      appendLongDraftPrefixToMessages(messages, prefill.prefillText);
    }

    primaryAgent.tools = [];
    primaryAgent.toolDefinitions = [];
    primaryAgent.toolRegistry = undefined;

    if (prefill.strategy === 'schema_google') {
      ensureGoogleResponseSchemaSupport();
      applyMinimalGoogleThinkingForPrefill(clientOptions);
      const googleSchema = buildPrefillSchemaObject(prefill.enumAnchor, 'google');
      clientOptions.responseSchema = googleSchema;
      clientOptions.responseMimeType = 'application/json';
      clientOptions.json = { responseSchema: googleSchema };
    } else if (prefill.strategy === 'schema_anthropic') {
      const jsonSchema = buildPrefillSchemaObject(prefill.enumAnchor, 'json_schema');
      clientOptions.outputConfig = {
        ...((clientOptions.outputConfig as Record<string, unknown> | undefined) ?? {}),
        format: {
          type: 'json_schema',
          schema: jsonSchema,
        },
      };
    } else if (prefill.strategy === 'schema_openai') {
      const jsonSchema = buildPrefillSchemaObject(prefill.enumAnchor, 'json_schema');
      const existingKwargs =
        ((clientOptions.modelKwargs as Record<string, unknown> | undefined) ?? {});
      if (clientOptions.useResponsesApi === true) {
        clientOptions.modelKwargs = {
          ...existingKwargs,
          text: {
            format: {
              type: 'json_schema',
              name: 'prefill_continuation',
              strict: true,
              schema: jsonSchema,
            },
          },
        };
      } else {
        clientOptions.modelKwargs = {
          ...existingKwargs,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'prefill_continuation',
              strict: true,
              schema: jsonSchema,
            },
          },
        };
      }
    }
  } else {
    if (Array.isArray(messages) && prefill.source === 'composer') {
      messages.push(new AIMessage(prefill.prefillText));
    }
    if (prefill.strategy === 'native_kimi_partial') {
      attachNativePartialFetchWrapper(clientOptions, 'partial');
    } else if (prefill.strategy === 'native_deepseek_prefix') {
      attachNativePartialFetchWrapper(clientOptions, 'prefix');
    }
  }

  const existingEndHandler = customHandlers?.[GraphEvents.CHAT_MODEL_END];
  const wrappedEndHandler: EventHandler = {
    handle(event, data, metadata, graph) {
      const output = (data as { output?: AIMessageChunk } | undefined)?.output;
      if (output) {
        const rawFinalText = extractMessageText(output);
        if (rawFinalText !== '') {
          const unwrapped = unwrapCompletePrefillOutput(rawFinalText, prefill);
          replaceChunkTextContent(output, unwrapped);
        }
        if (prefill.hasExistingPrefixInTarget && output.additional_kwargs) {
          const reasoningKey = primaryAgent.reasoningKey ?? 'reasoning_content';
          if (output.additional_kwargs[reasoningKey] != null) {
            const cleaned = { ...output.additional_kwargs };
            delete cleaned[reasoningKey];
            output.additional_kwargs = cleaned;
          }
        }
      }
      return existingEndHandler?.handle(event, data, metadata, graph);
    },
  };

  return {
    ...customHandlers,
    [GraphEvents.CHAT_MODEL_STREAM]: new PrefillChatModelStreamHandler(prefill),
    [GraphEvents.CHAT_MODEL_END]: wrappedEndHandler,
  };
}
