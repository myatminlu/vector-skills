#!/usr/bin/env node
/**
 * Contract smoke test: calls every endpoint the app uses against a real API and prints status + response *shape*,
 * so the docs can be compared with what the server actually does — before any screen is built on it. The core's
 * checks live in `scripts/smoke/core.mjs`; each installed module adds its own file there.
 *
 *   API_URL=https://api.example.com QA_EMAIL=… QA_PASSWORD=… npm run api:smoke
 *   API_URL=http://localhost:4010 npm run api:smoke -- --spec docs/openapi.json   # also check shapes against the spec
 *
 * Rules: credentials come from the environment, never a file; throttle to the backend's limit; reversible writes
 * only (create → read → delete); never payments, password changes or account deletion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PREFIX = process.env.API_PREFIX ?? '/api/v1';
const BASE = `${(process.env.API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4010').replace(/\/$/, '')}${PREFIX}`;
const perSecond = Number(process.env.API_RATE_PER_SECOND ?? 3);
const specIndex = process.argv.indexOf('--spec');
const spec = specIndex === -1 ? null : JSON.parse(fs.readFileSync(process.argv[specIndex + 1], 'utf8'));

let last = 0;

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
  const candidates = [`${PREFIX}${bare}`, bare];
  for (const [specPath, item] of Object.entries(spec.paths ?? {})) {
    const pattern = new RegExp(`^${specPath.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (candidates.some((candidate) => pattern.test(candidate)) && item[method.toLowerCase()]) return item[method.toLowerCase()];
  }
  return null;
}

/** Shallow check of a live body against the spec's response schema: missing required fields and wrong top-level types. */
function specProblems(method, path, status, body, stream) {
  if (!spec) return [];
  const operation = findOperation(method, path);
  if (!operation) return ['not in the spec'];
  if (stream) return operation.responses?.[String(status)]?.content?.['text/event-stream'] ? [] : [`spec has no event stream for ${status}`];
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

/** What the check files share: the session token a setup step stores, values captured from earlier answers, the caller. */
const ctx = {
  token: null,
  vars: {},
  shape,
  async call({ method, path, auth = true, body }) {
    await throttle();
    const headers = {};
    if (auth === 'bad-token') headers.Authorization = 'Bearer not-a-token';
    else if (auth && ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: response.status, json, contentType: response.headers.get('content-type') ?? '' };
  },
};

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'smoke');
const modules = (await Promise.all(fs.readdirSync(dir).filter((file) => file.endsWith('.mjs')).map((file) => import(pathToFileURL(path.join(dir, file)).href)))).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

for (const module of modules) await module.setup?.(ctx);

const results = [];
for (const check of modules.flatMap((module) => module.checks ?? [])) {
  const concrete = check.path.replace(/\{(\w+)\}/g, (_, name) => encodeURIComponent(ctx.vars[name] ?? `{${name}}`));
  const result = await ctx.call({ ...check, path: concrete, body: typeof check.body === 'function' ? check.body(ctx.vars) : check.body });
  check.capture?.(result.json, ctx.vars);
  const expected = [check.expect ?? [200]].flat();
  const streamOk = !check.stream || (result.contentType.includes('text/event-stream') && String(result.json ?? '').includes('data:'));
  const ok = expected.includes(result.status) && streamOk;
  const problems = specProblems(check.method, concrete, result.status, result.json, check.stream);
  results.push({ ok: ok && problems.length === 0 });
  const described = check.stream ? `stream (${result.contentType || 'no content type'})` : shape(result.json);
  console.log(`${ok ? '✔' : '✖'} ${check.method} ${concrete} → ${result.status}${expected.includes(result.status) ? '' : ` (expected ${expected.join('/')})`} · ${described}`);
  for (const problem of problems) console.log(`   spec: ${problem}`);
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} as expected${spec ? ' (shapes checked against the spec)' : ''}`);
process.exit(failed ? 1 : 0);
