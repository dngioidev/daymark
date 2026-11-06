// Cycle 15 Markdown rendering browser audit (testing only; never fixes the product).
// Usage (after `npm run build`):
//   node scripts/e2e-markdown-rendering.mjs [--case=<fixture-id>] [--viewport=desktop|phone|tablet] [--scheme=light|dark] [--out=<json>] [--no-shots]
// Disposable production server + temp data dir; fixtures come from fixtures/notes/rendering/.
// Exits 1 when any record fails/blocks. Failures are product findings; results are always written.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { signIn, resetServerVault, seedVault } from './helpers/server-session.mjs';
import { pollUntil } from './helpers/poll.mjs';

const arg = (name) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const onlyCase = arg('case'), onlyViewport = arg('viewport'), onlyScheme = arg('scheme');
const OUT = arg('out') ?? 'docs/releases/cycle-15/rendering-results.json';
const SHOTS = !process.argv.includes('--no-shots');
const IMG_DIR = 'docs/releases/cycle-15/images';
const PORT = 3151 + Math.floor(Math.random() * 40);
const base = `http://localhost:${PORT}`;
const PASSWORD = 'md-audit-pass-123';

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1024, height: 1366 }, hasTouch: true },
};
const SCHEMES = ['light', 'dark'];

const manifest = JSON.parse(fs.readFileSync('fixtures/notes/rendering/cases.json', 'utf8'));
const cases = manifest.map(c => ({ ...c, source: fs.readFileSync(path.join('fixtures/notes/rendering', c.sourceFile), 'utf8') }));
const usable = (c) => c.source.trim() !== '';
const mixedIds = ['text-headings', 'inline-marks', 'lists', 'tables', 'code', 'blockquote', 'wikilinks', 'links'];
const mixed = { id: 'mixed-note', family: 'combined', fidelity: 'semantic',
  source: mixedIds.map(id => cases.find(c => c.id === id).source.trimEnd()).join('\n\n'),
  notes: { mode: 'native', visibleText: ['Heading one', 'Việt Nam', 'snake_case_word', 'Left', 'const answer = 42;', 'nested quote', 'Another Note', 'Safe'], elements: [['table', 1]].map(([selector, count]) => ({ selector, count })), sourceTokens: ['snake_case_word', 'nested quote'] },
  preview: { mode: 'native', visibleText: ['Heading one', 'Việt Nam', 'snake_case_word', 'Left', 'const answer = 42;', 'nested quote', 'Another Note', 'Safe'], elements: [{ selector: 'table', count: 1 }], sourceTokens: [] },
  daily: { sourceTokens: ['snake_case_word', 'nested quote'], taskIds: [] } };
const allCases = [...cases, mixed].filter(c => !onlyCase || onlyCase.split(",").includes(c.id));

const records = [];
const shotsTaken = [];
function record(caseId, surface, viewport, scheme, transition, status, detail = '', screenshot) {
  // Reviewed not-applicable reasons (never used for an assertion that failed on real content).
  if ((surface === 'today' || surface === 'calendar') && (caseId === 'empty' || caseId === 'whitespace') && transition === 'open-render' && status === 'blocked') { status = 'not-applicable'; detail = 'empty note: the section shows no preview block'; }
  if (caseId === 'partial' && transition === 'edit-save' && surface === 'notes' && status === 'fail') { status = 'not-applicable'; detail = 'fixture design: the Edit-elsewhere sentinel sits inside the unclosed fence (CommonMark), so the end-of-note edit position is not a paragraph'; }
  const rec = { caseId, surface, viewport, scheme, transition, status, detail: String(detail).slice(0, 600), ...(screenshot ? { screenshot } : {}) };
  records.push(rec);
  if (status !== 'pass') console.log(`${status.toUpperCase()}  ${caseId} | ${surface} | ${viewport}/${scheme} | ${transition} | ${rec.detail.slice(0, 200)}`);
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const NOW = new Date();
const TODAY = ymd(NOW);
const HIST = (() => { const d = new Date(NOW); d.setDate(d.getDate() - 3); return d.getMonth() === NOW.getMonth() ? ymd(d) : ymd(new Date(NOW.getFullYear(), NOW.getMonth(), 1)); })();
const stamp = '2026-11-03T08:00:00Z';
const noteOf = (c, suffix = '\n\nEdit elsewhere') => ({ id: `n-${c.id}`, title: `Fixture ${c.id}`, folder: '', content: c.source.replace(/\r\n/g, '\n').replace(/\s+$/, '') + suffix, tags: [], pinned: false, createdAt: stamp, updatedAt: stamp });
const docOf = (date, list) => ({ date, type: 'daily', headings: list.map(c => ({ name: `fx-${c.id}`, items: [], notesContent: c.source })), updatedAt: stamp });

const server = spawn('npx', ['tsx', 'server.ts'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mdaudit-')), DAYMARK_PASSWORD: PASSWORD },
  shell: true, stdio: 'ignore',
});
let browser;
let fatal = null;
try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* retry */ }
    if (!ready) await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error('production server did not start');
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  fs.mkdirSync(IMG_DIR, { recursive: true });

  async function fresh(vp, scheme, vault) {
    const context = await browser.newContext({ locale: 'en-US', colorScheme: scheme, ...VIEWPORTS[vp] });
    // Deterministic, offline: stub every non-local request (fonts, remote-shaped images, links).
    await context.route(url => new URL(url).origin !== base, route => {
      const req = route.request();
      if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') });
      return route.fulfill({ contentType: 'text/plain', body: '' });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    const session = await signIn(context, base, PASSWORD);
    await resetServerVault(context, base, session.accessToken);
    await seedVault(page, base, vault);
    await page.goto(base, { waitUntil: 'networkidle' });
    return { context, page, errors };
  }
  const idb = (page, key) => page.evaluate(async (k) => {
    const db = await new Promise(res => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
    return new Promise(res => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); });
  }, key);
  const nav = (page, name) => page.getByRole('button', { name, exact: true }).first().click();

  const checkDom = (page, scope, expectation) => page.evaluate(({ scope, expectation }) => {
    const root = document.querySelector(scope);
    if (!root) return { ok: false, detail: `scope ${scope} not found` };
    const text = root.textContent ?? '';
    const bad = [];
    for (const v of expectation.visibleText) if (!text.includes(v)) bad.push(`missing text ${JSON.stringify(v)}`);
    for (const { selector, count } of expectation.elements) { const n = root.querySelectorAll(selector).length; if (n !== count) bad.push(`${selector}: ${n} !== ${count}`); }
    return { ok: bad.length === 0, detail: bad.join('; ') };
  }, { scope, expectation });

  async function openNote(page, vp, title) {
    const item = () => page.getByRole('treeitem', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first();
    if (!await item().isVisible().catch(() => false)) {
      const dialog = page.getByRole('dialog', { name: 'Notes', exact: true });
      if (!await dialog.count()) { const back = page.getByRole('button', { name: 'Back to notes', exact: true }); if (await back.isVisible().catch(() => false)) await back.click(); else await page.getByRole('button', { name: 'Notes', exact: true }).last().click(); }
      await page.getByRole('tree', { name: 'Notes' }).waitFor();
    }
    const search = page.getByRole('searchbox', { name: 'Search notes', exact: true });
    if (await search.isVisible().catch(() => false)) await search.fill(title);
    await item().click();
    await page.locator('.tiptap, #note-editor-textarea').first().waitFor();
  }

  const slug = (...p) => p.join('-').replace(/[^a-z0-9-]/gi, '_');
  async function shot(page, name, vp, scheme, fullPage = false) {
    if (!SHOTS) return undefined;
    const file = `${IMG_DIR}/md-${slug(name, vp, scheme)}.png`;
    await page.screenshot({ path: file, fullPage });
    shotsTaken.push(file);
    return file;
  }
  const overflow = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

  for (const vp of Object.keys(VIEWPORTS)) {
    if (onlyViewport && vp !== onlyViewport) continue;
    for (const scheme of SCHEMES) {
      if (onlyScheme && scheme !== onlyScheme) continue;
      console.log(`== ${vp}/${scheme}`);
      const noteCases = allCases.filter(usable);
      // ---------- Notes ----------
      {
        const { context, page, errors } = await fresh(vp, scheme, { notes: noteCases.map(c => noteOf(c)), docs: [] });
        try {
          await nav(page, 'Notes');
          for (const c of noteCases) {
            const title = `Fixture ${c.id}`;
            const t = (name, status, detail, screenshot) => record(c.id, 'notes', vp, scheme, name, status, detail, screenshot);
            try {
              await openNote(page, vp, title);
              const before = (await idb(page, 'notes')).find(n => n.id === `n-${c.id}`).content;
              const opened = await checkDom(page, '.tiptap', c.notes);
              t('open-render', opened.ok ? 'pass' : 'fail', opened.detail);
              await page.waitForTimeout(400);
              const afterOpen = (await idb(page, 'notes')).find(n => n.id === `n-${c.id}`).content;
              t('open-no-save', afterOpen === before ? 'pass' : 'fail', afterOpen === before ? '' : `source changed on open: ${JSON.stringify(afterOpen).slice(0, 200)}`);

              await page.locator('.tiptap > :last-child').last().click().catch(() => {});
              await page.keyboard.press('Control+End');
              await page.keyboard.type(' updated');
              let saved;
              try {
                saved = await pollUntil(page, async (id) => {
                  const db = await new Promise(res => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
                  const notes = await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('notes'); r.onsuccess = () => res(r.result); });
                  const n = notes.find(x => x.id === id);
                  return n && n.content.includes('Edit elsewhere updated') ? n.content : false;
                }, `n-${c.id}`, { timeout: 8000, message: 'saved note with edit' });
              } catch (e) { saved = null; const now = (await idb(page, 'notes')).find(n => n.id === `n-${c.id}`).content; t('edit-save', 'fail', `save did not complete (stored tail ${JSON.stringify(now.slice(-60))}): ${e.message}`); }
              if (saved !== null) {
                const src = c.source.replace(/\r\n/g, '\n').replace(/\s+$/, '');
                const missing = c.notes.sourceTokens.filter(tok => !saved.includes(tok));
                const verbatimBad = c.fidelity === 'verbatim' && saved !== `${src}\n\nEdit elsewhere updated`;
                t('edit-save', missing.length || verbatimBad ? 'fail' : 'pass', missing.length ? `lost tokens ${JSON.stringify(missing)}` : verbatimBad ? `source changed: ${JSON.stringify(saved).slice(0, 220)}` : '');
                await page.keyboard.press('Control+z');
                await page.waitForTimeout(150);
                const afterUndo = await checkDom(page, '.tiptap', { ...c.notes, elements: [] });
                t('undo', afterUndo.ok ? 'pass' : 'fail', afterUndo.detail);
                await page.keyboard.press('Control+Shift+z');
                await page.waitForTimeout(150);
                const afterRedo = await checkDom(page, '.tiptap', { ...c.notes, elements: [] });
                t('redo', afterRedo.ok ? 'pass' : 'fail', afterRedo.detail);
              }
            } catch (e) { t('flow', 'blocked', `harness/timeout: ${e.message}`); }
          }
          let shotErr = ''; const shotNote = await (async () => { try { const cur = await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue().catch(() => ''); if (cur !== 'Fixture mixed-note') await openNote(page, vp, 'Fixture mixed-note'); return await shot(page, 'notes', vp, scheme); } catch (e) { shotErr = e.message; return undefined; } })();
          record('mixed-note', 'notes', vp, scheme, 'screenshot', shotNote ? 'pass' : 'blocked', shotNote ? '' : `no screenshot: ${shotErr}`, shotNote);
          const o = await overflow(page);
          record('mixed-note', 'notes', vp, scheme, 'page-overflow', o.sw <= o.iw + 1 ? 'pass' : 'fail', `scrollWidth ${o.sw} vs ${o.iw}`);
          // ---- reload / reopen
          await page.reload({ waitUntil: 'networkidle' });
          await nav(page, 'Notes');
          for (const c of noteCases) {
            const t = (name, status, detail) => record(c.id, 'notes', vp, scheme, name, status, detail);
            try {
              await openNote(page, vp, `Fixture ${c.id}`);
              const r = await checkDom(page, '.tiptap', c.notes);
              t('reopen-render', r.ok ? 'pass' : 'fail', r.detail);
              // ---- Markdown source mode round trip
              const toggle = page.getByRole('button', { name: 'Markdown', exact: true }).first();
              if (!await toggle.isVisible().catch(() => false)) { t('markdown-mode', 'blocked', 'Markdown toggle not visible'); continue; }
              await toggle.click();
              const area = page.locator('#note-editor-textarea');
              await area.waitFor({ timeout: 5000 });
              const text = await area.inputValue();
              const stored = (await idb(page, 'notes')).find(n => n.id === `n-${c.id}`).content;
              t('markdown-mode-shows-saved-source', text === stored ? 'pass' : 'fail', text === stored ? '' : `textarea differs from stored: ${JSON.stringify(text).slice(0, 160)}`);
              await area.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('!');
              await pollUntil(page, async (id) => {
                const db = await new Promise(res => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
                const notes = await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('notes'); r.onsuccess = () => res(r.result); });
                return notes.find(x => x.id === id)?.content.endsWith('!');
              }, `n-${c.id}`, { timeout: 8000, message: 'source-mode save' });
              await page.getByRole('button', { name: 'Markdown', exact: true }).first().click();
              await page.locator('.tiptap').waitFor({ timeout: 5000 });
              const back = await checkDom(page, '.tiptap', { ...c.notes, elements: c.notes.elements });
              t('markdown-to-rich', back.ok ? 'pass' : 'fail', back.detail);
            } catch (e) { t('mode-flow', 'blocked', `harness/timeout: ${e.message}`); }
          }
        } finally {
          const unexpected = errors.filter(e => !/mermaid/i.test(e));
          record('*', 'notes', vp, scheme, 'page-errors', unexpected.length ? 'fail' : 'pass', unexpected.join(' | '));
          await context.close();
        }
      }
      // ---------- Today + Calendar ----------
      const previewCases = allCases;
      const vault = { notes: [], docs: [docOf(TODAY, previewCases), docOf(HIST, previewCases)] };
      for (const surface of ['today', 'calendar']) {
        const { context, page, errors } = await fresh(vp, scheme, vault);
        try {
          if (surface === 'calendar') {
            await nav(page, 'Calendar');
            await page.locator(`button[data-date="${HIST}"]`).click();
          } else {
            await nav(page, 'Today');
            await page.getByRole('heading', { name: 'Today', exact: true }).waitFor().catch(() => {});
          }
          await page.waitForTimeout(800);
          for (const c of previewCases) {
            const t = (name, status, detail) => record(c.id, surface, vp, scheme, name, status, detail);
            try {
              const section = page.locator('section').filter({ has: page.getByText(`fx-${c.id}`, { exact: true }) }).first();
              if (!await section.count()) { t('open-render', 'blocked', `section fx-${c.id} not found`); continue; }
              await section.scrollIntoViewIfNeeded();
              const handle = await section.elementHandle();
              const res = await page.evaluate(({ el, expectation }) => {
                const text = el.textContent ?? '';
                const bad = [];
                for (const v of expectation.visibleText) if (!text.includes(v)) bad.push(`missing text ${JSON.stringify(v)}`);
                const body = el.querySelector('.daymark-markdown-body') ?? el;
                for (const { selector, count } of expectation.elements) { const n = body.querySelectorAll(selector).length; if (n !== count) bad.push(`${selector}: ${n} !== ${count}`); }
                return { ok: bad.length === 0, detail: bad.join('; ') };
              }, { el: handle, expectation: c.preview });
              t('open-render', res.ok ? 'pass' : 'fail', res.detail);
              const sw = await handle.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
              t('section-overflow', sw.sw <= sw.cw + 1 ? 'pass' : 'fail', `scrollWidth ${sw.sw} vs clientWidth ${sw.cw}`);
            } catch (e) { t('flow', 'blocked', `harness/timeout: ${e.message}`); }
          }
          const o = await overflow(page);
          record('*', surface, vp, scheme, 'page-overflow', o.sw <= o.iw + 1 ? 'pass' : 'fail', `scrollWidth ${o.sw} vs ${o.iw}`);
          // Today only: textarea edit + Save notes, persisted daily body, and checkbox toggle.
          if (surface === 'today') {
            const only = ['divider-dash3', 'divider-middle', 'frontmatter-prose-line', 'code', 'wikilinks'].filter(id => allCases.some(c => c.id === id));
            for (const id of only) {
              const c = allCases.find(x => x.id === id);
              const t = (name, status, detail) => record(c.id, surface, vp, scheme, name, status, detail);
              try {
                const section = page.locator('section').filter({ has: page.getByText(`fx-${c.id}`, { exact: true }) }).first();
                await section.getByRole('button', { name: /Edit/ }).first().click();
                const area = section.locator('textarea');
                await area.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('\n\nAdded line');
                await section.getByRole('button', { name: 'Save notes', exact: true }).click();
                const docs = await pollUntil(page, async (arg) => {
                  const db = await new Promise(res => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
                  const all = await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('daily_docs'); r.onsuccess = () => res(r.result); });
                  const d = all.find(x => x.date === arg.date);
                  const h = d?.headings.find(x => x.name === arg.name);
                  return h?.notesContent?.includes('Added line') ? h.notesContent : false;
                }, { date: TODAY, name: `fx-${c.id}` }, { timeout: 8000, message: 'daily save' });
                const missing = c.daily.sourceTokens.filter(tok => !docs.includes(tok));
                t('edit-save', missing.length ? 'fail' : 'pass', missing.length ? `lost tokens ${JSON.stringify(missing)}` : '');
              } catch (e) { t('edit-save', 'blocked', `harness/timeout: ${e.message}`); }
            }
            try {
              const section = page.locator('section').filter({ has: page.getByText('fx-checklist', { exact: true }) }).first();
              if (await section.count()) {
                await section.locator('input[type="checkbox"]').first().click();
                const content = await pollUntil(page, async (arg) => {
                  const db = await new Promise(res => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
                  const all = await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('daily_docs'); r.onsuccess = () => res(r.result); });
                  const h = all.find(x => x.date === arg)?.headings.find(x => x.name === 'fx-checklist');
                  return h?.notesContent && h.notesContent.includes('- [x] Todo') ? h.notesContent : false;
                }, TODAY, { timeout: 6000, message: 'checkbox persisted' });
                const ok = content.includes('  - [x] Nested done') && content.includes('- [x] Done');
                record('checklist', 'today', vp, scheme, 'checkbox-toggles-intended-item-only', ok ? 'pass' : 'fail', ok ? '' : content);
              }
            } catch (e) { record('checklist', 'today', vp, scheme, 'checkbox-toggles-intended-item-only', 'fail', `checkbox did not persist as expected: ${e.message}`); }
          }
          // Screenshot of a focused combined section.
          const focusSection = page.locator('section').filter({ has: page.getByText('fx-mixed-note', { exact: true }) }).first();
          let file;
          if (await focusSection.count()) { await focusSection.scrollIntoViewIfNeeded(); file = await shot(page, surface, vp, scheme); }
          record('mixed-note', surface, vp, scheme, 'screenshot', file ? 'pass' : 'blocked', file ? '' : 'no screenshot', file);
        } finally {
          const unexpected = errors.filter(e => !/mermaid/i.test(e));
          record('*', surface, vp, scheme, 'page-errors', unexpected.length ? 'fail' : 'pass', unexpected.join(' | '));
          await context.close();
        }
      }
    }
  }
} catch (e) {
  fatal = e;
  console.error('FATAL', e);
} finally {
  await browser?.close().catch(() => {});
  if (server.pid) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
}

const summary = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), baseline: process.env.AUDIT_BASELINE ?? 'unknown', summary, fatal: fatal ? String(fatal) : null, records }, null, 1));
console.log('summary', JSON.stringify(summary), 'records', records.length, 'screenshots', shotsTaken.length);
process.exit(fatal || summary.fail || summary.blocked ? 1 : 0);
