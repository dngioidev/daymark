#!/usr/bin/env node
/**
 * Pen-writing benchmark against the REAL app (production build, disposable server, sync on).
 *
 * Usage: npm run build && node scripts/ink-app-bench.mjs [--throttle 4,6] [--runs 3] [--profile] [--json out.json] [--trace-out t.json]
 *   --runs     repeats per throttle (fresh context each) and prints the median of every metric
 *   --profile  also records a CPU profile of stroke commits and prints the top self-time costs
 *              (build with `npx vite build --minify false` first for readable function names).
 *
 * Fixture: sample vault + a handwritten notebook whose open page already holds 300 strokes, and
 * 20 ink pages in total. Tablet viewport 1280x800 @2x, CDP CPU throttling. Each run writes 20
 * strokes of 80 pen moves at 240 Hz with S Pen hover moves and realistic gaps (one 3 s pause, so
 * the debounced sync runs mid-session as it does on the tablet).
 *
 * Latency is measured without app instrumentation: a window capture listener stamps each
 * (coalesced) sample timestamp, and a window bubble listener - which runs after InkCanvas's
 * synchronous draw - takes the completion time. "frame" is the next rAF after that event.
 * Commit cost comes from a devtools.timeline trace: main-thread task time from each pointerup to
 * the next pen-down (this includes the 500 ms ink save flush and any sync run).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { tsImport } from 'tsx/esm/api';
import { signIn, resetServerVault, seedVault } from './helpers/server-session.mjs';
import { openNotes, inkCanvas } from './helpers/cycle-14-qa.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const throttles = (flag('--throttle') ?? '4,6').split(',').map(Number);
const repeats = Number(flag('--runs') ?? 1);
const profile = args.includes('--profile');
const jsonOut = flag('--json');
const PORT = Number(process.env.INK_APP_BENCH_PORT || 3107);
const base = `http://localhost:${PORT}`;
const PASSWORD = 'ink-bench-password-123';
// Each run seeds its own notebook id: the server keeps earlier runs' pages (deletes are tombstones).
let runNumber = 0;
let NOTE_ID = 'note-ink-bench-0';
const STROKES = 20, MOVES = 80, HZ = 240;
// Realistic inter-stroke gaps in ms (pen lifted, hovering); one longer thinking pause.
// Strokes 6 and 14 use the highlighter (selected in the toolbar during the preceding gap).
const HIGHLIGHT = new Set([6, 14]);
const GAPS = [320, 450, 280, 600, 380, 500, 260, 700, 340, 3000, 420, 300, 550, 380, 460, 290, 640, 350, 480, 1500];

const { encodePoints, decodePoints } = await tsImport('../src/ink/inkModel.ts', import.meta.url);
const { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } = await tsImport('../src/utils/defaultData.ts', import.meta.url);

function fixture() {
  const at = '2026-10-30T08:00:00.000Z';
  const stroke = (noteId, page, i) => ({
    id: `bench-${noteId}-${page}-${i}`, tool: i % 12 === 0 ? 'highlighter' : 'pen',
    color: i % 12 === 0 ? '#fde047' : '#1c1917', width: i % 12 === 0 ? 20 : 4,
    createdAt: new Date(Date.parse(at) + i * 1000).toISOString(),
    points: encodePoints(Array.from({ length: 60 }, (_, j) => ({
      x: 30 + (i % 6) * 160 + j * 2, y: 40 + Math.floor(i / 6) * 26 + Math.sin(j / 4 + i) * 7, p: 0.5 + Math.sin(j / 8) * 0.3,
    }))),
  });
  const page = (noteId, n, count) => ({ noteId, page: n, removed: [], updatedAt: at, strokes: Array.from({ length: count }, (_, i) => stroke(noteId, n, i)) });
  const notebook = (id, title) => ({ id, title, folder: 'Study', kind: 'handwritten', paper: 'lined', content: 'Handwritten note: open Daymark 1.11 or later on a tablet to view.', tags: [], pinned: false, createdAt: at, updatedAt: at });
  const ink = [page(NOTE_ID, 0, 300), page(NOTE_ID, 1, 200), page(NOTE_ID, 2, 200), page(NOTE_ID, 3, 150)];
  const others = [];
  for (let n = 0; n < 4; n++) {
    const id = `note-ink-archive-${runNumber}-${n}`; others.push(notebook(id, `Lecture ${n + 1}`));
    for (let p = 0; p < 4; p++) ink.push(page(id, p, 120 + p * 20));
  }
  return { notes: [notebook(NOTE_ID, 'Bench notebook'), ...others, ...SEED_STANDALONE_NOTES], ink };
}

const percentile = (values, q) => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * q) - 1)] : null; };
const round = (n) => n === null || n === undefined ? null : Math.round(n * 10) / 10;

async function waitForServer(ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await delay(400);
  }
  throw new Error('server did not start');
}

async function openBenchPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
  const session = await signIn(context, base, PASSWORD);
  await resetServerVault(context, base, session.accessToken);
  await context.addInitScript(() => { try { localStorage.setItem('dm.ink.penSeen', '1'); } catch {} });
  const page = await context.newPage();
  NOTE_ID = `note-ink-bench-${++runNumber}`;
  const { notes, ink } = fixture();
  await seedVault(page, base, { docs: SEED_DAILY_DOCUMENTS, notes, settings: DEFAULT_SETTINGS, ink });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /sync: synced/i }).waitFor({ timeout: 60000 });
  await openNotes(page);
  await page.getByRole('tree', { name: 'Notes', exact: true }).getByText('Bench notebook', { exact: true }).first().click();
  await inkCanvas(page).waitFor();
  await page.getByRole('toolbar', { name: 'Writing tools', exact: true }).waitFor();
  // Let the initial sync, page migration writes and lazy chunks settle.
  await page.getByRole('button', { name: /sync: synced/i }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  return { context, page };
}

async function installProbes(page) {
  await page.evaluate(() => {
    const r = window.__inkApp = { draw: [], frame: [], frameAt: [], moves: 0, hover: 0, longTasks: [], ups: [], downs: [], drawHook: false };
    let pending = [], seen = new Set();
    // Each pen sample is stamped when first seen (pointerrawupdate or pointermove, capture phase).
    const stamp = (e) => {
      if (e.pointerType !== 'pen') return;
      if (!e.buttons) { if (e.type === 'pointermove') r.hover++; return; }
      const samples = e.getCoalescedEvents?.() ?? [];
      for (const s of samples.length ? samples : [e]) {
        const key = `${s.timeStamp},${s.clientX},${s.clientY}`;
        if (!seen.has(key)) { seen.add(key); pending.push(s.timeStamp); r.moves++; }
      }
    };
    const drawn = () => {
      if (!pending.length) return;
      const now = performance.now(), stamps = pending; pending = [];
      for (const t of stamps) r.draw.push(now - t);
      requestAnimationFrame(() => { const f = performance.now(); for (const t of stamps) { r.frame.push(f - t); r.frameAt.push([r.downs.length, Math.round(t), Math.round(f - t)]); } });
    };
    // Builds that call this hook after each synchronous segment draw are timed exactly ...
    window.__daymarkInkDrawn = () => { r.drawHook = true; drawn(); };
    window.addEventListener('pointermove', stamp, { capture: true });
    // ... older builds draw in pointermove: window bubble runs after InkCanvas and React listeners.
    window.addEventListener('pointermove', (e) => { if (!r.drawHook && e.pointerType === 'pen' && e.buttons) drawn(); });
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'pen') return;
      r.downs.push(e.timeStamp); seen = new Set();
      // Like the app, listen to raw updates only while the pen is down (no extra hover events).
      window.addEventListener('pointerrawupdate', stamp, { capture: true });
    }, { capture: true });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'pen') return;
      r.ups.push(e.timeStamp); window.removeEventListener('pointerrawupdate', stamp, { capture: true });
    }, { capture: true });
    new PerformanceObserver((list) => { for (const t of list.getEntries()) r.longTasks.push({ start: t.startTime, duration: t.duration }); }).observe({ type: 'longtask' });
  });
}

async function writeStrokes(page, cdp, hooks = {}) {
  const box = await inkCanvas(page).boundingBox();
  const send = (params) => cdp.send('Input.dispatchMouseEvent', { pointerType: 'pen', ...params });
  const hover = async (x, y, ms) => {
    const n = Math.max(1, Math.floor(ms / (1000 / 120)) - 2);
    const started = performance.now();
    for (let i = 0; i < n; i++) {
      const wait = started + i * 1000 / 120 - performance.now();
      if (wait > 0) await delay(wait);
      void send({ type: 'mouseMoved', x: x + i * 0.3, y: y - 6 + Math.sin(i / 5) * 2, button: 'none', buttons: 0, force: 0 });
    }
    const rest = started + ms - performance.now();
    if (rest > 0) await delay(rest);
  };
  for (let s = 0; s < STROKES; s++) {
    // Three 112 px-wide strokes per row inside the canvas (462 CSS px wide at 1280x800 with the notes column).
    const x0 = box.x + 15 + (s % 3) * Math.max(140, (box.width - 142) / 2), y0 = Math.min(box.y + 90 + Math.floor(s / 3) * 45, 770);
    if (s === 0 && box.width < 440) throw new Error(`canvas too narrow for the stroke layout: ${box.width}px`);
    const tool = (name) => page.getByRole('toolbar', { name: 'Writing tools', exact: true }).getByRole('button', { name, exact: true }).click();
    if (HIGHLIGHT.has(s)) await tool('Highlighter');
    await hover(x0 - 10, y0, 60);
    await send({ type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, force: 0.4 });
    const started = performance.now();
    const pending = [];
    let x = x0, y = y0;
    for (let i = 0; i < MOVES; i++) {
      const wait = started + i * 1000 / HZ - performance.now();
      if (wait > 0) await delay(wait);
      x = x0 + i * 1.4; y = y0 + Math.sin(i / 6) * 14;
      pending.push(send({ type: 'mouseMoved', x, y, button: 'left', buttons: 1, force: 0.45 + Math.sin(i / 10) * 0.25 }));
    }
    await Promise.all(pending);
    if (hooks.beforeRelease) await hooks.beforeRelease(s);
    await send({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, force: 0 });
    if (hooks.afterRelease) await hooks.afterRelease(s);
    if (HIGHLIGHT.has(s)) await tool('Pen');
    await hover(x, y, GAPS[s]);
  }
  await delay(3500); // trailing save flush and debounced sync
}

/**
 * Main-thread time after each pen-up until the next pen-down (or +3.5 s), from outermost trace
 * tasks. Tasks that dispatch pointer/mouse moves are S Pen hover input and reported separately;
 * everything else (the pointerup task with its React work, timers, the ink save, sync, GC) is the
 * commit cost of that stroke.
 */
function commitCost(traceBuffer) {
  const parsed = JSON.parse(traceBuffer.toString());
  const events = parsed.traceEvents ?? parsed;
  const threads = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') threads.set(`${e.pid}:${e.tid}`, 0);
  for (const e of events) { const k = `${e.pid}:${e.tid}`; if (threads.has(k) && e.name === 'EventDispatch') threads.set(k, threads.get(k) + 1); }
  const main = [...threads].sort((a, b) => b[1] - a[1])[0]?.[0];
  const mine = events.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const isTask = (e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask';
  const tasks = [];
  let end = -Infinity;
  for (const e of mine) if (isTask(e) && e.ts >= end) { tasks.push({ ts: e.ts / 1000, dur: e.dur / 1000, types: new Set() }); end = e.ts + e.dur; }
  let t = 0;
  for (const e of mine) {
    if (e.name !== 'EventDispatch') continue;
    const at = e.ts / 1000;
    while (t < tasks.length - 1 && tasks[t].ts + tasks[t].dur < at) t++;
    if (tasks[t] && at >= tasks[t].ts && at <= tasks[t].ts + tasks[t].dur) tasks[t].types.add(e.args?.data?.type);
  }
  const at = (type) => mine.filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === type).map((e) => e.ts / 1000);
  const ups = at('pointerup'), downs = at('pointerdown');
  return ups.map((from) => {
    const to = downs.find((d) => d > from) ?? from + 3500;
    let commit = 0, hover = 0, max = 0, upTask = 0;
    for (const task of tasks) {
      const overlap = Math.min(task.ts + task.dur, to) - Math.max(task.ts, from - 0.001);
      if (overlap <= 0) continue;
      const input = !task.types.has('pointerup') && (task.types.has('pointermove') || task.types.has('mousemove'));
      if (input) hover += overlap; else { commit += overlap; max = Math.max(max, task.dur); }
      if (task.types.has('pointerup')) upTask = task.dur;
    }
    return { commit, hover, max, upTask, window: to - from };
  });
}

async function run(browser, rate) {
  const { context, page } = await openBenchPage(browser);
  try {
    await installProbes(page);
    const syncTimes = [];
    const origin = await page.evaluate(() => performance.timeOrigin);
    page.on('request', (q) => { if (q.url().endsWith('/api/sync')) syncTimes.push(['req', Date.now() - origin]); });
    page.on('response', (q) => { if (q.url().endsWith('/api/sync')) syncTimes.push(['res', Date.now() - origin]); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel'] });
    const started = await page.evaluate(() => performance.now());
    await writeStrokes(page, cdp);
    const trace = await browser.stopTracing();
    if (flag('--trace-out')) fs.writeFileSync(flag('--trace-out').replace('.json', `-${rate}x.json`), trace);
    const r = await page.evaluate(() => window.__inkApp);
    const writing = r.longTasks.filter((t) => t.start >= started);
    const busy = commitCost(trace);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const readStored = () => page.evaluate(async (noteId) => {
      window.dispatchEvent(new Event('pagehide'));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const db = await new Promise((resolve, reject) => { const q = indexedDB.open('daymark', 1); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
      try {
        const value = await new Promise((resolve, reject) => { const q = db.transaction('kv').objectStore('kv').get(`ink:${noteId}:0`); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
        return value ? value.strokes.filter((s) => !value.removed.includes(s.id)).map((s) => s.id.startsWith('bench-') ? '' : [Date.parse(s.createdAt) - performance.timeOrigin, s.points]) : [];
      } finally { db.close(); }
    }, NOTE_ID);
    let stored = await readStored();
    for (let i = 0; i < 10 && stored.length !== 300 + STROKES; i++) { await delay(500); stored = await readStored(); }
    const strokes = stored.length;
    const storedPoints = stored.filter((s) => s !== '').reduce((n, [, points]) => n + decodePoints(points).length, 0);
    if (process.env.INK_BENCH_DIAG) console.log('RENDERS', JSON.stringify(await page.evaluate(() => (window.__renders ?? []).map(([n, t]) => [n, Math.round(t)]))));
    if (process.env.INK_BENCH_DIAG) console.log('FRAMES', JSON.stringify(r.frameAt.filter((x) => x[2] > 50)), 'UPS', JSON.stringify(r.ups.map(Math.round)), 'DOWNS', JSON.stringify(r.downs.map(Math.round)));
    if (strokes !== 300 + STROKES) console.log('DIAG', JSON.stringify({ ups: r.ups.map(Math.round), syncs: syncTimes, written: stored.filter((t) => t !== '').map(([t]) => Math.round(t)).sort((a, b) => a - b) }));
    return {
      throttle: rate, drawTiming: r.drawHook ? 'app draw hook' : 'pointermove completion', penDowns: r.downs.length, penUps: r.ups.length, receivedMoves: r.moves, expectedMoves: STROKES * MOVES, hoverMoves: r.hover, storedStrokes: strokes, expectedStoredStrokes: 300 + STROKES, storedPoints, expectedStoredPoints: STROKES * (MOVES + 2),
      drawP50Ms: round(percentile(r.draw, 0.5)), drawP95Ms: round(percentile(r.draw, 0.95)), drawMaxMs: round(Math.max(...r.draw)),
      frameP50Ms: round(percentile(r.frame, 0.5)), frameP95Ms: round(percentile(r.frame, 0.95)),
      longTasks: writing.length, longTaskMaxMs: round(Math.max(0, ...writing.map((t) => t.duration))),
      commitMedianMs: round(percentile(busy.filter((_, i) => !HIGHLIGHT.has(i)).map((b) => b.commit), 0.5)), commitP95Ms: round(percentile(busy.filter((_, i) => !HIGHLIGHT.has(i)).map((b) => b.commit), 0.95)),
      highlighterCommitMaxMs: round(Math.max(...busy.filter((_, i) => HIGHLIGHT.has(i)).map((b) => b.commit))),
      highlighterPointerupTaskMaxMs: round(Math.max(...busy.filter((_, i) => HIGHLIGHT.has(i)).map((b) => b.upTask))),
      pointerupTaskMedianMs: round(percentile(busy.filter((_, i) => !HIGHLIGHT.has(i)).map((b) => b.upTask), 0.5)),
      commitMaxTaskMs: round(Math.max(0, ...busy.map((b) => b.max))),
      hoverBusyPerSecondMs: round(busy.reduce((s, b) => s + b.hover, 0) / busy.reduce((s, b) => s + b.window, 0) * 1000),
    };
  } finally { await context.close(); }
}

async function profileCommits(browser, rate) {
  const { context, page } = await openBenchPage(browser);
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    const self = new Map(), inclusive = new Map();
    let total = 0;
    await writeStrokes(page, cdp, { beforeRelease: async (s) => { if (s >= 3 && s <= 8) await cdp.send('Profiler.start'); }, afterRelease: async (s) => {
      if (s < 3 || s > 8) return;
      await delay(650); // commit task, hover moves and the 500 ms ink save flush
      const { profile } = await cdp.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const parent = new Map();
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
      const name = (f) => `${f.functionName || '(anonymous)'} ${f.url ? path.basename(f.url.split('?')[0]) + ':' + (f.lineNumber + 1) : ''}`.trim();
      const dt = profile.timeDeltas;
      profile.samples.forEach((id, i) => {
        const n = byId.get(id), f = n.callFrame;
        if (['(idle)', '(program)'].includes(f.functionName)) return;
        const ms = (dt[i + 1] ?? dt[i] ?? 0) / 1000;
        self.set(name(f), (self.get(name(f)) ?? 0) + ms); total += ms;
        const seen = new Set();
        for (let at = id; at !== undefined; at = parent.get(at)) {
          const key = name(byId.get(at).callFrame);
          if (!seen.has(key)) { seen.add(key); inclusive.set(key, (inclusive.get(key) ?? 0) + ms); }
        }
      });
    } });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return { throttle: rate, sampledStrokeCommits: 6, totalSelfMs: round(total), top: [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([fn, ms]) => ({ fn, ms: round(ms) })),
      inclusive: [...inclusive].filter(([fn]) => !/^\((root|anonymous)\)$/.test(fn)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([fn, ms]) => ({ fn, ms: round(ms) })) };
  } finally { await context.close(); }
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-ink-app-bench-'));
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--production'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DAYMARK_PASSWORD: PASSWORD }, stdio: 'ignore',
});
let browser;
const results = { runs: [], profile: null };
try {
  await waitForServer();
  browser = await chromium.launch({ channel: process.env.INK_BENCH_CHANNEL || 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  for (const rate of throttles) {
    const runs = [];
    for (let i = 0; i < repeats; i++) {
      const result = await run(browser, rate);
      runs.push(result); results.runs.push(result);
      console.log(JSON.stringify(result));
    }
    if (repeats > 1) {
      const median = Object.fromEntries(Object.entries(runs[0]).map(([k, v]) => [k, typeof v === 'number' ? percentile(runs.map((r) => r[k]), 0.5) : v]));
      (results.medians ??= []).push(median);
      console.log('MEDIAN', JSON.stringify(median));
    }
  }
  if (profile) {
    results.profile = await profileCommits(browser, throttles[0]);
    console.log(JSON.stringify(results.profile, null, 2));
  }
  // Every dispatched pen sample must be in the stored strokes (down + moves + up per stroke).
  const lost = results.runs.some((r) => r.storedStrokes !== r.expectedStoredStrokes || r.storedPoints < r.expectedStoredPoints);
  if (lost) { console.log('FAIL: strokes or moves were lost'); process.exitCode = 1; }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
