# Phase 33.0 — Provider Architecture

## Interface

```ts
interface AIProvider {
  generateText(request: AITextRequest): Promise<AITextResponse>;
  generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>>;
  embed?(request: AIEmbeddingRequest): Promise<AIEmbeddingResponse>;
  moderate?(request: AIModerationRequest): Promise<AIModerationResponse>;
  healthCheck(): Promise<AIProviderHealth>;
}
```

## Supported providers

| Id | Adapter | Network | Default |
|----|---------|---------|---------|
| OLLAMA | Adapts `generateScrolithaText` / core | Yes when enabled | Preferred internal |
| GEMINI | `@google/generative-ai` | External | Off until config + consent |
| OPENAI | `openai` package | External | Off until config + consent |
| MOCK | Deterministic local | **Never** | Used when provider calls disabled |

## Rules

1. Feature modules **must not** instantiate provider SDKs.  
2. Credentials only from env / Secret Manager — never API body or client responses.  
3. `enableProviderCalls === false` forces MOCK path.  
4. Emergency shutdown disables all non-MOCK providers.  
5. Additional providers can be registered in `providers/index.ts` without changing feature code.

## Health

`healthAllProviders()` returns status snapshots for admin UI. Admin “test” is health-only in 33.0.
