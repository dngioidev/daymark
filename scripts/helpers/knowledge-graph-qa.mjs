import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';

/** Production-browser graph checks. Uses only disposable vaults supplied by the QA runner. */
export async function knowledgeGraphQa({ run, fresh, check, settingsOpen, settingsBox, settingsClose, png }) {
  const navigate = page => page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  const note = (id, patch = {}) => ({ id, title: `Java ${id}`, folder: 'Tech/Java', content: 'Java streams collectors pipeline', tags: ['java'], createdAt: '2026-10-01', updatedAt: '2026-10-02', ...patch });
  const readNotes = page => page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
    try { return await new Promise(resolve => { const r = db.transaction('kv').objectStore('kv').get('notes'); r.onsuccess = () => resolve(r.result); }); } finally { db.close(); }
  });
  const output = path.join(os.tmpdir(), 'daymark-task-7-qa'); fs.mkdirSync(output, { recursive: true });
  await run('C11-Graph-actions', async () => {
    const notes = [note('a', { folder: 'Tech', pinned: true, updatedAt: '2026-10-01' }), note('b'), note('c'), note('orphan', { folder: 'Other', content: '', tags: [] })];
    const { page, errors } = await fresh({ notes });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await navigate(page); await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const canvas = page.getByRole('img', { name: /^Knowledge graph:/ });
    await canvas.waitFor();
    check('C11-Graph-readonly', JSON.stringify(await readNotes(page)) === JSON.stringify(notes), 'opening graph leaves note objects and Markdown byte-identical');
    const filters = page.getByRole('complementary', { name: 'Graph filters', exact: true });
    await filters.getByLabel('All folders', { exact: true }).uncheck();
    await filters.getByLabel('Tech', { exact: true }).check();
    check('C11-Graph-folder', (await canvas.getAttribute('aria-label')).includes('3 notes'), 'parent folder includes child notes and drops Other');
    // Reproduce the deterministic reduced-motion layout to click an actual dashed edge.
    const { buildNoteIndex } = await tsImport('../../src/utils/noteRelated.ts', import.meta.url);
    const { buildGraph } = await tsImport('../../src/utils/graphData.ts', import.meta.url);
    const { createLayout } = await tsImport('../../src/utils/graphLayout.ts', import.meta.url);
    const graph = buildGraph(notes, buildNoteIndex(notes), new Set(), { folderPaths: ['Tech'], showSuggestions: true, showTags: false, showOrphans: true });
    const layout = createLayout(graph.nodes, graph.edges); layout.settle();
    const a = layout.positions.get('a'), b = layout.positions.get('b'), box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2 + (a.x + b.x) / 2, box.y + box.height / 2 + (a.y + b.y) / 2);
    const edge = page.getByRole('group', { name: 'Selected suggestion', exact: true });
    await edge.getByRole('button', { name: 'Link', exact: true }).click();
    await page.waitForTimeout(300);
    const saved = await readNotes(page);
    check('C11-Graph-link', saved.find(n => n.id === 'a').content.includes('[[Java b]]') && saved.find(n => n.id === 'b').content === notes[1].content, 'canvas dashed-edge Link edits only the selected, older endpoint');
    const detail = page.getByRole('complementary', { name: 'Graph detail', exact: true });
    check('C11-Graph-solid', await detail.getByRole('heading', { name: 'Linked notes', exact: true }).count() === 1 && await detail.getByRole('button', { name: 'Java b', exact: true }).isVisible(), 'accepted suggestion becomes a solid linked connection');
    await detail.getByRole('button', { name: 'Not related', exact: true }).first().click();
    check('C11-Graph-dismiss', await detail.getByRole('button', { name: 'Not related', exact: true }).count() === 0, 'dismissal hides the suggestion');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    check('C11-Graph-undo', await detail.getByRole('button', { name: 'Not related', exact: true }).count() === 1, 'Undo restores the same graph suggestion');
    await filters.getByLabel('Local (2 steps)', { exact: true }).check();
    check('C11-Graph-local', (await canvas.getAttribute('aria-label')).includes('3 notes'), 'Local includes the selected note and its two-step neighbours');
    await page.getByRole('button', { name: 'Minimize graph filters', exact: true }).click();
    await page.getByRole('button', { name: 'Minimize graph detail', exact: true }).click();
    check('C11-Graph-panels', await page.getByRole('button', { name: 'Expand graph filters', exact: true }).isVisible() && await page.getByRole('button', { name: 'Expand graph detail', exact: true }).isVisible(), 'both panels minimize');
    await page.getByRole('button', { name: 'Expand graph filters', exact: true }).click();
    await page.getByRole('button', { name: 'Expand graph detail', exact: true }).click();
    for (const theme of ['light', 'dark', 'photo']) {
      if (theme !== 'light') {
        await settingsOpen(page);
        await settingsBox(page).getByRole('button', { name: /Dark$/ }).click();
        if (theme === 'photo') { await page.getByLabel('Add background photo', { exact: true }).setInputFiles(await png(page, 1)); await page.getByRole('button', { name: 'Select photo 1', exact: true }).waitFor(); }
        await settingsClose(page);
      }
      const colors = await canvas.evaluate(el => {
        // CSS colour tokens use oklch; let canvas convert to sRGB before measuring.
        const c = document.createElement('canvas'), ctx = c.getContext('2d'); c.width = c.height = 1;
        const luminance = color => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); };
        const s = getComputedStyle(el), bg = luminance(s.backgroundColor), fg = luminance(s.borderTopColor), amber = luminance(s.color);
        return { labels: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05), selected: (Math.max(bg, amber) + .05) / (Math.min(bg, amber) + .05), photo: !!document.querySelector('.dm-photo') };
      });
      check(`C11-Graph-${theme}`, colors.labels >= 4.5 && colors.selected >= 3 && (theme !== 'photo' || colors.photo), 'canvas labels and selected dot have contrast on an opaque themed surface', JSON.stringify(colors));
      await page.screenshot({ path: path.join(output, `graph-${theme}.png`) });
    }
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    const firstOpen = page.getByRole('region', { name: 'Graph nodes', exact: true }).getByRole('button', { name: 'Open note: Java a', exact: true });
    check('C11-Graph-keyboard-focus', await firstOpen.evaluate(el => document.activeElement === el), 'List view moves focus to the first native Open action');
    await page.keyboard.press('Enter');
    check('C11-Graph-keyboard-open', await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Java a', 'keyboard Open returns to the note editor');
    check('C11-Graph-errors', errors.length === 0, 'graph has no browser errors', errors.join(' | '));
  });
  await run('C11-Graph-performance', async () => {
    const notes = Array.from({ length: 1000 }, (_, i) => note(String(i), { title: `Vertex ${i}`, folder: 'Large', tags: [], content: `[[Vertex ${(i + 1) % 1000}]]\n[[Vertex ${(i + 17) % 1000}]]` }));
    const { page } = await fresh({ notes });
    await navigate(page);
    const start = performance.now(); await page.getByRole('button', { name: 'Graph', exact: true }).click();
    const canvas = page.getByRole('img', { name: /^Knowledge graph: 1000 notes, 2000 connections/ }); await canvas.waitFor();
    const loadMs = performance.now() - start;
    const box = await canvas.boundingBox(), interactionStart = performance.now();
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, i % 2 ? -40 : 40);
      await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 8, box.y + box.height / 2 + 8); await page.mouse.up();
      await page.mouse.move(box.x + 20 + i * 2, box.y + 20);
    }
    const interactionMs = performance.now() - interactionStart;
    check('C11-Graph-performance', loadMs < 10000 && interactionMs < 5000, '1,000 notes / 2,000 edges: 30 pan/zoom/hover interactions under 5s; initial display under 10s', JSON.stringify({ loadMs, interactionMs }));
    console.log('Graph performance:', JSON.stringify({ loadMs, interactionMs }));
    await page.screenshot({ path: path.join(output, 'graph-1000.png') });
  });
  await run('C11-Graph-phone', async () => {
    const { page } = await fresh({ mobile: true, notes: [note('a')] });
    await page.getByRole('navigation').getByRole('button', { name: 'Notes', exact: true }).click();
    check('C11-Graph-phone', await page.getByRole('button', { name: 'Graph', exact: true }).count() === 0 && await page.locator('canvas').count() === 0, '390px phone has no Graph switch or canvas');
  });
}
