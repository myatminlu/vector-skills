/**
 * Auth endpoints: sign-in with rotating refresh tokens, the current user, sign-out, account deletion, and the
 * Saved example. Demo account: demo@example.com / demo1234 (override with MOCK_EMAIL / MOCK_PASSWORD).
 * MOCK_ACCESS_TTL=20 gives short-lived access tokens, to watch the refresh flow work.
 */
import { randomUUID } from 'node:crypto';

export const order = 10;

const ACCESS_TTL = Number(process.env.MOCK_ACCESS_TTL ?? 900);
const user = { id: 'u-demo', email: process.env.MOCK_EMAIL ?? 'demo@example.com', name: 'Demo User' };
const password = process.env.MOCK_PASSWORD ?? 'demo1234';

/** refresh token → userId (rotated on every refresh) */
const refreshTokens = new Map();
/** userId → Map(itemId → savedAt) */
const saved = new Map([[user.id, new Map()]]);

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = (userId) => `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: userId, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL })}.mock`;
function issueTokens(userId) {
  const refreshToken = randomUUID();
  refreshTokens.set(refreshToken, userId);
  return { accessToken: accessToken(userId), refreshToken };
}

function userIdFrom(req) {
  const header = req.headers.authorization ?? '';
  const payload = (header.startsWith('Bearer ') ? header.slice(7) : '').split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() ? claims.sub : null;
  } catch {
    return null;
  }
}

export function register(app) {
  app.hasAuth = true;
  app.authenticate = userIdFrom;
  const signedIn = (ctx) => {
    if (ctx.userId) return true;
    app.fail(ctx.res, 401, 'UNAUTHORIZED', 'Missing or expired access token');
    return false;
  };

  app.route('POST', '/auth/login', async ({ req, res }) => {
    const body = await app.readJson(req);
    if (!body || body.email !== user.email || body.password !== password) return app.fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is wrong');
    app.send(res, 200, { ...issueTokens(user.id), user });
  });
  app.route('POST', '/auth/refresh', async ({ req, res }) => {
    const body = await app.readJson(req);
    const owner = body && refreshTokens.get(body.refreshToken);
    if (!owner) return app.fail(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or was already used');
    refreshTokens.delete(body.refreshToken);
    app.send(res, 200, issueTokens(owner));
  });
  app.route('GET', '/auth/me', (ctx) => signedIn(ctx) && app.send(ctx.res, 200, user));
  app.route('POST', '/auth/logout', (ctx) => {
    if (!signedIn(ctx)) return;
    for (const [token, owner] of refreshTokens) if (owner === ctx.userId) refreshTokens.delete(token);
    app.send(ctx.res, 204);
  });
  app.route('DELETE', '/auth/me', (ctx) => {
    if (!signedIn(ctx)) return;
    // The demo account survives so e2e runs can sign in again; its data and sessions do not.
    saved.set(ctx.userId, new Map());
    for (const [token, owner] of refreshTokens) if (owner === ctx.userId) refreshTokens.delete(token);
    app.send(ctx.res, 204);
  });
  app.route('GET', '/me/saved', (ctx) => signedIn(ctx) && app.send(ctx.res, 200, [...(saved.get(ctx.userId) ?? new Map())].map(([itemId, savedAt]) => ({ itemId, savedAt }))));
  app.route('POST', '/me/saved', async (ctx) => {
    if (!signedIn(ctx)) return;
    const body = await app.readJson(ctx.req);
    if (!body || !app.items.some((entry) => entry.id === body.itemId)) return app.fail(ctx.res, 404, 'NOT_FOUND', 'Item not found');
    const mine = saved.get(ctx.userId) ?? new Map();
    if (!mine.has(body.itemId)) mine.set(body.itemId, new Date().toISOString());
    saved.set(ctx.userId, mine);
    app.send(ctx.res, 201, { itemId: body.itemId, savedAt: mine.get(body.itemId) });
  });
  app.route('DELETE', /^\/me\/saved\/([^/]+)$/, (ctx) => {
    if (!signedIn(ctx)) return;
    saved.get(ctx.userId)?.delete(decodeURIComponent(ctx.match[1]));
    app.send(ctx.res, 204);
  });
}
