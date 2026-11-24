import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeGenerated } from '../skills/react-native-expo-app-builder/scripts/lib/starter.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const createAppScript = path.join(root, 'skills/react-native-expo-app-builder/scripts/create-app.mjs');
const addModuleScript = path.join(root, 'skills/react-native-expo-app-builder/scripts/add-module.mjs');
const repoSignalsScript = path.join(root, 'skills/code-quality-check/scripts/repo_signals.py');

function loadUploadSigning() {
  const file = path.join(root, 'skills/react-native-expo-app-builder/assets/starter/core/plugins/with-upload-signing.js');
  const code = fs.readFileSync(file, 'utf8');
  const mod = { exports: {} };
  const fakeRequire = (id) => (id === 'expo/config-plugins' ? { withAppBuildGradle: (cfg) => cfg } : require(id));
  new Function('require', 'module', 'exports', code)(fakeRequire, mod, mod.exports);
  return mod.exports;
}

const { applyUploadSigning } = loadUploadSigning();
const { assertReleaseEnv, assertStoreIdentity } = require('../skills/react-native-expo-app-builder/assets/starter/core/app.config.js');

function runPython(args) {
  let res = spawnSync('python3', args, { encoding: 'utf8' });
  if (res.error) res = spawnSync('python', args, { encoding: 'utf8' });
  return res;
}

test('create-app.mjs --list exits 0 and prints all 10 built-in modules', () => {
  const res = spawnSync(process.execPath, [createAppScript, '--list'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  for (const name of ['auth', 'guest', 'ai-consent', 'streaming', 'uploads', 'remote-config', 'offline-cache', 'text-size', 'lang-my', 'tabs']) {
    assert.ok(res.stdout.includes(name), `missing ${name} in --list output`);
  }
});

test('create-app.mjs and add-module.mjs reject unknown flags with exit code 2', () => {
  const c = spawnSync(process.execPath, [createAppScript, '--unknown-flag'], { encoding: 'utf8' });
  assert.equal(c.status, 2);
  const a = spawnSync(process.execPath, [addModuleScript, '--unknown-flag'], { encoding: 'utf8' });
  assert.equal(a.status, 2);
});

test('create-app.mjs applies starter with = flag syntax, preserves AGENTS.md, and sets cross-platform api:types', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-create-app-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { expo: '~54.0.0', 'expo-router': '~6.0.0' } }, null, 2),
    );
    fs.writeFileSync(path.join(tmp, 'app.json'), JSON.stringify({ expo: { name: 'demo', slug: 'demo' } }, null, 2));
    fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }, null, 2));
    fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# Expo Router Guide\n\nOfficial Expo guidance.\n');

    const res = spawnSync(
      process.execPath,
      [createAppScript, tmp, '--existing', '--skip-install', '--modules=auth,lang-my', '--name=Global Demo', '--bundle-id=com.acme.globaldemo'],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);

    const agentsMd = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
    assert.ok(agentsMd.includes('# Expo Router Guide'), 'AGENTS.md should preserve create-expo-app guide');
    assert.ok(agentsMd.includes('# Project rules'), 'AGENTS.md should include starter project rules');
    assert.ok(agentsMd.includes('useAuth()'), 'AGENTS.md should include auth module rules');
    assert.ok(agentsMd.includes('Noto Sans Myanmar') || agentsMd.includes('2.2×'), 'AGENTS.md should include lang-my module rules');

    assert.equal(fs.readFileSync(path.join(tmp, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');

    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['api:types'], 'node scripts/api-types.mjs');
    assert.ok(fs.existsSync(path.join(tmp, 'scripts/api-types.mjs')));

    const stringsTs = fs.readFileSync(path.join(tmp, 'src/modules/strings.ts'), 'utf8');
    assert.ok(stringsTs.includes("import { burmese } from './lang-my/language';"));
    assert.ok(stringsTs.includes("import { my as myCore } from './lang-my/strings/core';"));
    assert.ok(stringsTs.includes("import { my as myAuth } from './lang-my/strings/auth';"));
    assert.ok(stringsTs.includes('{ ...burmese, strings: { ...myCore, ...myAuth } }'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeGenerated dynamically wires multiple lang-* modules into src/modules/strings.ts', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lang-gen-'));
  try {
    fs.mkdirSync(path.join(tmp, 'src/modules/auth'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src/modules/auth/strings.ts'), 'export const strings = { auth_title: "Sign in" };\n');
    for (const [mod, files] of [
      ['lang-my', ['core.ts', 'auth.ts']],
      ['lang-es', ['core.ts', 'auth.ts']],
    ]) {
      const dir = path.join(tmp, 'src/modules', mod, 'strings');
      fs.mkdirSync(dir, { recursive: true });
      for (const f of files) fs.writeFileSync(path.join(dir, f), 'export const x = {};\n');
    }
    fs.mkdirSync(path.join(tmp, '.maestro'), { recursive: true });

    writeGenerated(tmp, [
      { name: 'auth', flows: ['auth'] },
      { name: 'lang-my', language: { code: 'my', exportName: 'burmese', stringsExport: 'my' } },
      { name: 'lang-es', language: { code: 'es', exportName: 'spanish', stringsExport: 'es' } },
    ]);

    const out = fs.readFileSync(path.join(tmp, 'src/modules/strings.ts'), 'utf8');
    assert.ok(out.includes("import { burmese } from './lang-my/language';"));
    assert.ok(out.includes("import { spanish } from './lang-es/language';"));
    assert.ok(out.includes("import { es as esCore } from './lang-es/strings/core';"));
    assert.ok(out.includes("import { es as esAuth } from './lang-es/strings/auth';"));
    assert.ok(out.includes('{ ...burmese, strings: { ...myCore, ...myAuth } }, { ...spanish, strings: { ...esCore, ...esAuth } }'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('with-upload-signing and app.config.js guards enforce release invariants', () => {
  const sampleGradle = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        release {
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
        }
    }
}
`;
  const patched = applyUploadSigning(sampleGradle, 'MYAPP_UPLOAD');
  assert.ok(patched.includes("project.hasProperty('MYAPP_UPLOAD_STORE_FILE') ? signingConfigs.upload : signingConfigs.debug"));
  assert.throws(() => applyUploadSigning(sampleGradle, 'bad-prefix'), /UPPER_SNAKE_CASE/);

  assert.throws(() => assertReleaseEnv({ NODE_ENV: 'production', EXPO_PUBLIC_API_URL: '' }), /EXPO_PUBLIC_API_URL is not set/);
  assert.doesNotThrow(() => assertReleaseEnv({ NODE_ENV: 'production', EXPO_PUBLIC_API_URL: 'https://api.acme.dev' }));

  assert.throws(
    () =>
      assertStoreIdentity({
        ios: { bundleIdentifier: 'com.example.demo' },
        android: { package: 'com.acme.demo' },
        extra: { legal: { privacyUrl: 'https://acme.dev/privacy', termsUrl: 'https://acme.dev/terms', supportEmail: 'hi@acme.dev' } },
      }),
    /ios\.bundleIdentifier = com\.example\.demo/,
  );
});

test('repo_signals.py outputs valid JSON hypotheses on a sample tree', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-signals-'));
  try {
    fs.writeFileSync(path.join(tmp, 'sample.ts'), 'export function demo() {\n  try { return 1; } catch (e) {}\n}\n');
    const res = runPython([repoSignalsScript, tmp, '--format', 'json']);
    assert.equal(res.status, 0, res.stderr);
    const data = JSON.parse(res.stdout);
    assert.ok(Array.isArray(data.risks?.['swallowed-exception']) && data.risks['swallowed-exception'].length > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
