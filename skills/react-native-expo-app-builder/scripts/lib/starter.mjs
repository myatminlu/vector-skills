/**
 * Shared by create-app.mjs and add-module.mjs: the module catalog, copying the core and modules into a project,
 * the generated files, the docs sections, and quiet command running (full output goes to a log file).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const coreDir = path.join(skillDir, 'assets', 'starter', 'core');
const modulesDir = path.join(skillDir, 'assets', 'starter', 'modules');

/** Install order — a module always comes after the modules it requires. */
export const MODULE_ORDER = ['auth', 'guest', 'ai-consent', 'streaming', 'uploads', 'remote-config', 'offline-cache', 'text-size', 'lang-my', 'tabs'];

/** Runtime libraries the core imports beyond the default template. Versions come from `npx expo install`. */
export const CORE_DEPENDENCIES = ['expo-sqlite', 'expo-localization', 'expo-dev-client', 'expo-build-properties', '@react-native-community/netinfo', '@tanstack/react-query'];
export const CORE_PLUGINS = ['expo-sqlite', 'expo-localization', 'expo-build-properties', './plugins/with-upload-signing'];
const LINT_DEPENDENCIES = ['eslint', 'eslint-config-expo'];
const DEV_DEPENDENCIES = ['tsx', '@types/node'];

export const SCRIPTS = {
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

const GITIGNORE_LINES = ['# local env (the real values live in the repository root\'s .env; .env.example is the list of keys)', '.env', '# Maestro artifacts', '.maestro/out/'];

// ── output ───────────────────────────────────────────────────────────────────────────────────────────────────────

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * One line per step on the console; every command's full output in a log file. An agent reading this output pays for
 * every line, so package-manager noise stays in the log unless `--verbose`.
 */
export function createRunner({ verbose = false, label = 'starter' } = {}) {
  const logFile = path.join(os.tmpdir(), `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  let stepNumber = 0;
  const log = (text) => fs.appendFileSync(logFile, `${text}\n`);
  const fail = (message) => {
    console.error(`\n✖ ${message}`);
    if (fs.existsSync(logFile)) {
      const tail = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-40).join('\n');
      console.error(`\n--- last lines of ${logFile} ---\n${tail}`);
    }
    process.exit(1);
  };
  return {
    logFile,
    fail,
    step: (title) => console.log(`▶ ${++stepNumber}. ${title}`),
    note: (text) => console.log(`  ${text}`),
    run(command, args, { cwd, hint } = {}) {
      log(`\n$ ${command} ${args.join(' ')}   (in ${cwd})`);
      const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: verbose ? 'inherit' : 'pipe', maxBuffer: 256 * 1024 * 1024 });
      if (!verbose) log(`${result.stdout ?? ''}${result.stderr ?? ''}`);
      if (result.status !== 0) fail(`\`${command} ${args.join(' ')}\` exited with ${result.status ?? result.signal}.${hint ? ` ${hint}` : ''}`);
      return result;
    },
  };
}

// ── catalog ──────────────────────────────────────────────────────────────────────────────────────────────────────

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

export function catalog() {
  return MODULE_ORDER.map((name) => ({ ...readJson(path.join(modulesDir, name, 'module.json')), dir: path.join(modulesDir, name) }));
}

export function printCatalog() {
  console.log('Modules (add with --modules a,b,c — or "all"; required modules are added automatically):\n');
  for (const module of catalog()) {
    console.log(`  ${module.name.padEnd(14)} ${module.title}${module.requires.length ? `  (needs ${module.requires.join(', ')})` : ''}`);
    console.log(`  ${''.padEnd(14)} when: ${module.when}`);
  }
}

/** The requested modules plus everything they require, in install order. Unknown names fail loudly. */
export function resolveModules(requested, fail) {
  const all = catalog();
  const names = requested.includes('all') ? all.map((module) => module.name) : requested.filter((name) => name && name !== 'none');
  const unknown = names.filter((name) => !MODULE_ORDER.includes(name));
  if (unknown.length) fail(`Unknown module(s): ${unknown.join(', ')}. Known: ${MODULE_ORDER.join(', ')}.`);
  const wanted = new Set(names);
  let grew = true;
  while (grew) {
    grew = false;
    for (const module of all) {
      if (!wanted.has(module.name)) continue;
      for (const needed of module.requires) {
        if (!wanted.has(needed)) {
          wanted.add(needed);
          grew = true;
        }
      }
    }
  }
  return all.filter((module) => wanted.has(module.name));
}

export function installedModules(target) {
  const file = path.join(target, 'modules.json');
  return fs.existsSync(file) ? readJson(file).modules ?? [] : [];
}

// ── files ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function copyModuleFiles(target, module) {
  const files = path.join(module.dir, 'files');
  if (fs.existsSync(files)) fs.cpSync(files, target, { recursive: true, force: true });
  for (const relative of module.remove ?? []) fs.rmSync(path.join(target, relative), { force: true });
}

const identifier = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/** `modules.json`, `src/modules/index.ts`, `src/modules/strings.ts` and `.maestro/config.yaml` for a module set. */
export function writeGenerated(target, modules) {
  const names = modules.map((module) => module.name);
  writeJson(path.join(target, 'modules.json'), { $comment: 'Installed starter modules. Change with the skill\'s add-module.mjs, which regenerates src/modules/index.ts and src/modules/strings.ts.', modules: names });

  const header = '// Generated from modules.json by the react-native-expo-app-builder scripts (create-app / add-module).\n';
  const index = names.length ? names.map((name) => `import './${name}';`).join('\n') : 'export {};';
  fs.writeFileSync(path.join(target, 'src/modules/index.ts'), `${header}// Importing it registers every installed module; the root layout does that first. Edit modules.json, not this file.\n${index}\n`);

  const withStrings = names.filter((name) => fs.existsSync(path.join(target, 'src/modules', name, 'strings.ts')));
  const lines = [header + '// The installed modules\' strings and the extra languages — plain data, so Node tests can import it.', "import type { ExtraLanguage } from '@/i18n/languages';"];
  for (const name of withStrings) lines.push(`import { strings as ${identifier(name)} } from './${name}/strings';`);
  const burmese = names.includes('lang-my');
  if (burmese) {
    lines.push("import { burmese } from './lang-my/language';", "import { my as myCore } from './lang-my/strings/core';");
    for (const name of withStrings) if (fs.existsSync(path.join(target, 'src/modules/lang-my/strings', `${name}.ts`))) lines.push(`import { my as my${identifier(name)[0].toUpperCase()}${identifier(name).slice(1)} } from './lang-my/strings/${name}';`);
  }
  lines.push('', `export const moduleStrings = {${withStrings.length ? ` ${withStrings.map((name) => `...${identifier(name)}`).join(', ')} ` : ''}};`, '');
  if (burmese) {
    const myParts = ['...myCore', ...withStrings.filter((name) => fs.existsSync(path.join(target, 'src/modules/lang-my/strings', `${name}.ts`))).map((name) => `...my${identifier(name)[0].toUpperCase()}${identifier(name).slice(1)}`)];
    lines.push(`export const extraLanguages: ExtraLanguage[] = [{ ...burmese, strings: { ${myParts.join(', ')} } }];`);
  } else {
    lines.push('export const extraLanguages: ExtraLanguage[] = [];');
  }
  fs.writeFileSync(path.join(target, 'src/modules/strings.ts'), `${lines.join('\n')}\n`);

  const flows = ['core', ...modules.flatMap((module) => module.flows ?? [])].filter((flow) => fs.existsSync(path.join(target, '.maestro', `${flow}.yaml`)));
  fs.writeFileSync(
    path.join(target, '.maestro/config.yaml'),
    `# Generated from modules.json by the react-native-expo-app-builder scripts. Each flow starts from a clean install.\nflows:\n${flows.map((flow) => `  - ${flow}.yaml`).join('\n')}\nexecutionOrder:\n  continueOnFailure: false\n  flowsOrder:\n${flows.map((flow) => `    - ${flow}`).join('\n')}\n`,
  );
}

/** Merges each module's endpoints and schemas into the project's `docs/openapi.json` (existing entries stay). */
export function mergeOpenApi(target, modules) {
  const file = path.join(target, 'docs/openapi.json');
  const spec = readJson(file);
  for (const module of modules) {
    const fragmentFile = path.join(module.dir, 'openapi.json');
    if (!fs.existsSync(fragmentFile)) continue;
    const fragment = readJson(fragmentFile);
    spec.paths = { ...fragment.paths, ...spec.paths };
    spec.components = { ...spec.components, schemas: { ...fragment.components?.schemas, ...spec.components?.schemas } };
  }
  writeJson(file, spec);
}

function replaceAfterMarker(file, marker, rows) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const at = text.indexOf(marker);
  if (at === -1) return;
  const lineEnd = text.indexOf('\n', at) + 1;
  const rest = text.slice(lineEnd).split('\n');
  while (rest.length && rest[0].startsWith('|')) rest.shift();
  fs.writeFileSync(file, `${text.slice(0, lineEnd)}${rows.map((row) => `${row}\n`).join('')}${rest.join('\n')}`);
}

function replaceBetween(file, startMarker, endMarker, lines) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return;
  const startEnd = text.indexOf('\n', start) + 1;
  fs.writeFileSync(file, `${text.slice(0, startEnd)}${lines.map((line) => `${line}\n`).join('')}${text.slice(end)}`);
}

/** The module sections of SCREENS, DATA_INVENTORY, CLAUDE.md and README, rewritten for the installed set. */
export function writeDocs(target, modules) {
  replaceAfterMarker(path.join(target, 'docs/SCREENS.md'), '<!-- module screens:', modules.flatMap((module) => module.screens ?? []));
  replaceAfterMarker(path.join(target, 'docs/DATA_INVENTORY.md'), '<!-- module data:', modules.flatMap((module) => module.dataInventory ?? []));
  replaceBetween(path.join(target, 'CLAUDE.md'), '<!-- module rules:', '<!-- end module rules -->', modules.flatMap((module) => (module.claudeRules ?? []).map((rule) => `- ${rule}`)));
  replaceBetween(
    path.join(target, 'README.md'),
    '<!-- modules:',
    '<!-- end modules -->',
    modules.length ? ['| Module | What it does |', '|---|---|', ...modules.map((module) => `| \`${module.name}\` — ${module.title} | ${module.summary} |`)] : ['Core only — no modules yet.'],
  );
}

export function addPlugins(target, plugins) {
  const file = path.join(target, 'app.json');
  const appJson = readJson(file);
  const present = (appJson.expo.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  appJson.expo.plugins = [...(appJson.expo.plugins ?? []), ...plugins.filter((plugin) => !present.includes(plugin))];
  writeJson(file, appJson);
}

export function patchJson(file, patch) {
  const value = readJson(file);
  patch(value);
  writeJson(file, value);
}

export function ensureGitignore(target) {
  const file = path.join(target, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text.split('\n');
  if (GITIGNORE_LINES.filter((line) => !line.startsWith('#')).every((line) => lines.includes(line))) return;
  fs.writeFileSync(file, `${text.trimEnd()}\n\n${GITIGNORE_LINES.join('\n')}\n`);
}

/** Points every `uses: owner/repo@vN` in the workflows at the action's latest major release. */
export async function bumpActions(target, runner) {
  const dir = path.join(target, '.github', 'workflows');
  if (!fs.existsSync(dir)) return;
  const latestMajor = async (repo) => {
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'create-app-script' }, signal: AbortSignal.timeout(8000) });
      return response.ok ? /^v\d+/.exec((await response.json()).tag_name ?? '')?.[0] : undefined;
    } catch {
      return undefined;
    }
  };
  for (const name of fs.readdirSync(dir).filter((file) => /\.ya?ml$/.test(file))) {
    const file = path.join(dir, name);
    let text = fs.readFileSync(file, 'utf8');
    for (const repo of new Set([...text.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@v\d+/g)].map((match) => match[1]))) {
      const major = await latestMajor(repo);
      if (major) {
        text = text.replace(new RegExp(`(uses:\\s*${repo.replace(/[.]/g, '\\.')})@v\\d+`, 'g'), `$1@${major}`);
        runner.note(`${repo}@${major}`);
      } else runner.note(`! latest release of ${repo} not readable; left as is (Dependabot will raise it)`);
    }
    fs.writeFileSync(file, text);
  }
}

/** `npx expo install` for libraries (SDK-matched versions). */
export function expoInstall(target, runner, packages) {
  if (packages.length) runner.run(npx, ['expo', 'install', ...packages], { cwd: target });
}

/**
 * Lint, test and type tooling. `expo install` picks the SDK-compatible versions (eslint can be held a major behind its
 * `latest` tag on purpose), but its `-- --save-dev` passthrough does not reach packages in Expo's own version map:
 * those land in `dependencies`, so they are moved to `devDependencies` with the same version.
 */
export function installTooling(target, runner) {
  runner.run(npx, ['expo', 'install', ...LINT_DEPENDENCIES, '--', '--save-dev'], { cwd: target });
  const file = path.join(target, 'package.json');
  const pkg = readJson(file);
  const misplaced = LINT_DEPENDENCIES.filter((dep) => pkg.dependencies?.[dep]);
  for (const dep of misplaced) {
    pkg.devDependencies = { ...pkg.devDependencies, [dep]: pkg.dependencies[dep] };
    delete pkg.dependencies[dep];
  }
  if (misplaced.length) {
    writeJson(file, pkg);
    runner.note(`moved ${misplaced.join(', ')} to devDependencies (same versions)`);
  }
  runner.run(npm, ['install', '--save-dev', ...DEV_DEPENDENCIES.map((dep) => `${dep}@latest`)], { cwd: target });
}

export function versionOf(target, name) {
  try {
    return readJson(path.join(target, 'node_modules', name, 'package.json')).version;
  } catch {
    return '?';
  }
}

export { npm, npx, readJson, writeJson };
