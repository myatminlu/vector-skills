import { ApiError } from './errors';

/** One server-sent event: a JSON object with a `type`. Narrow it per endpoint (see `ask.ts`). */
export type SseEvent = { type: string; [key: string]: unknown };

/** Joins the `data:` lines of one SSE block and parses the JSON. Comment lines (`: ping`) are ignored. */
export function parseSseBlock(block: string): SseEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    return JSON.parse(data) as SseEvent;
  } catch {
    throw new ApiError('Invalid streaming response', 502, 'STREAM_PARSE_ERROR');
  }
}

/**
 * Reads a `text/event-stream` body and emits events in order, however the bytes were chunked. An `error` event —
 * which arrives inside a 200 response — ends the stream with `ApiError('STREAM_ERROR')`.
 */
export async function readSseStream<E extends SseEvent = SseEvent>(body: ReadableStream<Uint8Array>, onEvent: (event: E) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const emit = (block: string) => {
    const event = parseSseBlock(block);
    if (!event) return;
    onEvent(event as E);
    if (event.type === 'error') {
      const message = typeof event.message === 'string' ? event.message : typeof event.error === 'string' ? event.error : 'Stream error';
      throw new ApiError(message, 500, typeof event.code === 'string' ? event.code : 'STREAM_ERROR');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) emit(block);
    }
    buffer += decoder.decode();
    if (buffer.trim()) emit(buffer);
  } finally {
    reader.releaseLock();
  }
}
