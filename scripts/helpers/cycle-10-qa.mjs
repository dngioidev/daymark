import fs from 'node:fs';
import path from 'node:path';
import { collapsibleRailQa } from './collapsible-rail-qa.mjs';

/** Cycle-specific browser cases, shared by the main QA runner without a second server. */
export async function cycle10Qa({ run, fresh, check, TODAY, day, doc, task, readDocs }) {
  await collapsibleRailQa({ run, fresh, check, TODAY, doc, task, readDocs });
  const navigate = (page, name) => page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name, exact: true }).click();
  const row = (page, title) => page.locator('li').filter({ has: page.getByText(title, { exact: true }) });
  const capture = async (page, title, category) => {
    await page.keyboard.press('Control+k');
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Backlog', exact: true }).click();
    await modal.getByLabel('Task', { exact: true }).fill(title);
    await modal.getByLabel('Category (optional)', { exact: true }).fill(category);
    await modal.getByRole('button', { name: 'Add task', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
  };

  await run('C10-B1', async () => {
    const { page } = await fresh({ docs: [doc(TODAY, [task('existing', 'not-started', TODAY)])] });
    await capture(page, 'Reuse category idea', ' work ');
    await capture(page, 'New category idea', 'Garden');
    let docs = await readDocs(page);
    check('C10-B1', docs.flatMap(d => d.headings.flatMap(h => h.items)).length === 1, 'undated ideas do not enter daily documents or counts');
    const counts = await page.getByRole('complementary', { name: 'Day at a glance' }).locator('dl > div').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.querySelector('dt').textContent, Number(node.querySelector('dd').textContent)])));
    check('C10-B1', counts.Open === 1 && counts.Done === 0 && counts.Old === 0 && await page.getByText('Reuse category idea', { exact: true }).count() === 0, 'backlog absent from Today, day totals and old-task alert count');
    await navigate(page, 'Calendar');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    check('C10-B1', await page.getByText('Reuse category idea', { exact: true }).count() === 0, 'backlog absent from Calendar week');
    await navigate(page, 'Backlog');
    await row(page, 'Reuse category idea').getByRole('button', { name: 'Add to day', exact: true }).click();
    await page.getByText('Reuse category idea', { exact: true }).waitFor({ state: 'detached' });
    docs = await readDocs(page);
    const today = docs.find(d => d.date === TODAY);
    check('C10-B1', today.headings.filter(h => h.name.toLowerCase() === 'work').length === 1 && today.headings.find(h => h.name === 'Work').items.some(t => t.title === 'Reuse category idea'), 'pick reuses the matching section spelling');
    await row(page, 'New category idea').getByLabel('Pick a day').fill(day(1));
    await row(page, 'New category idea').getByRole('button', { name: 'Add to day', exact: true }).click();
    await page.getByText('New category idea', { exact: true }).waitFor({ state: 'detached' });
    docs = await readDocs(page);
    check('C10-B1', docs.find(d => d.date === day(1))?.headings.some(h => h.name === 'Garden' && h.items.some(t => t.title === 'New category idea')), 'pick creates category section on a future day');
  });

  for (const mobile of [false, true]) await run(mobile ? 'C10-S2' : 'C10-S1', async () => {
    const id = mobile ? 'C10-S2' : 'C10-S1';
    const { page } = await fresh({ mobile, docs: [doc(TODAY, [task('section', 'not-started', TODAY)])] });
    const menu = () => page.getByRole('button', { name: 'More actions for "Task section"', exact: true }).click();
    await menu();
    await page.getByRole('menuitem', { name: 'Move to section…', exact: true }).click();
    let modal = page.getByRole('dialog', { name: 'Move to section…', exact: true });
    await modal.getByRole('button', { name: 'Ideas', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    let docs = await readDocs(page);
    check(id, docs.find(d => d.date === TODAY).headings.find(h => h.name === 'Ideas').items.some(t => t.id === 'section'), `${mobile ? 'phone sheet' : 'desktop menu'} moves to existing section`);
    await menu();
    await page.getByRole('menuitem', { name: 'Move to section…', exact: true }).click();
    modal = page.getByRole('dialog', { name: 'Move to section…', exact: true });
    await modal.getByLabel('New section', { exact: true }).fill('Follow up');
    await modal.getByLabel('New section', { exact: true }).press('Enter');
    await modal.waitFor({ state: 'detached' });
    docs = await readDocs(page);
    const moved = docs.find(d => d.date === TODAY).headings.find(h => h.name === 'Follow up')?.items.find(t => t.id === 'section');
    check(id, !!moved && moved.historyLog.some(h => h.details === 'Moved to Follow up'), 'new section preserves task id and records history');
    await menu();
    await page.getByRole('menuitem', { name: 'Move to backlog', exact: true }).click();
    await page.getByText('Task section', { exact: true }).waitFor({ state: 'detached' });
    if (mobile) await page.getByRole('navigation').getByRole('button', { name: 'Backlog', exact: true }).click();
    else await navigate(page, 'Backlog');
    await row(page, 'Task section').getByRole('button', { name: 'Add to day', exact: true }).click();
    docs = await readDocs(page);
    check(id, docs.find(d => d.date === TODAY).headings.flatMap(h => h.items).filter(t => t.id === 'section').length === 1, 'day to backlog to day preserves one task');
  });

  await run('C10-H1', async () => {
    const { page } = await fresh();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Help', exact: true }).click();
    const article = page.getByRole('article', { name: 'Getting started and install' });
    await article.waitFor();
    const web = await article.textContent();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    check('C10-H1', web.includes('Open your Daymark server') && (await article.textContent()).includes('Download the Android APK'), 'Help switches Web and Mobile instructions');
    // Give the static site its own browsing context: the app's navigation fallback SW must not intercept this fixture.
    const sitePage = await page.context().browser().newPage({ serviceWorkers: 'block' });
    const root = path.resolve('_site');
    await sitePage.route('**/__cycle10site/**', async route => {
      const relative = new URL(route.request().url()).pathname.split('/__cycle10site/')[1] || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403, body: '' });
      const contentType = ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ body: fs.readFileSync(file), contentType });
    });
    const origin = new URL(page.url()).origin;
    await sitePage.goto(origin + '/__cycle10site/index.html');
    const opener = sitePage.locator('a[data-zoom]').first();
    await opener.click();
    const modal = sitePage.getByRole('dialog', { name: 'Screenshot viewer' });
    await modal.waitFor();
    await sitePage.keyboard.press('Escape');
    check('C10-H1', !(await modal.isVisible()) && await opener.evaluate(el => el === document.activeElement), 'built site screenshot lightbox closes and returns focus');
  });
}
