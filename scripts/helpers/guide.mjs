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
const IMAGE = /^!\[([^\]]*)\]\(images\/([\w.-]+\.png)\)$/;

/** File names of the screenshots a guide section references (`![alt](images/name.png)`). */
export function guideImages(text) {
  return text.split('\n').flatMap(line => IMAGE.exec(line.trim())?.[2] ?? []);
}

// Escape first so Markdown source cannot inject HTML; then a small, fixed subset:
// paragraphs, numbered and bulleted lists, pipe tables, screenshots, **bold** and `code`.
const inline = text => escape(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
function block(part) {
  const lines = part.split('\n').map(line => line.trim()).filter(Boolean);
  const image = lines.length === 1 ? IMAGE.exec(lines[0]) : null;
  if (image) return `<figure class="guide-shot"><a href="guide-images/${escape(image[2])}" data-zoom><img src="guide-images/${escape(image[2])}" alt="${escape(image[1])}" loading="lazy"></a></figure>`;
  if (lines.every(line => /^\d+\. /.test(line))) return `<ol>${lines.map(line => `<li>${inline(line.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
  if (lines.every(line => line.startsWith('- '))) return `<ul>${lines.map(line => `<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
  if (lines.every(line => line.startsWith('|'))) {
    const rows = lines.filter(line => !/^\|[\s:|-]+\|$/.test(line)).map(line => line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()));
    const [head, ...body] = rows;
    return `<table><thead><tr>${head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  return `<p>${inline(lines.join(' '))}</p>`;
}
const blocks = text => text.split(/\n\s*\n/).filter(part => part.trim()).map(block).join('\n');
const PLATFORMS = [['web', 'Web'], ['tablet', 'Tablet'], ['phone', 'Phone']];
const GROUPS = [['start', 'Start here'], ['features', 'Features']];

export function renderGuidePage(topics) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daymark Guide</title><link rel="icon" href="icon.png"><link rel="stylesheet" href="style.css"></head>
<body><header class="top"><a class="brand" href="index.html">Daymark</a><nav aria-label="Site"><a href="index.html">Home</a><a href="guide.html" aria-current="page">Guide</a></nav></header>
<main class="guide"><h1>Daymark Guide</h1><p>Choose a topic and the instructions for your device.</p>
<div class="guide-switch" role="group" aria-label="Guide platform">${PLATFORMS.map(([id, label]) => `<button type="button" data-guide-choice="${id}">${label}</button>`).join('')}</div>
${GROUPS.map(([group, label]) => `<nav class="guide-topics" aria-label="${label}"><strong>${label}</strong> ${topics.filter(topic => topic.group === group).map(topic => `<a href="#${escape(topic.slug)}">${escape(topic.title)}</a>`).join('\n')}</nav>`).join('\n')}
${topics.map(topic => `<section id="${escape(topic.slug)}"><h2>${escape(topic.title)}</h2><p class="guide-summary">${inline(topic.summary)}</p>${PLATFORMS.map(([id, label]) => `<div data-platform="${id}"><h3>${label}</h3>${blocks(topic[id])}</div>`).join('\n')}</section>`).join('\n')}
</main><script type="module" src="guide.js"></script><script type="module" src="zoom.js"></script></body></html>`;
}
