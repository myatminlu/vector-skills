import { type FetchImpl, requestJson, type RequestOptions } from '@/lib/api/client';

import { xhrFetch } from './xhr-fetch';

const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Multipart upload over React Native's XMLHttpRequest: the global fetch (`expo/fetch`) rejects `{ uri, name, type }`
 * FormData parts and would buffer whole files into JS memory. Check type and size before calling, and keep the
 * image picker's `quality` below 1 (see the skill's Expo field notes on pickers).
 */
export async function requestMultipart<T>(path: string, form: FormData, options: RequestOptions = {}): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: form }, { ...options, fetchImpl: xhrFetch as FetchImpl, timeoutMs: options.timeoutMs ?? UPLOAD_TIMEOUT_MS });
}
