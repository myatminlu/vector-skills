#!/usr/bin/env node
/**
 * Local mock of the backend the template's screens call, so the app runs end to end before the real API exists —
 * and so Maestro flows have a backend that behaves the same on every run.
 *
 *   npm run mock-api                     # http://localhost:4010/api/v1
 *   MOCK_ACCESS_TTL=20 npm run mock-api  # short-lived access tokens, to watch the refresh flow work
 *
 * Demo account: demo@example.com / demo1234 (override with MOCK_EMAIL / MOCK_PASSWORD).
 * Other switches: MOCK_PORT, MOCK_ASK_ENABLED=0 (remote switch off), MOCK_ASK_ERROR=1 (error event mid-stream),
 * MOCK_LATENCY_MS (delay every response), MOCK_RATE_PER_SECOND (answer 429 above it).
 *
 * Replace it with the real API as soon as one is reachable; keep it for e2e runs if the real one has no test data.
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const PREFIX = process.env.MOCK_PREFIX ?? '/api/v1';
const ACCESS_TTL = Number(process.env.MOCK_ACCESS_TTL ?? 900);
const LATENCY = Number(process.env.MOCK_LATENCY_MS ?? 0);
const RATE = Number(process.env.MOCK_RATE_PER_SECOND ?? 0);
const ASK_ENABLED = process.env.MOCK_ASK_ENABLED !== '0';
const ASK_ERROR = process.env.MOCK_ASK_ERROR === '1';

const user = { id: 'u-demo', email: process.env.MOCK_EMAIL ?? 'demo@example.com', name: 'Demo User' };
const password = process.env.MOCK_PASSWORD ?? 'demo1234';

const items = [
  { id: '1', title: 'Getting started', summary: 'What this template already does for you.', body: 'Sign-in, guest browsing, a consent gate, streaming answers, offline caching, two languages and a text size setting are wired. Replace this content with your own.' },
  { id: '2', title: 'Guest browsing', summary: 'Public content works without an account.', body: 'App Store guideline 5.1.1(v): features that are not account-based must work without a login. Saving and asking need an account, so they ask for one at the moment they are used.' },
  { id: '3', title: 'မြန်မာစာ', summary: 'စာကြောင်းအမြင့်ကို စစ်ဖို့ နမူနာ။', body: 'မြန်မာစာလုံးတွေရဲ့ အပေါ်က သင်္ကေတတွေ ပြတ်မသွားဖို့ စာကြောင်းအမြင့်ကို ဖောင့်ရဲ့ line box အတိုင်း ထားရပါတယ်။ ဒီစာမျက်နှာက အဲဒါကို စစ်ဖို့ပါ။' },
  { id: '4', title: 'Streaming answers', summary: 'Server-sent events, read as they arrive.', body: 'The Ask screen reads an event stream with expo/fetch. Errors can arrive as an HTTP status or as an error event inside a 200 response; both end up as ApiError.' },
  { id: '5', title: 'Remote switches', summary: 'Hide a feature without a release.', body: 'GET /app-config returns flags such as ask.enabled. Run the mock with MOCK_ASK_ENABLED=0 and the Ask button disappears within a minute.' },
  { id: '6', title: 'Offline', summary: 'The last list stays readable.', body: 'The home list is persisted; switch the network off and reopen the app.' },
];

/** userId → Map(itemId → savedAt) */
const saved = new Map([[user.id, new Map()]]);
/** refresh token → userId (rotated on every refresh) */
const refreshTokens = new Map();
let requestTimes = [];

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function accessToken(userId) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: userId, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL })}.mock`;
}
function issueTokens(userId) {
  const refreshToken = randomUUID();
  refreshTokens.set(refreshToken, userId);
  return { accessToken: accessToken(userId), refreshToken };
}
function userIdFrom(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() ? claims.sub : null;
  } catch {
    return null;
  }
}

function send(res, status, body) {
  if (status === 204) {
    res.writeHead(204).end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}
const fail = (res, status, code, message) => send(res, status, { code, message, traceId: randomUUID().slice(0, 8) });

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function streamAnswer(res, question, item) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const intro = item ? `About "${item.title}": ` : '';
  const words = `${intro}this is a mock answer to "${question}". A real backend would send your question to the AI provider named in the consent sheet and stream its reply here, word by word.`.split(' ');
  res.write(': connected\n\n');
  for (const [index, word] of words.entries()) {
    if (res.destroyed) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
    res.write(`data: ${JSON.stringify({ type: 'delta', text: (index ? ' ' : '') + word })}\n\n`);
    if (ASK_ERROR && index === 5) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'The AI provider is not available right now.', code: 'PROVIDER_UNAVAILABLE' })}\n\n`);
      res.end();
      return;
    }
  }
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
}

async function route(req, res, path, query) {
  const method = req.method ?? 'GET';
  const authed = userIdFrom(req);

  if (path === '/health') return send(res, 200, { ok: true });

  if (method === 'POST' && path === '/auth/login') {
    const body = await readJson(req);
    if (!body || body.email !== user.email || body.password !== password) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is wrong');
    return send(res, 200, { ...issueTokens(user.id), user });
  }
  if (method === 'POST' && path === '/auth/refresh') {
    const body = await readJson(req);
    const owner = body && refreshTokens.get(body.refreshToken);
    if (!owner) return fail(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or was already used');
    refreshTokens.delete(body.refreshToken);
    return send(res, 200, issueTokens(owner));
  }
  if (method === 'GET' && path === '/app-config') return send(res, 200, { config: { 'ask.enabled': ASK_ENABLED } });
  if (method === 'GET' && path === '/items') {
    const limit = Math.min(Number(query.get('limit') ?? 20), 100);
    const page = Math.max(Number(query.get('page') ?? 1), 1);
    return send(res, 200, { items: items.slice((page - 1) * limit, page * limit), total: items.length });
  }
  const itemMatch = path.match(/^\/items\/([^/]+)$/);
  if (method === 'GET' && itemMatch) {
    const item = items.find((entry) => entry.id === decodeURIComponent(itemMatch[1]));
    return item ? send(res, 200, item) : fail(res, 404, 'NOT_FOUND', 'Item not found');
  }

  // Everything below needs a valid access token.
  if (!authed) return fail(res, 401, 'UNAUTHORIZED', 'Missing or expired access token');

  if (method === 'GET' && path === '/auth/me') return send(res, 200, user);
  if (method === 'POST' && path === '/auth/logout') {
    for (const [token, owner] of refreshTokens) if (owner === authed) refreshTokens.delete(token);
    return send(res, 204);
  }
  if (method === 'DELETE' && path === '/auth/me') {
    // The demo account survives so e2e runs can sign in again; its data and sessions do not.
    saved.set(authed, new Map());
    for (const [token, owner] of refreshTokens) if (owner === authed) refreshTokens.delete(token);
    return send(res, 204);
  }
  if (method === 'GET' && path === '/me/saved') {
    return send(res, 200, [...(saved.get(authed) ?? new Map())].map(([itemId, savedAt]) => ({ itemId, savedAt })));
  }
  if (method === 'POST' && path === '/me/saved') {
    const body = await readJson(req);
    if (!body || !items.some((entry) => entry.id === body.itemId)) return fail(res, 404, 'NOT_FOUND', 'Item not found');
    const mine = saved.get(authed) ?? new Map();
    if (!mine.has(body.itemId)) mine.set(body.itemId, new Date().toISOString());
    saved.set(authed, mine);
    return send(res, 201, { itemId: body.itemId, savedAt: mine.get(body.itemId) });
  }
  const savedMatch = path.match(/^\/me\/saved\/([^/]+)$/);
  if (method === 'DELETE' && savedMatch) {
    saved.get(authed)?.delete(decodeURIComponent(savedMatch[1]));
    return send(res, 204);
  }
  if (method === 'POST' && path === '/ask') {
    if (!ASK_ENABLED) return fail(res, 403, 'FEATURE_DISABLED', 'Asking is switched off');
    const body = await readJson(req);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) return fail(res, 400, 'VALIDATION', ['question should not be empty']);
    return streamAnswer(res, question, items.find((entry) => entry.id === body.itemId));
  }
  return fail(res, 404, 'NOT_FOUND', `No route for ${method} ${path}`);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  res.on('finish', () => console.log(`${req.method} ${url.pathname} → ${res.statusCode} ${Date.now() - started}ms`));
  if (!url.pathname.startsWith(PREFIX)) return fail(res, 404, 'NOT_FOUND', `Paths start with ${PREFIX}`);
  if (RATE > 0) {
    const now = Date.now();
    requestTimes = requestTimes.filter((time) => now - time < 1000);
    if (requestTimes.length >= RATE) return fail(res, 429, 'RATE_LIMITED', 'Too many requests');
    requestTimes.push(now);
  }
  if (LATENCY > 0) await new Promise((resolve) => setTimeout(resolve, LATENCY));
  try {
    await route(req, res, url.pathname.slice(PREFIX.length) || '/', url.searchParams);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) fail(res, 500, 'INTERNAL', 'Mock server error');
  }
});

server.listen(PORT, () => {
  console.log(`mock API on http://localhost:${PORT}${PREFIX} — demo account ${user.email} / ${password}`);
});
