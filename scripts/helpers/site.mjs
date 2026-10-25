/** Pure helpers for the GitHub Pages site (scripts/build-site.mjs). */

export const REPO = 'dngioidev/daymark';
export const REPO_URL = `https://github.com/${REPO}`;

/** Site values from a GitHub "latest release" API response, or from the package version when there is none. */
export function releaseValues(release, fallbackVersion) {
  const latest = `${REPO_URL}/releases/latest`;
  if (!release?.tag_name) {
    return { VERSION: fallbackVersion, RELEASE_DATE: 'recently', RELEASE_URL: latest, APK_URL: latest, REPO_URL };
  }
  const apk = (release.assets ?? []).find((asset) => asset.name?.endsWith('.apk'));
  const date = release.published_at ? new Date(release.published_at) : null;
  return {
    VERSION: release.tag_name.replace(/^v/, ''),
    RELEASE_DATE: date ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'recently',
    RELEASE_URL: release.html_url || latest,
    // The download button points at the release asset; without one it opens the release page
    APK_URL: apk?.browser_download_url || release.html_url || latest,
    REPO_URL,
  };
}

/** Replaces every {{KEY}} placeholder; unknown placeholders are an error so none ship unfilled. */
export function fillTemplate(html, values) {
  const filled = html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`No value for ${match}`);
    return String(values[key]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  });
  return filled;
}
