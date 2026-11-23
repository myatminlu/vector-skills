#!/usr/bin/env node
/**
 * Contract smoke test: calls every endpoint the app uses against a real API and prints status + response *shape*,
 * so the docs can be compared with what the server actually does — before any screen is built on it.
 *
 *   API_URL=https://api.example.com QA_EMAIL=… QA_PASSWORD=… npm run api:smoke
 *   API_URL=http://localhost:4010 npm run api:smoke -- --spec docs/openapi.json   # also check shapes against the spec
 *
 * Rules: credentials come from the environment, never a file; throttle to the backend's limit; reversible writes
 * only (create → read → delete); never payments, password changes or account deletion. Edit CHECKS for your API.
 */
import fs from 'node:fs';

const BASE = `${(process.env.API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4010').replace(/\/$/, '')}${process.env.API_PREFIX ?? '/api/v1'}`;
const email = process.env.QA_EMAIL ?? 'demo@example.com';
const password = process.env.QA_PASSWORD ?? 'demo1234';
const perSecond = Number(process.env.API_RATE_PER_SECOND ?? 3);
const specIndex = process.argv.indexOf('--spec');
const spec = specIndex === -1 ? null : JSON.parse(fs.readFileSync(process.argv[specIndex + 1], 'utf8'));

/** `{id}` segments are filled from earlier answers through `vars`. */
const CHECKS = [
  { method: 'GET', path: '/health', auth: false },
  { method: 'GET', path: '/app-config', auth: false },
  { method: 'GET', path: '/items?limit=5', auth: false, capture: (body, vars) => (vars.itemId = body?.items?.[0]?.id) },
  { method: 'GET', path: '/items/{itemId}', auth: false },
  { method: 'GET', path: '/items/does-not-exist', auth: false, expect: 404 },
  { method: 'GET', path: '/auth/me' },
  { method: 'GET', path: '/me/saved' },
  { method: 'POST', path: '/me/saved', body: (vars) => ({ itemId: vars.itemId }), expect: [200, 201] },
  { method: 'DELETE', path: '/me/saved/{itemId}', expect: [200, 204] },
  { method: 'GET', path: '/me/saved', auth: 'bad-token', expect: 401 },
];

let token = null;
let last = 0;
const results = [];

async function throttle() {
  const wait = 1000 / perSecond - (Date.now() - last);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  last = Date.now();
}

function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length ? `[${shape(value[0], depth + 1)} ×${value.length}]` : '[]';
  if (typeof value === 'object') return depth > 2 ? '{…}' : `{${Object.entries(value).map(([k, v]) => `${k}:${shape(v, depth + 1)}`).join(', ')}}`;
  return typeof value;
}

function resolveRef(schema) {
  let current = schema;
  for (let guard = 0; current?.$ref && guard < 10; guard += 1) current = current.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[key], spec);
  return current;
}

/** The spec operation for a concrete path, whether the spec's paths include the API prefix or not. */
function findOperation(method, concretePath) {
  const bare = concretePath.split('?')[0];
  const candidates = [`${process.env.API_PREFIX ?? '/api/v1'}${bare}`, bare];
  for (const [specPath, item] of Object.entries(spec.paths ?? {})) {
    const pattern = new RegExp(`^${specPath.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (candidates.some((candidate) => pattern.test(candidate)) && item[method.toLowerCase()]) return item[method.toLowerCase()];
  }
  return null;
}

/** Shallow check of a live body against the spec's response schema: missing required fields and wrong top-level types. */
function specProblems(method, path, status, body) {
  if (!spec) return [];
  const operation = findOperation(method, path);
  if (!operation) return ['not in the spec'];
  const media = operation.responses?.[String(status)]?.content?.['application/json'];
  if (!media) return status < 300 && body !== undefined ? [`spec has no JSON body for ${status}`] : [];
  const schema = resolveRef(media.schema);
  const target = schema?.type === 'array' ? { schema: resolveRef(schema.items), value: Array.isArray(body) ? body[0] : undefined } : { schema, value: body };
  if (!target.schema || target.value === undefined || target.value === null || typeof target.value !== 'object') return [];
  const problems = [];
  for (const name of target.schema.required ?? []) if (!(name in target.value)) problems.push(`missing required "${name}"`);
  for (const [name, property] of Object.entries(target.schema.properties ?? {})) {
    const expected = resolveRef(property)?.type;
    const actual = Array.isArray(target.value[name]) ? 'array' : target.value[name] === null ? 'null' : typeof target.value[name];
    if (expected && name in target.value && actual !== 'null' && actual !== (expected === 'integer' ? 'number' : expected)) problems.push(`"${name}" is ${actual}, spec says ${expected}`);
  }
  return problems;
}

async function call({ method, path, auth = true, body }) {
  await throttle();
  const headers = {};
  if (auth === 'bad-token') headers.Authorization = 'Bearer not-a-token';
  else if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

const login = await call({ method: 'POST', path: '/auth/login', auth: false, body: { email, password } });
token = login.json?.accessToken ?? null;
console.log(`${login.status === 200 ? '✔' : '✖'} POST /auth/login → ${login.status} · ${shape(login.json)}`);
if (!token) console.log('   (no access token — authenticated checks will fail; check QA_EMAIL / QA_PASSWORD)');

const vars = {};
for (const check of CHECKS) {
  const path = check.path.replace(/\{(\w+)\}/g, (_, name) => encodeURIComponent(vars[name] ?? `{${name}}`));
  const result = await call({ ...check, path, body: typeof check.body === 'function' ? check.body(vars) : check.body });
  check.capture?.(result.json, vars);
  const expected = [check.expect ?? [200]].flat();
  const ok = expected.includes(result.status);
  const problems = specProblems(check.method, path, result.status, result.json);
  results.push({ ok: ok && problems.length === 0 });
  console.log(`${ok ? '✔' : '✖'} ${check.method} ${path} → ${result.status}${ok ? '' : ` (expected ${expected.join('/')})`} · ${shape(result.json)}`);
  for (const problem of problems) console.log(`   spec: ${problem}`);
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} as expected${spec ? ' (shapes checked against the spec)' : ''}`);
process.exit(failed ? 1 : 0);
