# 27 — AI Streaming (SSE)

## TL;DR

- Stream LLM output to the client via **SSE** (`text/event-stream`) — simpler than WebSockets, works through HTTP proxies, native browser `EventSource` support.
- Cancel-aware: when the client disconnects, abort the upstream LLM call. Don't keep burning tokens.
- Emit typed events: `chunk`, `tool_call`, `tool_result`, `usage`, `done`, `error`. Never invent ad-hoc shapes.
- Heartbeat every 15s (comment lines) so proxies don't close idle connections.
- The global exception filter **must not** write to a response that's already streaming — honor `res.headersSent`.

## Why it matters

LLM responses take seconds. Users want to see them as they arrive. Done naively, streaming
breaks under client disconnects, proxy timeouts, and tool calls. The patterns below handle
all of that.

## SSE vs WebSocket vs HTTP chunked

| | SSE | WebSocket | HTTP chunked |
|---|---|---|---|
| Transport | HTTP | TCP upgrade | HTTP |
| Direction | server → client | bidi | server → client |
| Reconnect | built-in | manual | manual |
| Proxy-friendly | ✅ | varies | ✅ |
| Client API | `EventSource` | `WebSocket` | fetch + reader |
| Auth via cookies | ✅ | limited | ✅ |

**Default to SSE** for LLM streaming. Use WebSocket only if you need bidi (e.g., realtime voice).

## SSE frame format

```
event: chunk
id: 0
data: {"delta":"Hello"}

event: chunk
id: 1
data: {"delta":" world"}

event: done
id: 2
data: {"usage":{"inputTokens":120,"outputTokens":2,"totalTokens":122},"costMicroUsd":"12500"}
```

Two newlines end an event. Lines starting with `:` are comments (used for heartbeats).

## Controller

> Why raw `@Res()` instead of Nest's `@Sse()` decorator? `@Sse()` returns
> `Observable<MessageEvent>` and gives the framework full control of the response — you can't
> set custom headers before the first event, can't observe `req.on('close')` cleanly, and
> can't write a `:hb\n\n` heartbeat comment line. For LLM streams that need cancellation,
> heartbeats, and `X-Accel-Buffering` we use raw `@Res()`. For trivial event feeds, `@Sse()`
> is fine.

```ts
// modules/conversation/conversation.controller.ts
import { Controller, Post, Body, Res, Req, Param, UseGuards } from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationService } from './conversation.service';

@Controller({ path: 'conversations/:conversationId/stream', version: '1' })
@UseGuards(AuthGuard)
export class StreamController {
  constructor(private readonly service: ConversationService) {}

  @Post()
  async stream(
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 1. Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');   // disable nginx buffering
    res.flushHeaders();

    // 2. Abort on client disconnect
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    // 3. Heartbeat every 15s. Use `res.writable`, not `!res.writableEnded` —
    //    a disconnected socket is destroyed but writableEnded stays false until we call .end().
    const heartbeat = setInterval(() => {
      if (res.writable) res.write(':hb\n\n');
    }, 15_000);

    try {
      let index = 0;
      for await (const event of this.service.stream(user.id, conversationId, dto, abortController.signal)) {
        if (!res.writable) break;
        res.write(`event: ${event.type}\n`);
        res.write(`id: ${index++}\n`);
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (e) {
      if (res.writable) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ code: 'LLM.STREAM_ERROR', message: 'Stream failed' })}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
      if (res.writable) res.end();
    }
  }
}
```

## Service generator

```ts
// modules/conversation/types.ts
export interface UsageInfo {
  inputTokens: number;                 // UNCACHED input only (non-overlapping with cache buckets); see `28`
  outputTokens: number;
  totalTokens: number;                 // sum of all four buckets
  cacheReadInputTokens?: number;       // prompt-cache HIT (discounted)
  cacheWriteInputTokens?: number;      // prompt-cache WRITE (premium on Anthropic)
}

export type StreamEvent =
  | { type: 'chunk';       data: { delta: string } }
  | { type: 'tool_call';   data: { id: string; name: string; arguments: unknown } }
  | { type: 'tool_result'; data: { id: string; result: unknown } }
  | { type: 'usage';       data: UsageInfo }
  | { type: 'done';        data: { usage: UsageInfo | null; costMicroUsd: string } }
  | { type: 'error';       data: { code: string; message: string } };
```

```ts
async *stream(
  userId: string,
  conversationId: string,
  dto: SendMessageDto,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent> {
  // persist user message first
  await this.messages.insert({ conversationId, role: 'user', content: dto.content, userId });

  // stream from LLM
  let buffer = '';
  let usage: UsageInfo | null = null;
  const started = Date.now();
  const traceId = this.cls.get('traceId');

  try {
    for await (const chunk of this.llm.stream({
      model: env.LLM_STREAM_MODEL,
      messages: await this.history(conversationId),
      // traceId comes from request-scoped CLS (e.g. nestjs-cls), not a logger field
      metadata: { userId, traceId },
    }, { signal })) {
      if (chunk.type === 'text_delta') {
        buffer += chunk.text;
        yield { type: 'chunk', data: { delta: chunk.text } };
      } else if (chunk.type === 'tool_call') {
        yield {
          type: 'tool_call',
          data: { id: chunk.id, name: chunk.name, arguments: chunk.arguments },
        };
      } else if (chunk.type === 'tool_result') {
        yield {
          type: 'tool_result',
          data: { id: chunk.id, result: chunk.result },
        };
      } else if (chunk.type === 'usage') {
        usage = chunk.usage;
        // emit usage as its own event so clients can render it before `done`
        yield { type: 'usage', data: usage };
      }
    }

    // persist assistant message after the stream completes
    await this.messages.insert({ conversationId, role: 'assistant', content: buffer, userId });

    let costMicroUsd = 0n;
    if (usage) {
      costMicroUsd = this.cost(usage); // bigint
      // record() enqueues; the worker writes the row + updates the rollup. See `28`.
      await this.usage.record({
        userId,
        provider: this.llm.providerFor(env.LLM_STREAM_MODEL).name,
        model: env.LLM_STREAM_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
        cacheWriteInputTokens: usage.cacheWriteInputTokens ?? 0,
        costMicroUsd,
        latencyMs: Date.now() - started,
        outcome: 'success',
        traceId,
        feature: 'chat.stream',
      });
    }
    // JSON has no bigint — serialize costMicroUsd as a string on the wire.
    yield { type: 'done', data: { usage, costMicroUsd: costMicroUsd.toString() } };
  } catch (e) {
    // Always meter what the provider already charged us for, even on abort/error.
    if (usage) {
      await this.usage.record({
        userId,
        provider: this.llm.providerFor(env.LLM_STREAM_MODEL).name,
        model: env.LLM_STREAM_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
        cacheWriteInputTokens: usage.cacheWriteInputTokens ?? 0,
        costMicroUsd: this.cost(usage),
        latencyMs: Date.now() - started,
        outcome: signal.aborted ? 'aborted' : 'error',
        traceId,
        feature: 'chat.stream',
      });
    }
    if (signal.aborted) {
      // client disconnected; persist partial message + stop silently
      if (buffer) await this.messages.insert({ conversationId, role: 'assistant', content: buffer, userId, partial: true });
      return;
    }
    throw e;
  }
}
```

## Event types (protocol)

Agree on a small vocabulary:

| Event | Payload | When |
|---|---|---|
| `chunk` | `{ delta: string }` | text token |
| `tool_call` | `{ id, name, arguments }` | the model is calling a tool |
| `tool_result` | `{ id, result }` | the server returned a tool result back to the model |
| `usage` | `{ inputTokens, outputTokens, totalTokens, cacheReadInputTokens?, cacheWriteInputTokens? }` | per-call usage (sent near the end) |
| `done` | `{ usage, costMicroUsd }` | final event — stream completed successfully (`costMicroUsd` serialized as string since JSON has no `bigint`) |
| `error` | `{ code, message }` | fatal — stream ends |

Don't invent per-endpoint shapes. Consumers can share a single parser.

## Client side

```ts
const source = new EventSource('/v1/conversations/c1/stream', { withCredentials: true });

source.addEventListener('chunk', (e) => {
  const { delta } = JSON.parse((e as MessageEvent).data);
  appendToTextArea(delta);
});

source.addEventListener('tool_call', (e) => {
  const call = JSON.parse((e as MessageEvent).data);
  showToolCallChip(call);
});

source.addEventListener('usage', (e) => {
  const usage = JSON.parse((e as MessageEvent).data);
  updateUsageBadge(usage);
});

// IMPORTANT: close on terminal events. Otherwise the browser auto-reconnects on `error`
// and triggers another billed LLM call.
source.addEventListener('done', () => source.close());
source.addEventListener('error', () => {
  showErrorToast();
  source.close();
});
```

Note: `EventSource` doesn't support `POST` with a body. Common workarounds:

- Use a **GET**-style stream for completion of a previously-submitted message (post body, then open SSE on returned URL).
- Use **fetch-eventsource** polyfill which supports POST.
- Switch to fetch + `ReadableStream`.

## Backpressure

If the client reads slower than the server writes (big payloads), Node buffers and RSS climbs.

- Prefer short chunks (text deltas are already small).
- If you send large payloads (images, whole docs), respect `res.write()`'s return value and wait for the `'drain'` event before continuing:

  ```ts
  if (!res.write(payload)) {
    await new Promise<void>((resolve) => res.once('drain', resolve));
  }
  ```
- For very large streams, break into multiple SSE events instead of one huge message.

## Cancellation semantics

- Client disconnects → `req.on('close')` → `abortController.abort()` → upstream LLM request aborted.
- Anthropic / OpenAI SDKs accept `AbortSignal`; pass through.
- Persist partial output if useful (resume UI state).

**Never** keep the upstream call running after the client is gone. Wastes tokens ($$$).

## Reconnection / resumption

Browsers automatically reconnect dropped `EventSource` connections and replay the last
received event id in a `Last-Event-ID` request header. **LLM streams are not resumable** —
the upstream provider call has already been billed and the partial output is gone. Detect a
reconnect by the presence of the header and short-circuit:

```ts
if (req.headers['last-event-id']) {
  // EventSource is auto-retrying. We don't support resumption.
  return res.status(204).end();   // 204 → browser stops retrying.
}
```

Then choose one policy and stick to it:

- **Reject** (preferred for paid LLM endpoints): the `204` above ends it. The user must explicitly retry.
- **Restart**: ignore the header and start a fresh generation from persisted conversation history (do not "continue" the previous output).

Tell the client to call `source.close()` inside its `done` and `error` handlers — otherwise
the browser will auto-reconnect on the terminal `error` event and trigger another billed
call. The example in [Client side](#client-side) does this; copy the pattern.

## Global exception filter interaction

Once you call `res.flushHeaders()` (or `res.write(...)`), the status and headers are locked.
A thrown exception that reaches the global filter can't switch to a JSON error body — it'd be
invalid HTTP to write a second response.

```ts
@Catch()
export class AllExceptionsFilter {
  catch(e: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw e;     // ← let non-HTTP contexts handle it
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;                // ← CRITICAL for streaming
    // ... normal { code, message, details?, traceId } body for non-streaming responses
  }
}
```

Inside the stream handler, emit an `error` SSE event before ending:

```ts
if (res.writable) {
  res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
  res.end();
}
```

## Proxying

- Set `X-Accel-Buffering: no` for nginx.
- Disable HTTP/2 compression for SSE if your stack re-buffers (rare; measure).
- Check your load balancer's idle timeout — extend it (e.g., ALB default is 60s; bump for long streams).

## CORS for cross-origin clients

`new EventSource(url, { withCredentials: true })` requires the server to send:

- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Origin: <specific origin>` — credentialed CORS forbids the `*` wildcard.
- The session cookie must be `SameSite=None; Secure` to be sent on cross-site SSE requests.

Configure these in the global Nest CORS setup (`app.enableCors({ origin: [...], credentials: true })`) and on every load balancer / CDN in front. Without this, the browser opens the connection but drops the cookie and the auth guard rejects with `401`.

## Rate limit + quota

- Rate limit SSE endpoints same as LLM calls (per user, per model).
- Reject the SSE start with `429` before flushing headers if over quota — the global filter can still return a standard JSON error body at that point.

## Testing

- **Unit-test the async generator** in the service. Drive it with a fake LLM client that yields a scripted sequence of chunks (incl. `tool_call`, `usage`) and assert on the events your generator yields. Cover the `signal.aborted` branch with a pre-aborted `AbortController`.
- **E2E with supertest** for the happy path. Supertest waits for the full response, so it's fine for asserting event ordering but **cannot** test mid-stream cancellation, heartbeats, or partial-stream errors.

  ```ts
  const res = await request(app.getHttpServer())
    .post('/v1/conversations/c1/stream')
    .send({ content: 'Hi' });
  // res.text is the full SSE body; split on \n\n, parse data: lines, assert event sequence.
  ```
- **For cancellation / heartbeat tests**, use raw `http.request` (or `undici` with an `AbortController`) so you can read chunks as they arrive, abort mid-stream, and assert that the upstream LLM mock saw an `AbortSignal` fire.

## Good vs bad

### Good

```ts
res.setHeader('Content-Type', 'text/event-stream');
res.flushHeaders();
req.on('close', () => abortController.abort());
for await (const evt of service.stream(..., abortController.signal)) {
  res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
}
res.end();
```

### Bad

```ts
@Post(...)
async stream(@Body() dto, @Res() res) {
  const resp = await this.llm.call(...);      // ❌ buffers full response, no streaming
  res.json({ text: resp.text });              // ❌ standard JSON, not SSE
}
```

## Anti-patterns

- Returning the full string after generation (kills UX).
- Sending raw provider SDK chunks as SSE data (leaks provider shape to client).
- No heartbeat → proxy kills connection after 60s of no bytes.
- Ignoring `req.close` → wastes tokens on abandoned streams.
- Global filter writing JSON to a response that already started streaming.
- Per-endpoint event shape — make clients relearn each one.

## Code review checklist

- [ ] `text/event-stream` + `Cache-Control: no-cache` + `X-Accel-Buffering: no` headers set
- [ ] `req.on('close')` aborts the upstream call (no orphaned billed token generation)
- [ ] Heartbeat comment line every ≤ 15s
- [ ] Event vocabulary is the standard set (`chunk`, `tool_call`, `tool_result`, `usage`, `done`, `error`)
- [ ] `done` always fires on success (with `usage`/`costMicroUsd` when available); `costMicroUsd` is a string on the wire
- [ ] Usage + cost persisted server-side (not just emitted to the client)
- [ ] Global exception filter checks `res.headersSent`
- [ ] Quota / rate limit checked **before** `flushHeaders()` so a `429` JSON body is still possible
- [ ] CORS configured with a specific origin + `credentials: true` for cross-origin SPAs
- [ ] Reconnect handling decided (return `204`, or start a fresh stream — never resume the old one)
- [ ] Load balancer idle timeout configured for long streams

## See also

- [`26-ai-product-patterns.md`](./26-ai-product-patterns.md) — gateway that drives the stream
- [`28-ai-usage-metering-cost.md`](./28-ai-usage-metering-cost.md) — recording usage per stream
- [`10-error-handling.md`](./10-error-handling.md) — filter behavior
- [`07-standard-responses.md`](./07-standard-responses.md) — standard response contract doesn't apply to SSE events
