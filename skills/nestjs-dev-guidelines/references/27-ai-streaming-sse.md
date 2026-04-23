# 27 — AI Streaming (SSE)

## TL;DR

- Stream LLM output to the client via **SSE** (`text/event-stream`) — simpler than WebSockets, works through HTTP proxies, native browser `EventSource` support.
- Cancel-aware: when the client disconnects, abort the upstream LLM call. Don't keep burning tokens.
- Emit typed events: `chunk`, `tool_call`, `usage`, `done`, `error`. Never invent ad-hoc shapes.
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
data: {"usage":{"inputTokens":120,"outputTokens":2},"costCents":1}
```

Two newlines end an event. Lines starting with `:` are comments (used for heartbeats).

## Controller

```ts
// modules/conversation/conversation.controller.ts
import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';

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

    // 3. Heartbeat every 15s
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(':hb\n\n');
    }, 15_000);

    try {
      let index = 0;
      for await (const event of this.service.stream(user.id, conversationId, dto, abortController.signal)) {
        if (res.writableEnded) break;
        res.write(`event: ${event.type}\n`);
        res.write(`id: ${index++}\n`);
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (e) {
      if (!res.writableEnded) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ code: 'LLM.STREAM_ERROR', message: 'Stream failed' })}\n\n`);
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }
}
```

## Service generator

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

  try {
    for await (const chunk of this.llm.stream({
      model: 'claude-sonnet-4-6',
      messages: await this.history(conversationId),
      metadata: { userId, traceId: this.logger.traceId },
    }, { signal })) {
      if (chunk.type === 'text_delta') {
        buffer += chunk.text;
        yield { type: 'chunk', data: { delta: chunk.text } };
      } else if (chunk.type === 'tool_call') {
        yield { type: 'tool_call', data: chunk };
      } else if (chunk.type === 'usage') {
        usage = chunk.usage;
      }
    }

    // persist assistant message after the stream completes
    await this.messages.insert({ conversationId, role: 'assistant', content: buffer, userId });

    if (usage) {
      await this.usage.record({ userId, model: '...', ...usage });
      yield { type: 'done', data: { usage, costCents: this.cost(usage) } };
    }
  } catch (e) {
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
| `usage` | `{ inputTokens, outputTokens, totalTokens }` | per-call usage (sent near the end) |
| `done` | `{ usage, costCents }` | final event — stream completed successfully |
| `error` | `{ code, message }` | fatal — stream ends |

Don't invent per-endpoint shapes. Consumers can share a single parser.

## Client side

```ts
const source = new EventSource('/v1/conversations/c1/stream', { withCredentials: true });
source.addEventListener('chunk', (e) => {
  const { delta } = JSON.parse(e.data);
  appendToTextArea(delta);
});
source.addEventListener('done', (e) => { source.close(); });
source.addEventListener('error', (e) => {
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
- If you send large payloads (images, whole docs), consider chunking them yourself with flow control (`res.write(...) && next || res.once('drain', next)`).
- For very large streams, break into multiple SSE events instead of one huge message.

## Cancellation semantics

- Client disconnects → `req.on('close')` → `abortController.abort()` → upstream LLM request aborted.
- Anthropic / OpenAI SDKs accept `AbortSignal`; pass through.
- Persist partial output if useful (resume UI state).

**Never** keep the upstream call running after the client is gone. Wastes tokens ($$$).

## Global exception filter interaction

Once you call `res.flushHeaders()` (or `res.write(...)`), the status and headers are locked.
A thrown exception that reaches the global filter can't switch to a JSON error body — it'd be
invalid HTTP to write a second response.

```ts
@Catch()
export class AllExceptionsFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;        // ← CRITICAL for streaming
    // ... normal { code, message, details?, traceId } body for non-streaming responses
  }
}
```

Inside the stream handler, emit an `error` SSE event before ending:

```ts
if (!res.writableEnded) {
  res.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
  res.end();
}
```

## Proxying

- Set `X-Accel-Buffering: no` for nginx.
- Disable HTTP/2 compression for SSE if your stack re-buffers (rare; measure).
- Check your load balancer's idle timeout — extend it (e.g., ALB default is 60s; bump for long streams).

## Rate limit + quota

- Rate limit SSE endpoints same as LLM calls (per user, per model).
- Reject the SSE start with `429` before flushing headers if over quota — the global filter can still return a standard JSON error body at that point.

## Testing

- Unit-test the async generator in the service.
- E2E: use supertest to hit the endpoint, read the streamed body, assert the event sequence.

```ts
const res = await request(app.getHttpServer())
  .post('/v1/conversations/c1/stream')
  .send({ content: 'Hi' });
// res.text is the full SSE body; parse and assert.
```

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
- [ ] `req.on('close')` aborts the upstream call
- [ ] Heartbeat every ≤ 30s
- [ ] Event vocabulary is the standard set (`chunk`, `tool_call`, `usage`, `done`, `error`)
- [ ] Usage and cost captured in `done` event; persisted server-side
- [ ] Global exception filter checks `res.headersSent`
- [ ] Quota / rate limit checked before flushing headers
- [ ] Load balancer idle timeout configured for long streams

## See also

- [`26-ai-product-patterns.md`](./26-ai-product-patterns.md) — gateway that drives the stream
- [`28-ai-usage-metering-cost.md`](./28-ai-usage-metering-cost.md) — recording usage per stream
- [`10-error-handling.md`](./10-error-handling.md) — filter behavior
- [`07-standard-responses.md`](./07-standard-responses.md) — standard response contract doesn't apply to SSE events
