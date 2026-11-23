import type { AskEvent } from '@/types/api';

import { apiFetch } from './client';
import { ApiError, parseApiError } from './errors';
import { readSseStream } from './sse';

/**
 * Streams an answer over server-sent events. Errors can arrive two ways: as an HTTP status before the stream starts,
 * or as an `error` event inside a 200 — both end up as `ApiError`.
 */
export async function streamAnswer(input: { question: string; itemId?: string }, onEvent: (event: AskEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await apiFetch('/ask', { method: 'POST', body: JSON.stringify(input), headers: { Accept: 'text/event-stream' }, signal }, { unscheduled: true, timeoutMs: 60_000 });
  if (!response.ok) throw await parseApiError(response);
  if (!response.body) throw new ApiError('This build cannot read streams', 0, 'STREAM_UNSUPPORTED');
  await readSseStream<AskEvent>(response.body, onEvent);
}
