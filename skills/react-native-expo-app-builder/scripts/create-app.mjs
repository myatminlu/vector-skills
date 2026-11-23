#!/usr/bin/env node
/**
 * Creates a new Expo app on whatever SDK is `latest` today and applies the starter foundation on top of it.
 *
 *   node <skill>/scripts/create-app.mjs <app-dir> [--name "My App"] [--bundle-id com.acme.myapp]
 *                                                  [--existing] [--conductor] [--skip-install] [--skip-check]
 *
 *   <app-dir>         Folder to create (it must not exist), or with --existing a fresh `create-expo-app` project.
 *   --name            Display name. Default: the folder name.
 *   --bundle-id       iOS bundle identifier and Android application id. Default: com.example.<slug>, which store
 *                     builds refuse on purpose — the real one is fixed forever by the first store upload.
 *   --existing        Do not run create-expo-app; apply the starter to <app-dir> (default template, untouched).
 *   --conductor       Also write .conductor/settings.toml and .conductor/setup.sh (Conductor workspace bootstrap).
 *   --skip-install    Copy and patch files only; install nothing (offline dry run of the file changes).
 *   --skip-check      Do not run typecheck, lint and unit tests at the end.
 *
 * Nothing here pins a version. The project comes from `create-expo-app@latest`, every Expo/React Native library is
 * added with `npx expo install` (which picks the version that matches the project's SDK), and dev tools resolve to
 * their latest release. The script prints the versions it ended up with; record them in docs/PROJECT_BRIEF.md.
 *
 * Needs network access and a package manager cache, so run it with the agent's tool sandbox off.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const starterDir = path.join(skillDir, 'assets', 'starter');

// Runtime libraries the starter imports beyond the default template. Versions come from `npx expo install`.
const RUNTIME_DEPS = [
  'expo-secure-store',
  'expo-sqlite',
  'expo-localization',
  'expo-dev-client',
  'expo-build-properties',
  '@react-native-community/netinfo',
  '@tanstack/react-query',
  '@tanstack/react-query-persist-client',
  '@tanstack/query-async-storage-persister',
  '@expo-google-fonts/noto-sans-myanmar',
];
// Linting is set up through Expo so that eslint and eslint-config-expo match the SDK.
const LINT_DEPS = ['eslint', 'eslint-config-expo'];
// Test runner and Node types for the pure-logic tests and scripts. Latest releases.
const DEV_DEPS = ['tsx', '@types/node'];

const PLUGINS = ['expo-secure-store', 'expo-sqlite', 'expo-localization', 'expo-build-properties', './plugins/with-upload-signing'];

const SCRIPTS = {
  start: 'expo start --dev-client',
  ios: 'expo run:ios',
  android: 'expo run:android',
  lint: 'expo lint',
  typecheck: 'tsc --noEmit',
  test: 'node --import tsx --experimental-test-module-mocks --test "src/**/*.test.ts"',
  check: 'npm run typecheck && npm run lint && npm test',
  'export:all': 'expo export --platform ios --platform android',
  'mock-api': 'node scripts/mock-api.mjs',
  'api:smoke': 'node scripts/api-smoke.mjs',
  'api:types': 'npx --yes openapi-typescript@latest "${OPENAPI_SPEC:-docs/openapi.json}" -o src/types/openapi.d.ts',
  e2e: 'node scripts/e2e.mjs',
  bump: 'node scripts/bump-build.mjs',
  'ios:launch-test': 'node scripts/ios-launch-test.mjs',
};

const GITIGNORE_LINES = [
  '# local env (the real values live in the repository root\'s .env; .env.example is the list of keys)',
  '.env',
  '# Maestro artifacts',
  '.maestro/out/',
];

// Template example code that the starter replaces. Root-level folders cover templates that do not use src/.
const TEMPLATE_CODE = ['src/app', 'src/components', 'src/hooks', 'src/constants', 'src/global.css', 'scripts/reset-project.js', 'app', 'components', 'hooks', 'constants'];

// ── arguments ────────────────────────────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const positional = argv.filter((arg, index) => !arg.startsWith('--') && !['--name', '--bundle-id'].includes(argv[index - 1]));
const target = positional[0] && path.resolve(positional[0]);
if (!target) {
  console.error('Usage: node create-app.mjs <app-dir> [--name "My App"] [--bundle-id com.acme.myapp] [--existing] [--conductor] [--skip-install] [--skip-check]');
  process.exit(2);
}
const existing = flag('--existing');
const skipInstall = flag('--skip-install');

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let stepNumber = 0;
const step = (title) => console.log(`\n▶ ${++stepNumber}. ${title}`);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};
function run(command, args, options = {}) {
  console.log(`  $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: target, ...options });
  if (result.status !== 0) fail(`\`${command} ${args.join(' ')}\` exited with ${result.status ?? result.signal}. Fix the cause and rerun with --existing.`);
}
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(target, file), 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(path.join(target, file), `${JSON.stringify(value, null, 2)}\n`);
const versionOf = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(target, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
};
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';

// ── 1. the project ───────────────────────────────────────────────────────────────────────────────────────────────

if (target.startsWith(skillDir + path.sep)) fail('Create the app outside the skill folder.');

if (existing) {
  step(`Using the existing project at ${target}`);
  if (!fs.existsSync(path.join(target, 'package.json'))) fail('No package.json — run create-expo-app first, or drop --existing.');
} else {
  step('Creating the project with create-expo-app@latest (default template)');
  if (fs.existsSync(target)) fail(`${target} already exists. Pick a new folder, or pass --existing for a fresh create-expo-app project.`);
  run(npx, ['--yes', 'create-expo-app@latest', target, '--yes', ...(skipInstall ? ['--no-install'] : [])], { cwd: path.dirname(target) });
}

const pkg = readJson('package.json');
if (!pkg.dependencies?.expo || !pkg.dependencies?.['expo-router']) fail('This is not an expo-router project from create-expo-app (expo or expo-router missing).');
if (fs.existsSync(path.join(target, 'src', 'lib', 'api', 'client.ts')) && !flag('--force')) fail('The starter is already applied here (src/lib/api/client.ts exists). Pass --force to overwrite.');

// ── 2. replace the template's example code with the starter ──────────────────────────────────────────────────────

step('Replacing the template example code with the starter');
for (const relative of TEMPLATE_CODE) {
  const absolute = path.join(target, relative);
  if (fs.existsSync(absolute)) {
    fs.rmSync(absolute, { recursive: true, force: true });
    console.log(`  removed ${relative}`);
  }
}
fs.cpSync(starterDir, target, { recursive: true, force: true });
console.log(`  copied ${path.relative(process.cwd(), starterDir) || starterDir}`);

const docs = path.join(target, 'docs');
for (const [from, to] of [['PROJECT_BRIEF.template.md', 'PROJECT_BRIEF.md'], ['HUMAN_TASKS.template.md', 'HUMAN_TASKS.md']]) {
  const destination = path.join(docs, to);
  if (!fs.existsSync(destination)) fs.copyFileSync(path.join(skillDir, 'assets', from), destination);
}
if (flag('--conductor')) {
  fs.mkdirSync(path.join(target, '.conductor'), { recursive: true });
  for (const file of ['settings.toml', 'setup.sh']) fs.copyFileSync(path.join(skillDir, 'assets', 'conductor', file), path.join(target, '.conductor', file));
  console.log('  wrote .conductor/settings.toml and .conductor/setup.sh');
}

// Template images nothing refers to any more (tab icons, logos used by the example screens).
const appJsonText = fs.readFileSync(path.join(target, 'app.json'), 'utf8');
const imagesDir = path.join(target, 'assets', 'images');
if (fs.existsSync(imagesDir)) {
  for (const entry of fs.readdirSync(imagesDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
    const relative = path.relative(target, absolute).split(path.sep).join('/');
    if (!appJsonText.includes(relative)) fs.rmSync(absolute);
  }
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
    const absolute = path.join(imagesDir, entry.name);
    if (entry.isDirectory() && fs.readdirSync(absolute).length === 0) fs.rmdirSync(absolute);
  }
}

// ── 3. identity and config ───────────────────────────────────────────────────────────────────────────────────────

step('Setting the identity and wiring the config plugins');
const appJson = readJson('app.json');
const expo = appJson.expo;
const name = option('--name') ?? expo.name;
const slug = slugify(option('--name') ?? expo.slug ?? path.basename(target));
const bundleId = option('--bundle-id') ?? `com.example.${slug.replace(/-/g, '')}`;
if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(bundleId)) fail(`"${bundleId}" is not a valid bundle id (reverse domain, letters/digits/underscores).`);
Object.assign(expo, { name, slug, scheme: slug.replace(/-/g, ''), orientation: 'default' });
expo.ios = { ...expo.ios, bundleIdentifier: bundleId, buildNumber: expo.ios?.buildNumber ?? '1', supportsTablet: true, config: { ...expo.ios?.config, usesNonExemptEncryption: expo.ios?.config?.usesNonExemptEncryption ?? false } };
expo.android = { ...expo.android, package: bundleId, versionCode: expo.android?.versionCode ?? 1 };
expo.web = { ...expo.web, output: 'static' };
const pluginNames = (expo.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
expo.plugins = [...(expo.plugins ?? []), ...PLUGINS.filter((plugin) => !pluginNames.includes(plugin))];
expo.extra = { ...expo.extra, legal: expo.extra?.legal ?? { privacyUrl: 'https://example.com/privacy', termsUrl: 'https://example.com/terms', supportEmail: 'support@example.com' } };
writeJson('app.json', appJson);
console.log(`  ${name} · ${bundleId}${option('--bundle-id') ? '' : ' (placeholder — store builds refuse it until you set the real one)'}`);

try {
  const tsconfig = readJson('tsconfig.json');
  tsconfig.compilerOptions = { ...tsconfig.compilerOptions, types: [...new Set([...(tsconfig.compilerOptions?.types ?? []), 'react', 'node'])] };
  writeJson('tsconfig.json', tsconfig);
} catch (error) {
  console.warn(`  ! tsconfig.json not patched (${error.message}). Add "types": ["react", "node"] to compilerOptions by hand.`);
}

const gitignorePath = path.join(target, '.gitignore');
const gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
const missing = GITIGNORE_LINES.filter((line) => line.startsWith('#') || !gitignore.split('\n').includes(line));
if (missing.some((line) => !line.startsWith('#'))) fs.writeFileSync(gitignorePath, `${gitignore.trimEnd()}\n\n${missing.join('\n')}\n`);

const freshPkg = readJson('package.json');
freshPkg.name = slug;
delete freshPkg.scripts?.['reset-project'];
freshPkg.scripts = { ...freshPkg.scripts, ...SCRIPTS };
writeJson('package.json', freshPkg);

if (!fs.existsSync(path.join(target, '.env'))) fs.copyFileSync(path.join(target, '.env.example'), path.join(target, '.env'));

// The workflow files carry whatever action majors were current when the starter was written; point each `uses:` at
// the action's latest release instead. .github/dependabot.yml keeps them current after today.
step('Pointing GitHub Actions at their current major versions');
const workflowsDir = path.join(target, '.github', 'workflows');
const latestMajor = async (repo) => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'create-app-script' },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? /^v\d+/.exec((await response.json()).tag_name ?? '')?.[0] : undefined;
  } catch {
    return undefined;
  }
};
for (const file of fs.existsSync(workflowsDir) ? fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name)) : []) {
  const absolute = path.join(workflowsDir, file);
  let text = fs.readFileSync(absolute, 'utf8');
  for (const repo of new Set([...text.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@v\d+/g)].map((match) => match[1]))) {
    const major = await latestMajor(repo);
    if (major) {
      text = text.replace(new RegExp(`(uses:\\s*${repo.replace(/[.]/g, '\\.')})@v\\d+`, 'g'), `$1@${major}`);
      console.log(`  ${repo}@${major}`);
    } else {
      console.warn(`  ! could not read the latest release of ${repo}; left as is (Dependabot will raise it)`);
    }
  }
  fs.writeFileSync(absolute, text);
}

// ── 4. dependencies ──────────────────────────────────────────────────────────────────────────────────────────────

if (skipInstall) {
  step('Skipping installs (--skip-install). To finish later:');
  console.log(`  npx expo install ${RUNTIME_DEPS.join(' ')}`);
  console.log(`  npx expo install ${LINT_DEPS.join(' ')} -- --save-dev   (or: npx expo lint, and accept its setup)`);
  console.log(`  npm install --save-dev ${DEV_DEPS.join(' ')}`);
  console.log('  npm run api:types && npm run check');
  process.exit(0);
}

step('Installing the starter\'s libraries at the versions this SDK expects');
run(npx, ['expo', 'install', ...RUNTIME_DEPS]);

step('Installing lint, test and type tooling');
// `expo install` picks the SDK-compatible versions (eslint can be held a major behind its `latest` tag on purpose),
// but its `-- --save-dev` passthrough does not reach packages in Expo's own version map: those land in
// `dependencies`. Keep Expo's version choice and move them to `devDependencies`.
run(npx, ['expo', 'install', ...LINT_DEPS, '--', '--save-dev']);
const lintPkg = readJson('package.json');
const misplaced = LINT_DEPS.filter((dep) => lintPkg.dependencies?.[dep]);
if (misplaced.length) {
  for (const dep of misplaced) {
    lintPkg.devDependencies = { ...lintPkg.devDependencies, [dep]: lintPkg.dependencies[dep] };
    delete lintPkg.dependencies[dep];
  }
  writeJson('package.json', lintPkg);
  console.log(`  moved ${misplaced.join(', ')} to devDependencies (same versions)`);
}
run(npm, ['install', '--save-dev', ...DEV_DEPS.map((dep) => `${dep}@latest`)]);

const afterInstall = readJson('package.json');
for (const dep of [...LINT_DEPS, ...DEV_DEPS]) {
  if (afterInstall.dependencies?.[dep] || !afterInstall.devDependencies?.[dep]) fail(`${dep} is not in devDependencies. Fix package.json by hand and rerun with --existing --force.`);
}

step('Generating API types from docs/openapi.json');
run(npm, ['run', 'api:types']);

// ── 5. checks ────────────────────────────────────────────────────────────────────────────────────────────────────

if (!flag('--skip-check')) {
  step('Typecheck, lint and unit tests');
  run(npm, ['run', 'check']);
}

const versions = ['expo', 'react-native', 'react', 'expo-router', 'typescript'].map((dep) => `${dep}@${versionOf(dep) ?? '?'}`).join(' · ');
console.log(`
✔ ${name} is ready at ${target}
  Versions: ${versions}
  Record them in docs/PROJECT_BRIEF.md (Pack 4 → toolchain) — they are what "latest" meant today.

Next:
  1. Fill docs/PROJECT_BRIEF.md; set the real bundle id and extra.legal in app.json before any store build.
  2. npm run mock-api                     # local backend on :4010 (demo@example.com / demo1234)
  3. npm run ios  |  npm run android      # development builds (sandbox off)
  4. Release builds + Maestro: see README.md → "End-to-end tests"
`);
