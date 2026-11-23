#!/usr/bin/env node
/**
 * Adds starter modules to an app made with create-app.mjs (reads and updates its modules.json).
 *
 *   node <skill>/scripts/add-module.mjs <app-dir> <module> [<module> …] [--skip-install] [--skip-check] [--verbose]
 *   node <skill>/scripts/add-module.mjs --list
 *
 * Copies each new module's files (required modules come along), regenerates src/modules/index.ts, src/modules/strings.ts,
 * .maestro/config.yaml and the module sections of the docs, merges the module's endpoints into docs/openapi.json, adds
 * its config plugins and libraries (`npx expo install`), regenerates the API types and runs the checks. Core files are
 * not touched, except the thin route files a module says it replaces (tabs).
 *
 * A module with native libraries (auth, offline-cache, lang-my) needs a new development build afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';

import { addPlugins, catalog, copyModuleFiles, createRunner, expoInstall, installedModules, mergeOpenApi, npm, printCatalog, resolveModules, writeDocs, writeGenerated } from './lib/starter.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
if (flag('--list')) {
  printCatalog();
  process.exit(0);
}
const [target, ...requested] = argv.filter((arg) => !arg.startsWith('--'));
if (!target || !requested.length) {
  console.error('Usage: node add-module.mjs <app-dir> <module> [<module> …] [--skip-install] [--skip-check] [--verbose]\n       node add-module.mjs --list');
  process.exit(2);
}
const appDir = path.resolve(target);
const runner = createRunner({ verbose: flag('--verbose'), label: 'add-module' });
const { step, note, run, fail } = runner;
if (!fs.existsSync(path.join(appDir, 'modules.json'))) fail(`${appDir} has no modules.json — it was not made with create-app.mjs.`);

const before = installedModules(appDir);
const all = resolveModules([...before, ...requested], fail);
const added = all.filter((module) => !before.includes(module.name));
if (!added.length) {
  console.log(`Nothing to add: ${requested.join(', ')} ${requested.length === 1 ? 'is' : 'are'} already installed.`);
  process.exit(0);
}

step(`Adding ${added.map((module) => module.name).join(', ')}`);
for (const module of added) copyModuleFiles(appDir, module);
writeGenerated(appDir, all);
mergeOpenApi(appDir, added);
writeDocs(appDir, all);
addPlugins(appDir, added.flatMap((module) => module.plugins ?? []));

const dependencies = added.flatMap((module) => module.dependencies ?? []);
if (flag('--skip-install')) {
  step('Skipping installs (--skip-install). To finish:');
  if (dependencies.length) note(`npx expo install ${dependencies.join(' ')}`);
  note('npm run api:types && npm run check');
  process.exit(0);
}
if (dependencies.length) {
  step('Installing the modules\' libraries');
  expoInstall(appDir, runner, dependencies);
}
step('Regenerating API types');
run(npm, ['run', 'api:types'], { cwd: appDir });
if (!flag('--skip-check')) {
  step('Typecheck, lint and unit tests');
  run(npm, ['run', 'check'], { cwd: appDir, hint: 'If the latest SDK moved an API, fix the module code forward.' });
}
const native = added.filter((module) => (module.dependencies ?? []).length || (module.plugins ?? []).length);
console.log(`
✔ Installed: ${all.map((module) => module.name).join(', ')}
  ${native.length ? `New native code (${native.map((module) => module.name).join(', ')}): make a new development build (npm run ios / npm run android).` : 'No native code added: a running development client picks the change up.'}
  Log: ${runner.logFile}
`);
void catalog;
