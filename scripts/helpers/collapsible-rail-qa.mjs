import fs from 'node:fs';

export async function collapsibleRailQa({ run, fresh, check, TODAY, doc, task, readDocs }) {
  await run('C101-names', async () => {
    const { page } = await fresh({ docs: [doc(TODAY, [task('needs-attention', 'in-progress', '2020-01-01', { carriedFromDate: '2020-01-01' })])] });
    await page.locator('#daymark-rail-attention').waitFor();
    await page.addScriptTag({ content: fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8') });
    for (const collapsed of [false, true]) {
      if (collapsed) await page.getByRole('button', { name: 'Minimize menu', exact: true }).click();
      const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('.dm-side-rail'), { runOnly: { type: 'rule', values: ['label-content-name-mismatch'] } })).violations.map(v => v.nodes.map(n => n.html)));
      check('C101-names', violations.length === 0, `${collapsed ? 'minimized' : 'expanded'} icon names include all visible shortcut and attention text`, JSON.stringify(violations));
    }
  });
  for (const theme of ['light', 'dark']) for (const size of ['S', 'M', 'L']) await run(`C101-${theme}-${size}`, async () => {
    const title = 'Keep content while minimizing';
    const note = { id: 'focus-note', title: 'Focus draft', folder: '', content: 'Keep this paragraph.', tags: [], createdAt: `${TODAY}T09:00:00Z`, updatedAt: `${TODAY}T09:00:00Z` };
    const { page, errors } = await fresh({ docs: [doc(TODAY, [task('rail-content', 'not-started', TODAY, { title })])], notes: [note] });
    const rail = page.getByRole('navigation', { name: 'Main', exact: true });
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    const openSettings = () => rail.getByRole('button', { name: 'Settings', exact: true }).click();
    const closeSettings = () => settings.getByRole('button', { name: 'Close', exact: true }).click();
    await openSettings();
    await settings.getByRole('button', { name: theme === 'dark' ? /Dark$/ : /Light$/ }).click();
    await settings.getByRole('button', { name: size, exact: true }).click();
    await settings.getByRole('button', { name: 'Header colour #1e3a5f', exact: true }).click();
    if (theme === 'dark') await page.getByLabel('Add background photo', { exact: true }).setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: fs.readFileSync('site/icon.png') });
    await closeSettings();
    for (const width of [800, 1440]) for (const side of ['Left', 'Right']) {
      const id = `C101-${theme}-${size}-${width}-${side}`;
      await page.setViewportSize({ width, height: 480 });
      await openSettings();
      await settings.getByRole('button', { name: side, exact: true }).click();
      await closeSettings();
      const expanded = await rail.evaluate(el => ({ width: el.getBoundingClientRect().width, content: document.querySelector('main').getBoundingClientRect().width }));
      await rail.getByRole('button', { name: 'Minimize menu', exact: true }).click();
      const layout = await rail.evaluate(el => {
        const r = el.getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect();
        return { width: r.width, content: m.width, overlap: Math.max(0, Math.min(r.right, m.right) - Math.max(r.left, m.left)), overflow: document.documentElement.scrollWidth - innerWidth, parts: el.children.length };
      });
      check(id, expanded.width === 168 && layout.width === 64 && layout.content - expanded.content === 104 && layout.overlap <= 1 && layout.overflow <= 1 && layout.parts === 6, 'minimized rail reclaims 104 physical pixels without overlap', JSON.stringify({ expanded, layout }));
      for (const label of ['Expand menu', 'Sync:', 'New task', 'Search (Ctrl Shift F)']) {
        await rail.getByRole('button', { name: 'Today', exact: true }).focus();
        const button = rail.getByRole('button', { name: label === 'Sync:' ? /^Sync:/ : label, exact: label !== 'Sync:' });
        await button.focus();
        const target = await button.evaluate(el => { const r = el.getBoundingClientRect(); return { y: r.y, bottom: r.bottom, w: r.width, h: r.height, focus: document.activeElement === el }; });
        const tooltip = page.getByRole('tooltip');
        check(id, target.focus && target.y >= 0 && target.bottom <= 480 && target.w >= 24 && target.h >= 24 && await tooltip.isVisible(), `${label} stays reachable with a keyboard tooltip in a short window`, JSON.stringify(target));
        await page.keyboard.press('Escape');
        check(id, await tooltip.count() === 0 && await button.evaluate(el => document.activeElement === el), 'Escape dismisses the tooltip without moving focus');
      }
      await page.mouse.move(width / 2, 300);
      await rail.getByRole('button', { name: 'Today', exact: true }).hover();
      check(id, await page.getByRole('tooltip').textContent() === 'Today', 'navigation label appears on hover');
      await rail.getByRole('button', { name: 'Expand menu', exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await rail.getByRole('button', { name: 'Minimize menu', exact: true }).click();
    await rail.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('button', { name: /Focus draft/ }).click();
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
    await rail.waitFor({ state: 'hidden' });
    check(`C101-${theme}-${size}`, await rail.count() === 0 && await page.locator('.ProseMirror').textContent() === note.content, 'Notes focus hides the rail and keeps content');
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
    check(`C101-${theme}-${size}`, await rail.getAttribute('data-collapsed') === 'true' && await rail.getAttribute('data-side') === 'right', 'leaving Notes focus restores minimized width and side');
    await page.reload({ waitUntil: 'networkidle' });
    await rail.getByRole('button', { name: 'Expand menu', exact: true }).waitFor();
    const savedDocs = await readDocs(page);
    check(`C101-${theme}-${size}`, savedDocs.find(d => d.date === TODAY).headings.flatMap(h => h.items).some(t => t.title === title), 'minimized preference survives reload without changing task content');
    await rail.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByRole('dialog', { name: /New task/ }).waitFor();
    await page.keyboard.press('Escape');
    await rail.getByRole('button', { name: 'Search (Ctrl Shift F)', exact: true }).click();
    await page.getByRole('dialog', { name: /Search/ }).waitFor();
    await page.keyboard.press('Escape');
    await rail.getByRole('button', { name: /^Sync:/ }).click();
    await settings.getByRole('tab', { name: 'Sync', exact: true }).waitFor();
    check(`C101-${theme}-${size}`, errors.length === 0, 'compact actions open their dialogs without browser errors', errors.join('; '));
  });
}
