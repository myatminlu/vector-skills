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
  model: string;                       // provider model id or internal alias; verify against current docs/config
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LlmTool[];
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  jsonSchema?: unknown;
  stream?: boolean;
  metadata?: {
    userId?: string;
    orgId?: string;            // project convention; gateway maps to organizationId at the boundary
    traceId?: string;
    feature?: string;          // 'chat' | 'summarize' | 'agent.plan'
    promptName?: string;       // for usage attribution
    promptVersion?: number;
  };
}

export interface LlmCallResult {
  text: string;
  toolCalls?: LlmToolCall[];
  usage: {
    inputTokens: number;                 // UNCACHED input only (non-overlapping with cache buckets); see `28` for provider mapping
    outputTokens: number;
    totalTokens: number;                 // inputTokens + cacheReadInputTokens + cacheWriteInputTokens + outputTokens
    cacheReadInputTokens?: number;       // prompt-cache HIT (discounted rate)
    cacheWriteInputTokens?: number;      // prompt-cache WRITE (premium on Anthropic)
  };
  costMicroUsd: bigint;                  // 1 USD = 1,000,000 micro USD; matches `28`'s schema
  model: string;
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'pause_turn' | 'error' | 'other';
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
    @InjectPinoLogger(LlmService.name) private readonly logger: PinoLogger,
  ) {
    for (const p of providers) this.providers.set(p.name, p);
  }

  async call(input: LlmCallInput): Promise<LlmCallResult> {
    const meta = input.metadata ?? {};
    // Quota enforcement runs at both user and org scope; either may be omitted. See `28`.
    if (meta.userId || meta.orgId) {
      await this.quota.assertWithin({ userId: meta.userId, organizationId: meta.orgId });
    }

    const provider = this.providerFor(input.model);
    const started = Date.now();

    let result: LlmCallResult | undefined;
    let outcome: 'success' | 'error' | 'timeout' | 'aborted' = 'success';
    let errorCode: string | undefined;
    try {
      try {
        result = await this.withRetry(() => provider.call(input));
      } catch (e) {
        this.logger.warn({ err: e, model: input.model }, 'llm primary failed');
        result = await this.fallback(input);
      }
      return result;
    } catch (e) {
      outcome = classifyOutcome(e);     // 'error' | 'timeout' | 'aborted'
      errorCode = errorCodeOf(e);
      throw e;
    } finally {
      // Record on success AND failure — providers often charge for attempted calls.
      // `record()` enqueues; the worker writes the row. See `28` for the queue + rollup design.
      await this.usage.record({
        userId: meta.userId,
        organizationId: meta.orgId,           // map caller convention → DB column convention
        provider: provider.name,
        model: result?.model ?? input.model,
        promptName: meta.promptName,
        promptVersion: meta.promptVersion,
        inputTokens: result?.usage.inputTokens ?? 0,
        cacheReadInputTokens: result?.usage.cacheReadInputTokens ?? 0,
        cacheWriteInputTokens: result?.usage.cacheWriteInputTokens ?? 0,
        outputTokens: result?.usage.outputTokens ?? 0,
        costMicroUsd: result?.costMicroUsd ?? 0n,
        latencyMs: Date.now() - started,
        outcome,
        errorCode,
        traceId: meta.traceId,
        feature: meta.feature,
      });
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(); }
      catch (e) {
        last = e;
        if (isNonRetryable(e)) throw e;
        if (i === attempts - 1) break;
        // Honor provider Retry-After (seconds) when present; otherwise exponential backoff with jitter.
        const retryAfterMs = retryAfterMsFromError(e);
        const backoffMs = retryAfterMs ?? (500 * 2 ** i + Math.floor(Math.random() * 250));
        await sleep(backoffMs);
      }
    }
    throw last;
  }

  private async fallback(input: LlmCallInput): Promise<LlmCallResult> {
    // e.g. primary_reasoning → balanced → low_cost, or provider_a → provider_b for availability
    const fallbackModel = FALLBACKS[input.model];
    if (!fallbackModel) throw new ServiceUnavailableException({ code: 'LLM.UPSTREAM_DOWN', message: 'AI provider unavailable' });
    const provider = this.providerFor(fallbackModel);
    return provider.call({ ...input, model: fallbackModel });
  }

  // Public so callers (e.g. SSE service in `27`) can attribute usage to the right provider.
  providerFor(model: string): LlmProvider {
    for (const p of this.providers.values()) {
      if (p.supportedModels.includes(model)) return p;
    }
    throw new BadGatewayException({
      code: 'LLM.UNKNOWN_MODEL',
      message: `No provider configured for model "${model}"`,
    });
  }
}

// ── Helpers expected to live next to LlmService ───────────────────────────────
// Implement these against your provider's error shape; keep them small & pure.
declare function isNonRetryable(e: unknown): boolean;        // 400 / 401 / 403 / token-limit
declare function retryAfterMsFromError(e: unknown): number | undefined;
declare function classifyOutcome(e: unknown): 'error' | 'timeout' | 'aborted';
declare function errorCodeOf(e: unknown): string | undefined;
declare function sleep(ms: number): Promise<void>;
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
  primary_reasoning: 'balanced_text',
  balanced_text: 'low_cost_text',
  provider_a_balanced: 'provider_b_balanced',
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

// Reusable helper — keep next to LlmService in `integrations/llm/`.
export async function callJsonWithRepair<T extends z.ZodTypeAny>(
  llm: LlmService,
  input: LlmCallInput,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await llm.call({ ...input, responseFormat: 'json_object' });
  const first = tryParse(schema, raw.text);
  if (first.ok) return first.data;

  // One repair attempt: feed the schema error back and ask for valid JSON.
  const fixed = await llm.call({
    ...input,
    responseFormat: 'json_object',
    messages: [
      ...input.messages,
      { role: 'assistant', content: raw.text },
      { role: 'user', content: `Invalid output. Fix to match schema: ${first.error}` },
    ],
  });
  const second = tryParse(schema, fixed.text);
  if (second.ok) return second.data;

  throw new BadGatewayException({
    code: 'LLM.INVALID_OUTPUT',
    message: 'Upstream model returned invalid output.',
    details: second.issues,
  });
}

// Wrap JSON.parse so a non-JSON body (e.g. stray prose or a code fence) flows
// through the same repair path as a schema mismatch instead of throwing uncaught.
function tryParse<T extends z.ZodTypeAny>(
  schema: T,
  text: string,
): { ok: true; data: z.infer<T> } | { ok: false; error: string; issues?: z.ZodIssue[] } {
  let json: unknown;
  try { json = JSON.parse(text); }
  catch (e) { return { ok: false, error: `Not valid JSON: ${(e as Error).message}` }; }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.message, issues: parsed.error.issues };
}

// Caller — inside any service that injects LlmService:
class SummarizerService {
  constructor(private readonly llm: LlmService) {}

  async summarize(text: string) {
    return callJsonWithRepair(this.llm, {
      model: env.LLM_SUMMARY_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        { role: 'user', content: text },
      ],
    }, SummarySchema);
  }
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
model_preference: summary_balanced
---

You are a senior editor. Summarize the following text in exactly 5 bullets...
```

- Each call references a prompt by (name, version).
- Track which prompt version was used in usage metering and tracing.
- A/B new prompt versions behind a feature flag.

### Prompt caching (provider-specific)

When you call the same system prompt many times with different user messages, reuse server-side
prompt state. Each provider exposes this differently — opt in inside the **provider adapter**, not
in feature code, so callers stay provider-agnostic. Verify current pricing and cache semantics
against the provider's docs before relying on a specific savings percentage.

- **Anthropic** — explicit, ephemeral. `system` is a top-level field (not a `role: 'system'`
  message) and `cache_control` lives on the block, not the message:

  ```ts
  // inside AnthropicProvider.call(): map LlmCallInput → SDK request
  await client.messages.create({
    model,
    system: [
      { type: 'text', text: longStableSystemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: maxTokens,
  });
  ```

- **OpenAI** — automatic for prompts above the cache threshold; no API flag required. Keep the
  stable prefix (system + few-shot examples) at the **start** of the prompt and put per-call
  variation at the end. Read `usage.prompt_tokens_details.cached_tokens` from the response to
  attribute savings.

- **Google Gemini** — explicit `cachedContent` resource. Create a cached content handle for the
  stable system + tools, then reference it on each call (`cached_content: name`). TTL applies, so
  refresh on rotation.

In every case, expose the cache result through `LlmCallResult.usage` so cost metering can split
cached vs uncached tokens. Anthropic exposes both `cache_read_input_tokens` (HIT, discounted)
and `cache_creation_input_tokens` (WRITE, premium) — surface them as `cacheReadInputTokens` and
`cacheWriteInputTokens` respectively. Providers without a separate write rate (OpenAI, Gemini)
populate only the read field. See [`28-ai-usage-metering-cost.md`](./28-ai-usage-metering-cost.md).

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
    return callJsonWithRepair(this.llm, {
      model: env.LLM_SUMMARY_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        { role: 'user', content: text },
      ],
      maxTokens: 1000,
      metadata: { userId, traceId },
    }, SummarySchema);
  }
}
```

### Bad

```ts
@Injectable()
export class SummarizerService {
  async summarize(text: string) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); // ❌ direct SDK, new client each call
    const response = await anthropic.messages.create({                           // ❌ no timeout, no retry, no fallback
      model: process.env.MODEL!,                                                 // ❌ unvalidated env, no model whitelist
      max_tokens: 1000,
      messages: [{ role: 'user', content: text }],
    });
    return JSON.parse((response.content[0] as any).text);                        // ❌ no schema validation, throws on non-JSON
    // ❌ no cost tracking, no observability, no quota check, no PII redaction
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
- [ ] Model is a stable, validated string from a whitelist (no `"latest"` aliases, no raw `process.env.MODEL`)
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
- Provider-specific skills (use inside the corresponding adapter, not in feature code):
  - `claude-api` — Anthropic SDK patterns, prompt caching, thinking, batch
  - `gemini-interactions-api` — Gemini SDK, structured output, multimodal
  - `gemini-live-api-dev` — Gemini Live API for realtime audio/video streaming
  - `vertex-ai-api-dev` — Gemini on Vertex AI in enterprise environments
