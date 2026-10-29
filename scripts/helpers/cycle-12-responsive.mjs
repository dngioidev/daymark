// Shared browser assertions for QA and UX. The controller executes these suites.
export const responsiveNotesFixture = () => {
  const note = (id, title, folder = '') => ({ id, title, folder, content: '', tags: [], pinned: false, createdAt: '2026-10-29T08:00:00Z', updatedAt: '2026-10-29T08:00:00Z' });
  return [note('java', 'Java note', 'Tech/Java'), note('garden', 'Garden note', 'Garden'), note('root', 'Root note'),
    ...Array.from({ length: 8 }, (_, i) => note(`extra-${i}`, `Extra ${i}`, `Other${i}`)),
    ...Array.from({ length: 40 }, (_, i) => note(`scroll-${i}`, `Scroll note ${i}`))];
};

export async function notesResponsiveScenario({ page, width, axe, verify }) {
  const tree = () => page.getByRole('tree', { name: 'Notes', exact: true });
  const editor = () => page.getByRole('group', { name: 'Note editor', exact: true });
  const radio = name => page.getByRole('radio', { name, exact: true });
  const search = () => page.getByRole('searchbox', { name: 'Search notes', exact: true });
  const title = () => page.getByRole('textbox', { name: 'Title', exact: true });
  const opener = () => editor().getByRole('button', { name: 'Notes', exact: true });
  const drawer = () => page.getByRole('dialog', { name: 'Notes', exact: true });
  await page.addScriptTag({ content: axe });
  const audit = async (state, selectors) => {
    const violations = await page.evaluate(async include => (await window.axe.run({ include }, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), selectors);
    verify(`axe-${state}`, violations.length === 0, JSON.stringify(violations));
  };
  const actionGeometry = async () => {
    await search().fill('Root');
    const row = page.getByTestId('notes-actions-row');
    const buttons = await row.locator('button').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => {
      const r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') || el.textContent, height: r.height, y: r.y };
    }));
    const clearHeight = await page.getByRole('button', { name: 'Clear search', exact: true }).evaluate(el => el.getBoundingClientRect().height);
    const expected = width < 768 ? 44 : 36;
    verify('action-heights', buttons.length === (width < 768 ? 3 : 5) && buttons.every(b => b.height === expected && Math.abs(b.y - buttons[0].y) < 1) && clearHeight === expected, JSON.stringify({ buttons, clearHeight, expected }));
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  };
  if (width >= 768) {
    verify('no-header', await page.locator('header[aria-label="Notes view"]').count() === 0 && await page.locator('h1').count() === 1 && await page.locator('h1').innerText() === 'Notes');
    const pane = width < 1100 ? editor() : page.getByRole('group', { name: 'Notes navigation', exact: true });
    const [bounds, main] = await Promise.all([pane.boundingBox(), page.locator('main').boundingBox()]);
    verify('pane-top', Math.abs(bounds.y - main.y) <= 12, JSON.stringify({ pane: bounds.y, main: main.y }));
    if (width < 1100) await opener().click();
    await tree().waitFor();
    verify('list-switch', await radio('List').getAttribute('aria-checked') === 'true');
    await audit('column', ['[data-notes-column]']);
    await radio('List').focus(); await page.keyboard.press('ArrowRight');
    await page.getByRole('toolbar', { name: 'Graph controls', exact: true }).waitFor();
    verify('graph-switch', await radio('Graph').getAttribute('aria-checked') === 'true'
      && await radio('Graph').evaluate(el => el === document.activeElement)
      && await page.getByRole('toolbar', { name: 'Graph controls', exact: true }).evaluate(el => el.firstElementChild?.getAttribute('role') === 'radiogroup'));
    await audit('graph-switch', ['[role=radiogroup]']);
    await page.keyboard.press('ArrowLeft');
    if (width < 1100 && !await tree().isVisible()) await opener().click();
    await tree().waitFor();
    if (width >= 1100) verify('list-focus', await radio('List').evaluate(el => el === document.activeElement));
    await tree().getByRole('treeitem', { name: 'Java note', exact: true }).click();
    const openedTitle = await title().inputValue();
    if (width < 1100) {
      verify('note-closes-drawer', await drawer().count() === 0 && await opener().evaluate(el => el === document.activeElement));
      await opener().click();
      const tech = tree().locator('[data-folder-path="Tech"]');
      await tech.click(); // Collapse explicitly; search must not change this saved choice.
      await search().fill('Root');
      await audit('drawer', ['[role=dialog]']);
      await page.keyboard.press('Escape');
      verify('escape-focus', await drawer().count() === 0 && await opener().evaluate(el => el === document.activeElement));
      await opener().click(); verify('drawer-query', await search().inputValue() === 'Root');
      await page.getByRole('button', { name: 'Clear search', exact: true }).click();
      verify('drawer-expansion', await tech.getAttribute('aria-expanded') === 'false');
      await page.keyboard.press('Escape');
    } else {
      await radio('Graph').click(); await radio('List').waitFor(); await radio('List').click();
      verify('switch-keeps-note', await title().inputValue() === openedTitle);
      verify('editor-minimum', (await editor().boundingBox()).width >= 480);
      await page.getByRole('button', { name: 'Minimize folders', exact: true }).click();
      verify('strip-only', !await tree().isVisible() && await page.getByRole('region', { name: 'Notes list', exact: true }).count() === 0);
      const strip = page.getByRole('group', { name: 'Notes shortcuts', exact: true });
      verify('strip-folders', await strip.locator('[data-folder-path]').count() === 8 && await strip.getByRole('button', { name: '2 more folders', exact: true }).innerText() === '+2');
      await audit('strip', ['[aria-label="Notes shortcuts"]']);
      await strip.getByRole('button', { name: 'New note', exact: true }).click();
      verify('strip-new-note', await title().inputValue() === 'Untitled' && await page.getByRole('button', { name: 'Move to folder: Tech/Java', exact: true }).isVisible());
      await strip.getByRole('button', { name: 'New folder', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'New folder', exact: true });
      verify('strip-new-folder', (await dialog.innerText()).includes('In Tech/Java'));
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await strip.getByRole('button', { name: 'Search notes', exact: true }).click();
      verify('strip-search-focus', await search().evaluate(el => el === document.activeElement));
      await page.getByRole('button', { name: 'Minimize folders', exact: true }).click();
      await strip.getByRole('button', { name: 'Open folder Garden', exact: true }).click();
      verify('strip-current-folder', await tree().locator('[data-folder-path="Garden"]').getAttribute('aria-current') === 'true');
    }
  } else {
    await tree().waitFor();
    verify('phone-switch-hidden', await page.getByRole('radiogroup').count() === 0);
    verify('phone-targets', await tree().getByRole('treeitem').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height >= 44)));
    verify('phone-no-drag', await tree().locator('[draggable=true]').count() === 0);
    await audit('phone-column', ['[data-notes-column]']);
    const note = tree().locator('[data-note-id]').last(); await note.scrollIntoViewIfNeeded();
    const position = await tree().evaluate(el => el.scrollTop);
    await note.click(); await title().waitFor();
    verify('phone-editor', !await tree().isVisible());
    const folder = page.getByRole('button', { name: /^Move to folder:/ }); await folder.click();
    await page.getByRole('menuitem', { name: 'Garden', exact: true }).click();
    verify('phone-move', await page.getByRole('button', { name: 'Move to folder: Garden', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Back to notes', exact: true }).click();
    verify('phone-scroll', await tree().isVisible() && Math.abs(await tree().evaluate(el => el.scrollTop) - position) <= 1);
    const folderRow = tree().locator('[data-folder-path="Tech"]');
    await folderRow.getByRole('button', { name: 'Actions for Tech', exact: true }).click();
    verify('phone-actions', await page.getByRole('menuitem', { name: 'Rename folder', exact: true }).isVisible());
    await page.keyboard.press('Escape');
  }
  verify('no-overflow', !await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
}
