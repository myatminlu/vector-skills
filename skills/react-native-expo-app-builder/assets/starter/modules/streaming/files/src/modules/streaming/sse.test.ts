import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSseBlock, readSseStream, type SseEvent } from './sse';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test('parseSseBlock ignores keep-alive comments and joins data lines', () => {
  assert.equal(parseSseBlock(': ping'), null);
  assert.deepEqual(parseSseBlock('data: {"type":"delta","text":"a"}'), { type: 'delta', text: 'a' });
});

test('events split across chunks — even inside a multi-byte character — arrive whole and in order', async () => {
  const events: SseEvent[] = [];
  const burmese = new TextEncoder().encode('data: {"type":"delta","text":"မင်္ဂလာ"}\n\n');
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': ping\n\ndata: {"type":"delta","text":"Hel'));
      controller.enqueue(encoder.encode('lo"}\n\n'));
      controller.enqueue(burmese.slice(0, 31)); // cuts a Myanmar character in half
      controller.enqueue(burmese.slice(31));
      controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      controller.close();
    },
  });
  await readSseStream(stream, (event) => events.push(event));
  assert.deepEqual(events, [
    { type: 'delta', text: 'Hello' },
    { type: 'delta', text: 'မင်္ဂလာ' },
    { type: 'done' },
  ]);
});

test('an error event inside a 200 response ends the stream as an ApiError', async () => {
  await assert.rejects(
    readSseStream(streamFrom(['data: {"type":"error","message":"Monthly limit reached","code":"QUOTA_EXCEEDED"}\n\n']), () => undefined),
    (error: unknown) => error instanceof Error && error.message === 'Monthly limit reached' && (error as { code?: string }).code === 'QUOTA_EXCEEDED',
  );
});
