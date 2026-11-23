import { fetch as expoFetch } from 'expo/fetch';

import { API_BASE_URL, API_PREFIX, API_RATE_PER_SECOND } from '@/config/env';
import { guestMode } from '@/lib/guest-mode';
import { accessTokenExpiresWithin } from '@/lib/jwt';
import { type AuthTokens, tokenStore } from '@/lib/token-store';

import { ApiError, AUTH_REQUIRED, parseApiError } from './errors';
import { createScheduler } from './scheduler';
import { xhrFetch } from './xhr-fetch';

/**
 * Everything this client assumes about the backend's token refresh. Adapt these two to the real API — nothing else
 * in the app knows the refresh contract.
 */
export const REFRESH_PATH = '/auth/refresh';

export function tokensFrom(body: unknown): AuthTokens | null {
  if (!body || typeof body !== 'object') return null;
  const { accessToken, refreshToken } = body as Record<string, unknown>;
  return typeof accessToken === 'string' && accessToken && typeof refreshToken === 'string' && refreshToken ? { accessToken, refreshToken } : null;
}

const REQUEST_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

const requestScheduler = createScheduler({ perSecond: API_RATE_PER_SECOND });
const unauthorizedListeners = new Set<() => void>();
const reachableListeners = new Set<() => void>();
let refreshPromise: Promise<AuthTokens> | null = null;

export function endpoint(path: string): string {
  return `${API_BASE_URL}${API_PREFIX}${path}`;
}

/** The platform every request announces. Servers that switch features per platform (payments!) key on it. */
export function clientPlatform(): 'ios' | 'android' | 'web' | null {
  const os = process.env.EXPO_OS;
  return os === 'ios' || os === 'android' || os === 'web' ? os : null;
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(name, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

type FetchImpl = typeof globalThis.fetch;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, fetchImpl: FetchImpl): Promise<Response> {
  const timeoutController = new AbortController();
  const externalSignal = init.signal;
  const signal = externalSignal ? AbortSignal.any([externalSignal, timeoutController.signal]) : timeoutController.signal;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, { ...init, signal });
    // Any answer, whatever its status, proves the network path works (see `connectivity.ts`).
    reachableListeners.forEach((listener) => listener());
    return response;
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (timedOut) throw new ApiError('Request timed out', 408, 'REQUEST_TIMEOUT');
    throw new ApiError('Network connection failed', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

/** Single-flight: ten requests that hit 401 together share one refresh, so a rotating refresh token is spent once. */
export function refreshAccessToken(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!refreshToken) throw new ApiError('Session expired', 401, 'AUTH_SESSION_EXPIRED');

    const response = await fetchWithTimeout(
      endpoint(REFRESH_PATH),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) },
      REQUEST_TIMEOUT_MS,
      expoFetch as unknown as FetchImpl,
    );
    if (!response.ok) throw await parseApiError(response);

    const tokens = tokensFrom(await response.json());
    if (!tokens) throw new ApiError('Refresh response has no tokens', 502, 'AUTH_REFRESH_SHAPE');
    await tokenStore.set(tokens);
    return tokens;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((listener) => listener());
}

/** The server turned the refresh token down (4xx other than timeout or throttling): the session is over. */
function isSessionRejection(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

export type RequestOptions = {
  authenticated?: boolean;
  /** Refresh the access token and retry once on 401 (default true). */
  retryAuth?: boolean;
  /**
   * A 401 normally means the session is dead, so the tokens are cleared and the app signs out. Endpoints that answer
   * 401 to a wrong *request* (a password check) opt out: the error reaches the caller and the session stays.
   */
  keepSessionOn401?: boolean;
  /** Bypass the rate-limit scheduler (streams are long-lived and already serialised by the UI). */
  unscheduled?: boolean;
  timeoutMs?: number;
  /** Send through React Native's XMLHttpRequest (multipart uploads with `{ uri }` parts). */
  nativeFetch?: boolean;
};

/**
 * The only way the app talks to its API: auth header, single-flight refresh, time-out, rate-limit scheduling and the
 * 401 policy. Streaming responses come back unread (`expo/fetch` is the fetch that exposes `response.body`).
 */
export async function apiFetch(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<Response> {
  const authenticated = options.authenticated ?? true;
  const fetchImpl: FetchImpl = options.nativeFetch ? xhrFetch : (expoFetch as unknown as FetchImpl);
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const platform = clientPlatform();
  if (platform && !headers.has('X-Client-Platform')) headers.set('X-Client-Platform', platform);

  const run = async (): Promise<Response> => {
    if (authenticated) {
      let accessToken = await tokenStore.getAccessToken();
      // A guest has no session to send or end: answering here keeps the request off the network, and keeps its 401
      // from reaching `notifyUnauthorized`, which would clear the cache the guest is browsing.
      if (!accessToken && guestMode.isActive()) throw new ApiError('Sign in to use this', 401, AUTH_REQUIRED);
      // A request that keeps the session on 401 cannot refresh-and-retry, so a token about to expire is renewed first.
      if (accessToken && options.keepSessionOn401 && accessTokenExpiresWithin(accessToken, 60_000)) {
        accessToken = (await refreshAccessToken().catch(() => null))?.accessToken ?? accessToken;
      }
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    }

    let response = await fetchWithTimeout(endpoint(path), { ...init, headers }, timeoutMs, fetchImpl);

    const sessionBound = authenticated && !options.keepSessionOn401;
    if (response.status === 401 && sessionBound && (options.retryAuth ?? true)) {
      try {
        const tokens = await refreshAccessToken();
        headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        response = await fetchWithTimeout(endpoint(path), { ...init, headers }, timeoutMs, fetchImpl);
      } catch (error) {
        // Only a refresh the server rejected ends the session; one that could not reach the server (offline,
        // time-out, 5xx, throttled) leaves the tokens for the next attempt.
        if (isSessionRejection(error)) {
          await tokenStore.clear();
          notifyUnauthorized();
        }
        throw error;
      }
    }

    if (response.status === 401 && sessionBound) {
      await tokenStore.clear();
      notifyUnauthorized();
    }

    return response;
  };

  return options.unscheduled ? run() : requestScheduler.schedule(run);
}

export async function requestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, init, options);
  if (!response.ok) throw await parseApiError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function requestVoid(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<void> {
  const response = await apiFetch(path, init, options);
  if (!response.ok) throw await parseApiError(response);
}

export function jsonBody(body: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST'): RequestInit {
  return { method, body: JSON.stringify(body) };
}

/**
 * Multipart upload over React Native's XMLHttpRequest: the global fetch (`expo/fetch`) rejects `{ uri, name, type }`
 * FormData parts and would buffer whole files into JS memory.
 */
export async function requestMultipart<T>(path: string, form: FormData, options: RequestOptions = {}): Promise<T> {
  return requestJson<T>(path, { method: 'POST', body: form }, { ...options, nativeFetch: true, timeoutMs: options.timeoutMs ?? UPLOAD_TIMEOUT_MS });
}

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/** Called after every response the API returned (any status); never for a request that failed to reach it. */
export function onNetworkReachable(listener: () => void): () => void {
  reachableListeners.add(listener);
  return () => {
    reachableListeners.delete(listener);
  };
}
