#!/usr/bin/env node
/**
 * Runs the Maestro flows in .maestro/ against a build already installed on a simulator or emulator, with the mock
 * API running. This is how an agent taps through the app itself instead of asking a person to.
 *
 *   npm run e2e -- --device <iOS simulator UDID | emulator-5554> [--flow .maestro/guest.yaml] [--no-mock]
 *
 * Build the app for it once (see README → "End-to-end tests"): APP_ENV=e2e and EXPO_PUBLIC_API_URL pointing at
 * http://localhost:4010. On Android the emulator reaches the Mac's port through `adb reverse`, which this script sets.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const device = option('--device');
const flow = option('--flow') ?? path.join(root, '.maestro');
const useMock = !args.includes('--no-mock');
const port = Number(process.env.MOCK_PORT ?? 4010);

if (!device) {
  console.error('Pass --device <iOS simulator UDID | emulator-5554>. List them with `xcrun simctl list devices booted` and `adb devices`.');
  process.exit(2);
}

// Maestro runs on Java; macOS's /usr/bin/java is only a stub. If JAVA_HOME is not set, use the JDK Homebrew
// installed with Maestro (`openjdk`), then any other Homebrew JDK, then whatever /usr/libexec/java_home reports.
if (!process.env.JAVA_HOME) {
  const brewOpt = ['/opt/homebrew/opt', '/usr/local/opt'].find((dir) => fs.existsSync(dir));
  const brewJdks = brewOpt
    ? fs.readdirSync(brewOpt).filter((name) => /^openjdk(@\d+)?$/.test(name)).sort((a, b) => (a === 'openjdk' ? -1 : b === 'openjdk' ? 1 : b.localeCompare(a, undefined, { numeric: true })))
    : [];
  const candidates = brewJdks.map((name) => path.join(brewOpt, name, 'libexec', 'openjdk.jdk', 'Contents', 'Home'));
  const javaHome = spawnSync('/usr/libexec/java_home', { encoding: 'utf8' });
  if (javaHome.status === 0) candidates.push(javaHome.stdout.trim());
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'bin', 'java')));
  if (found) process.env.JAVA_HOME = found;
}

// adb is rarely on PATH; the SDK's copy always exists where Android Studio put it.
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), 'Library', 'Android', 'sdk');
const adb = fs.existsSync(path.join(sdk, 'platform-tools', 'adb')) ? path.join(sdk, 'platform-tools', 'adb') : 'adb';

const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const isAndroid = /^emulator-\d+$|:\d+$/.test(device) || spawnSync(adb, ['-s', device, 'get-state'], { encoding: 'utf8' }).stdout?.trim() === 'device';
const appId = isAndroid ? expo.android.package : expo.ios.bundleIdentifier;

async function healthy() {
  try {
    return (await fetch(`http://localhost:${port}/api/v1/health`)).ok;
  } catch {
    return false;
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await healthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The mock API did not answer on port ${port}.`);
}

// Reuse a mock that is already running (another platform's run, or `npm run mock-api` in a terminal) instead of
// fighting it for the port — and leave it running afterwards, since this run does not own it.
let mock;
if (useMock && !(await healthy())) {
  mock = spawn(process.execPath, [path.join(root, 'scripts', 'mock-api.mjs')], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MOCK_PORT: String(port) } });
  mock.stdout.on('data', (chunk) => process.env.E2E_VERBOSE && process.stdout.write(`[mock] ${chunk}`));
  await waitForHealth();
}
if (isAndroid) execFileSync(adb, ['-s', device, 'reverse', `tcp:${port}`, `tcp:${port}`]);

const email = process.env.QA_EMAIL ?? 'demo@example.com';
const password = process.env.QA_PASSWORD ?? 'demo1234';
console.log(`Maestro → ${isAndroid ? 'Android' : 'iOS'} ${device} · ${appId} · ${path.relative(root, flow) || flow}`);
const result = spawnSync('maestro', ['--device', device, 'test', flow, '-e', `APP_ID=${appId}`, '-e', `QA_EMAIL=${email}`, '-e', `QA_PASSWORD=${password}`], { stdio: 'inherit', env: process.env });

mock?.kill();
process.exit(result.status ?? 1);
