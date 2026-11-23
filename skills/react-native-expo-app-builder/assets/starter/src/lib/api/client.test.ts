import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';

// `apiFetch` runs against a scripted transport and an in-memory secure store, so the session rules — single-flight
// refresh, what ends a session and what must not — are proven without a device.
process.env.EXPO_PUBLIC_API_URL = 'https://api.test';

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const store = new Map<string, string>();
let respond: (call: Call) => Response | Promise<Response> = () => new Response(null, { status: 500 });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const route = (call: Call) => `${call.init.method ?? 'GET'} ${call.url.replace('https://api.test/api/v1', '')}`;
const bearer = (call: Call) => new Headers(call.init.headers).get('Authorization');
/** Unsigned JWT with the given `exp` (seconds); only the payload is read client-side. */
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ sub: 'u1', exp })).toString('base64url')}.s`;
const farFuture = Math.floor(Date.now() / 1000) + 3600;

mock.module('expo/fetch', {
  exports: {
    fetch: (url: string, init: RequestInit = {}) => {
      const call = { url, init };
      calls.push(call);
      return Promise.resolve(respond(call));
    },
  },
});
mock.module('expo-secure-store', {
  exports: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked',
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void store.set(key, value),
    deleteItemAsync: async (key: string) => void store.delete(key),
  },
});
let guest = false;
mock.module('@/lib/guest-mode', { exports: { guestMode: { isActive: () => guest } } });

let client: typeof import('./client');
let errors: typeof import('./errors');
let tokens: typeof import('@/lib/token-store').tokenStore;
let unauthorized = 0;

before(async () => {
  client = await import('./client');
  errors = await import('./errors');
  tokens = (await import('@/lib/token-store')).tokenStore;
  client.onUnauthorized(() => {
    unauthorized += 1;
  });
});

beforeEach(async () => {
  calls.length = 0;
  unauthorized = 0;
  guest = false;
  await tokens.set({ accessToken: 'stale', refreshToken: 'refresh-1' });
});

/** `stale` is rejected; a refresh with `refresh-1` mints a fresh pair; any other refresh token is refused. */
function rotatingServer() {
  const fresh = jwt(farFuture);
  respond = (call) => {
    if (route(call) === 'POST /auth/refresh') {
      const { refreshToken } = JSON.parse(String(call.init.body)) as { refreshToken: string };
      return refreshToken === 'refresh-1' ? json(200, { accessToken: fresh, refreshToken: 'refresh-2' }) : json(401, { message: 'Invalid refresh token' });
    }
    return bearer(call) === 'Bearer stale' ? json(401, { message: 'Unauthorized' }) : json(200, { ok: true });
  };
  return fresh;
}

test('concurrent 401s share one refresh and both requests are retried with the new token', async () => {
  const fresh = rotatingServer();
  const [a, b] = await Promise.all([client.requestJson<{ ok: boolean }>('/a'), client.requestJson<{ ok: boolean }>('/b')]);
  assert.deepEqual([a, b], [{ ok: true }, { ok: true }]);
  assert.equal(calls.filter((call) => route(call) === 'POST /auth/refresh').length, 1, 'one refresh for both');
  assert.equal(await tokens.getAccessToken(), fresh);
  assert.equal(await tokens.getRefreshToken(), 'refresh-2');
  assert.equal(unauthorized, 0);
});

test('a refresh the server refuses ends the session once', async () => {
  respond = (call) => (route(call) === 'POST /auth/refresh' ? json(401, { message: 'revoked' }) : json(401, { message: 'Unauthorized' }));
  await assert.rejects(client.requestJson('/a'), (error: unknown) => error instanceof errors.ApiError && error.status === 401);
  assert.equal(await tokens.getRefreshToken(), null, 'tokens cleared');
  assert.equal(unauthorized, 1);
});

test('a refresh that cannot reach the server keeps the session', async () => {
  respond = (call) => {
    if (route(call) === 'POST /auth/refresh') throw new TypeError('Network request failed');
    return json(401, { message: 'Unauthorized' });
  };
  await assert.rejects(client.requestJson('/a'), (error: unknown) => errors.isNetworkError(error));
  assert.equal(await tokens.getRefreshToken(), 'refresh-1', 'tokens kept for the next attempt');
  assert.equal(unauthorized, 0);
});

test('a guest asking for an account-only resource gets AUTH_REQUIRED without a network call', async () => {
  await tokens.clear();
  guest = true;
  await assert.rejects(client.requestJson('/me/saved'), (error: unknown) => errors.hasApiCode(error, errors.AUTH_REQUIRED));
  assert.equal(calls.length, 0);
  assert.equal(unauthorized, 0, 'the guest is not signed out of anything');
});

test('public endpoints send no Authorization header', async () => {
  respond = () => json(200, { items: [], total: 0 });
  await client.requestJson('/items', {}, { authenticated: false });
  assert.equal(bearer(calls[0]!), null);
});

test('keepSessionOn401 hands the 401 to the caller and keeps the session', async () => {
  await tokens.set({ accessToken: jwt(farFuture), refreshToken: 'refresh-1' });
  respond = () => json(401, { message: 'Wrong password' });
  const response = await client.apiFetch('/auth/check-password', { method: 'POST' }, { keepSessionOn401: true });
  assert.equal(response.status, 401);
  assert.equal(await tokens.getRefreshToken(), 'refresh-1');
  assert.equal(unauthorized, 0);
});

test('error envelopes become ApiError with code, messages and a localised fallback', async () => {
  respond = () => json(400, { code: 'VALIDATION', message: ['email must be an email', 'password is too short'], traceId: 't-1' });
  await assert.rejects(client.requestJson('/items', {}, { authenticated: false }), (error: unknown) => {
    assert.ok(error instanceof errors.ApiError);
    assert.equal(error.code, 'VALIDATION');
    assert.equal(error.traceId, 't-1');
    assert.equal(errors.getApiErrorMessage(error), 'email must be an email\npassword is too short');
    return true;
  });
});
