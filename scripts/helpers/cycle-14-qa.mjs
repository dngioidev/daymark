import assert from 'node:assert/strict';
import { pollUntil } from './poll.mjs';

export const inkCanvas = page => page.getByRole('img', { name: 'Handwritten page', exact: true });
export const noteTitle = page => page.getByRole('textbox', { name: 'Title', exact: true });

export async function openNotes(page) {
  if (await page.getByRole('tree', { name: 'Notes', exact: true }).isVisible()) return;
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  // Reopening Notes can retain its editor; use its own navigation opener.
  if (!await page.getByRole('tree', { name: 'Notes', exact: true }).isVisible()) {
    const back = page.getByRole('button', { name: 'Back to notes', exact: true });
    if (await back.isVisible()) await back.click();
    const opener = page.getByRole('group', { name: 'Note editor', exact: true }).getByRole('button', { name: 'Notes', exact: true });
    if (await opener.isVisible() && !await page.getByRole('tree', { name: 'Notes', exact: true }).isVisible()) await opener.click();
    const expand = page.getByRole('button', { name: 'Expand notes column', exact: true });
    if (await expand.isVisible()) await expand.click();
  }
  await page.getByRole('tree', { name: 'Notes', exact: true }).waitFor();
}

export async function createNotebook(page, paper = 'Lined', title = 'Study notebook') {
  await openNotes(page);
  await page.getByRole('button', { name: 'Note templates', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Handwritten note', exact: true }).click();
  await page.getByRole('dialog', { name: 'Handwritten note', exact: true }).getByRole('button', { name: paper, exact: true }).click();
  await noteTitle(page).fill(title);
  await noteTitle(page).press('Tab');
  await inkCanvas(page).waitFor();
}

// CDP generates real pointer events (including working pointer capture). Synthetic
// dispatchEvent pen events cannot capture an inactive pointer in Chromium.
export async function penDrag(page, points) {
  const session = await page.context().newCDPSession(page);
  try {
    const send = (type, point, buttons) => session.send('Input.dispatchMouseEvent', {
      type, x: point.x, y: point.y, pointerType: 'pen', button: buttons ? 'left' : 'none',
      buttons, force: point.p ?? 0.5,
    });
    await send('mouseMoved', points[0], 0);
    await send('mousePressed', points[0], 1);
    for (const point of points.slice(1)) await send('mouseMoved', point, 1);
    const last = points.at(-1);
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last.x, y: last.y, pointerType: 'pen', button: 'left', buttons: 0 });
  } finally { await session.detach(); }
}

export async function writeTwoStrokes(page) {
  const canvas = inkCanvas(page);
  // The first pen contact enables writing for a device that has not seen a pen.
  if (!await page.getByRole('toolbar', { name: 'Writing tools', exact: true }).count()) {
    const box = await canvas.boundingBox();
    await penDrag(page, [{ x: box.x + 20, y: box.y + 20 }, { x: box.x + 21, y: box.y + 20 }]);
  }
  await page.getByRole('toolbar', { name: 'Writing tools', exact: true }).waitFor();
  const box = await canvas.boundingBox();
  for (const offset of [45, 90]) await penDrag(page, [
    { x: box.x + 35, y: box.y + offset, p: 0.3 },
    { x: box.x + 90, y: box.y + offset + 12, p: 0.7 },
    { x: box.x + 160, y: box.y + offset, p: 0.5 },
  ]);
}

export async function readStored(page, key) {
  return page.evaluate(async key => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try { return await new Promise((resolve, reject) => {
      const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    }); } finally { db.close(); }
  }, key);
}

// Polls committed IndexedDB ink. page.waitForFunction cannot be used here: it does not await an
// async predicate, so the pending Promise counts as truthy and the wait passes at once.
export async function waitInk(page, count, noteId, timeout = 20000) {
  await pollUntil(page, async ({ count, noteId }) => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    try {
      const pages = await new Promise((resolve, reject) => {
        // Ink is stored one IndexedDB key per page: ink:<noteId>:<page>.
        const store = db.transaction('kv').objectStore('kv'); const keys = store.getAllKeys(); const values = store.getAll();
        values.onsuccess = () => resolve(keys.result.map((key, i) => [key, values.result[i]]).filter(([key]) => String(key).startsWith('ink:')).map(([, value]) => value)); values.onerror = () => reject(values.error);
      });
      return (pages ?? []).some(p => (!noteId || p.noteId === noteId) && p.strokes.filter(s => !p.removed.includes(s.id)).length === count);
    } finally { db.close(); }
  }, { count, noteId }, { timeout, message: `waiting for ${count} stored strokes` });
}

/** All stored ink pages, collected from the per-page keys. */
export async function readInk(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => {
      const store = db.transaction('kv').objectStore('kv'); const keys = store.getAllKeys(); const values = store.getAll();
      values.onsuccess = () => resolve(keys.result.map((key, i) => [key, values.result[i]]).filter(([key]) => String(key).startsWith('ink:')).map(([, value]) => value)); values.onerror = () => reject(values.error);
    }); } finally { db.close(); }
  });
}

export async function touchDoesNotDraw(page, noteId) {
  // Flush pending pen strokes first so the baseline includes them.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const before = await readInk(page);
  const box = await inkCanvas(page).boundingBox();
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 180, y: box.y + 120 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 180, y: box.y + 40 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
  // Flush debounced ink writes before comparing, without a timing guess.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.deepEqual((await readInk(page)).filter(p => p.noteId === noteId), before.filter(p => p.noteId === noteId), 'touch drag must not change ink');
}

export async function highlightWords(page) {
  const editor = page.getByRole('textbox', { name: 'Note rich text', exact: true });
  await page.getByRole('button', { name: 'Highlighter', exact: true }).click();
  await page.getByRole('button', { name: 'Highlighter colour #86efac', exact: true }).click();
  const points = await editor.evaluate(el => {
    const text = [...el.querySelectorAll('p')].find(p => p.textContent.includes('Study these words today')).firstChild;
    const point = offset => { const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + 1); const r = range.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    return [point(7), point(10), point(14)];
  });
  await penDrag(page, points);
  await editor.locator('mark').waitFor();
  assert.equal(await editor.locator('mark').innerText(), 'these words');
  assert.equal(await editor.locator('mark').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(134, 239, 172)');
}

export async function assertSafeControls(page, state) {
  const controls = await page.locator('button, input, [role="tab"], [role="radio"]').evaluateAll(elements => elements
    .filter(el => el.checkVisibility() && el.getBoundingClientRect().bottom > 0)
    .map(el => ({ label: el.getAttribute('aria-label') || el.textContent, y: el.getBoundingClientRect().y })));
  assert.ok(controls.length > 0, `${state}: controls must exist`);
  assert.deepEqual(controls.filter(control => control.y < 24), [], `${state}: controls must start below the 24px status bar`);
}

export async function cycle14Qa({ run, fresh, check }) {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 800, height: 1280 }]) {
    await run(`C14-Inset-${viewport.width}`, async () => {
      const { page, errors } = await fresh();
      await page.setViewportSize(viewport);
      await page.evaluate(() => document.documentElement.style.setProperty('--dm-safe-top', '24px'));
      await assertSafeControls(page, 'Today and rail');
      await openNotes(page); await assertSafeControls(page, 'Notes column or drawer');
      await page.getByRole('radio', { name: 'Graph', exact: true }).click();
      await page.getByRole('group', { name: 'Graph controls', exact: true }).waitFor();
      await assertSafeControls(page, 'Graph toolbar and filters');
      await page.getByRole('radio', { name: 'List', exact: true }).click();
      if (viewport.width === 1280) {
        await page.getByRole('button', { name: 'Minimize notes column', exact: true }).click();
        await page.getByRole('group', { name: 'Notes shortcuts', exact: true }).waitFor();
        await assertSafeControls(page, 'Notes strip');
        await page.getByRole('button', { name: 'Expand notes column', exact: true }).click();
      }
      await createNotebook(page); await assertSafeControls(page, 'Handwritten note');
      await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
      await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
      await assertSafeControls(page, 'Settings dialog');
      check(`C14-Inset-${viewport.width}`, true, 'top controls clear forced 24px inset');
      check(`C14-Inset-${viewport.width}-errors`, errors.length === 0, 'no browser errors', errors.join(' | '));
    });
  }
}
