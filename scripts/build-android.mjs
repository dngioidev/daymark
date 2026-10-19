#!/usr/bin/env node
/**
 * Builds the web app, syncs it into the Android project, and assembles the debug APK.
 *
 * Usage: npm run android:build            (APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk)
 *        npm run android:build -- --test  (also runs the Kotlin unit tests)
 *
 * Needs JDK 21 (a standard one; GraalVM's jlink breaks the Android Gradle plugin) and the
 * Android SDK. JAVA_HOME / ANDROID_HOME are used when set; otherwise common install paths are tried.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWin = process.platform === 'win32';
const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (res.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')}`);
    process.exit(res.status ?? 1);
  }
};

const firstExisting = (candidates) => candidates.find((p) => p && fs.existsSync(p));

const javaHome =
  process.env.JAVA_HOME && !/graalvm/i.test(process.env.JAVA_HOME)
    ? process.env.JAVA_HOME
    : firstExisting(['C:\\Program Files\\Java\\jdk-21', '/usr/lib/jvm/temurin-21-jdk-amd64', '/usr/lib/jvm/java-21-openjdk-amd64']);
const sdk = firstExisting([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  path.join(os.homedir(), 'Android', 'Sdk'),
]);

if (!javaHome) {
  console.error('JDK 21 not found. Install a standard JDK 21 and set JAVA_HOME.');
  process.exit(1);
}
if (!sdk) {
  console.error('Android SDK not found. Install it and set ANDROID_HOME.');
  process.exit(1);
}
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };

run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);

const gradle = isWin ? 'gradlew.bat' : './gradlew';
const tasks = process.argv.includes('--test') ? ['testDebugUnitTest', 'assembleDebug'] : ['assembleDebug'];
// Absolute path so Windows cmd does not depend on cwd lookup
run(path.resolve('mobile', 'android', gradle), [...tasks, '--no-daemon'], { cwd: path.resolve('mobile', 'android'), env });
console.log('\nAPK: mobile/android/app/build/outputs/apk/debug/app-debug.apk');
