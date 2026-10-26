import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGuide } from './guide-format.mjs';

export function loadGuide(dir) {
  const folder = dir instanceof URL ? fileURLToPath(dir) : dir;
  return readdirSync(folder).filter(name => name.endsWith('.md'))
    .map(name => parseGuide(readFileSync(join(folder, name), 'utf8'), name.slice(0, -3)))
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Guide bodies deliberately use prose paragraphs. Escape first so Markdown source cannot inject HTML.
const paragraphs = text => text.split(/\n\s*\n/).map(part => `<p>${escape(part)}</p>`).join('\n');
export function renderGuidePage(topics) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daymark Guide</title><link rel="icon" href="icon.png"><link rel="stylesheet" href="style.css"></head>
<body><header class="top"><a class="brand" href="index.html">Daymark</a><nav aria-label="Site"><a href="index.html">Home</a><a href="guide.html" aria-current="page">Guide</a></nav></header>
<main class="guide"><h1>Daymark Guide</h1><p>Choose a topic and the instructions for your device.</p>
<div class="guide-switch" role="group" aria-label="Guide platform"><button type="button" data-guide-choice="web">Web</button><button type="button" data-guide-choice="mobile">Mobile</button></div>
<nav class="guide-topics" aria-label="Guide topics">${topics.map(topic => `<a href="#${escape(topic.slug)}">${escape(topic.title)}</a>`).join('\n')}</nav>
${topics.map(topic => `<section id="${escape(topic.slug)}"><h2>${escape(topic.title)}</h2>${['web', 'mobile'].map(platform => `<div data-platform="${platform}"><h3>${platform === 'web' ? 'Web' : 'Mobile'}</h3>${paragraphs(topic[platform])}</div>`).join('\n')}</section>`).join('\n')}
<figure class="guide-shot"><a href="screens/notes-rich.png" data-zoom><img src="screens/notes-rich.png" alt="Rich Notes editor in Daymark" loading="lazy"></a><figcaption>Rich Notes, saved as Markdown</figcaption></figure>
</main><script type="module" src="guide.js"></script><script type="module" src="zoom.js"></script></body></html>`;
}
