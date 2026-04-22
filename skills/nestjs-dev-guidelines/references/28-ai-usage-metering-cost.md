# 28 — AI Usage Metering & Cost

## TL;DR

- Record **every** LLM call as a row: user, org, model, input/output tokens, cost (cents), latency, outcome.
- Aggregate per-user / per-org / per-day asynchronously (MV or rollup table). Don't compute on every read.
- Enforce **quotas** before the call (authoritative) and **cost alerts** after (monitoring).
- Track cost in **minor units as integers** (cents or milli-cents). Never floats for money.
- Expose a usage API for users to self-audit; a cost dashboard for internal.

## Why it matters

LLM bills are the #1 surprise on AI product invoices. A rogue loop or a single jailbreak that
calls the largest model in a loop can rack up thousands of dollars overnight. Per-call
metering + quotas + alerts convert "what happened?" into "caught it at 9am."

## Schema

### Call-level (raw, append-only)

```sql
CREATE TABLE llm_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  provider text NOT NULL,                         -- 'anthropic' | 'openai' | ...
  model text NOT NULL,                            -- 'claude-sonnet-4-6'
  prompt_name text,                               -- 'summarize' | 'chat' | ...
  prompt_version int,
  input_tokens int NOT NULL,
  output_tokens int NOT NULL,
  cached_input_tokens int NOT NULL DEFAULT 0,     -- for prompt caching
  cost_micro_usd bigint NOT NULL,                 -- 1 USD = 1,000,000 micro USD
  latency_ms int NOT NULL,
  outcome text NOT NULL,                          -- 'success' | 'error' | 'timeout' | 'aborted'
  error_code text,
  trace_id text,
  feature text,                                   -- 'chat' | 'summarize' | 'agent.plan'
  metadata jsonb                                  -- anything extra
);

CREATE INDEX idx_llm_usage_org_time ON llm_usage_events (organization_id, occurred_at DESC);
CREATE INDEX idx_llm_usage_user_time ON llm_usage_events (user_id, occurred_at DESC);
CREATE INDEX idx_llm_usage_model_time ON llm_usage_events (model, occurred_at DESC);
```

**Append-only.** Never update or delete. Use partitioning (monthly) if the table grows past
10M rows.

### Aggregated (rollups)

```sql
CREATE TABLE llm_usage_daily (
  occurred_on date NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  model text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  call_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (occurred_on, organization_id, user_id, model)
);
```

Updated by a daily rollup job or incrementally via an upsert on each event. The rollup makes
"usage this month" a fast point query.

## Cost calculation

Maintain a table of pricing (cents per 1M tokens) per (provider, model, kind).

```sql
CREATE TABLE llm_pricing (
  provider text NOT NULL,
  model text NOT NULL,
  effective_from date NOT NULL,
  input_cost_micro_usd_per_1m bigint NOT NULL,
  output_cost_micro_usd_per_1m bigint NOT NULL,
  cached_input_cost_micro_usd_per_1m bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, model, effective_from)
);
```

```ts
function calcCostMicroUsd(usage: Usage, pricing: Pricing): bigint {
  return (
    (BigInt(usage.inputTokens - usage.cachedInputTokens) * pricing.inputCostMicroUsdPer1m +
      BigInt(usage.cachedInputTokens) * pricing.cachedInputCostMicroUsdPer1m +
      BigInt(usage.outputTokens) * pricing.outputCostMicroUsdPer1m) /
    1_000_000n
  );
}
```

Prices change. Version them; compute using the pricing in effect at call time.

## Recording — in the gateway

```ts
// integrations/llm/usage-metering.service.ts
@Injectable()
export class UsageMeteringService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(event: UsageEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_usage_events (
         user_id, organization_id, provider, model, prompt_name, prompt_version,
         input_tokens, output_tokens, cached_input_tokens,
         cost_micro_usd, latency_ms, outcome, error_code, trace_id, feature
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        event.userId, event.organizationId, event.provider, event.model,
        event.promptName, event.promptVersion,
        event.inputTokens, event.outputTokens, event.cachedInputTokens ?? 0,
        event.costMicroUsd.toString(), event.latencyMs, event.outcome,
        event.errorCode, event.traceId, event.feature,
      ],
    );
  }
}
```

Called by `LlmService` after every call (success or failure). Failures count tokens too
(providers often charge for attempted calls).

## Quotas

### Authoritative check before the call

```ts
@Injectable()
export class QuotaService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async assertWithin(userId: string, model: string): Promise<void> {
    const { rows: [row] } = await this.pool.query<{ used: string; limit_micro_usd: string | null }>(
      `SELECT
         coalesce(sum(cost_micro_usd), 0)::text AS used,
         (SELECT llm_monthly_limit_micro_usd FROM users WHERE id = $1) AS limit_micro_usd
       FROM llm_usage_events
       WHERE user_id = $1
         AND occurred_at >= date_trunc('month', now())`,
      [userId],
    );
    const used = BigInt(row.used);
    const limit = row.limit_micro_usd ? BigInt(row.limit_micro_usd) : null;
    if (limit !== null && used >= limit) {
      throw new AppException(429, {
        code: 'BILLING.QUOTA_EXCEEDED',
        message: 'Monthly LLM usage limit reached.',
        details: { usedMicroUsd: used.toString(), limitMicroUsd: limit.toString() },
      });
    }
  }
}
```

For performance, cache the current usage in Redis (1-min TTL) with bypass on check-fail.

### Tiers

- Free: $5 / month
- Pro: $50 / month
- Enterprise: custom

Map plan → limit; store on user/org row.

### Graceful degradation

- 80% usage: warn the user (banner) + warn internally (alert).
- 100%: reject new calls with a clear upgrade path.
- Never silently truncate or fall back to a tiny model without notice.

## Cost alerts (monitoring, not authoritative)

Set up alerts on the usage metric:

- Global cost per hour > $X → page oncall.
- One user's last-hour cost > $X → investigate (possible abuse).
- Model `model=expensive-opus` ratio > threshold → someone forgot to route.

See `22-observability.md`.

## User-facing usage endpoint

```
GET /v1/usage?from=2026-04-01&to=2026-04-30
```

Returns aggregated usage + cost for the user / org, grouped by day / model.

```json
{
  "data": {
    "period": { "from": "2026-04-01", "to": "2026-04-30" },
    "totals": { "callCount": 1284, "inputTokens": 2450000, "outputTokens": 180000, "costUsd": "12.45" },
    "byModel": [
      { "model": "claude-sonnet-4-6", "callCount": 1100, "costUsd": "10.20" },
      { "model": "claude-haiku-4-5-20251001", "callCount": 184, "costUsd": "2.25" }
    ],
    "daily": [ { "date": "2026-04-01", "costUsd": "0.52" }, ... ]
  }
}
```

Cost presented to the user as fixed-decimal string from the stored integer.

## Billing integration

- Stripe metered billing: emit usage records to Stripe on rollup.
- Reconcile: compare your internal totals to Stripe reports monthly.
- Never over-bill; prefer under-billing on ambiguity (invoicing errors are expensive to fix).

## Prompt caching accounting

Anthropic + some others charge cached tokens at a lower rate. Record them separately:

```ts
{
  inputTokens: usage.input_tokens,
  cachedInputTokens: usage.cache_read_input_tokens ?? 0,
  outputTokens: usage.output_tokens,
}
```

Math uses different rates for cached vs uncached.

## Anti-patterns

- Not recording failures or aborted calls — they still cost.
- Computing monthly usage with a full-table scan on every request.
- Storing cost as float.
- Quotas only based on call count (a single expensive model call can be 50× a cheap one).
- Soft caps that silently truncate context — users confused by bad output.
- No per-user alerts, only global — one user with a loop drowns in the average.
- Not surfacing usage to users ("please explain why I'm being charged").
- Recording usage in the same transaction as the LLM call (slow + ties availability together).

## Code review checklist

- [ ] Every LLM call recorded in `llm_usage_events`, including failures
- [ ] Cost computed using pricing table; stored as integer minor units
- [ ] Prompt caching counted and priced separately
- [ ] Quota check before each call (not after); fast (cached or indexed)
- [ ] Rollup table updated on schedule; queries hit rollup, not raw events
- [ ] Alerts on per-hour cost + per-user spikes
- [ ] User-facing usage API respects paginated period queries
- [ ] No floats in cost; BigInt or integer columns

## See also

- [`26-ai-product-patterns.md`](./26-ai-product-patterns.md) — gateway calls `UsageMeteringService`
- [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md) — final `done` event emits usage
- [`22-observability.md`](./22-observability.md) — metrics and alerts
- [`13-database-design.md`](./13-database-design.md) — partitioning + indexes
