// After npm.cmd run build: node scripts/ink-bench.mjs (starts an isolated Vite dev server).
// Optional INK_BENCH_URL for an existing ungated Vite server, INK_BENCH_CHANNEL=chrome|msedge.
// Measures event timestamp to synchronous segment draw; next-rAF latency is a separate diagnostic.
import { chromium } from 'playwright-core';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';

let browser, server;
try {
  let base = process.env.INK_BENCH_URL;
  if (!base) {
    server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
    await server.listen();
    base = server.resolvedUrls.local[0];
  }
  browser = await chromium.launch({ channel: process.env.INK_BENCH_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 }, deviceScaleFactor: 2, hasTouch: true });
  await page.goto(new URL('/?inkbench', base).href, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-inkbench] canvas');
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.querySelector('canvas');
    const pendingDraw = [], pendingFrame = [], samples = [], frameSamples = [], longTasks = [];
    window.inkBenchResults = { samples, frameSamples, longTasks, moves: 0 };
    // Capture runs before InkCanvas's listener, including handler cost in the measurement.
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'pen' && e.buttons) {
        const coalesced = e.getCoalescedEvents?.();
        const samples = coalesced?.length ? coalesced : [e];
        for (const sample of samples) { pendingDraw.push(sample.timeStamp); pendingFrame.push(sample.timeStamp); }
        window.inkBenchResults.moves += samples.length;
      }
    }, { capture: true });
    canvas.addEventListener('inkdraw', e => {
      const now = e.detail;
      for (const received of pendingDraw.splice(0)) samples.push(now - received);
    });
    canvas.addEventListener('inkframe', e => {
      const now = e.detail;
      for (const received of pendingFrame.splice(0)) frameSamples.push(now - received);
    });
    new PerformanceObserver(list => { for (const task of list.getEntries()) longTasks.push(task.duration); }).observe({ type: 'longtask' });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 40, y: 40, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
  const started = performance.now();
  const dispatches = [];
  for (let i = 0; i < 600; i++) {
    const remaining = started + i * 1000 / 240 - performance.now();
    if (remaining > 0) await delay(remaining);
    dispatches.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 40 + i * 1.4, y: 100 + Math.sin(i / 25) * 40, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5 + Math.sin(i / 15) * 0.3 }));
  }
  const dispatchDurationMs = performance.now() - started;
  await Promise.all(dispatches);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 880, y: 100, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await delay(150); // Let PerformanceObserver deliver tasks including the commit.
  const result = await page.evaluate(() => window.inkBenchResults);
  result.samples.sort((a, b) => a - b);
  result.frameSamples.sort((a, b) => a - b);
  const report = {
    strokes: 2000, dispatchedMoves: 600, receivedMoves: result.moves, paintedSamples: result.samples.length, framedSamples: result.frameSamples.length,
    targetHz: 240, achievedHz: 600000 / dispatchDurationMs, dispatchDurationMs,
    p95Ms: result.samples[Math.ceil(result.samples.length * 0.95) - 1] ?? null,
    p95FrameMs: result.frameSamples[Math.ceil(result.frameSamples.length * 0.95) - 1] ?? null,
    maxLongTaskMs: Math.max(0, ...result.longTasks),
    measurement: 'p95Ms: browser event timestamp (including coalesced samples) to synchronous live-segment draw completion in the handler; p95FrameMs: same timestamp to next rAF after predicted-tail drawing (the fixture has no predictions). Both exclude compositor presentation, display scanout, and transport before the browser timestamp. PASS uses p95Ms, not p95FrameMs.',
  };
  // An under-rate run is inconclusive, never a passing latency result.
  const valid = result.moves === 600 && result.samples.length === 600 && result.frameSamples.length === 600
    && result.samples.every(ms => Number.isFinite(ms) && ms >= 0) && report.achievedHz >= 228;
  const pass = valid && report.p95Ms <= 16 && report.maxLongTaskMs <= 50;
  console.log(JSON.stringify({ status: !valid ? 'INCONCLUSIVE' : pass ? 'PASS' : 'FAIL', ...report }, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
