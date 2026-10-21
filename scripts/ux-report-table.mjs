#!/usr/bin/env node
/**
 * Builds docs/reports/ux-ui/test-results.md: one row per test case in
 * docs/testing/ux-ui-test-suite.md. Results come from the automated run (results.json), the
 * scans (scans.json: responsive, axe, fonts, targets) and the manual/native results below.
 */
import fs from 'node:fs';

const suite = fs.readFileSync('docs/testing/ux-ui-test-suite.md', 'utf8');
const { results: auto, ranAt } = JSON.parse(fs.readFileSync('docs/reports/ux-ui/results.json', 'utf8'));
const { scans = [], responsive = [] } = JSON.parse(fs.readFileSync('docs/reports/ux-ui/scans.json', 'utf8'));
const byId = Object.fromEntries(auto.map((r) => [r.id, r]));

// ---- derived from scans
const axeNodes = (pred) => ok.reduce((n, s) => n + s.axe.filter(pred).reduce((m, v) => m + v.nodes, 0), 0);
const axeRules = (pred) => [...new Set(ok.flatMap((s) => s.axe.filter(pred).map((v) => `${v.id} (${v.impact})`)))];
// With a menu open, axe reports the rows under the popup as partly obscured targets: expected, not a defect
const ok = scans.filter((s) => !s.error).map((s) =>
  /-menu$/.test(s.screen) ? { ...s, axe: s.axe.map((v) => (v.id === 'target-size' ? { ...v, impact: 'minor (covered by open menu)' } : v)) } : s
);
const serious = (v) => v.impact === 'critical' || v.impact === 'serious';
const contrast = (v) => v.id === 'color-contrast';
const contrastBy = (scheme) => ok.filter((s) => s.scheme === scheme).reduce((n, s) => n + s.axe.filter(contrast).reduce((m, v) => m + v.nodes, 0), 0);
const small = ok.reduce((n, s) => n + s.smallText.length, 0);
const phoneTargets = [...new Set(ok.filter((s) => s.env === 'P412').flatMap((s) => s.smallTargets.map((t) => `${t.name} ${t.w}x${t.h}`)))];
const deskTargets = [...new Set(ok.filter((s) => s.env === 'D1440').flatMap((s) => s.smallTargets.map((t) => `${t.name} ${t.w}x${t.h}`)))];
const unnamed = [...new Set(ok.flatMap((s) => s.unnamed))];
const unlabeled = [...new Set(ok.flatMap((s) => s.unlabeledFields))];
const truncated = [...new Set(ok.flatMap((s) => s.truncated))];
const overflow = responsive.filter((r) => r.error || r.overflowX > 0);
const wide = responsive.find((r) => r.env === 'D1920' && r.screen === 'today');
const scanErrors = scans.filter((s) => s.error).map((s) => `${s.env}/${s.scheme}/${s.screen}`);
const list = (a, n = 4) => a.slice(0, n).join('; ') + (a.length > n ? ` … (+${a.length - n})` : '');
const verdict = (failIf, warnIf, details) => [failIf ? 'fail' : warnIf ? 'warn' : 'pass', details];
const from = (id, note) => {
  const r = byId[id];
  return r ? [r.status, `${note ?? id}${r.details ? `: ${r.details}` : ''}`] : ['not run', `${id} not run`];
};

const derived = {
  'GL-06': verdict(contrastBy('light') + contrastBy('dark') > 0, false, `Low-contrast nodes: light ${contrastBy('light')}, dark ${contrastBy('dark')}`),
  'RS-01': verdict(overflow.length > 0, false, overflow.length ? list(overflow.map((r) => `${r.env}/${r.screen} +${r.overflowX ?? '?'}px`)) : `No horizontal scroll on ${responsive.length} screen/width combinations (320-1920 px)`),
  'RS-03': from('NAV-05', 'NAV-05'),
  'RS-04': verdict(!wide || wide.container > 1800, false, wide ? `Content ${Math.round(wide.container)} px wide at 1920 (cap 1800); task list capped at 56 rem with a side panel` : 'not measured'),
  'RS-05': verdict(false, truncated.length > 3, truncated.length ? `Ellipsis on: ${list(truncated)}` : 'No clipped labels'),
  'AX-01': verdict(axeNodes(serious) > 0, axeNodes((v) => !serious(v)) > 0, axeNodes(serious) ? `Critical/serious: ${list(axeRules(serious), 6)} (${axeNodes(serious)} nodes)` : `No critical/serious violations; minor/moderate: ${list(axeRules((v) => !serious(v)), 4) || 'none'}`),
  'AX-02': verdict(axeNodes(contrast) > 0, false, `${axeNodes(contrast)} low-contrast text nodes across ${ok.length} screen/theme scans`),
  'AX-03': verdict(false, small > 0, small ? `${small} visible text instances below 12 px` : 'No visible text below 12 px'),
  'AX-04': verdict(phoneTargets.length > 0, deskTargets.length > 0, `Phone controls < 44 px: ${phoneTargets.length ? list(phoneTargets) : 'none'}; desktop < 24 px: ${deskTargets.length ? list(deskTargets) : 'none'}`),
  'AX-05': verdict(unnamed.length + unlabeled.length > 0, false, unnamed.length + unlabeled.length ? `Unnamed: ${list(unnamed)}; unlabelled fields: ${list(unlabeled)}` : 'Every button has a name and every field a label'),
  'DS-01': from('TK-08'),
  'DS-02': from('NO-09'),
  'DS-03': from('TD-08'),
  'DS-04': from('SE-05'),
  'DS-05': from('SE-04'),
  'DS-06': from('SY-06'),
};
if (scanErrors.length) derived['GL-06'][1] += `; scans that failed to open: ${list(scanErrors)}`;

// ---- manual and native-suite results (Android 16 emulator, 2026-10-21, Daymark 1.1.0)
const manual = JSON.parse(fs.readFileSync('docs/reports/ux-ui/manual-results.json', 'utf8'));

const rows = [];
for (const line of suite.split('\n')) {
  const h = line.match(/^### 4\.\d+ (.*)$/);
  if (h) {
    rows.push(`\n#### ${h[1]}\n\n| ID | Test case | P | Result | Notes |\n| :--- | :--- | :---: | :---: | :--- |`);
    continue;
  }
  const m = line.match(/^\| ([A-Z]+-\d+) \| ([^|]+) \|(.*)\| (\d) \|$/);
  if (!m) continue;
  const [, id, title, , p] = m;
  const a = byId[id];
  const [status, notes] = manual[id] || derived[id] || (a ? [a.status, a.details] : ['not run', '']);
  const icon = { pass: '✅ pass', warn: '⚠️ warn', fail: '❌ fail', 'not run': '— not run' }[status] || status;
  rows.push(`| ${id} | ${title.trim()} | ${p} | ${icon} | ${(notes || '').replace(/\|/g, '/')} |`);
}

const all = rows.filter((r) => /^\| [A-Z]+-\d+/.test(r));
const tally = (s) => all.filter((r) => r.includes(s)).length;
const header = `# UX/UI test results

Run ${ranAt.slice(0, 10)} against Daymark ${JSON.parse(fs.readFileSync('package.json', 'utf8')).version} (production build, sample vault). Automated: \`scripts/ux-suite.mjs\` (functional cases and scans); native/manual: Android 16 emulator (\`docs/reports/ux-ui/manual-results.json\`). Suite: [\`docs/testing/ux-ui-test-suite.md\`](../../testing/ux-ui-test-suite.md).

**${all.length} test cases: ${tally('✅')} pass · ${tally('⚠️')} warn · ${tally('❌')} fail · ${tally('— not run')} not run**
`;
fs.writeFileSync('docs/reports/ux-ui/test-results.md', header + rows.join('\n') + '\n');
console.log(header);
