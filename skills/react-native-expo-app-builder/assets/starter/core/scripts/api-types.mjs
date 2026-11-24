#!/usr/bin/env node
/**
 * Generates src/types/openapi.d.ts from docs/openapi.json (or OPENAPI_SPEC / first CLI arg).
 * Kept as a Node script rather than a POSIX shell fallback so `npm run api:types` works on Windows too.
 */
import { spawnSync } from 'node:child_process';

const spec = process.env.OPENAPI_SPEC || process.argv[2] || 'docs/openapi.json';
const args = ['--yes', 'openapi-typescript@latest', spec, '-o', 'src/types/openapi.d.ts'];

const result =
  process.platform === 'win32'
    ? spawnSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `"${['npx.cmd', ...args.map((a) => (/[ \t"&()<>^|]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a))].join(' ')}"`],
        { stdio: 'inherit', windowsVerbatimArguments: true },
      )
    : spawnSync('npx', args, { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
