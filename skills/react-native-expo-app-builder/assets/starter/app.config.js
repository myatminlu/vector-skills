// Extends app.json with the decisions that have to be made at build time.
//
// 1. A release bundle without its API address still builds — `expo export:embed` exits 0 — and the app then
//    throws in src/config/env.ts before its first frame: a launch crash only a store reviewer or a user would
//    find. Both release builds (Xcode and Gradle) evaluate this file while bundling, so the bundle is refused here.
//    NODE_ENV is "production" only for release bundling; `expo start`, prebuild and the doctor are unaffected.
//
// 2. A store build (APP_ENV=production, or the EAS "production" profile) must not ship the template's
//    placeholders: the bundle identifier is fixed forever by the first upload, and the privacy/terms links have to
//    match what the store listings say.
//
// 3. APP_ENV=e2e builds talk to the local mock API over plain http (scripts/mock-api.mjs), which Android release
//    builds refuse unless cleartext traffic is allowed. Only that build type gets the exception.

const PLACEHOLDER = /(^|\.)example\.(com|org)$|^com\.example\./i;

function assertReleaseEnv(env) {
  if (env.NODE_ENV !== 'production') return;
  if (/^https?:\/\//i.test((env.EXPO_PUBLIC_API_URL ?? '').trim())) return;
  throw new Error('EXPO_PUBLIC_API_URL is not set, so this release bundle would crash at launch. Copy .env.example to .env and fill it in before building.');
}

function hostOf(value) {
  if (typeof value !== 'string') return '';
  if (value.includes('@')) return value.split('@').pop() ?? '';
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function assertStoreIdentity(config) {
  const legal = (config.extra && config.extra.legal) || {};
  const problems = [
    ['ios.bundleIdentifier', config.ios && config.ios.bundleIdentifier],
    ['android.package', config.android && config.android.package],
    ['extra.legal.privacyUrl', legal.privacyUrl],
    ['extra.legal.termsUrl', legal.termsUrl],
    ['extra.legal.supportEmail', legal.supportEmail],
  ]
    .filter(([, value]) => !value || PLACEHOLDER.test(String(value)) || PLACEHOLDER.test(hostOf(value)))
    .map(([key, value]) => `${key} = ${value ?? '(missing)'}`);
  if (problems.length > 0) {
    throw new Error(`This is a store build but app.json still has template placeholders:\n  ${problems.join('\n  ')}\nSet the real values (docs/PROJECT_BRIEF.md, pack 4 and 6) before building for the stores.`);
  }
}

module.exports = ({ config }) => {
  const env = process.env;
  assertReleaseEnv(env);
  const appEnv = env.EAS_BUILD_PROFILE ?? env.APP_ENV ?? 'development';
  if (appEnv === 'production') assertStoreIdentity(config);

  const plugins = (config.plugins ?? []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== 'expo-build-properties') return plugin;
    const options = Array.isArray(plugin) && plugin[1] ? { ...plugin[1] } : {};
    if (appEnv === 'e2e') options.android = { ...(options.android ?? {}), usesCleartextTraffic: true };
    return ['expo-build-properties', options];
  });

  return { ...config, plugins, extra: { ...config.extra, appEnv } };
};

module.exports.assertReleaseEnv = assertReleaseEnv;
module.exports.assertStoreIdentity = assertStoreIdentity;
