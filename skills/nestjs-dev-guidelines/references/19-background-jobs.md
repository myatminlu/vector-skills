# 19 — Background Jobs

## TL;DR

- Default: **BullMQ** on Redis. Mature, scheduling, retries, DLQ, dashboard (bull-board).
- Alternative without Redis: **pg-boss** (runs on Postgres). Simpler ops.
- Always: **idempotent handlers**, **bounded retries with exponential backoff**, **DLQ** for poison messages.
- Queue anything > 200ms, external-call, unreliable-upstream, or safe-to-defer. Don't queue user-blocking work.
- Propagate `traceId` through job data so worker logs correlate with the originating request.
- Separate worker process in prod (own deployment, own CPU). API process does not run workers at scale.

## Why it matters

Long work inside the HTTP handler times out, holds DB connections, and blocks event-loop.
Queues decouple "accept" from "process", add retries, and scale horizontally. Done wrong,
they're hidden sources of duplicates, silent failures, and runaway cost.

## BullMQ basics

### Install + module

```ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: { url: env.REDIS_URL },
      }),
    }),
    BullModule.registerQueue({ name: 'email' }),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
    BullModule.registerQueue({ name: 'llm-run' }),
  ],
})
export class AppModule {}
```

### Produce (in a service)

```ts
@Injectable()
export class WelcomeEmailProducer {
  constructor(@InjectQueue('email') private readonly queue: Queue) {}

  async send(userId: string, traceId?: string) {
    await this.queue.add(
      'welcome',
      { userId, traceId },
      {
        jobId: `welcome:${userId}`,          // dedupe — one welcome per user
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 3600 },     // keep 1h of completed jobs
        removeOnFail: { age: 24 * 3600 },
      },
    );
    // Note: jobId dedupe only holds while the job exists in Redis. Once
    // removeOnComplete evicts it (1h here), a second add with the same id
    // will succeed. For permanent idempotency, pair this with an inbox table
    // or an idempotent side effect — see "Idempotency" below.
  }
}
```

### Consume (worker)

```ts
@Processor('email', { concurrency: 10 })
export class EmailWorker extends WorkerHost {
  constructor(private readonly mail: MailService, private readonly users: UserService) {
    super();
  }

  async process(job: Job<{ userId: string; traceId?: string }>) {
    const { userId, traceId } = job.data;
    const user = await this.users.findById(userId);
    if (!user) return; // user gone — idempotent no-op
    await this.mail.sendTemplate(user.email, 'welcome', { name: user.name }, { traceId });
  }
}
```

### Deployment topology

- Dev: worker and API run in same Node process (OK for small volumes).
- Prod: **separate worker process(es)**. API container does not register workers. Scale workers independently.

One image, two entrypoints. Pick the command at deploy time:

```yaml
# docker-compose.yml (illustrative)
services:
  web:
    image: myapp:latest
    command: ["node", "dist/main.js"]
  worker:
    image: myapp:latest
    command: ["node", "dist/worker.js"]
```

```dockerfile
# Dockerfile — single image, no CMD; the orchestrator chooses the entrypoint
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
# CMD is intentionally omitted; set it per service in compose / k8s manifest.
```

## Idempotency

**Every job handler must be safe to run twice.**

Strategies:
- **Natural key** — ``jobId: `welcome:${userId}` `` — BullMQ refuses a second enqueue with the same id while the job still exists in Redis.
- **Inbox** — `processed_jobs(job_id, completed_at)` — handler inserts unique row first; if conflict, exit.
- **Idempotent side effect** — `UPDATE users SET welcomed = true WHERE id = $1 AND welcomed = false` is naturally idempotent.

Why it matters: retries, duplicate publisher, worker crash mid-job — all cause re-processing.

## Retries

- `attempts: 5` is a reasonable default for external calls.
- Exponential backoff: `backoff: { type: 'exponential', delay: 2000 }` — 2s, 4s, 8s, 16s, 32s.
- Cap total time: jobs that retry for > 24h become DLQ candidates.
- Do not retry on errors that will never succeed (`NonRetryableError`): bad input, permanently missing resource.

```ts
import { UnrecoverableError } from 'bullmq';

try {
  await this.stripe.charge(...);
} catch (e) {
  if (isCardDeclinedError(e)) {
    // don't retry card declines
    throw new UnrecoverableError('card declined');
  }
  throw e; // network / 5xx — let BullMQ retry
}
```

BullMQ stops retrying on `UnrecoverableError`. Verify the import path against the
installed BullMQ major — see [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md).

## Dead-letter queue (DLQ)

Jobs that exceed max attempts move to failed state. Strategy:

1. **Alert** on DLQ depth > threshold.
2. **Inspect** via bull-board UI.
3. **Fix** the root cause.
4. **Retry** or **discard** explicitly.

Never silently drop failed jobs. They represent work the system promised to do.

## Scheduling / repeatable jobs

```ts
await queue.add(
  'nightly-report',
  {},
  { repeat: { pattern: '0 2 * * *', tz: 'UTC' } },  // every day 02:00 UTC
);
```

Only one instance across a cluster should schedule (otherwise N duplicates per fire). Use a
singleton / leader election or register scheduling from a bootstrap script run once per deploy.

## Delayed jobs

```ts
await queue.add('reminder', { userId }, { delay: 24 * 3600_000 });   // 24h
```

Useful for email reminders, trial expiration, webhook retry intervals.

## Priorities

```ts
await queue.add('high', data, { priority: 1 });     // lower = earlier
await queue.add('low', data, { priority: 100 });
```

Use sparingly. Priorities often mask a missing queue separation — consider a dedicated queue.

## Rate limiting (worker side)

```ts
@Processor('llm-run', { concurrency: 5, limiter: { max: 10, duration: 1000 } })
```

Stay within upstream quotas (e.g., LLM provider, email sender).

## Observability

- Log every job start / complete / fail with `jobId`, `queue`, `attempts`, `traceId`.
- Metrics: queue depth, processing time, failure rate, DLQ depth.
- bull-board exposes a dashboard; gate behind admin auth.

```ts
// Install: @bull-board/api @bull-board/express
// Verify exact subpaths against the installed major; package layout has shifted
// across versions — see `35-source-of-truth-freshness.md`.
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const adapter = new ExpressAdapter();
adapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(webhookQueue)],
  serverAdapter: adapter,
});
app.use('/admin/queues', adminAuth, adapter.getRouter());
```

## pg-boss alternative

If you have Postgres and no Redis, pg-boss is a strong alternative.

- Durable — uses Postgres as the queue.
- One less piece of infra; backups already cover queue state.
- Lower throughput ceiling than Redis-backed BullMQ; fine for < ~1000 jobs/sec.
- Less ecosystem (no bull-board equivalent).

```ts
const boss = new PgBoss(env.DATABASE_URL);
await boss.start();
await boss.send('email:welcome', { userId }, { retryLimit: 5, retryBackoff: true });
await boss.work('email:welcome', async (job) => { ... });
```

Pick one — don't run both queues in the same project.

## Outbox → queue

Combine with the outbox pattern (see [`18-events.md`](./18-events.md)):

1. Transaction writes domain change + outbox row.
2. Outbox poller reads pending rows (`SELECT ... FOR UPDATE SKIP LOCKED`).
3. Poller enqueues a BullMQ job for each row, then marks the outbox row as published.
4. Worker handles the job. Worker uses its own idempotency (jobId / inbox / idempotent side
   effect) to tolerate retries — it does **not** write back to the outbox table.

This gives: at-least-once delivery with idempotent processing (effectively-once when handlers
are idempotent), and durable events even on process crash. True exactly-once is not achievable
across a DB + queue boundary — design handlers accordingly.

> Keep the outbox table owned by the publishing module. Workers consuming jobs should not
> need to know the outbox exists — they only see the job payload. This matches the boundary
> rule in [`18-events.md`](./18-events.md).

## When to queue vs inline

Queue if any of:
- Work takes > 200ms in p95.
- External call involved (network variability).
- User doesn't need the result to proceed.
- Work can be retried safely.

Inline if:
- User is waiting for the result.
- Work must complete in the same transaction.
- Failure must be visible immediately to the user.

Common queued: email, webhooks out, report generation, LLM inference, analytics writes,
bulk imports/exports, image processing, notifications.

## Propagation of context

Always pass:

- `userId`, `organizationId` — for logs + authorization inside the worker.
- `traceId` — matches the HTTP request's trace.
- `actor` (for audit).
- `locale` (if the output is user-visible).

```ts
await queue.add('task', { userId, orgId, traceId, locale });
```

## Graceful shutdown

Workers must drain on SIGTERM. In NestJS, enable framework shutdown hooks so a single
coordinator owns the sequence (see [`34-health-shutdown.md`](./34-health-shutdown.md) —
"one shutdown coordinator").

```ts
// worker bootstrap (e.g. dist/worker.js)
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();   // Nest listens for SIGTERM/SIGINT and runs the lifecycle chain
```

`@nestjs/bullmq` registers `OnModuleDestroy` on `WorkerHost` and on each `Queue`, so worker
drain and queue close happen automatically — do **not** add a second handler that closes them
again. Only add `OnApplicationShutdown` when you need extra logic around drain (e.g. flip a
readiness flag first, wait for the load balancer, then let the modules close):

```ts
@Injectable()
export class DrainCoordinator implements OnApplicationShutdown {
  constructor(private readonly readiness: ReadinessService) {}

  async onApplicationShutdown(signal?: string) {
    this.readiness.setReady(false);          // stop new traffic / probes
    await sleep(this.config.drainGraceMs);   // let LB stop routing
    // Nest will now tear modules down; @nestjs/bullmq closes worker + queue.
  }
}
```

If the worker entrypoint is **not** a Nest application (a plain BullMQ `Worker`), use exactly
one signal handler — never two racing:

```ts
process.once('SIGTERM', async () => {
  await worker.close();   // stops accepting new, waits for in-flight
  await queue.close();
  process.exit(0);
});
```

Deploys that kill workers mid-job lead to duplicates when retries kick in — idempotency saves
you, but cleaner shutdowns reduce noise.

## Good vs bad

### Good

```ts
// producer — fire and forget, user keeps moving
async signUp(dto: SignUpDto) {
  const user = await this.repo.insert(dto);
  await this.welcome.enqueue(user.id, this.logger.traceId);
  return user;
}

// worker — idempotent, bounded retries
@Processor('email', { concurrency: 10 })
export class EmailWorker extends WorkerHost {
  async process(job: Job<{ userId: string }>) {
    if (await this.sent.wasSent('welcome', job.data.userId)) return;
    await this.mail.send(job.data.userId, 'welcome');
    await this.sent.mark('welcome', job.data.userId);
  }
}
```

### Bad

```ts
async signUp(dto: SignUpDto) {
  const user = await this.repo.insert(dto);
  try {
    await this.mail.sendWelcome(user);                 // ❌ blocking, may be slow
  } catch (e) { /* swallow */ }                        // ❌ silent fail — no welcome, no retry
  return user;
}
```

## Anti-patterns

- Running the worker inside the API process at scale.
- Non-idempotent handlers (duplicates on retry).
- Unbounded retries or unbounded queue growth (no producer-side rate limit).
- Different job schemas shoved into one queue ("misc").
- Missing DLQ monitoring — jobs die silently.
- Logs without `jobId` or `traceId` — impossible to correlate.
- Jobs whose payload is a whole DB row (couples job to schema). Prefer ID + refetch in worker.
- Scheduling jobs from multiple replicas without leader election.

## Code review checklist

- [ ] Handler is idempotent (natural key, inbox, or idempotent side effect)
- [ ] Retries bounded; backoff configured
- [ ] Non-retryable errors explicitly marked
- [ ] DLQ alerting exists for this queue
- [ ] `jobId` / dedupe key used where appropriate
- [ ] `traceId` propagated
- [ ] Worker concurrency and rate limit set appropriately
- [ ] Graceful shutdown (SIGTERM) handled
- [ ] In prod: worker runs as a separate process
- [ ] Payload keeps domain objects as IDs, not full rows

## See also

- [`18-events.md`](./18-events.md) — outbox + job enqueue
- [`22-observability.md`](./22-observability.md) — queue metrics
- [`10-error-handling.md`](./10-error-handling.md) — retry vs non-retryable
- [`34-health-shutdown.md`](./34-health-shutdown.md) — worker drain, readiness, shutdown coordinator
- [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md) — verify BullMQ / bull-board package paths against the installed version
