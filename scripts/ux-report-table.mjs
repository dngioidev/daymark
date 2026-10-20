#!/usr/bin/env node
/**
 * Builds docs/reports/ux-ui/test-results.md: one row per test case in
 * docs/testing/ux-ui-test-suite.md, merging automated results (results.json) with the
 * manual/native results recorded below.
 */
import fs from 'node:fs';

const suite = fs.readFileSync('docs/testing/ux-ui-test-suite.md', 'utf8');
const auto = JSON.parse(fs.readFileSync('docs/reports/ux-ui/results.json', 'utf8')).results;

// Manual, native-suite and scan-derived results (2026-10-21, Android 16 emulator + scans.json)
const manual = {
  'GL-06': ['warn', 'Both themes readable overall; contrast failures in both (see AX-02)'],
  'GL-08': ['not run', ''],
  'NAV-10': ['warn', 'Badge "4" on Today has no label or tooltip explaining it'],
  'NAV-12': ['pass', 'Native suite: dialog → editor → Today → minimise'],
  'TD-08': ['pass', 'Code review: Clear asks for confirmation (no notes in today\'s sample to clear)'],
  'TD-11': ['not run', ''],
  'HI-05': ['not run', ''],
  'SY-07': ['fail', 'Restoring a 1-task backup on a synced emulator reduced the server from 4 daily notes + 4 notes to 1 + 0'],
  'SY-08': ['fail', 'Every sign-in adds a device; 7 devices incl. duplicates; this device not tagged in the list'],
  'SE-10': ['pass', 'Native suite'],
  'RS-01': ['pass', 'No horizontal scroll on 6 screens x 8 widths (320-1920)'],
  'RS-02': ['pass', 'Phone shell below 768 px, desktop from 768 px'],
  'RS-03': ['fail', 'At 1024 px the navbar clips "Settings" (hidden horizontal scroll)'],
  'RS-04': ['warn', 'Capped at 1800 px, but task rows stretch so actions sit ~1,600 px from titles'],
  'RS-05': ['warn', 'Status chip "Waiting / Dependency" truncated on phones; long note titles ellipsed in desktop list'],
  'AX-01': ['fail', 'axe: button-name (128 nodes), select-name (44), label (40) critical; contrast, target-size, scrollable-region serious'],
  'AX-02': ['fail', '692 low-contrast text nodes across 46 screen/theme scans'],
  'AX-03': ['fail', '1,162 visible text instances at 10-11 px; phone task text mostly 11-12 px'],
  'AX-04': ['fail', '117 distinct phone controls below 44 px; 11 desktop controls below 24 px'],
  'AX-05': ['fail', 'Unnamed icon buttons: "…" (task menu), X (close), month ‹ ›'],
  'AX-08': ['not run', ''],
  'AN-01': ['pass', 'Native suite'],
  'AN-02': ['fail', 'Today and tabs fine; Settings draws white behind light status-bar icons (invisible)'],
  'AN-03': ['pass', 'Quick Capture and note editor stay above the keyboard'],
  'AN-04': ['pass', 'Share sheet opens with the ZIP'],
  'AN-05': ['pass', 'System picker → confirmation → restored'],
  'AN-06': ['pass', 'Native suite (widget add, tick, apply)'],
  'AN-07': ['fail', 'Same as AN-02'],
  'AN-08': ['fail', 'Dismissing the share sheet shows "Failed to export vault as zip."'],
  'AN-09': ['warn', 'Keyboard shows "next" (→|) instead of Done/Go'],
  'DS-01': ['pass', 'TK-08'],
  'DS-02': ['pass', 'NO-09'],
  'DS-03': ['pass', 'TD-08'],
  'DS-04': ['pass', 'SE-05'],
  'DS-05': ['pass', 'SE-04'],
  'DS-06': ['pass', 'SY-06'],
  'DS-07': ['not run', ''],
};

const rows = [];
let area = '';
for (const line of suite.split('\n')) {
  const h = line.match(/^### 4\.\d+ (.*)$/);
  if (h) {
    area = h[1];
    rows.push(`\n#### ${area}\n\n| ID | Test case | P | Result | Notes |\n| :--- | :--- | :---: | :---: | :--- |`);
    continue;
  }
  const m = line.match(/^\| ([A-Z]+-\d+) \| ([^|]+) \|(.*)\| (\d) \|$/);
  if (!m) continue;
  const [, id, title, , p] = m;
  const a = auto.find((r) => r.id === id);
  const [status, notes] = manual[id] || (a ? [a.status, a.details] : ['not run', '']);
  const icon = { pass: '✅ pass', warn: '⚠️ warn', fail: '❌ fail', 'not run': '— not run' }[status] || status;
  rows.push(`| ${id} | ${title.trim()} | ${p} | ${icon} | ${(notes || '').replace(/\|/g, '/')} |`);
}

const all = rows.filter((r) => /^\| [A-Z]+-\d+/.test(r));
const tally = (s) => all.filter((r) => r.includes(s)).length;
const header = `# UX/UI test results

Run 2026-10-21 against Daymark 1.0.0 (production build, sample vault). Automated: \`scripts/ux-suite.mjs\`; native/manual: Android 16 emulator. Suite: [\`docs/testing/ux-ui-test-suite.md\`](../../testing/ux-ui-test-suite.md).

**${all.length} test cases: ${tally('✅')} pass · ${tally('⚠️')} warn · ${tally('❌')} fail · ${tally('— not run')} not run**
`;
fs.writeFileSync('docs/reports/ux-ui/test-results.md', header + rows.join('\n') + '\n');
console.log(header);
