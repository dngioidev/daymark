#!/usr/bin/env node
/**
 * Universal AI Configuration Validator
 *
 * Validates canonical .ai-configs structure, root agent adapters,
 * SKILL.md frontmatter, workflows, templates, and relative markdown links.
 *
 * Runs cleanly on Node.js 18+ without external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const AI_CONFIGS_DIR = path.join(REPO_ROOT, '.ai-configs');

let errors = 0;
let warnings = 0;
let checks = 0;

function report(status, message, details = '') {
  checks++;
  if (status === 'PASS') {
    console.log(`  [PASS] ${message}`);
  } else if (status === 'WARN') {
    warnings++;
    console.warn(`  [WARN] ${message}${details ? ` -> ${details}` : ''}`);
  } else {
    errors++;
    console.error(`  [FAIL] ${message}${details ? ` -> ${details}` : ''}`);
  }
}

console.log('\n=== Validating Universal AI Agent Configuration System ===\n');

// 1. Verify Core Directories
console.log('1. Checking Canonical Directories:');
const requiredDirs = [
  '.ai-configs',
  '.ai-configs/rules',
  '.ai-configs/skills',
  '.ai-configs/workflows',
  '.ai-configs/project',
  '.ai-configs/templates',
  '.ai-configs/scripts',
];

for (const dir of requiredDirs) {
  const fullPath = path.join(REPO_ROOT, dir);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    report('PASS', `Directory exists: ${dir}`);
  } else {
    report('FAIL', `Missing required directory: ${dir}`);
  }
}

// 2. Verify Canonical Rule Files
console.log('\n2. Checking Canonical Rule Files:');
const requiredRules = [
  'general-behavior.md',
  'repository-safety.md',
  'engineering-standards.md',
  'testing-and-verification.md',
  'completion-report.md',
  'README.md',
];

for (const rule of requiredRules) {
  const fullPath = path.join(AI_CONFIGS_DIR, 'rules', rule);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8').trim();
    if (content.length > 50) {
      report('PASS', `Rule file valid: .ai-configs/rules/${rule}`);
    } else {
      report('FAIL', `Rule file too short or empty: .ai-configs/rules/${rule}`);
    }
  } else {
    report('FAIL', `Missing rule file: .ai-configs/rules/${rule}`);
  }
}

// 3. Verify Skills and SKILL.md Frontmatter
console.log('\n3. Checking Reusable Skills:');
const skillsDir = path.join(AI_CONFIGS_DIR, 'skills');
if (fs.existsSync(skillsDir)) {
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  if (skillDirs.length === 0) {
    report('FAIL', 'No skill subdirectories found in .ai-configs/skills');
  }

  for (const skillName of skillDirs) {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      report('FAIL', `Skill ${skillName} is missing SKILL.md`);
      continue;
    }

    const content = fs.readFileSync(skillPath, 'utf8');

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      report('FAIL', `Skill ${skillName}/SKILL.md missing valid YAML frontmatter`);
      continue;
    }

    const frontmatter = frontmatterMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    if (!nameMatch || !nameMatch[1].trim()) {
      report('FAIL', `Skill ${skillName}/SKILL.md frontmatter missing 'name' field`);
    } else if (nameMatch[1].trim() !== skillName) {
      report('WARN', `Skill ${skillName}/SKILL.md name '${nameMatch[1].trim()}' does not match directory name '${skillName}'`);
    }

    if (!descMatch || !descMatch[1].trim()) {
      report('FAIL', `Skill ${skillName}/SKILL.md frontmatter missing 'description' field`);
    }

    // Check required sections
    const hasProcedure = /##\s+(?:Repeatable\s+)?Procedure/i.test(content);
    const hasInputsOutputs = /(?:Inputs|Outputs)/i.test(content);

    if (hasProcedure && hasInputsOutputs) {
      report('PASS', `Skill verified: ${skillName} (valid frontmatter & sections)`);
    } else {
      report('WARN', `Skill ${skillName}/SKILL.md may be missing standard procedure or input/output sections`);
    }
  }
} else {
  report('FAIL', 'Skills directory does not exist');
}

// 4. Verify Workflows and Templates
console.log('\n4. Checking Workflows & Templates:');
const requiredWorkflows = [
  'bug-fix.md',
  'feature-development.md',
  'code-review.md',
  'regression-testing.md',
  'documentation-update.md',
  'release-handoff.md',
  'README.md',
];

for (const wf of requiredWorkflows) {
  const fullPath = path.join(AI_CONFIGS_DIR, 'workflows', wf);
  if (fs.existsSync(fullPath)) {
    report('PASS', `Workflow file valid: .ai-configs/workflows/${wf}`);
  } else {
    report('FAIL', `Missing workflow file: .ai-configs/workflows/${wf}`);
  }
}

const requiredTemplates = [
  'pull-request.md',
  'test-plan.md',
  'completion-report.md',
  'README.md',
];

for (const tmpl of requiredTemplates) {
  const fullPath = path.join(AI_CONFIGS_DIR, 'templates', tmpl);
  if (fs.existsSync(fullPath)) {
    report('PASS', `Template file valid: .ai-configs/templates/${tmpl}`);
  } else {
    report('FAIL', `Missing template file: .ai-configs/templates/${tmpl}`);
  }
}

// 5. Verify Project Context Files
console.log('\n5. Checking Project Context:');
const requiredProjectDocs = [
  'architecture.md',
  'codebase-map.md',
  'conventions.md',
  'decisions.md',
  'specification.md',
  'api-and-sync.md',
  'README.md',
];

for (const doc of requiredProjectDocs) {
  const fullPath = path.join(AI_CONFIGS_DIR, 'project', doc);
  if (fs.existsSync(fullPath)) {
    report('PASS', `Project doc valid: .ai-configs/project/${doc}`);
  } else {
    report('FAIL', `Missing project doc: .ai-configs/project/${doc}`);
  }
}

// 6. Verify Root Agent Adapters
console.log('\n6. Checking Root Agent Adapters:');
const rootAdapters = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];

for (const adapter of rootAdapters) {
  const fullPath = path.join(REPO_ROOT, adapter);
  if (!fs.existsSync(fullPath)) {
    report('FAIL', `Root adapter missing: ${adapter}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lineCount = content.split(/\r?\n/).length;

  // Verify adapter points to .ai-configs/
  if (content.includes('.ai-configs')) {
    report('PASS', `Root adapter ${adapter} references .ai-configs/`);
  } else {
    report('FAIL', `Root adapter ${adapter} does NOT reference .ai-configs/`);
  }

  // Ensure adapter is thin (does not duplicate entire rulebook)
  if (lineCount < 200) {
    report('PASS', `Root adapter ${adapter} is thin (${lineCount} lines)`);
  } else {
    report('WARN', `Root adapter ${adapter} is quite large (${lineCount} lines). Consider keeping it thin.`);
  }
}

// 7. Verify Internal Markdown Relative Links
console.log('\n7. Checking Relative Markdown Links in .ai-configs/:');
function checkMarkdownLinks(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkMarkdownLinks(fullPath);
    } else if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      // Match markdown links: [label](path)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;

      while ((match = linkRegex.exec(content)) !== null) {
        const linkTarget = match[2].trim();

        // Skip anchors, mailto, and http(s) URLs
        if (
          linkTarget.startsWith('#') ||
          linkTarget.startsWith('http://') ||
          linkTarget.startsWith('https://') ||
          linkTarget.startsWith('mailto:')
        ) {
          continue;
        }

        // Strip anchor from relative link
        const [cleanTarget] = linkTarget.split('#');
        if (!cleanTarget) continue;

        // Templates use placeholder screenshot paths that only exist in a real release doc
        if (path.basename(dir) === 'templates' && cleanTarget.startsWith('./images/')) continue;

        const resolvedTarget = path.resolve(path.dirname(fullPath), cleanTarget);
        if (!fs.existsSync(resolvedTarget)) {
          report(
            'FAIL',
            `Broken link in ${path.relative(REPO_ROOT, fullPath)}: '${linkTarget}'`,
            `Resolves to missing: ${path.relative(REPO_ROOT, resolvedTarget)}`
          );
        }
      }
    }
  }
}

checkMarkdownLinks(AI_CONFIGS_DIR);

// Also check relative links inside root adapters
for (const adapter of rootAdapters) {
  const adapterPath = path.join(REPO_ROOT, adapter);
  if (fs.existsSync(adapterPath)) {
    const content = fs.readFileSync(adapterPath, 'utf8');
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const linkTarget = match[2].trim();
      if (
        linkTarget.startsWith('#') ||
        linkTarget.startsWith('http://') ||
        linkTarget.startsWith('https://') ||
        linkTarget.startsWith('mailto:')
      ) {
        continue;
      }
      const [cleanTarget] = linkTarget.split('#');
      if (!cleanTarget) continue;

      const resolvedTarget = path.resolve(REPO_ROOT, cleanTarget);
      if (!fs.existsSync(resolvedTarget)) {
        report(
          'FAIL',
          `Broken link in ${adapter}: '${linkTarget}'`,
          `Resolves to missing: ${path.relative(REPO_ROOT, resolvedTarget)}`
        );
      }
    }
  }
}

// 8. Verify fitness: referenced npm scripts, adapter invariants, docs links
console.log('\n8. Checking Fitness (scripts, invariants, docs links):');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const markdownFiles = [];
function collectMarkdown(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full);
    else if (entry.name.endsWith('.md')) markdownFiles.push(full);
  }
}
collectMarkdown(REPO_ROOT);

// 8a. Every `npm run <script>` mentioned in docs must exist in package.json
const referencedScripts = new Map();
for (const file of markdownFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/npm run ([a-z0-9:_-]+)/gi)) {
    if (!referencedScripts.has(m[1])) referencedScripts.set(m[1], path.relative(REPO_ROOT, file));
  }
}
for (const [script, where] of referencedScripts) {
  if (pkg.scripts && pkg.scripts[script]) report('PASS', `npm script exists: ${script}`);
  else report('FAIL', `Docs reference missing npm script: ${script}`, `first seen in ${where}`);
}

// 8b. Root adapters must all state the core invariants
const invariantKeywords = ['daymark: task_id', 'src/utils/lifecycleEngine.ts', 'stone', 'src/types/daymark.ts', 'max-w-[1800px]'];
for (const adapter of rootAdapters) {
  const adapterPath = path.join(REPO_ROOT, adapter);
  if (!fs.existsSync(adapterPath)) continue;
  const content = fs.readFileSync(adapterPath, 'utf8');
  const missing = invariantKeywords.filter((k) => !content.includes(k));
  if (missing.length === 0) report('PASS', `Adapter ${adapter} states all core invariants`);
  else report('FAIL', `Adapter ${adapter} is missing invariants`, missing.join(', '));
}

// 8c. Relative links in README.md, docs/ and release docs must resolve
const outsideConfigs = markdownFiles.filter(
  (f) => !f.startsWith(AI_CONFIGS_DIR) && !rootAdapters.includes(path.basename(f))
);
let docLinkFailures = 0;
for (const file of outsideConfigs) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = m[1].trim().split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
      docLinkFailures++;
      report('FAIL', `Broken link in ${path.relative(REPO_ROOT, file)}: ${target}`);
    }
  }
}
if (docLinkFailures === 0) report('PASS', `Relative links resolve in ${outsideConfigs.length} docs outside .ai-configs/`);

// 8d. Each release doc must have a README and at least one screenshot
const releasesDir = path.join(REPO_ROOT, 'docs', 'releases');
if (fs.existsSync(releasesDir)) {
  for (const cycle of fs.readdirSync(releasesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const imagesDir = path.join(releasesDir, cycle.name, 'images');
    const images = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir).filter((f) => f.endsWith('.png')) : [];
    if (!fs.existsSync(path.join(releasesDir, cycle.name, 'README.md'))) {
      report('FAIL', `Release doc ${cycle.name} is missing README.md`);
    }
    if (images.length > 0) report('PASS', `Release doc ${cycle.name} has ${images.length} screenshots`);
    else report('FAIL', `Release doc ${cycle.name} has no screenshots`, 'docs/releases/<cycle>/images/*.png');
  }
}

// 9. Summary
console.log('\n=== Validation Summary ===');
console.log(`Total Checks : ${checks}`);
console.log(`Passed       : ${checks - errors - warnings}`);
console.log(`Warnings     : ${warnings}`);
console.log(`Failures     : ${errors}`);

if (errors > 0) {
  console.error('\nResult: VALIDATION FAILED\n');
  process.exit(1);
} else {
  console.log('\nResult: ALL CHECKS PASSED\n');
  process.exit(0);
}
