import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fillTemplate, releaseValues, REPO_URL } from './site.mjs';

test('published site serves the rich Notes screenshot and resolves every local image', () => {
  const root = new URL('../../site/', import.meta.url);
  const html = fillTemplate(readFileSync(new URL('index.html', root), 'utf8'), releaseValues(null, '1.6.0'));
  const images = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
  assert.ok(images.includes('screens/notes-rich.png'), 'rich Notes screenshot is visible in the gallery');
  for (const src of images) assert.ok(existsSync(new URL(src, root)), `missing site image: ${src}`);
  assert.deepEqual(readFileSync(new URL('screens/notes-rich.png', root)),
    readFileSync(new URL('../../docs/releases/cycle-9/images/notes-rich.png', import.meta.url)));
});

test('release values come from the latest release and its APK asset', () => {
  const v = releaseValues({
    tag_name: 'v1.4.0', published_at: '2026-10-25T04:00:41Z', html_url: `${REPO_URL}/releases/tag/v1.4.0`,
    assets: [{ name: 'SHA256SUMS', browser_download_url: 'x' }, { name: 'daymark-1.4.0-debug.apk', browser_download_url: `${REPO_URL}/releases/download/v1.4.0/daymark-1.4.0-debug.apk` }],
  }, '0.0.0');
  assert.equal(v.VERSION, '1.4.0');
  assert.equal(v.RELEASE_DATE, 'October 25, 2026');
  assert.match(v.APK_URL, /daymark-1\.4\.0-debug\.apk$/);
  assert.match(v.RELEASE_URL, /tag\/v1\.4\.0$/);
});

test('without a release or an APK the buttons open the release page', () => {
  assert.equal(releaseValues(null, '1.4.0').APK_URL, `${REPO_URL}/releases/latest`);
  assert.equal(releaseValues(null, '1.4.0').VERSION, '1.4.0');
  assert.equal(releaseValues({ tag_name: 'v2.0.0', html_url: 'https://r', assets: [] }, '1').APK_URL, 'https://r');
});

test('fillTemplate fills and escapes placeholders and rejects unknown ones', () => {
  assert.equal(fillTemplate('<a href="{{U}}">{{V}}</a>', { U: 'a"b', V: '<1>' }), '<a href="a&quot;b">&lt;1></a>');
  assert.throws(() => fillTemplate('{{MISSING}}', {}), /MISSING/);
});
