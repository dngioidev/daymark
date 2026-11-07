/** Help "Show me" targets, shared by the guide parser and the app. */
export const SHOW_ME_TARGETS = ['today', 'quick-capture', 'calendar', 'backlog', 'notes', 'notes-tags', 'notes-graph', 'search',
  'settings-appearance', 'settings-sync', 'settings-storage', 'settings-widget'];
export const GUIDE_GROUPS = ['start', 'features'];
export const SUMMARY_MAX = 160;

/** Parse the shared source without filesystem APIs so Vite can bundle it offline.
 * Front matter: title, order, group (start | features), summary, optional show
 * (a SHOW_ME_TARGETS entry) and related (comma-separated slugs). Body: `## Web`,
 * optional `## Tablet` (falls back to Phone) and `## Phone`. */
export function parseGuide(raw, slug) {
  const text = raw.replace(/\r\n/g, '\n');
  const metadata = text.match(/^---\n([\s\S]*?)\n---\n/);
  const field = name => metadata?.[1].match(new RegExp(`^${name}:\s*(.*)$`, 'm'))?.[1].trim();
  const title = field('title');
  const order = Number(field('order'));
  if (!title || !Number.isFinite(order)) throw new Error(`${slug}: missing title or order`);
  const group = field('group');
  if (!GUIDE_GROUPS.includes(group)) throw new Error(`${slug}: group must be one of ${GUIDE_GROUPS.join(', ')}`);
  const summary = field('summary');
  if (!summary) throw new Error(`${slug}: missing summary`);
  if (summary.length > SUMMARY_MAX) throw new Error(`${slug}: summary longer than ${SUMMARY_MAX} characters`);
  const show = field('show') || undefined;
  if (show && !SHOW_ME_TARGETS.includes(show)) throw new Error(`${slug}: unknown show target ${show}`);
  const related = (field('related') ?? '').split(',').map(part => part.trim()).filter(Boolean);
  const body = text.slice(metadata[0].length);
  const sections = {};
  for (const match of body.matchAll(/^## (Web|Tablet|Phone)[ \t]*\n([\s\S]*?)(?=^## (?:Web|Tablet|Phone)[ \t]*$|(?![\s\S]))/gm)) sections[match[1].toLowerCase()] = match[2].trim();
  for (const name of ['Web', 'Phone']) if (!sections[name.toLowerCase()]) throw new Error(`${slug}: missing or empty ${name} section`);
  return { slug, title, order, group, summary, show, related, web: sections.web, tablet: sections.tablet || sections.phone, phone: sections.phone };
}
