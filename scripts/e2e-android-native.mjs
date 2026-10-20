#!/usr/bin/env node
/**
 * End-to-end check of the native Android app + home-screen widget on a running emulator/device.
 *
 * Prerequisites: `npm run android:build` and a booted emulator or USB device (adb devices).
 * Usage: node scripts/e2e-android-native.mjs [cycle-name]    (with a cycle name, also saves screenshots)
 *
 * Flow (sync): a production server is started on this machine and the app connects to it at
 * http://10.0.2.2:<port> (the emulator's address for the host), exercising native HTTP + cleartext.
 *
 * Flow: install fresh -> load sample vault -> app pushes snapshot -> pin widget from Settings ->
 * widget shows today's tasks -> tap a widget checkbox -> reopen app -> the toggle is applied to the vault.
 * The WebView is driven over Chrome DevTools (adb forward), the widget via adb input + uiautomator.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PKG = 'app.daymark.notes';
const APK = path.resolve('mobile/android/app/build/outputs/apk/debug/app-debug.apk');
const cycle = process.argv[2];
const outDir = cycle ? path.resolve('docs', 'releases', cycle, 'images') : null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};
const shot = (name) => {
  if (!outDir) return;
  fs.writeFileSync(path.join(outDir, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
};

// ---- WebView over DevTools -------------------------------------------------------------
let ws;
let syncServer;
let msgId = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pid = adb('shell', 'pidof', PKG).trim();
      adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
      const targets = await (await fetch('http://localhost:9333/json')).json();
      const page = targets.find((t) => t.type === 'page');
      ws = new WebSocket(page.webSocketDebuggerUrl);
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) pending.get(m.id)(m.result ?? m.error);
      };
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error('Could not attach to the WebView');
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return out.result?.value;
};
const waitFor = async (expression, label, ms = 40000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(expression).catch(() => false)) return true;
    await sleep(500);
  }
  check(false, `timed out waiting for: ${label}`);
  return false;
};
const clickButton = (re) =>
  evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent + ' ' + (b.getAttribute('aria-label') || ''))); if (b) { b.click(); return true; } return false; })()`);

// ---- uiautomator helpers ---------------------------------------------------------------
function uiNodes() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
  return [...xml.matchAll(/<node [^>]*?text="([^"]*)"[^>]*?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)].map((m) => ({
    text: m[1],
    left: +m[2],
    top: +m[3],
    right: +m[4],
    bottom: +m[5],
  }));
}
const tap = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));

try {
  const devices = adb('devices').split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
  if (devices.length === 0) throw new Error('No emulator/device connected (adb devices is empty)');
  if (!fs.existsSync(APK)) throw new Error('APK not found; run `npm run android:build` first');

  // Fresh install
  // Uninstall first so widgets from earlier runs do not pile up on the home screen
  try {
    adb('uninstall', PKG);
  } catch {}
  adb('install', '-r', APK);
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  await connect();
  check(await waitFor(`document.body.innerText.includes('Welcome to Daymark')`, 'welcome dialog'), 'native app renders first-run welcome');
  await sleep(1000);
  shot('native-1-first-run');

  // Sample vault -> carried-forward tasks for today
  await clickButton(/explore with sample data/i);
  const TITLE = 'Investigate build pipeline failure';
  check(await waitFor(`document.body.innerText.includes(${JSON.stringify(TITLE)})`, 'sample tasks'), 'sample vault rolls tasks into today');
  await sleep(1500);
  shot('native-2-today-sample');

  // The app pushed a snapshot for the widget
  const prefs = adb('shell', 'run-as', PKG, 'cat', 'shared_prefs/daymark_widget.xml');
  check(prefs.includes(TITLE), 'snapshot for the widget was written natively');

  // Settings is reachable on a phone; add the widget from there
  check(await clickButton(/settings, backup and import/i), 'phone header has a Settings button');
  await sleep(800);
  await clickButton(/storage|vault/i);
  await sleep(500);
  shot('native-3-settings-add-widget');
  check(await clickButton(/^\s*add widget/i), 'Add widget button is shown in the native app');
  await sleep(2000);

  // System confirmation dialog for pinning the widget
  let confirm = uiNodes().find((n) => /^(add to home screen|add automatically|add)$/i.test(n.text));
  check(!!confirm, 'Android shows the "add widget" confirmation');
  shot('native-4-pin-dialog');
  if (confirm) tap((confirm.left + confirm.right) / 2, (confirm.top + confirm.bottom) / 2);
  await sleep(2500);
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await sleep(2000);

  // Widget on the home screen shows today's tasks
  let nodes = uiNodes();
  check(nodes.some((n) => n.text === 'Daymark Today'), 'widget is on the home screen');
  const titleNode = nodes.find((n) => n.text === TITLE);
  check(!!titleNode, 'widget lists a carried-forward task');
  shot('native-5-widget-home');

  // Tick it off from the widget (checkbox sits left of the title)
  if (titleNode) {
    tap(titleNode.left - (titleNode.bottom - titleNode.top) * 0.9, (titleNode.top + titleNode.bottom) / 2);
    await sleep(2000);
    nodes = uiNodes();
    check(!nodes.some((n) => n.text === TITLE), 'ticked task disappears from the widget list');
    check(nodes.some((n) => /^1\/\d+ done$/.test(n.text)), 'widget counter shows 1 done');
    shot('native-6-widget-after-tick');
  }
  const queued = adb('shell', 'run-as', PKG, 'cat', 'shared_prefs/daymark_widget.xml');
  check(/actions/.test(queued), 'toggle is queued natively');

  // Reopen the app: the queued toggle is applied to the real vault
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
  await connect();
  await waitFor(`document.body.innerText.includes('Daymark')`, 'app reopened');
  const applied = await waitFor(
    `new Promise((resolve) => { const r = indexedDB.open('daymark'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('daily_docs'); g.onsuccess = () => { const docs = g.result || []; const t = docs.flatMap(d => d.headings.flatMap(h => h.items)).filter(t => t.title === ${JSON.stringify(TITLE)}); resolve(t.some(x => x.status === 'done')); }; g.onerror = () => resolve(false); }; r.onerror = () => resolve(false); })`,
    'toggle applied in vault',
    20000
  );
  check(applied, 'widget tick is applied to the vault when the app opens');
  const leftover = adb('shell', 'run-as', PKG, 'cat', 'shared_prefs/daymark_widget.xml');
  check(!/<string name="actions">/.test(leftover), 'action queue is cleared after applying');
  await sleep(1500);
  shot('native-7-app-after-widget-tick');

  // ---- Sync with a self-hosted server running on this machine ----
  const SYNC_PORT = 3104;
  const SYNC_PASSWORD = 'native-e2e-password';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-native-sync-'));
  syncServer = spawn('npx', ['tsx', 'server.ts', '--production'], {
    env: { ...process.env, PORT: String(SYNC_PORT), DATA_DIR: dataDir, DAYMARK_PASSWORD: SYNC_PASSWORD },
    shell: true,
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${SYNC_PORT}/api/health`)).ok) break;
    } catch {}
    await sleep(500);
  }
  check(await clickButton(/^\s*sync\s*$/i), 'phone Sync tab opens');
  await sleep(800);
  await evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const fill = (label, value) => {
      const el = [...document.querySelectorAll('label')].find((l) => l.textContent.includes(label)).querySelector('input');
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill('Server address', 'http://10.0.2.2:${SYNC_PORT}');
    fill('Password', '${SYNC_PASSWORD}');
    fill('Name for this device', 'Emulator phone');
    return true;
  })()`);
  await clickButton(/connect and sync/i);
  check(await waitFor(`document.body.innerText.toLowerCase().includes('up to date')`, 'native sync'), 'native app connects to the server over http and syncs');
  await sleep(1500);
  shot('native-8-synced-with-server');
  const loginRes = await fetch(`http://127.0.0.1:${SYNC_PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: SYNC_PASSWORD, deviceName: 'e2e check', platform: 'test' }),
  });
  const { token } = await loginRes.json();
  const stats = await (await fetch(`http://127.0.0.1:${SYNC_PORT}/api/server/stats`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check(stats.dailyNotes >= 1, 'the phone vault reached the server', `${stats.dailyNotes} daily notes, ${stats.notes} notes`);

  // ---- Android Back button ----
  const focused = () =>
    /app\.daymark\.notes/.test(
      adb('shell', 'dumpsys', 'window', 'displays')
        .split('\n')
        .filter((l) => /mCurrentFocus|mFocusedApp/.test(l))
        .join(' ')
    );
  await clickButton(/settings, backup and import/i);
  await waitFor(`!!document.querySelector('[role=dialog][aria-label=Settings]')`, 'settings open');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await sleep(1200);
  check(!(await evaluate(`!!document.querySelector('[role=dialog][aria-label=Settings]')`)) && focused(), 'Back closes Settings and keeps the app open');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // from the Sync tab
  await sleep(1200);
  check((await evaluate(`document.body.innerText.includes('Finished earlier') || document.body.innerText.includes('carried-forward')`)) && focused(), 'Back from the Sync tab returns to Today');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // on Today
  await sleep(1500);
  check(!focused() && adb('shell', 'pidof', PKG).trim().length > 0, 'Back on Today minimises the app (not killed)');
} catch (err) {
  console.error('E2E aborted:', err);
  failures++;
} finally {
  try {
    ws?.close();
  } catch {}
  if (syncServer) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(syncServer.pid), '/T', '/F'], { stdio: 'ignore' });
    else syncServer.kill();
  }
}

console.log(failures === 0 ? '\nAll native e2e checks passed' : `\n${failures} native e2e check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
