/**
 * Bumps the native build numbers in app.json.
 *
 * Save as scripts/bump-build.mjs. It assumes the layout this skill recommends: versions in app.json
 * (`expo.version`, `expo.ios.buildNumber`, `expo.android.versionCode`) and a line
 * `export const APP_VERSION = 'x.y.z';` in src/config/env.ts — change `envFile` below if yours differs.
 * Always show the `--dry-run` output to the owner and wait for approval before the real run.
 *
 * EAS does this automatically (`autoIncrement` in eas.json), but that only runs on EAS Build. Uploading
 * from Xcode or Transporter means the numbers are ours to manage, and App Store Connect and the Play
 * Console both reject a build that reuses one — after the upload, which is a slow way to find out.
 *
 * Usage:
 *   node scripts/bump-build.mjs                 # ios.buildNumber + android.versionCode + 1
 *   node scripts/bump-build.mjs --version 1.1.0 # also set the marketing version
 *   node scripts/bump-build.mjs --dry-run       # print what would change
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'app.json');
// `APP_VERSION` is shown in Profile and is the react-query persist cache buster, so it has to move
// with app.json or a shipped 1.1.0 reports 1.0.0 and reuses the previous version's offline cache.
const envFile = path.join(root, 'src', 'config', 'env.ts');
const APP_VERSION_RE = /^(export const APP_VERSION = ')(\d+\.\d+\.\d+)(';)$/m;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const versionIndex = args.indexOf('--version');
const version = versionIndex === -1 ? null : args[versionIndex + 1];

if (versionIndex !== -1 && !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('--version needs a three-part version, e.g. --version 1.1.0');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const config = JSON.parse(raw);
const { expo } = config;

// `buildNumber` is a string in the Expo schema and `versionCode` a number; Apple and Google both want
// a value strictly greater than the last one they accepted, so a non-numeric build number cannot be
// bumped for us and is a mistake worth stopping on rather than guessing at.
const currentBuild = Number(expo.ios.buildNumber);
if (!Number.isInteger(currentBuild) || currentBuild < 1) {
  console.error(`ios.buildNumber is "${expo.ios.buildNumber}", which is not a whole number — set it by hand.`);
  process.exit(1);
}

const before = { version: expo.version, buildNumber: expo.ios.buildNumber, versionCode: expo.android.versionCode };
const after = {
  version: version ?? expo.version,
  buildNumber: String(currentBuild + 1),
  versionCode: expo.android.versionCode + 1,
};

const envSource = fs.readFileSync(envFile, 'utf8');
const envMatch = envSource.match(APP_VERSION_RE);
if (!envMatch) {
  console.error(`Could not find \`export const APP_VERSION = 'x.y.z';\` in ${path.relative(root, envFile)} — update it by hand.`);
  process.exit(1);
}

console.log(`version      ${before.version} → ${after.version}${version ? '' : '  (unchanged; pass --version to raise it)'}`);
if (version && envMatch[2] !== after.version) console.log(`APP_VERSION  ${envMatch[2]} → ${after.version}  (src/config/env.ts)`);
console.log(`buildNumber  ${before.buildNumber} → ${after.buildNumber}`);
console.log(`versionCode  ${before.versionCode} → ${after.versionCode}`);

if (dryRun) {
  console.log('\n--dry-run: app.json not written.');
  process.exit(0);
}

expo.version = after.version;
expo.ios.buildNumber = after.buildNumber;
expo.android.versionCode = after.versionCode;

if (envMatch[2] !== after.version) {
  fs.writeFileSync(envFile, envSource.replace(APP_VERSION_RE, `$1${after.version}$3`));
}

// Two spaces and a trailing newline, matching the file as committed.
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log('\nWritten. Run `npx expo prebuild` before archiving so the native projects pick it up.');
