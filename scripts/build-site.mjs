/**
 * Builds the GitHub Pages site into _site/: copies site/ and fills the latest release
 * (version, date, release notes and APK links) from the GitHub API.
 * Usage: node scripts/build-site.mjs   (set GITHUB_TOKEN to avoid API rate limits)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fillTemplate, releaseValues, REPO } from './helpers/site.mjs';

const out = path.resolve('_site');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.resolve('site'), out, { recursive: true });

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
let release = null;
try {
  // A release event names its own tag; "latest" can still point at the previous release for a few seconds
  const tag = process.env.RELEASE_TAG;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/${tag ? `tags/${encodeURIComponent(tag)}` : 'latest'}`, {
    headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
  });
  if (res.ok) release = await res.json();
  else console.warn(`No latest release (${res.status}); using package version ${version}.`);
} catch (err) {
  console.warn(`Could not reach GitHub (${err.message}); using package version ${version}.`);
}

const values = releaseValues(release, version);
const index = path.join(out, 'index.html');
fs.writeFileSync(index, fillTemplate(fs.readFileSync(index, 'utf8'), values));
console.log(`Built _site for Daymark ${values.VERSION} (APK: ${values.APK_URL})`);
