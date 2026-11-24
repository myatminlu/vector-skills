/**
 * Builds the Release configuration for the iOS simulator, launches it, and fails unless the app stays up.
 *
 * Save as scripts/ios-launch-test.mjs and add `"ios:launch-test": "node scripts/ios-launch-test.mjs"` to
 * package.json. It reads everything it needs from app.json and the generated ios/ folder — there is nothing
 * project-specific to edit.
 *
 * Why it exists: on the project it comes from, a store reviewer hit a crash on launch that every local check
 * had passed — the project compiled, archived and uploaded, and the OS stopped it before the first frame on
 * the newest iOS (a life cycle the new SDK required and the template lacked). Two more failures of the same
 * shape turned up while fixing it: a dyld abort when the dependency install quietly built the framework from
 * source, and a JS throw when the bundle was made without `.env`. Each has its own guard now, but what they
 * share is that only *launching the release build* shows them, and the next one will be something nobody has
 * thought of yet. So launch it, on the newest iOS there is, before it is archived.
 *
 * Usage (after `APP_ENV=production npx expo prebuild --clean`):
 *   node scripts/ios-launch-test.mjs            # newest iOS runtime: one iPad and one iPhone
 *   node scripts/ios-launch-test.mjs <udid>…    # these simulators instead
 *
 * It never uninstalls the app and only picks simulators that are shut down, so a simulator someone is
 * working in — with its dev client and signed-in session — is left alone unless its UDID is passed in.
 * Needs Xcode and takes about ten minutes; under a sandboxed agent shell, run it with the sandbox off.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iosDir = path.join(root, 'ios');
const { expo } = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const bundleId = expo.ios.bundleIdentifier;
const reportsDir = path.join(os.homedir(), 'Library/Logs/DiagnosticReports');
const derivedData = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData/launch-test');
const SECONDS_UP = 15;

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const simctl = (...args) => run('xcrun', ['simctl', ...args]);
const plist = (file, key) => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file]).trim();
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

const workspace = fs.existsSync(iosDir) ? fs.readdirSync(iosDir).find((name) => name.endsWith('.xcworkspace')) : null;
if (!workspace) fail('No ios/*.xcworkspace — run `APP_ENV=production npx expo prebuild --platform ios --clean` first.');
const scheme = workspace.replace('.xcworkspace', '');

// A stale ios/ is how a fixed bug ships anyway: the project is only as new as the last prebuild.
const infoPlist = path.join(iosDir, scheme, 'Info.plist');
const built = `${plist(infoPlist, 'CFBundleShortVersionString')} (${plist(infoPlist, 'CFBundleVersion')})`;
const expected = `${expo.version} (${expo.ios.buildNumber})`;
if (built !== expected) fail(`ios/ is ${built} but app.json says ${expected} — the native project is stale; prebuild again.`);
console.log(`✓ ios/ matches app.json: ${built}`);

function pickSimulators() {
  const { devices } = JSON.parse(simctl('list', 'devices', 'available', '-j'));
  const newest = Object.keys(devices)
    .filter((runtime) => /SimRuntime\.iOS-/.test(runtime) && devices[runtime].length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  if (!newest) fail('No iOS simulator runtime is installed.');
  const idle = devices[newest].filter((device) => device.state === 'Shutdown');
  // Store reviewers test on iPad as well as iPhone — and iPad is where the original app was rejected.
  const picked = [idle.find((device) => device.name.startsWith('iPad')), idle.find((device) => device.name.startsWith('iPhone'))].filter(Boolean);
  if (picked.length === 0) fail(`Every simulator on ${newest} is in use; pass a UDID.`);
  const version = newest.split('iOS-')[1].replace(/-/g, '.');
  return picked.map((device) => ({ udid: device.udid, name: `${device.name}, iOS ${version}` }));
}

const targets = process.argv.length > 2 ? process.argv.slice(2).map((udid) => ({ udid, name: udid })) : pickSimulators();

// A fresh build directory every time: objects left over from a differently configured Pods project link
// against frameworks that are no longer embedded, which looks exactly like the crash being hunted.
fs.rmSync(derivedData, { recursive: true, force: true });
const buildLog = path.join(os.tmpdir(), 'ios-launch-test-build.log');
console.log(`… building ${scheme} (Release, simulator) — about ten minutes; log: ${buildLog}`);
const build = spawnSync(
  'xcodebuild',
  ['-workspace', path.join(iosDir, workspace), '-scheme', scheme, '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', `id=${targets[0].udid}`, '-derivedDataPath', derivedData, 'build'],
  { stdio: ['ignore', fs.openSync(buildLog, 'w'), 'inherit'] },
);
if (build.status !== 0) {
  const errors = fs.readFileSync(buildLog, 'utf8').split('\n').filter((line) => /error:|BUILD FAILED/.test(line));
  fail(`The Release build failed:\n${errors.slice(-8).join('\n')}`);
}
const app = path.join(derivedData, 'Build/Products/Release-iphonesimulator', `${scheme}.app`);

const crashReports = () => new Set(fs.existsSync(reportsDir) ? fs.readdirSync(reportsDir).filter((name) => name.startsWith(`${scheme}-`) && name.endsWith('.ips')) : []);

function describeCrash(file) {
  const raw = fs.readFileSync(path.join(reportsDir, file), 'utf8');
  const report = JSON.parse(raw.slice(raw.indexOf('\n') + 1));
  const frames = report.threads[report.faultingThread].frames.slice(0, 5).map((frame) => `    ${report.usedImages[frame.imageIndex].name ?? '?'}  ${frame.symbol ?? ''}`);
  const reasons = (report.termination?.reasons ?? []).slice(0, 2).map((reason) => `    ${reason}`);
  return [`  ${report.exception.type} ${report.exception.signal ?? ''} — ${report.termination?.indicator ?? ''}`, ...reasons, ...frames].join('\n');
}

let failed = false;
for (const { udid, name } of targets) {
  const everyDevice = Object.values(JSON.parse(simctl('list', 'devices', '-j')).devices).flat();
  const booted = everyDevice.find((device) => device.udid === udid)?.state === 'Booted';
  if (!booted) simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
  simctl('install', udid, app);
  const before = crashReports();
  simctl('launch', udid, bundleId);
  execFileSync('/bin/sleep', [String(SECONDS_UP)]);
  const alive = simctl('spawn', udid, 'launchctl', 'list').includes(bundleId);
  const crashes = [...crashReports()].filter((file) => !before.has(file));
  if (alive && crashes.length === 0) {
    console.log(`✓ ${name}: still running after ${SECONDS_UP} s`);
  } else {
    failed = true;
    console.error(`✖ ${name}: ${alive ? 'crash report written' : 'the app is not running'}`);
    crashes.forEach((file) => console.error(describeCrash(file)));
  }
  if (!booted) simctl('shutdown', udid);
}

fs.rmSync(derivedData, { recursive: true, force: true });
if (failed) fail('Do not archive this build.');
console.log('\n✓ The release build launches. Safe to archive.');
