import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseSigning, androidBuildOptions } from '../build-android.mjs';

const fileProps = {
  storeFile: 'D:/private/daymark-release.jks',
  storePassword: 'file-store-password',
  keyAlias: 'daymark',
  keyPassword: 'file-key-password',
};
const env = {
  DAYMARK_KEYSTORE: '/private/release.jks',
  DAYMARK_KEYSTORE_PASSWORD: 'env-store-password',
  DAYMARK_KEY_ALIAS: 'release',
  DAYMARK_KEY_PASSWORD: 'env-key-password',
};

test('release signing accepts file properties without inventing defaults', () => {
  assert.deepEqual(releaseSigning({}, fileProps), { ok: true, config: fileProps });
});

test('environment signing values override file properties individually', () => {
  assert.deepEqual(releaseSigning(env, fileProps), { ok: true, config: {
    storeFile: '/private/release.jks', storePassword: 'env-store-password',
    keyAlias: 'release', keyPassword: 'env-key-password',
  } });
  assert.deepEqual(releaseSigning({ DAYMARK_KEY_ALIAS: 'override' }, fileProps), {
    ok: true, config: { ...fileProps, keyAlias: 'override' },
  });
});

for (const [variable, property] of [
  ['DAYMARK_KEYSTORE', 'storeFile'], ['DAYMARK_KEYSTORE_PASSWORD', 'storePassword'],
  ['DAYMARK_KEY_ALIAS', 'keyAlias'], ['DAYMARK_KEY_PASSWORD', 'keyPassword'],
]) {
  test(`release signing fails clearly when ${variable} is missing or blank`, () => {
    for (const value of [undefined, '', '   ']) {
      const result = releaseSigning({}, { ...fileProps, [property]: value });
      assert.equal(result.ok, false);
      assert.ok(result.message.includes(variable));
      assert.ok(result.message.includes(property));
      assert.ok(result.message.includes('docs/guide/getting-started.md'));
      assert.ok(!result.message.includes('file-store-password'));
      assert.ok(!result.message.includes('file-key-password'));
    }
  });
}

test('missing signing never falls back to a debug key', () => {
  assert.equal(releaseSigning({}, {}).ok, false);
  assert.equal(releaseSigning({}, { ...fileProps, storeFile: 'C:/Users/test/.android/debug.keystore' }).ok, false);
});

test('build arguments preserve debug defaults and select release unit tests before assembly', () => {
  assert.deepEqual(androidBuildOptions([]), {
    release: false, tasks: ['assembleDebug'], apk: 'mobile/android/app/build/outputs/apk/debug/app-debug.apk',
  });
  assert.deepEqual(androidBuildOptions(['--test']).tasks, ['testDebugUnitTest', 'assembleDebug']);
  assert.deepEqual(androidBuildOptions(['--release']), {
    release: true, tasks: ['assembleRelease'], apk: 'mobile/android/app/build/outputs/apk/release/app-release.apk',
  });
  assert.deepEqual(androidBuildOptions(['--release', '--test']).tasks, ['testReleaseUnitTest', 'assembleRelease']);
});
