/**
 * Provider-agnostic streaming abstraction.
 * Falls back to chunked full-response when token streaming unavailable.
 */
import { chunkAnswerForIncrementalRender } from './scrolitha.os';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';

export type StreamEventType = 'start' | 'token' | 'chunk' | 'done' | 'error' | 'cancelled';

export type StreamEvent = {
  type: StreamEventType;
  requestId: string;
  text?: string;
  index?: number;
  error?: string;
  provider?: string;
  streamingMode: 'token' | 'chunk_fallback' | 'none';
};

export type StreamHandler = (event: StreamEvent) => void | Promise<void>;

export type StreamRequest = {
  requestId: string;
  systemPrompt?: string;
  userPrompt: string;
  providerHint?: string;
  signal?: AbortSignal;
  /**
   * If true, attempt real token streaming when provider supports it.
   * Default false until provider streaming is enabled in runtime config.
   */
  preferTokenStream?: boolean;
};

export type StreamResult = {
  requestId: string;
  fullText: string;
  streamingMode: 'token' | 'chunk_fallback' | 'none';
  provider: string;
  cancelled: boolean;
  events: number;
};

export interface LlmStreamProvider {
  readonly name: string;
  readonly supportsTokenStreaming: boolean;
  stream?(request: StreamRequest, onEvent: StreamHandler): Promise<StreamResult>;
  complete(request: StreamRequest): Promise<{ text: string; provider: string }>;
}

/**
 * Default completion adapter — uses existing Scrolitha generate path via callback injection.
 */
type CompleteFn = (input: {
  systemPrompt?: string;
  userPrompt: string;
}) => Promise<{ text: string; provider: string }>;

class FallbackStreamProvider implements LlmStreamProvider {
  readonly name = 'fallback_chunk';
  readonly supportsTokenStreaming = false;

  constructor(private readonly completeFn: CompleteFn) {}

  async complete(request: StreamRequest) {
    return this.completeFn({
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt
    });
  }

  async stream(request: StreamRequest, onEvent: StreamHandler): Promise<StreamResult> {
    let events = 0;
    const emit = async (event: Omit<StreamEvent, 'requestId' | 'streamingMode'> & { streamingMode?: StreamEvent['streamingMode'] }) => {
      events += 1;
      await onEvent({
        requestId: request.requestId,
        streamingMode: event.streamingMode || 'chunk_fallback',
        ...event
      });
    };

    if (request.signal?.aborted) {
      await emit({ type: 'cancelled', streamingMode: 'none' });
      return {
        requestId: request.requestId,
        fullText: '',
        streamingMode: 'none',
        provider: this.name,
        cancelled: true,
        events
      };
    }

    await emit({ type: 'start', streamingMode: 'chunk_fallback', provider: this.name });

    try {
      const completed = await this.complete(request);
      if (request.signal?.aborted) {
        await emit({ type: 'cancelled', provider: completed.provider });
        return {
          requestId: request.requestId,
          fullText: '',
          streamingMode: 'chunk_fallback',
          provider: completed.provider,
          cancelled: true,
          events
        };
      }

      const chunks = chunkAnswerForIncrementalRender(completed.text);
      for (let i = 0; i < chunks.length; i += 1) {
        if (request.signal?.aborted) {
          await emit({ type: 'cancelled', provider: completed.provider });
          return {
            requestId: request.requestId,
            fullText: chunks.slice(0, i).join('\n\n'),
            streamingMode: 'chunk_fallback',
            provider: completed.provider,
            cancelled: true,
            events
          };
        }
        await emit({
          type: 'chunk',
          text: chunks[i],
          index: i,
          provider: completed.provider
        });
      }

      await emit({
        type: 'done',
        text: completed.text,
        provider: completed.provider
      });

      // Optional short-lived stream transcript cache (not private long-term store)
      enterpriseCache.set(
        'streaming',
        hashCacheKey([request.requestId, 'result']),
        { text: completed.text, provider: completed.provider },
        120_000
      );

      return {
        requestId: request.requestId,
        fullText: completed.text,
        streamingMode: 'chunk_fallback',
        provider: completed.provider,
        cancelled: false,
        events
      };
    } catch (error: any) {
      await emit({
        type: 'error',
        error: String(error?.message || 'stream failed'),
        provider: this.name
      });
      throw error;
    }
  }
}

let streamProvider: LlmStreamProvider | null = null;

export const setStreamProvider = (provider: LlmStreamProvider) => {
  streamProvider = provider;
};

export const getStreamProviderStatus = () => ({
  provider: streamProvider?.name || 'unset',
  supportsTokenStreaming: Boolean(streamProvider?.supportsTokenStreaming),
  mode: streamProvider?.supportsTokenStreaming ? 'token_capable' : 'chunk_fallback',
  note: streamProvider?.supportsTokenStreaming
    ? 'Token streaming provider registered.'
    : 'Chunk fallback streaming active. Provider token streaming can be enabled without UI rewrites.'
});

export const createFallbackStreamProvider = (completeFn: CompleteFn) =>
  new FallbackStreamProvider(completeFn);

export const streamOrFallback = async (
  request: StreamRequest,
  onEvent: StreamHandler,
  completeFn: CompleteFn
): Promise<StreamResult> => {
  const provider =
    streamProvider ||
    (streamProvider = new FallbackStreamProvider(completeFn));

  if (request.preferTokenStream && provider.supportsTokenStreaming && provider.stream) {
    return provider.stream(request, onEvent);
  }

  // Graceful fallback path
  const fallback = provider.stream
    ? provider
    : new FallbackStreamProvider(completeFn);
  return fallback.stream!(request, onEvent);
};
