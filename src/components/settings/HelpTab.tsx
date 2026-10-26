import React, { useState } from 'react';
import type { AppMode } from '../../types/daymark';
import { GUIDE_TOPICS } from '../../utils/guideData';
import { MarkdownPreview } from '../MarkdownPreview';

export function HelpTab({ appMode }: { appMode?: AppMode }) {
  const [platform, setPlatform] = useState<'web' | 'mobile'>(() =>
    appMode === 'mobile-app' || (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches) ? 'mobile' : 'web');
  const [slug, setSlug] = useState(GUIDE_TOPICS[0].slug);
  const topic = GUIDE_TOPICS.find(item => item.slug === slug) ?? GUIDE_TOPICS[0];
  const button = 'min-h-11 px-3 py-2 rounded-lg text-left border border-stone-200 dark:border-stone-700';
  return <div className="space-y-4">
    <div role="group" aria-label="Guide platform" className="flex gap-2">
      {(['web', 'mobile'] as const).map(part => <button type="button" key={part} aria-pressed={platform === part} onClick={() => setPlatform(part)} className={`${button} ${platform === part ? 'bg-stone-200 dark:bg-stone-700 font-semibold' : ''}`}>{part === 'web' ? 'Web' : 'Mobile'}</button>)}
    </div>
    <label className="block sm:hidden">Topic
      <select aria-label="Help topic" value={slug} onChange={event => setSlug(event.target.value)} className="mt-1 w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900">
        {GUIDE_TOPICS.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}
      </select>
    </label>
    <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Help topics" className="hidden sm:flex flex-col gap-1">
        {GUIDE_TOPICS.map(item => <button type="button" key={item.slug} aria-current={slug === item.slug ? 'true' : undefined} onClick={() => setSlug(item.slug)} className={`${button} ${slug === item.slug ? 'bg-stone-100 dark:bg-stone-800 font-semibold' : ''}`}>{item.title}</button>)}
      </nav>
      <article className="min-w-0" aria-label={topic.title}>
        <h3 className="text-lg font-semibold mb-3">{topic.title}</h3>
        <MarkdownPreview content={topic[platform]} />
      </article>
    </div>
  </div>;
}
