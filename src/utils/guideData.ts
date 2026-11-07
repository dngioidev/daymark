import { parseGuide, SHOW_ME_TARGETS } from '../../scripts/helpers/guide-format.mjs';

/** Where Help's Show me can take you. Kept equal to SHOW_ME_TARGETS (guide-format.mjs) by a test. */
export const SHOW_ME: readonly ShowMeTarget[] = SHOW_ME_TARGETS as ShowMeTarget[];
export type ShowMeTarget = 'today' | 'quick-capture' | 'calendar' | 'backlog' | 'notes' | 'notes-tags' | 'notes-graph' | 'search'
  | 'settings-appearance' | 'settings-sync' | 'settings-storage' | 'settings-widget';
export interface GuideTopic {
  slug: string; title: string; order: number; group: 'start' | 'features'; summary: string;
  show?: ShowMeTarget; related: string[]; web: string; tablet: string; phone: string;
}

// Vite imports the canonical Markdown and screenshots at build time; no runtime request is needed.
const sources = import.meta.glob('../../docs/guide/*.md', { query: '?raw', import: 'default', eager: true });
export const GUIDE_TOPICS: GuideTopic[] = Object.entries(sources)
  .map(([path, raw]) => parseGuide(String(raw), path.split('/').at(-1)!.replace(/\.md$/, '')) as GuideTopic)
  .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
const images = import.meta.glob('../../docs/guide/images/*.png', { query: '?url', import: 'default', eager: true });
/** Screenshot URL by file name, e.g. `tags.png` and its optional `tags-dark.png`. */
export const GUIDE_IMAGES: Record<string, string> = Object.fromEntries(Object.entries(images).map(([path, url]) => [path.split('/').at(-1)!, String(url)]));
