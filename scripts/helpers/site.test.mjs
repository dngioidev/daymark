import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate, releaseValues, REPO_URL } from './site.mjs';

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
