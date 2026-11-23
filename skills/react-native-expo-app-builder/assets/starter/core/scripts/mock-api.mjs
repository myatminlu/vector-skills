#!/usr/bin/env node
/**
 * Local mock of the backend, so the app runs end to end before the real API exists — and so Maestro flows have a
 * backend that behaves the same on every run. The core serves health and the example's items; every installed module
 * adds its endpoints in `scripts/mock/<module>.mjs` (`export const order`, `export function register(app)`).
 *
 *   npm run mock-api                     # http://localhost:4010/api/v1
 *
 * Switches: MOCK_PORT, MOCK_PREFIX, MOCK_LATENCY_MS (delay every response), MOCK_RATE_PER_SECOND (answer 429 above it).
 * Module switches are listed at the top of each `scripts/mock/*.mjs`.
 *
 * Replace it with the real API as soon as one is reachable; keep it for e2e runs if the real one has no test data.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const PREFIX = process.env.MOCK_PREFIX ?? '/api/v1';
const LATENCY = Number(process.env.MOCK_LATENCY_MS ?? 0);
const RATE = Number(process.env.MOCK_RATE_PER_SECOND ?? 0);

const routes = [];
let requestTimes = [];

/** What the endpoint files share: the example data, the auth hook and the response helpers. */
const app = {
  /** The example's public content; modules push items about themselves. */
  items: [],
  /** True once a module that issues tokens is loaded (auth); endpoints that need a user then answer 401 without one. */
  hasAuth: false,
  /** The user id behind a request's bearer token, or null. Set by the auth module. */
  authenticate: () => null,
  route(method, pattern, handler) {
    routes.push({ method, pattern, handler });
  },
  send(res, status, body) {
    if (status === 204) {
      res.writeHead(204).end();
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  },
  fail(res, status, code, message) {
    app.send(res, status, { code, message, traceId: randomUUID().slice(0, 8) });
  },
  async readJson(req) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
};

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mock');
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.mjs'));
const loaded = await Promise.all(files.map(async (file) => ({ file, module: await import(pathToFileURL(path.join(dir, file)).href) })));
loaded.sort((a, b) => (a.module.order ?? 50) - (b.module.order ?? 50));
for (const { module } of loaded) await module.register(app);

async function handle(req, res, pathname, query) {
  // HEAD is GET without a body (Node drops the body itself). The app's connectivity probe is a HEAD on /health.
  const method = req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET');
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = typeof route.pattern === 'string' ? (route.pattern === pathname ? [pathname] : null) : pathname.match(route.pattern);
    if (!match) continue;
    return route.handler({ req, res, path: pathname, query, match, userId: app.authenticate(req) });
  }
  return app.fail(res, 404, 'NOT_FOUND', `No route for ${method} ${pathname}`);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  res.on('finish', () => console.log(`${req.method} ${url.pathname} → ${res.statusCode} ${Date.now() - started}ms`));
  if (!url.pathname.startsWith(PREFIX)) return app.fail(res, 404, 'NOT_FOUND', `Paths start with ${PREFIX}`);
  if (RATE > 0) {
    const now = Date.now();
    requestTimes = requestTimes.filter((time) => now - time < 1000);
    if (requestTimes.length >= RATE) return app.fail(res, 429, 'RATE_LIMITED', 'Too many requests');
    requestTimes.push(now);
  }
  if (LATENCY > 0) await new Promise((resolve) => setTimeout(resolve, LATENCY));
  try {
    await handle(req, res, url.pathname.slice(PREFIX.length) || '/', url.searchParams);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) app.fail(res, 500, 'INTERNAL', 'Mock server error');
  }
});

server.listen(PORT, () => {
  console.log(`mock API on http://localhost:${PORT}${PREFIX} — ${loaded.map(({ file }) => file.replace(/\.mjs$/, '')).join(', ')}`);
});
