import type { GuideTopic } from './guideData';

/** A few everyday words people type for features named differently in the guide. */
const SYNONYMS: Record<string, string[]> = {
  link: ['linking', 'links', 'connect', 'connections'],
  eraser: ['erase', 'pen'],
  tag: ['tags', '#'],
  backup: ['backups', 'restore'],
  shortcut: ['shortcuts', 'keyboard', 'keys'],
};
const WEIGHTS = { title: 3, summary: 2, body: 1 } as const;
const words = (text: string): string[] => text.toLocaleLowerCase().split(/[^\p{L}\p{N}#]+/u).filter(Boolean);
const variants = (word: string): string[] => {
  const stem = word.replace(/s$/, '');
  return [...new Set([word, stem, ...(SYNONYMS[word] ?? []), ...(SYNONYMS[stem] ?? [])])];
};

const index = new WeakMap<GuideTopic, Record<keyof typeof WEIGHTS, string[]>>();
function fields(topic: GuideTopic) {
  let value = index.get(topic);
  if (!value) index.set(topic, value = { title: words(topic.title), summary: words(topic.summary), body: words(`${topic.web} ${topic.tablet} ${topic.phone}`) });
  return value;
}

/** Word-prefix search over title (3), summary (2) and steps (1). Every query word
 * (or one of its variants) must match somewhere; ties keep guide order. */
export function searchGuide(topics: readonly GuideTopic[], query: string): GuideTopic[] {
  const terms = words(query);
  if (!terms.length) return [...topics];
  return topics.flatMap(topic => {
    const f = fields(topic);
    let score = 0;
    for (const term of terms) {
      let best = 0;
      for (const variant of variants(term)) for (const field of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
        if (f[field].some(word => word.startsWith(variant))) best = Math.max(best, WEIGHTS[field]);
      }
      if (!best) return [];
      score += best;
    }
    return [{ topic, score }];
  }).sort((a, b) => b.score - a.score || a.topic.order - b.topic.order).map(entry => entry.topic);
}
