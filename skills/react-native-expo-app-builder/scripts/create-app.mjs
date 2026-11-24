#!/usr/bin/env node
/**
 * Creates a new Expo app on whatever SDK is `latest` today: the starter's core, plus only the modules the app needs.
 *
 *   node <skill>/scripts/create-app.mjs <app-dir> [--modules auth,guest,ai-consent] [--name "My App"]
 *                                       [--bundle-id com.acme.myapp] [--existing] [--force] [--conductor]
 *                                       [--skip-install] [--skip-check] [--verbose]
 *   node <skill>/scripts/create-app.mjs --list            # the modules and when each is worth it
 *
 *   --modules       Comma-separated, or "all". Required modules are added (guest → auth). Default: core only.
 *   --name          Display name. Default: the folder name.
 *   --bundle-id     iOS bundle identifier and Android application id. Default: com.example.<slug>, which store builds
 *                   refuse on purpose — the real one is fixed forever by the first store upload.
 *   --existing      Apply to <app-dir>, a fresh `create-expo-app` project, instead of creating one.
 *   --force         Overwrite an already-applied starter in <app-dir> (when combined with --existing).
 *   --conductor     Also write .conductor/settings.toml and setup.sh (Conductor workspace bootstrap).
 *   --skip-install  Copy and patch files only (no installs, no type generation, no checks).
 *   --skip-check    Do not run typecheck, lint and unit tests at the end.
 *   --verbose       Stream every command's output (by default it goes to a log file in the temp directory).
 *
 * Nothing pins a version: the project comes from `create-expo-app@latest`, Expo and React Native libraries go in with
 * `npx expo install` (versions follow the SDK), dev tools at their latest release. The script prints what it ended up
 * with; record that in docs/PROJECT_BRIEF.md. Add modules later with add-module.mjs.
 *
 * Needs network access and the package manager cache: run it with the agent's tool sandbox off.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  addPlugins,
  bumpActions,
  copyModuleFiles,
  CORE_DEPENDENCIES,
  CORE_PLUGINS,
  coreDir,
  createRunner,
  ensureAgentInstructions,
  ensureGitignore,
  expoInstall,
  installTooling,
  mergeOpenApi,
  npm,
  npx,
  patchJson,
  printCatalog,
  resolveModules,
  SCRIPTS,
  skillDir,
  versionOf,
  writeDocs,
  writeGenerated,
} from './lib/starter.mjs';

const USAGE =
  'Usage: node create-app.mjs <app-dir> [--modules a,b] [--name "My App"] [--bundle-id com.acme.myapp] [--existing] [--force] [--conductor] [--skip-install] [--skip-check] [--verbose]\n       node create-app.mjs --list';

let parsed;
try {
  parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      list: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      modules: { type: 'string' },
      name: { type: 'string' },
      'bundle-id': { type: 'string' },
      existing: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      conductor: { type: 'boolean', default: false },
      'skip-install': { type: 'boolean', default: false },
      'skip-check': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}

const { values: opts, positionals } = parsed;
if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}
if (opts.list) {
  printCatalog();
  process.exit(0);
}
const target = positionals[0];
if (!target || positionals.length > 1) {
  console.error(USAGE);
  process.exit(2);
}

const appDir = path.resolve(target);
const runner = createRunner({ verbose: opts.verbose, label: 'create-app' });
const { step, note, run, fail } = runner;
const skipInstall = opts['skip-install'];

// Template example code that the starter replaces; root-level folders cover templates that do not use src/.
const TEMPLATE_CODE = ['src/app', 'src/components', 'src/hooks', 'src/constants', 'src/global.css', 'scripts/reset-project.js', 'app', 'components', 'hooks', 'constants'];

if (appDir.startsWith(skillDir + path.sep)) fail('Create the app outside the skill folder.');
const modules = resolveModules((opts.modules ?? '').split(',').map((name) => name.trim()), fail);

// ── 1. the project ──
if (opts.existing) {
  step(`Using the existing project at ${appDir}`);
  if (!fs.existsSync(path.join(appDir, 'package.json'))) fail('No package.json — run create-expo-app first, or drop --existing.');
} else {
  step('Creating the project with create-expo-app@latest (default template)');
  if (fs.existsSync(appDir)) fail(`${appDir} already exists. Pick a new folder, or pass --existing for a fresh create-expo-app project.`);
  run(npx, ['--yes', 'create-expo-app@latest', appDir, '--yes', ...(skipInstall ? ['--no-install'] : [])], { cwd: path.dirname(appDir) });
}
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
if (!pkg.dependencies?.expo || !pkg.dependencies?.['expo-router']) fail('This is not an expo-router project from create-expo-app (expo or expo-router missing).');
if (fs.existsSync(path.join(appDir, 'modules.json')) && !opts.force) fail('The starter is already applied here (modules.json exists). Use add-module.mjs to add modules, or --force to start over.');

// ── 2. core and modules ──
step(`Applying the core${modules.length ? ` and ${modules.length} module(s): ${modules.map((module) => module.name).join(', ')}` : ' (no modules — add them later with add-module.mjs)'}`);
for (const relative of TEMPLATE_CODE) fs.rmSync(path.join(appDir, relative), { recursive: true, force: true });
fs.cpSync(coreDir, appDir, { recursive: true, force: true });
for (const [from, to] of [['PROJECT_BRIEF.template.md', 'PROJECT_BRIEF.md'], ['HUMAN_TASKS.template.md', 'HUMAN_TASKS.md']]) {
  const destination = path.join(appDir, 'docs', to);
  if (!fs.existsSync(destination)) fs.copyFileSync(path.join(skillDir, 'assets', from), destination);
}
if (opts.conductor) {
  fs.mkdirSync(path.join(appDir, '.conductor'), { recursive: true });
  for (const file of ['settings.toml', 'setup.sh']) fs.copyFileSync(path.join(skillDir, 'assets', 'conductor', file), path.join(appDir, '.conductor', file));
}
for (const module of modules) copyModuleFiles(appDir, module);
writeGenerated(appDir, modules);
mergeOpenApi(appDir, modules);
ensureAgentInstructions(appDir);
writeDocs(appDir, modules);

// Template images nothing refers to any more (tab icons, logos used by the example screens).
const appJsonText = fs.readFileSync(path.join(appDir, 'app.json'), 'utf8');
const imagesDir = path.join(appDir, 'assets', 'images');
if (fs.existsSync(imagesDir)) {
  for (const entry of fs.readdirSync(imagesDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath ?? entry.path, entry.name);
    if (!appJsonText.includes(path.relative(appDir, absolute).split(path.sep).join('/'))) fs.rmSync(absolute);
  }
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) if (entry.isDirectory() && fs.readdirSync(path.join(imagesDir, entry.name)).length === 0) fs.rmdirSync(path.join(imagesDir, entry.name));
}

// ── 3. identity and config ──
step('Setting the identity and the config');
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
let identity = '';
patchJson(path.join(appDir, 'app.json'), (appJson) => {
  const expo = appJson.expo;
  const name = opts.name ?? expo.name;
  const slug = slugify(opts.name ?? expo.slug ?? path.basename(appDir));
  const bundleId = opts['bundle-id'] ?? `com.example.${slug.replace(/-/g, '')}`;
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(bundleId)) fail(`"${bundleId}" is not a valid bundle id (reverse domain, letters/digits/underscores).`);
  Object.assign(expo, { name, slug, scheme: slug.replace(/-/g, ''), orientation: 'default' });
  expo.ios = { ...expo.ios, bundleIdentifier: bundleId, buildNumber: expo.ios?.buildNumber ?? '1', supportsTablet: true, config: { ...expo.ios?.config, usesNonExemptEncryption: expo.ios?.config?.usesNonExemptEncryption ?? false } };
  expo.android = { ...expo.android, package: bundleId, versionCode: expo.android?.versionCode ?? 1 };
  expo.web = { ...expo.web, output: 'static' };
  expo.extra = { ...expo.extra, legal: expo.extra?.legal ?? { privacyUrl: 'https://example.com/privacy', termsUrl: 'https://example.com/terms', supportEmail: 'support@example.com' } };
  identity = `${name} · ${bundleId}${opts['bundle-id'] ? '' : ' (placeholder — store builds refuse it until the real one is set)'}`;
});
addPlugins(appDir, [...CORE_PLUGINS, ...modules.flatMap((module) => module.plugins ?? [])]);
note(identity);
try {
  patchJson(path.join(appDir, 'tsconfig.json'), (tsconfig) => {
    tsconfig.compilerOptions = { ...tsconfig.compilerOptions, types: [...new Set([...(tsconfig.compilerOptions?.types ?? []), 'react', 'node'])] };
  });
} catch (error) {
  note(`! tsconfig.json not patched (${error.message}); add "types": ["react", "node"] to compilerOptions`);
}
ensureGitignore(appDir);
patchJson(path.join(appDir, 'package.json'), (value) => {
  value.name = slugify(opts.name ?? path.basename(appDir));
  delete value.scripts?.['reset-project'];
  value.scripts = { ...value.scripts, ...SCRIPTS };
});
if (!fs.existsSync(path.join(appDir, '.env'))) fs.copyFileSync(path.join(appDir, '.env.example'), path.join(appDir, '.env'));
await bumpActions(appDir, runner);

// ── 4. dependencies, types, checks ──
const moduleDependencies = modules.flatMap((module) => module.dependencies ?? []);
if (skipInstall) {
  step('Skipping installs (--skip-install). To finish:');
  note(`npx expo install ${[...CORE_DEPENDENCIES, ...moduleDependencies].join(' ')}`);
  note('npx expo install eslint eslint-config-expo -- --save-dev   # then move them to devDependencies if they land in dependencies');
  note('npm install --save-dev tsx@latest @types/node@latest && npm run api:types && npm run check');
  process.exit(0);
}
step('Installing libraries at the versions this SDK expects');
expoInstall(appDir, runner, [...CORE_DEPENDENCIES, ...moduleDependencies]);
step('Installing lint, test and type tooling');
installTooling(appDir, runner);
step('Generating API types from docs/openapi.json');
run(npm, ['run', 'api:types'], { cwd: appDir });
if (!opts['skip-check']) {
  step('Typecheck, lint and unit tests');
  const result = run(npm, ['test'], { cwd: appDir, hint: 'Unit tests failed.' });
  const passed = /ℹ pass (\d+)/.exec(`${result.stdout ?? ''}`)?.[1];
  run(npm, ['run', 'typecheck'], { cwd: appDir, hint: 'Type errors — if the latest SDK moved an API, fix the starter code forward (see the skill\'s 07-expo-react-native.md §0).' });
  run(npm, ['run', 'lint'], { cwd: appDir });
  note(`typecheck ✓ · lint ✓ · unit tests ✓${passed ? ` (${passed})` : ''}`);
}

const versions = ['expo', 'react-native', 'react', 'expo-router', 'typescript'].map((dep) => `${dep}@${versionOf(appDir, dep)}`).join(' · ');
console.log(`
✔ Ready: ${appDir}
  Modules:  ${modules.length ? modules.map((module) => module.name).join(', ') : 'none (core only)'}
  Versions: ${versions}   ← what "latest" meant today; record it in docs/PROJECT_BRIEF.md
  Log:      ${runner.logFile}

Next: set the real bundle id and extra.legal in app.json · npm run mock-api · npm run ios | npm run android
      add a module later: node ${path.relative(appDir, path.join(skillDir, 'scripts', 'add-module.mjs'))} . <module>   (list: --list)
`);
