import React, { useMemo, useState } from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import type { AppMode } from '../../types/daymark';
import { GUIDE_IMAGES, GUIDE_TOPICS, type GuideTopic, type ShowMeTarget } from '../../utils/guideData';
import { searchGuide } from '../../utils/guideSearch';
import { MarkdownPreview } from '../MarkdownPreview';
import { Dialog, buttonClass } from '../ui/Dialog';

export type HelpPlatform = 'web' | 'tablet' | 'phone';
const PLATFORMS: [HelpPlatform, string][] = [['web', 'Web'], ['tablet', 'Tablet'], ['phone', 'Phone']];
const GROUPS: [GuideTopic['group'], string][] = [['start', 'Start here'], ['features', 'Features']];
const IMAGE = /^!\[([^\]]*)\]\(images\/([\w.-]+\.png)\)$/;

export interface HelpViewProps {
  topic: string;
  appMode?: AppMode;
  onTopicChange(slug: string): void;
  onClose(): void;
  onShowMe(target: ShowMeTarget): void;
}

const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;

/** Phone below 768 px; Tablet for the Android app or a touch-first screen; Web otherwise. */
function defaultPlatform(appMode?: AppMode): HelpPlatform {
  if (narrow()) return 'phone';
  if (appMode === 'mobile-app' || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)) return 'tablet';
  return 'web';
}

/** A screenshot line becomes a light/dark image pair; everything else is Markdown. */
function Section({ text, topic }: { text: string; topic: GuideTopic }) {
  const parts = text.split(/\n\s*\n/);
  return <>{parts.map((part, i) => {
    const image = IMAGE.exec(part.trim());
    if (!image) return <MarkdownPreview key={i} content={part} />;
    const [, alt, name] = image, dark = GUIDE_IMAGES[name.replace(/\.png$/, '-dark.png')];
    return <figure key={i} className="my-4">
      <img src={GUIDE_IMAGES[name]} alt={alt} loading="lazy" className={`w-full max-w-3xl rounded-lg border border-stone-200 dark:border-stone-700 ${dark ? 'dark:hidden' : ''}`} />
      {dark && <img src={dark} alt={alt} loading="lazy" className="hidden dark:block w-full max-w-3xl rounded-lg border border-stone-700" />}
      <figcaption className="sr-only">{topic.title}</figcaption>
    </figure>;
  })}</>;
}

/** Full-size Help built from docs/guide: search, platform switch, grouped topics and an article. */
export function HelpView({ topic: slug, appMode, onTopicChange, onClose, onShowMe }: HelpViewProps) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<HelpPlatform>(() => defaultPlatform(appMode));
  // Phones show the topic list first unless Help was opened at a specific topic.
  const [listOnly, setListOnly] = useState(() => narrow() && slug === GUIDE_TOPICS[0].slug);
  const topic = GUIDE_TOPICS.find(item => item.slug === slug) ?? GUIDE_TOPICS[0];
  const results = useMemo(() => searchGuide(GUIDE_TOPICS, query), [query]);
  const phone = narrow();
  const choose = (next: string) => { onTopicChange(next); setListOnly(false); };
  const topicButton = (item: GuideTopic) => <li key={item.slug}><button type="button" aria-current={item.slug === topic.slug ? 'page' : undefined} onClick={() => choose(item.slug)}
    className={`min-h-11 w-full px-3 rounded-lg text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 ${item.slug === topic.slug ? 'bg-stone-200 dark:bg-stone-700 font-semibold' : ''}`}>{item.title}</button></li>;
  const nav = <nav aria-label="Help topics" className="min-h-0 overflow-y-auto">
    {/* Searching shows one list in best-match order; otherwise the two guide groups. */}
    {query.trim() ? results.length > 0 && <section className="mb-3"><h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Results</h3><ul>{results.map(topicButton)}</ul></section> : GROUPS.map(([group, label]) => {
      const items = results.filter(item => item.group === group);
      return items.length ? <section key={group} className="mb-3"><h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</h3><ul>{items.map(topicButton)}</ul></section> : null;
    })}
    {!results.length && <p className="px-3 py-2 text-sm text-stone-600 dark:text-stone-400">No topics match “{query.trim()}”.</p>}
  </nav>;
  const related = topic.related.flatMap(other => GUIDE_TOPICS.find(item => item.slug === other) ?? []);
  const article = <article aria-label={topic.title} className="min-h-0 min-w-0 overflow-y-auto">
    <div className="max-w-3xl">
      {phone && <button type="button" className={`${buttonClass.ghost} mb-2 -ml-3`} onClick={() => setListOnly(true)}><ChevronLeft className="w-4 h-4" aria-hidden="true" />All topics</button>}
      <h2 className="text-2xl font-bold">{topic.title}</h2>
      <p className="mt-1 text-base text-stone-600 dark:text-stone-300">{topic.summary}</p>
      {topic.show && <button type="button" className={`${buttonClass.primary} mt-3`} onClick={() => onShowMe(topic.show!)}>Show me</button>}
      <div className="mt-4"><Section text={topic[platform]} topic={topic} /></div>
      {related.length > 0 && <div role="group" aria-label="Related topics" className="mt-6 flex flex-wrap items-center gap-2 border-t border-stone-200 dark:border-stone-800 pt-4">
        <span className="text-sm text-stone-600 dark:text-stone-400">See also</span>
        {related.map(item => <button key={item.slug} type="button" className={buttonClass.secondary} onClick={() => choose(item.slug)}>{item.title}</button>)}
      </div>}
    </div>
  </article>;
  return <Dialog isOpen onClose={onClose} title="Help" variant="fullscreen">
    <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-3 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" aria-hidden="true" />
          <input type="search" aria-label="Search help" placeholder="Search help, e.g. tags, link notes, eraser" value={query} data-autofocus=""
            onChange={event => { setQuery(event.target.value); if (phone) setListOnly(true); }}
            className="w-full min-h-11 pl-9 pr-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800" />
        </label>
        <div role="group" aria-label="Help platform" className="inline-flex rounded-lg ring-1 ring-inset ring-stone-300 dark:ring-stone-700">
          {PLATFORMS.map(([id, label]) => <button key={id} type="button" aria-pressed={platform === id} onClick={() => setPlatform(id)}
            className={`min-h-11 px-3 rounded-lg text-sm ${platform === id ? 'bg-stone-200 dark:bg-stone-700 font-semibold' : ''}`}>{label}</button>)}
        </div>
      </div>
      {phone ? (listOnly ? nav : article) : <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)] gap-6">{nav}{article}</div>}
    </div>
  </Dialog>;
}
