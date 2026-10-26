import { parseGuide } from '../../scripts/helpers/guide-format.mjs';

// Vite imports the canonical Markdown at build time; no runtime request is needed.
const sources = import.meta.glob('../../docs/guide/*.md', { query: '?raw', import: 'default', eager: true });
export const GUIDE_TOPICS = Object.entries(sources)
  .map(([path, raw]) => parseGuide(String(raw), path.split('/').at(-1)!.replace(/\.md$/, '')))
  .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
