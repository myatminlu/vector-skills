# 34 — Health Checks & Graceful Shutdown

## TL;DR

- Liveness and readiness are different signals: liveness asks "restart me?", readiness asks "send me traffic?".
- Liveness is cheap and avoids DB/Redis/network I/O; readiness reflects real ability to serve traffic.
- Healthy probe → `200`. Not ready (starting up or draining) → `503`. Liveness keeps returning `200` while the process is alive, even when readiness is `503`.
- Mark readiness true only after startup/migrations/critical pools are confirmed; mark it false first on shutdown, then close resources.
- One shutdown coordinator owns process signals — never two handlers racing to close the app. Trap `SIGTERM` for graceful drain; `SIGKILL` cannot be trapped.
- Workers need their own drain: stop accepting jobs, finish in-flight, close queue connections, respect orchestrator grace period.

## Why it matters

Most "mystery 5xx" incidents during deploys trace back to one of two lifecycle bugs: traffic
arriving before the app is ready, or traffic still arriving after shutdown started. Both come from
conflating liveness with readiness or from running multiple signal handlers that fight each other.
This file defines the semantics; verify current NestJS/platform APIs before adding imports or
install commands — see [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md).

## Endpoint semantics

- Liveness answers: "Should the orchestrator restart this process?"
- Readiness answers: "Should this instance receive traffic right now?"

Keep them separate. Wiring them to the same probe (or the same code path) is the single most
common source of "mystery 5xx during deploy" incidents.

Liveness should be cheap and avoid network I/O. Readiness should reflect whether the instance can
serve real traffic: startup complete, migrations/checks done, and critical dependencies reachable
according to the product's tolerance.

### Status codes

- Healthy: `200`.
- Not ready (still starting up, or actively draining): `503`.
- Liveness keeps returning `200` while the process is alive — even when readiness has flipped to
  `503`. If liveness fails during a graceful drain, the orchestrator restarts the pod mid-drain
  and in-flight work is killed.

Path naming is conventional, not prescriptive (`/healthz/live` + `/healthz/ready` or
`/health/liveness` + `/health/readiness` are both fine). What matters is that the two probes are
distinct routes with distinct logic.

## Startup readiness

Mark readiness true only after the app can safely receive traffic.

Common gates:

- Configuration validated.
- Observability/logging initialized.
- Required migrations or startup checks completed.
- Critical connection pools warmed (e.g., DB and Redis pings succeed) — cold-pool latency on the
  first real request is one of the top causes of post-deploy p99 spikes.
- HTTP server is listening.
- Required queues/workers/dependencies are in the expected state.

If startup fails, fail before readiness turns true. Do not flip readiness on `app.listen()` —
listening only proves the socket is open, not that the app can serve.

## Shutdown semantics

### Signals

- `SIGTERM` — the orchestrator's graceful-shutdown signal. Trap it and run the drain sequence.
- `SIGINT` — Ctrl-C / dev shutdown. Treat it the same as `SIGTERM` or as a faster local shutdown,
  but do not ignore it.
- `SIGKILL` — cannot be trapped. The process dies immediately. Design drain to finish well inside
  the orchestrator's grace period so it never escalates to `SIGKILL`.

### Coordinator

Pick exactly one shutdown coordinator:

- Simple app: framework-provided shutdown hooks may be enough.
- Draining app: a custom coordinator can mark readiness false, wait for load balancer drain, then
  close the application and resources.

Do not run two independent signal handlers that both close the app. That creates race conditions
and double-cleanup bugs (e.g., closing a queue connection twice, or tearing down telemetry while
another handler is still trying to log).

### Drain sequence

A healthy drain sequence conceptually does this:

1. Receive `SIGTERM`.
2. Flip readiness to `503` immediately so the load balancer / orchestrator stops sending new
   traffic to this instance.
3. Wait the configured drain grace period for the load balancer's next probe cycle to observe
   the failed readiness and remove the instance from rotation. (Step 2 alone is not enough — the
   LB only stops routing after its own probe-failure threshold is hit.)
4. Stop accepting new connections (close the HTTP listening socket / stop fetching new jobs) so
   any straggling request fails fast instead of starting work that will be killed.
5. Let in-flight work finish within the remaining grace period, with a per-step timeout so a
   stuck request cannot hold the whole shutdown.
6. Close resources in dependency order: workers → queues → DB pools → telemetry exporters.
7. Exit with success (`0`) on clean drain, or non-zero if cleanup timed out or errored.

### Probes during drain

While the drain is running, the probes must keep responding — silence is not "draining", it is
"unhealthy" and will trigger a restart.

- Readiness: return `503` immediately once the drain starts, until the process exits.
- Liveness: keep returning `200` until the event loop is gone. A liveness failure during drain
  causes the orchestrator to send `SIGKILL` and abandon in-flight work.

## Dependency checks

Readiness checks should be bounded and cheap enough for probe frequency.

- Add explicit timeouts (shorter than the probe interval).
- Avoid checks that allocate scarce pool clients without releasing them.
- Do not make liveness depend on DB, Redis, queues, or third-party APIs — a Redis hiccup must
  not restart the pod.
- Tune probe intervals and shutdown grace periods to match the platform's drain behavior.

## Workers and queues

HTTP app shutdown is not enough for worker processes.

Worker processes need their own drain behavior:

- Stop accepting new jobs.
- Finish or safely release in-progress jobs.
- Close queue connections.
- Respect orchestrator grace period.

Worker handlers must be idempotent regardless — `SIGKILL`, network partitions, and retries can
all replay a job. Idempotency is owned by [`19-background-jobs.md`](./19-background-jobs.md);
this file only enforces that drain happens.

## Review checklist

- [ ] Liveness and readiness are separate endpoints/signals with distinct logic.
- [ ] Healthy → `200`; not-ready → `503`; liveness keeps returning `200` during drain.
- [ ] Liveness avoids DB/Redis/network I/O.
- [ ] Readiness is false during startup and drain.
- [ ] Startup marks ready only after required boot work completes (config, migrations, pool warmup, dependency reachability).
- [ ] `SIGTERM` is trapped for graceful drain; drain finishes inside the orchestrator's grace period.
- [ ] There is exactly one signal/shutdown coordinator — no two handlers racing.
- [ ] Shutdown sequence: flip readiness false → wait for LB drain → stop accepting new connections → finish in-flight → close resources in dependency order.
- [ ] Drain wait matches the load balancer's probe-failure threshold, not just one probe interval.
- [ ] DB/Redis/queue health checks have timeouts (shorter than probe interval) and release resources.
- [ ] Workers drain current jobs and close queue connections; handlers are idempotent.
- [ ] Tests or operational runbooks cover startup failure and shutdown behavior.

## See also

- [`19-background-jobs.md`](./19-background-jobs.md) — worker idempotency and drain
- [`21-logging.md`](./21-logging.md) — shutdown logging
- [`32-modern-nestjs-stack.md`](./32-modern-nestjs-stack.md) — bootstrap order checks
