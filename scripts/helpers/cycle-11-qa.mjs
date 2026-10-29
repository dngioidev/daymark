import fs from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** Cycle 11 coverage gaps: nested-folder ZIP export, Help text, keyboard-only paths and axe on the new panes. */
export async function cycle11Qa({ run, fresh, check, settingsOpen, settingsBox, settingsClose, themeSaved }) {
  const navigate = page => page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  const note = (id, patch = {}) => ({ id, title: `Java ${id}`, folder: 'Tech/Java', content: 'Java stream collectors pipeline processing', tags: ['java'], createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-02T08:00:00Z', ...patch });

  await run('C11-Export', async () => {
    const notes = [note('a'), note('b', { folder: 'Tech' }), note('c', { folder: 'Inbox/2026' }), note('d', { folder: '' })];
    const { page, errors } = await fresh({ notes });
    await navigate(page);
    // An empty folder is created through the real dialog and must also become a directory.
    // New folder nests in the current folder; opening the top-level note makes that the top level.
    await page.getByRole('tree', { name: 'Notes', exact: true }).getByRole('treeitem', { name: 'Java d', exact: true }).click();
    await page.getByRole('button', { name: 'New folder', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Drafts');
    await page.getByRole('dialog').getByRole('button', { name: /^(Create|Save|OK|New folder)$/ }).last().click();
    await page.getByRole('tree', { name: 'Notes', exact: true }).getByRole('treeitem', { name: 'Drafts, folder, 0 notes', exact: true }).waitFor();
    await settingsOpen(page);
    await settingsBox(page).getByRole('tab', { name: 'Backup & restore', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), settingsBox(page).getByRole('button', { name: /Back up now/ }).click()]);
    const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()));
    const names = Object.keys(zip.files);
    const has = entry => names.some(name => name === entry || name.startsWith(entry));
    check('C11-Export-dirs', has('Daymark/Notes/Tech/Java/') && has('Daymark/Notes/Tech/') && has('Daymark/Notes/Inbox/2026/'), 'nested folders are real directories under Daymark/Notes', names.filter(n => n.includes('Notes/')).join(', '));
    check('C11-Export-files', names.some(n => /^Daymark\/Notes\/Tech\/Java\/.*\.md$/.test(n)) && names.some(n => /^Daymark\/Notes\/Inbox\/2026\/.*\.md$/.test(n)) && names.some(n => /^Daymark\/Notes\/[^/]+\.md$/.test(n)), 'each note file sits inside its own directory; the top-level note sits in Notes');
    check('C11-Export-empty', has('Daymark/Notes/Drafts/'), 'an empty folder is exported as an empty directory');
    check('C11-Export-errors', errors.length === 0, 'export has no browser errors', errors.join(' | '));
  });

  await run('C11-Help', async () => {
    const { page } = await fresh();
    await settingsOpen(page);
    await settingsBox(page).getByRole('tab', { name: 'Help', exact: true }).click();
    for (const [topic, web, mobile] of [
      ['Notes', ['Related panel', 'Hidden suggestions', 'Graph', 'Minimize folders', 'List | Graph'], ['Move to folder', 'Related button', 'Hidden suggestions']],
      ['Shortcuts and gestures', ['List view'], ['List view']],
      ['Sync and the server', ['Tech/Java'], ['Not related']],
      ['Backups', ['Daymark/Notes/Tech/Java'], []],
    ]) {
      await settingsBox(page).getByRole('navigation', { name: 'Help topics', exact: true }).getByRole('button', { name: topic, exact: true }).click();
      const article = page.getByRole('article', { name: topic, exact: true });
      await article.waitFor();
      await settingsBox(page).getByRole('button', { name: 'Web', exact: true }).click();
      const webText = await article.innerText();
      await settingsBox(page).getByRole('button', { name: 'Mobile', exact: true }).click();
      const mobileText = await article.innerText();
      const missing = [...web.filter(t => !webText.includes(t)).map(t => `web:${t}`), ...mobile.filter(t => !mobileText.includes(t)).map(t => `mobile:${t}`)];
      check(`C11-Help-${topic.split(' ')[0]}`, missing.length === 0, `Help ${topic} shows the cycle 11 text on both platforms`, missing.join(', '));
    }
  });

  await run('C11-Keyboard', async () => {
    const notes = [note('a'), note('b'), note('e'), note('c', { title: 'Garden c', folder: 'Inbox', content: 'Gardening tomatoes', tags: [] })];
    const { page, errors } = await fresh({ notes });
    await page.setViewportSize({ width: 1600, height: 900 });
    await navigate(page);
    const press = async (key, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(key); };
    // Folder tree: focus a folder row, Enter selects it and toggles it, Shift+F10 opens its actions and Escape closes them.
    const tree = page.getByRole('tree', { name: 'Notes', exact: true });
    const inbox = tree.getByRole('treeitem', { name: 'Inbox, folder, 1 note', exact: true });
    const wasExpanded = await inbox.getAttribute('aria-expanded');
    await inbox.focus(); await press('Enter');
    if (await inbox.getAttribute('aria-expanded') !== 'true') await press('Enter');
    check('C11-Keyboard-folder', wasExpanded !== null && await inbox.getAttribute('aria-current') === 'true' && await tree.getByRole('treeitem', { name: 'Garden c', exact: true }).isVisible(), 'Enter on a focused folder row selects it and shows its notes');
    await inbox.focus(); await press('Shift+F10');
    const rename = page.getByRole('menuitem', { name: 'Rename folder', exact: true });
    await rename.waitFor();
    await press('Escape');
    await rename.waitFor({ state: 'detached' });
    check('C11-Keyboard-menu', await inbox.evaluate(el => el === document.activeElement), 'Escape closes the folder menu and returns focus to the folder row');
    await press('ArrowDown');
    check('C11-Keyboard-menu-arrows', await tree.getByRole('treeitem', { name: 'Garden c', exact: true }).evaluate(el => el === document.activeElement), 'ArrowDown still walks the tree after closing folder actions');
    await press('ArrowUp');
    check('C11-Keyboard-menu-return', await inbox.evaluate(el => el === document.activeElement), 'ArrowUp returns to the folder row');
    // Related panel: open a Java note from the list, then Link by keyboard.
    // Keyboard only: expand every collapsed folder with ArrowRight, then open the note with Enter.
    for (let i = 0; i < 6; i++) {
      const collapsed = tree.locator('[role=treeitem][aria-expanded=false]').first();
      if (!await collapsed.count()) break;
      await collapsed.focus(); await press('ArrowRight');
    }
    await tree.getByRole('treeitem', { name: 'Java a', exact: true }).focus(); await press('Enter');
    const panel = page.getByRole('complementary', { name: 'Related panel', exact: true });
    const link = panel.getByRole('region', { name: 'Suggested notes', exact: true }).getByRole('button', { name: 'Link', exact: true });
    await link.first().waitFor();
    const suggestionsBefore = await link.count();
    await link.first().focus(); await press('Enter');
    await panel.getByRole('region', { name: 'Linked notes', exact: true }).getByRole('button', { name: /^Java [be]$/ }).waitFor();
    check('C11-Keyboard-link', await link.count() === suggestionsBefore - 1, 'Link works from the keyboard and the linked note leaves Suggested', `${suggestionsBefore} -> ${await link.count()}`);
    // Graph: switch with the keyboard, use List view and dismiss a suggestion by keyboard.
    const graph = page.getByRole('radio', { name: 'Graph', exact: true });
    await graph.focus(); await press('Enter');
    await page.getByRole('img', { name: /^Knowledge graph:/ }).waitFor();
    const listView = page.getByRole('button', { name: 'List view', exact: true });
    await listView.focus(); await press('Space');
    const rows = page.locator('[aria-label="Graph nodes"] [data-node-id] button').first();
    await rows.waitFor();
    const focusedInList = await page.evaluate(() => !!document.activeElement?.closest('[aria-label="Graph nodes"]'));
    check('C11-Keyboard-graph-list', focusedInList, 'List view moves focus into the accessible node list');
    const dismissals = page.locator('[aria-label="Graph nodes"]').getByRole('button', { name: /^Not related to / });
    const before = await dismissals.count();
    await dismissals.first().focus(); await press('Enter');
    await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
    check('C11-Keyboard-graph-dismiss', before > 0 && await dismissals.count() < before, 'Not related in the graph list works from the keyboard and offers Undo', `${before} -> ${await dismissals.count()}`);
    check('C11-Keyboard-errors', errors.length === 0, 'keyboard-only paths have no browser errors', errors.join(' | '));
  });

  const RULES = ['color-contrast', 'label-content-name-mismatch', 'button-name', 'label', 'list', 'listitem', 'nested-interactive', 'aria-allowed-attr', 'aria-valid-attr-value', 'aria-required-children', 'aria-required-parent'];
  const axeOn = (page, selectors) => page.evaluate(async ({ selectors, RULES }) => {
    const include = selectors.map(selector => [selector]);
    const result = await window.axe.run({ include }, { runOnly: { type: 'rule', values: RULES } });
    return result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.html.slice(0, 120)).join(' | ')}`);
  }, { selectors, RULES });
  for (const theme of ['light', 'dark']) await run(`C11-Axe-${theme}`, async () => {
    const notes = [note('a'), note('b'), note('c', { title: 'Garden c', folder: 'Inbox', content: 'Gardening tomatoes', tags: [] }), note('d', { folder: '', content: 'Root only', tags: [] })];
    const { page, errors } = await fresh({ notes, colorScheme: theme });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addScriptTag({ content: AXE });
    if (theme === 'dark') {
      await settingsOpen(page);
      await settingsBox(page).getByRole('button', { name: /Dark$/ }).click();
      await settingsClose(page);
      await themeSaved(page, 'dark');
    }
    await navigate(page);
    const tree = await axeOn(page, ['aside[aria-label="Folder navigation"]']);
    check(`C11-Axe-${theme}-tree`, tree.length === 0, `folder tree has no axe findings (${theme})`, tree.join(' ; '));
    await page.getByRole('tree', { name: 'Notes', exact: true }).getByRole('treeitem', { name: 'Java a', exact: true }).click();
    await page.getByRole('complementary', { name: 'Related panel', exact: true }).getByRole('button', { name: 'Link', exact: true }).first().waitFor();
    const related = await axeOn(page, ['aside[aria-label="Related panel"]']);
    check(`C11-Axe-${theme}-related`, related.length === 0, `Related panel has no axe findings (${theme})`, related.join(' ; '));
    await page.getByRole('button', { name: 'Minimize Related', exact: true }).click();
    const strip = await axeOn(page, ['aside[aria-label="Related minimized"]']);
    check(`C11-Axe-${theme}-related-min`, strip.length === 0, `minimized Related strip has no axe findings (${theme})`, strip.join(' ; '));
    await page.getByRole('button', { name: 'Minimize folders', exact: true }).click();
    const minTree = await axeOn(page, ['aside[aria-label="Folder navigation"]']);
    check(`C11-Axe-${theme}-tree-min`, minTree.length === 0, `minimized folder strip has no axe findings (${theme})`, minTree.join(' ; '));
    await page.getByRole('button', { name: 'Expand folders', exact: true }).click();
    await page.getByRole('radio', { name: 'Graph', exact: true }).click();
    await page.getByRole('img', { name: /^Knowledge graph:/ }).waitFor();
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await page.locator('[aria-label="Graph nodes"] [data-node-id]').first().waitFor();
    const graph = await axeOn(page, ['div[aria-label="Knowledge graph"]']);
    check(`C11-Axe-${theme}-graph`, graph.length === 0, `graph toolbar, filters, detail and list have no axe findings (${theme})`, graph.join(' ; '));
    check(`C11-Axe-${theme}-errors`, errors.length === 0, 'axe checks cause no browser errors', errors.join(' | '));
  });
}
