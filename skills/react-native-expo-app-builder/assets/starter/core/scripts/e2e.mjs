#!/usr/bin/env node
/**
 * Runs the Maestro flows in .maestro/ against a build already installed on a simulator or emulator, with the mock
 * API running. This is how an agent taps through the app itself instead of asking a person to.
 *
 *   npm run e2e -- --device <iOS simulator UDID | emulator-5554> [--flow .maestro/guest.yaml] [--no-mock]
 *
 * Build the app for it once (see README → "End-to-end tests"): APP_ENV=e2e and EXPO_PUBLIC_API_URL pointing at
 * http://localhost:4010. On Android the emulator reaches the host port through `adb reverse`, which this script sets.
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
  console.error('Pass --device <iOS simulator UDID | emulator-5554>. List them with `xcrun simctl list devices booted` (macOS) or `adb devices`.');
  process.exit(2);
}

const isWin = process.platform === 'win32';
const javaBin = isWin ? 'java.exe' : 'java';

function findJavaHome() {
  const candidates = [];
  if (process.platform === 'darwin') {
    const brewOpt = ['/opt/homebrew/opt', '/usr/local/opt'].find((dir) => fs.existsSync(dir));
    const brewJdks = brewOpt
      ? fs
          .readdirSync(brewOpt)
          .filter((name) => /^openjdk(@\d+)?$/.test(name))
          .sort((a, b) => (a === 'openjdk' ? -1 : b === 'openjdk' ? 1 : b.localeCompare(a, undefined, { numeric: true })))
      : [];
    for (const name of brewJdks) candidates.push(path.join(brewOpt, name, 'libexec', 'openjdk.jdk', 'Contents', 'Home'));
    const javaHome = spawnSync('/usr/libexec/java_home', { encoding: 'utf8' });
    if (javaHome.status === 0) candidates.push(javaHome.stdout.trim());
  } else if (isWin) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      for (const vendor of ['Eclipse Adoptium', 'Java', 'Microsoft']) {
        const dir = path.join(base, vendor);
        if (!fs.existsSync(dir)) continue;
        for (const sub of fs.readdirSync(dir).sort().reverse()) candidates.push(path.join(dir, sub));
      }
    }
  } else {
    candidates.push(path.join(os.homedir(), '.sdkman', 'candidates', 'java', 'current'), '/usr/lib/jvm/default-java');
    if (fs.existsSync('/usr/lib/jvm')) {
      for (const sub of fs.readdirSync('/usr/lib/jvm').filter((n) => /openjdk|temurin|java-/.test(n)).sort().reverse()) {
        candidates.push(path.join('/usr/lib/jvm', sub));
      }
    }
  }
  return candidates.find((candidate) => candidate && fs.existsSync(path.join(candidate, 'bin', javaBin)));
}

// Maestro runs on Java; macOS's /usr/bin/java is only a stub, and Linux/Windows installs often omit JAVA_HOME.
if (!process.env.JAVA_HOME) {
  const found = findJavaHome();
  if (found) process.env.JAVA_HOME = found;
}

function findAdb() {
  const adbBin = isWin ? 'adb.exe' : 'adb';
  const defaultSdk =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
      : isWin
        ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
        : path.join(os.homedir(), 'Android', 'Sdk');
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? defaultSdk;
  const candidate = path.join(sdk, 'platform-tools', adbBin);
  return fs.existsSync(candidate) ? candidate : adbBin;
}

const adb = findAdb();

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
const maestroArgs = ['--device', device, 'test', flow, '-e', `APP_ID=${appId}`, '-e', `QA_EMAIL=${email}`, '-e', `QA_PASSWORD=${password}`];
const result = isWin
  ? spawnSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `"${['maestro', ...maestroArgs.map((a) => (/[ \t"&()<>^|]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a))].join(' ')}"`],
      { stdio: 'inherit', env: process.env, windowsVerbatimArguments: true },
    )
  : spawnSync('maestro', maestroArgs, { stdio: 'inherit', env: process.env });

mock?.kill();
process.exit(result.status ?? 1);
