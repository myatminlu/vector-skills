# 22 — Observability

## TL;DR

- Three pillars: **logs** (discrete events; see `21`), **metrics** (aggregated numbers), **traces** (span tree of one request).
- Use **OpenTelemetry** for traces + metrics — vendor-neutral; export to any backend (Grafana Tempo, Datadog, Honeycomb, Jaeger).
- Correlation: every log, metric label, and span carries the same `traceId`.
- For LLM apps, add **Langfuse** or **Helicone** for prompt/completion tracing — standard OTel doesn't capture LLM semantics well.
- Alert on **user-visible symptoms** (p95 latency, 5xx rate), not just component-level metrics.

## Why it matters

Logs tell you what happened. Metrics tell you what's happening now. Traces tell you why. All
three together let you answer "why is payment latency up?" in minutes instead of hours.
Missing any one and incidents become guesswork.

## OpenTelemetry setup

```ts
// core/observability/otel.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';

export const otel = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': 'my-service',
    'service.version': process.env.APP_VERSION ?? 'dev',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    exportIntervalMillis: 15_000,
  }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },    // noisy, rarely useful
    '@opentelemetry/instrumentation-http': { ignoreIncomingRequestHook: (r) => r.url === '/health' },
  })],
});

// main.ts — BEFORE NestFactory
otel.start();
```

Auto-instrumentations give you HTTP server/client spans, pg, Redis, DNS, etc. for free.

## Custom spans

Add spans for business-important operations:

```ts
import { trace, SpanKind } from '@opentelemetry/api';

const tracer = trace.getTracer('payment-service');

async charge(userId: string, amount: number) {
  return tracer.startActiveSpan('charge', { attributes: { userId, amountCents: amount } }, async (span) => {
    try {
      const result = await this.stripe.charge(...);
      span.setAttribute('charge.status', 'success');
      return result;
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({ code: 2, message: 'charge failed' });
      throw e;
    } finally {
      span.end();
    }
  });
}
```

Use sparingly. Every span costs a little; hot paths shouldn't be over-instrumented.

### Span attributes — name them well

- `userId`, `organizationId`
- `<resource>.id` (e.g. `payment.id`, `message.id`)
- `outcome` — `success` / `failed` / `cached`
- `provider` — `stripe` / `anthropic` / `openai`
- Quantities: `batchSize`, `rowCount`, `tokenCount`

Don't put PII (email, name, address) on spans — same as logs.

## Metrics

Define stable metrics for dashboards + alerting:

```ts
import { metrics } from '@opentelemetry/api';
const meter = metrics.getMeter('my-service');

const paymentCounter = meter.createCounter('payment.attempts', {
  description: 'Total payment attempts',
});
paymentCounter.add(1, { status: 'success', provider: 'stripe' });

const chargeDuration = meter.createHistogram('payment.charge.duration_ms');
chargeDuration.record(Date.now() - start, { provider: 'stripe' });
```

### Essential metrics

| Type | Metric | Labels |
|---|---|---|
| HTTP | request count, latency (histogram) | method, route, status |
| DB | query count, latency, errors | query_name |
| External call | count, latency, errors | provider, operation |
| Queue | depth, processed, failed | queue_name |
| Domain | sign-ups, payments, orders, LLM calls | outcome, status |

Prefer **histograms** (p50/p95/p99 later) over averages. Averages hide tails; tails wake oncall.

### Cardinality discipline

Labels multiply time-series. Avoid:
- `userId` as a label (every user → a new series).
- Unbounded strings (`errorMessage`) as labels.

Use:
- Finite enums (`status`, `provider`, `region`).
- Buckets (`route: '/v1/payments/:id'` — route template, not URL).

## Traces: propagation

- Auto-instrumentation reads `traceparent` header on incoming HTTP and writes it on outgoing `fetch` / axios / pg.
- For queues (BullMQ), manually carry `traceparent` in job data:

```ts
import { context, propagation } from '@opentelemetry/api';

async enqueue(data: T) {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  await this.queue.add('job', { ...data, _carrier: carrier });
}

async process(job: Job<T & { _carrier?: Record<string, string> }>) {
  const parent = job.data._carrier ? propagation.extract(context.active(), job.data._carrier) : context.active();
  return context.with(parent, () => this.handle(job.data));
}
```

Now a single trace spans: HTTP → DB write → queue insert → worker pickup → LLM call → DB update.

## LLM-specific observability

Standard OTel doesn't capture LLM semantics well (tokens, cost, prompt version, tool calls).
Use **Langfuse** or **Helicone** (or proprietary: Arize, Phoenix).

### Langfuse example

```ts
import { Langfuse } from 'langfuse';
const langfuse = new Langfuse({ publicKey, secretKey });

async generate(userId: string, prompt: string) {
  const trace = langfuse.trace({ userId, name: 'completion' });
  const generation = trace.generation({
    name: 'claude-4-7-sonnet',
    model: 'claude-sonnet-4-6',
    input: prompt,
  });
  try {
    const resp = await this.anthropic.messages.create({ ... });
    generation.end({
      output: resp.content,
      usage: { input: resp.usage.input_tokens, output: resp.usage.output_tokens },
    });
    return resp;
  } catch (e) {
    generation.end({ level: 'ERROR', statusMessage: String(e) });
    throw e;
  }
}
```

Langfuse then gives: latency, cost, token counts, prompt versions, per-user aggregates,
eval scores. Much richer than raw OTel spans for LLM work. See `26-ai-product-patterns.md`.

## Dashboards

One per audience:

- **Service overview** (oncall) — request rate, error rate, p95 latency, queue depth.
- **Per-endpoint** (feature eng) — latency + errors + throughput per route.
- **Business** (PM/leadership) — sign-ups, payments, LLM calls per hour.
- **LLM** (ML eng) — tokens, cost, model mix, avg completion length.

Save dashboards as code (Grafana JSON in repo) so they survive account resets and migrations.

## Alerts

- Alert on **symptoms**, not causes: "5xx rate > 2% for 5m", "p95 > 2s for 10m", "queue depth > 10k".
- Every alert has a **runbook link** (`docs/OPERATIONS.md`).
- Page only on user-facing impact. Warn-only alerts for internal-only regressions.
- Avoid alert fatigue: a good alert fires ≤ once per week on average.

Common:
- `5xx > 2% for 5m → page`
- `p95 > 2s for 10m → page`
- `DB pool waiting > 0 for 2m → page`
- `DLQ depth > 100 → warn`
- `outbound upstream error > 10% for 5m → page`
- `LLM cost > $X per hour → warn`

## SLIs / SLOs

For real products, define:

- **SLI** (Service Level Indicator): "% of requests that return < 1s" (p99 latency). "% of requests that return non-5xx" (availability).
- **SLO**: "99.5% of requests return < 1s over 30 days."
- **Error budget**: 0.5% = ~3.6 hours / 30 days of slow or failed requests.

Burn-rate alerts (fast burn = 2% of budget in 1h → page).

## Sampling

- Traces at 100% in dev / staging.
- Traces at 5–20% in prod for cost reasons; 100% on 5xx (tail-based sampling if available).
- Metrics always at 100% — cheap.
- Logs at 100% but filter at the aggregator by level.

## Costs

- Traces are the expensive one; sample aggressively in prod.
- Metrics are cheap but cardinality explodes fast — police labels.
- Logs: info+ in prod; debug temporarily.
- LLM tracing (Langfuse): usually < 1% of LLM cost itself.

## Code review checklist

- [ ] OpenTelemetry initialized before NestFactory
- [ ] Service name, version, env set as resource attributes
- [ ] Custom spans added for business-critical operations; no PII in attributes
- [ ] Histograms used for latency (not gauges or averages)
- [ ] Labels have finite cardinality (no userId, no errorMessage)
- [ ] `traceparent` propagated through queues / outbound HTTP
- [ ] LLM calls traced via Langfuse / Helicone for cost + token visibility
- [ ] Dashboards saved as code; alerts have runbook links
- [ ] SLO-based alerts (symptom) preferred over component-level

## See also

- [`21-logging.md`](./21-logging.md) — third pillar
- [`10-error-handling.md`](./10-error-handling.md) — traceId on errors
- [`26-ai-product-patterns.md`](./26-ai-product-patterns.md) — LLM tracing
- [`28-ai-usage-metering-cost.md`](./28-ai-usage-metering-cost.md) — cost metrics
