# 26 — AI Product Patterns (LLM Gateway)

## TL;DR

- Don't call provider SDKs directly from feature services. Build a **provider-agnostic LLM gateway** (`integrations/llm/`) with a stable internal interface.
- Always: timeout, retry with backoff, fallback, cost metering, structured output validation (Zod), prompt versioning.
- Treat LLM responses as untrusted. Validate the JSON with Zod before using. Retry once on schema mismatch.
- Cache the parts that are worth caching — prompt cache for fixed system prompts; embedding cache for stable inputs; **don't** cache user-specific completions.
- Observability: Langfuse / Helicone for prompt-level traces; metrics for tokens, cost, latency per model.

## Why it matters

LLM calls are: slow, expensive, non-deterministic, flaky, and regulated by rate limits and
quotas. Wrapping them behind a gateway gives you one place to add retries, fallbacks, cost
tracking, and to swap providers without rewriting features.

## Gateway architecture

```
modules/conversation/          ← feature code
        ↓
 integrations/llm/llm.service  ← provider-agnostic (the gateway)
        ↓
 integrations/llm/providers/
     ├── anthropic.provider.ts
     ├── openai.provider.ts
     └── google.provider.ts
```

Feature code never imports `@anthropic-ai/sdk` directly. It depends on `LlmService`.

## Internal interface

```ts
// integrations/llm/llm.types.ts
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LlmMessagePart[];
  toolCallId?: string;
}

export interface LlmCallInput {
  model: string;                       // 'claude-sonnet-4-6' | 'gpt-4o' | ...
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LlmTool[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  jsonSchema?: unknown;
  stream?: boolean;
  metadata?: { userId?: string; orgId?: string; traceId?: string };
}

export interface LlmCallResult {
  text: string;
  toolCalls?: LlmToolCall[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  costCents: number;
  model: string;
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'error';
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: string;                                  // 'anthropic' | 'openai' | ...
  readonly supportedModels: string[];
  call(input: LlmCallInput): Promise<LlmCallResult>;
  stream(input: LlmCallInput): AsyncIterable<LlmStreamChunk>;
}
```

This becomes the stable contract. Providers implement it; features depend on it.

## Gateway service

```ts
// integrations/llm/llm.service.ts
@Injectable()
export class LlmService {
  private readonly providers = new Map<string, LlmProvider>();

  constructor(
    @Inject(LLM_PROVIDERS) providers: LlmProvider[],
    private readonly usage: UsageMeteringService,
    private readonly quota: QuotaService,
    private readonly logger: PinoLogger,
  ) {
    for (const p of providers) this.providers.set(p.name, p);
  }

  async call(input: LlmCallInput): Promise<LlmCallResult> {
    const { userId, orgId } = input.metadata ?? {};
    if (userId) await this.quota.assertWithin(userId, input.model);

    const provider = this.providerFor(input.model);
    const started = Date.now();

    let result: LlmCallResult;
    try {
      result = await this.withRetry(() => provider.call(input));
    } catch (e) {
      this.logger.warn({ err: e, model: input.model }, 'llm primary failed');
      result = await this.fallback(input);
    }

    await this.usage.record({
      userId, orgId, model: result.model, provider: provider.name,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costCents: result.costCents,
      latencyMs: Date.now() - started,
    });

    return result;
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(); }
      catch (e) {
        last = e;
        if (isNonRetryable(e)) throw e;
        await sleep(500 * 2 ** i);
      }
    }
    throw last;
  }

  private async fallback(input: LlmCallInput): Promise<LlmCallResult> {
    // e.g. primary: claude-opus → fallback: claude-sonnet; or primary: anthropic → fallback: openai
    const fallbackModel = FALLBACKS[input.model];
    if (!fallbackModel) throw new AppException(503, { code: 'LLM.UPSTREAM_DOWN', message: 'AI provider unavailable' });
    const provider = this.providerFor(fallbackModel);
    return provider.call({ ...input, model: fallbackModel });
  }

  private providerFor(model: string): LlmProvider {
    for (const p of this.providers.values()) {
      if (p.supportedModels.includes(model)) return p;
    }
    throw new Error(`Unknown model ${model}`);
  }
}
```

## Timeouts

- Interactive calls: 30s (user is waiting).
- Background / batch: 2–5 min.
- Streaming: per-chunk heartbeat (see `27`).

Never rely on default SDK timeouts — always pass `AbortSignal.timeout(...)`.

## Retries

- **Retry**: 429 (rate limited — honor `Retry-After`), 5xx, network errors, timeout.
- **Don't retry**: 400 (bad prompt), 401 (bad key), 403 (org blocked), token-limit exceeded.
- Exponential backoff with jitter.
- Cap total retry budget (e.g., 3 attempts within 30s for interactive).

## Fallbacks

Define chains per concern, not per model:

```ts
const FALLBACKS: Record<string, string> = {
  'claude-opus-4-7': 'claude-sonnet-4-6',
  'claude-sonnet-4-6': 'claude-haiku-4-5-20251001',
  'gpt-4o': 'gpt-4o-mini',
};
```

Or cross-provider for availability (slower, behavior differs — signal to user if needed).

## Structured output (Zod)

LLM JSON is suspect. Don't trust it until parsed.

```ts
const SummarySchema = z.object({
  title: z.string().min(1).max(200),
  bullets: z.array(z.string()).min(1).max(5),
  tone: z.enum(['positive', 'neutral', 'negative']),
});

async summarize(text: string) {
  const raw = await this.llm.call({
    model: 'claude-sonnet-4-6',
    messages: [...],
    responseFormat: 'json_object',
  });

  const parsed = SummarySchema.safeParse(JSON.parse(raw.text));
  if (!parsed.success) {
    // One repair attempt: send the error back and ask for valid JSON
    const fixed = await this.llm.call({
      model: 'claude-sonnet-4-6',
      messages: [
        ...originalMessages,
        { role: 'assistant', content: raw.text },
        { role: 'user', content: `Invalid output. Fix to match schema: ${parsed.error.message}` },
      ],
    });
    const p2 = SummarySchema.safeParse(JSON.parse(fixed.text));
    if (!p2.success) throw new AppException(502, { code: 'LLM.INVALID_OUTPUT', details: p2.error.issues });
    return p2.data;
  }
  return parsed.data;
}
```

Cheaper option: strict JSON mode + a Zod check + log-and-alert on failures rather than repair.

## Prompt management

### Version prompts

```ts
// prompts/summarize-v2.md
---
version: 2
description: 5-bullet summary with tone
model_preference: claude-sonnet-4-6
---

You are a senior editor. Summarize the following text in exactly 5 bullets...
```

- Each call references a prompt by (name, version).
- Track which prompt version was used in usage metering and tracing.
- A/B new prompt versions behind a feature flag.

### Prompt caching (Anthropic)

When you call the same system prompt many times with different user messages, use Anthropic's
prompt caching to reuse server-side state (see the `claude-api` skill for details).

```ts
messages: [
  { role: 'system', content: longStableSystemPrompt, cache_control: { type: 'ephemeral' } },
  { role: 'user', content: userMessage },
];
```

Cache hits save ~90% cost and 50–90% latency on the cached portion. Use aggressively for
anything > 1k tokens stable.

## Agents + tool use

- Define tools as typed Zod schemas; generate the JSON schema from Zod.
- Validate tool-call arguments with Zod before executing.
- Gate tool calls with the user's permissions — never let the LLM escalate.
- Log every tool call; alert on unexpected calls or high rates.

```ts
const searchTool = {
  name: 'search_products',
  description: 'Search products by keyword',
  input_schema: zodToJsonSchema(z.object({
    query: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(50).default(10),
  })),
};
```

## RAG (retrieval augmented generation)

If your app retrieves before generating:

- Store embeddings in pgvector (Postgres) for small scale; Pinecone/Qdrant at large scale.
- Chunk documents at paragraph or heading boundaries; 500–1500 tokens per chunk is typical.
- Include source citations in the LLM response for user trust + debugging.
- Cache embedding lookups for stable inputs.

## Quotas / abuse

- Per-user and per-org daily / monthly quotas (tokens or dollars).
- Hard stop at limit: return `429 BILLING.QUOTA_EXCEEDED` with upgrade path.
- Alert at 80% usage internally (sign of runaway script or attacker).
- Rate limit per user (e.g., 10 LLM requests / minute) independent of billing.

See `28-ai-usage-metering-cost.md`.

## PII + LLM

- Redact PII from prompts when possible (hash emails, mask phone).
- Don't send regulated data (HIPAA, PCI) to providers without an agreement (BAA / DPA).
- Log only prompt ID, not the prompt content, unless you've explicitly configured safe logging.
- LLM responses may leak PII from the prompt — don't display raw completions to unauthorized users.

## Evals (continuous)

- Curated test set of (input, expected-shape, optionally expected-content) per feature.
- Run on every model / prompt change.
- Track: schema-validity rate, cost per call, latency, LLM-as-judge score, regressions.
- Lightweight: JSON Schema match + assertion count.
- Langfuse / Braintrust / internal script — pick one, keep it in CI for high-risk features.

## Observability

- Trace every LLM call (Langfuse / Helicone).
- Metrics: tokens in/out, cost, latency, model, user, outcome (success / schema-fail / error / timeout).
- Dashboard: cost per hour, p95 latency per model, schema-fail rate.

See `22-observability.md`.

## Good vs bad

### Good

```ts
@Injectable()
export class SummarizerService {
  constructor(private readonly llm: LlmService) {}

  async summarize(userId: string, text: string, traceId: string): Promise<Summary> {
    const result = await this.llm.call({
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        { role: 'user', content: text },
      ],
      responseFormat: 'json_object',
      maxTokens: 1000,
      metadata: { userId, traceId },
    });
    return SummarySchema.parse(JSON.parse(result.text));
  }
}
```

### Bad

```ts
@Injectable()
export class SummarizerService {
  async summarize(text: string) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); // ❌ direct SDK, new client each call
    const response = await anthropic.messages.create({                           // ❌ no timeout, no retry
      model: 'claude-3-5-sonnet-latest',                                         // ❌ implicit, unversioned model
      max_tokens: 1000,
      messages: [{ role: 'user', content: text }],
    });
    return JSON.parse((response.content[0] as any).text);                        // ❌ no schema validation
    // no cost tracking, no observability, no quota check
  }
}
```

## Anti-patterns

- Direct provider SDK calls from feature code.
- No timeout; waiting minutes for a hung call.
- No retry on 429 / 5xx.
- No fallback; one provider down = app down.
- Unvalidated LLM JSON used as typed data.
- Prompts as inline strings scattered across code.
- No cost / usage tracking until the bill arrives.
- Temperature > 0 for structured output (non-determinism).
- Sending raw user PII to third-party providers without a DPA.

## Code review checklist

- [ ] Feature code uses `LlmService`, not provider SDKs directly
- [ ] Model specified as a stable string (no "latest" aliases)
- [ ] Timeouts and retries explicit
- [ ] Fallback configured for primary model
- [ ] Structured output validated with Zod
- [ ] Prompt versioned and referenced
- [ ] Usage metered; quota checked
- [ ] Tool calls validated against schemas before execution
- [ ] Langfuse / Helicone tracing in place
- [ ] No PII sent where a DPA doesn't exist

## See also

- [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md) — streaming LLM output
- [`28-ai-usage-metering-cost.md`](./28-ai-usage-metering-cost.md) — cost + quotas
- [`22-observability.md`](./22-observability.md) — LLM traces
- `claude-api` skill — Claude-specific prompt caching and migration
- `gemini-interactions-api` skill — Gemini-specific patterns
