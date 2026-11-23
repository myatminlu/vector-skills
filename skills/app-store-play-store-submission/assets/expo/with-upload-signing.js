const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs Android release builds with a real upload key instead of the template's `debug.keystore`.
 * Save as plugins/with-upload-signing.js and add to app.json:
 *
 *   "plugins": [ ["./plugins/with-upload-signing", { "prefix": "MYAPP_UPLOAD" }] ]
 *
 * The React Native template ships `release { signingConfig signingConfigs.debug }`, and that key is
 * public — the store rejects an upload signed with it, and anyone could forge an update if it ever
 * shipped. The fix cannot live in `android/app/build.gradle`: `expo prebuild` regenerates that file,
 * so it has to be reapplied on every run, which is what this plugin does.
 *
 * Credentials stay out of the repository. Put them in `~/.gradle/gradle.properties` (chmod 600):
 *
 *   MYAPP_UPLOAD_STORE_FILE=/Users/<you>/keystores/myapp-upload.jks
 *   MYAPP_UPLOAD_STORE_PASSWORD=…
 *   MYAPP_UPLOAD_KEY_ALIAS=upload
 *   MYAPP_UPLOAD_KEY_PASSWORD=…
 *
 * Without them a release build still succeeds, signed with the debug key as before — so a local
 * release APK for testing does not need the upload keystore, and only a store upload does.
 * Always confirm the signer of the artifact before uploading.
 */

const DEFAULT_PREFIX = 'APP_UPLOAD';

const uploadConfig = (prefix) => `
        upload {
            // Guarded so a checkout without the credentials still configures; see plugins/with-upload-signing.js.
            if (project.hasProperty('${prefix}_STORE_FILE')) {
                storeFile file(${prefix}_STORE_FILE)
                storePassword ${prefix}_STORE_PASSWORD
                keyAlias ${prefix}_KEY_ALIAS
                keyPassword ${prefix}_KEY_PASSWORD
            }
        }`;

/**
 * The release build type's line, told apart from the identical one in `debug` by the comment above it.
 * Matched by pattern rather than by literal text because the template writes `signingConfig x` and a
 * later Expo mod rewrites it to `signingConfig = x`; this plugin can run on either side of that.
 */
const RELEASE_ANCHOR = /(\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s*\n\s*signingConfig\s*)=?\s*signingConfigs\.debug/;

/** Pure transformation of `android/app/build.gradle`, exported so it can be unit-tested without a prebuild. */
function applyUploadSigning(gradle, prefix = DEFAULT_PREFIX) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(prefix)) throw new Error(`with-upload-signing: prefix "${prefix}" must be UPPER_SNAKE_CASE (it becomes Gradle property names)`);

  // Failing loudly matters more than usual here: silently skipping would produce a debug-signed
  // release that only the store rejects, long after the build.
  if (gradle.includes('signingConfigs.upload')) return gradle;
  if (!gradle.includes('signingConfigs {')) throw new Error('with-upload-signing: no `signingConfigs {` block in app/build.gradle');
  if (!RELEASE_ANCHOR.test(gradle)) throw new Error('with-upload-signing: the release `signingConfig signingConfigs.debug` line changed shape; update RELEASE_ANCHOR');

  return gradle
    .replace('signingConfigs {', () => `signingConfigs {${uploadConfig(prefix)}`)
    .replace(RELEASE_ANCHOR, (_match, head) => `${head}= project.hasProperty('${prefix}_STORE_FILE') ? signingConfigs.upload : signingConfigs.debug`);
}

module.exports = function withUploadSigning(config, props = {}) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = applyUploadSigning(cfg.modResults.contents, props.prefix ?? DEFAULT_PREFIX);
    return cfg;
  });
};

module.exports.applyUploadSigning = applyUploadSigning;
