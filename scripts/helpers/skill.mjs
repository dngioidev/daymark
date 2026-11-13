/**
 * Packages the Daymark client skill (skills/daymark/SKILL.md) for download.
 * Claude's skill upload expects a zip whose top level is the skill folder, so the
 * archive holds `daymark/SKILL.md` rather than a loose SKILL.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export const SKILL_ZIP = 'daymark-skill.zip';

/** Returns the zip as a Buffer: every file under `skillDir`, inside a folder named after it. */
export async function buildSkillZip(skillDir) {
  const name = path.basename(skillDir);
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) throw new Error(`${skillDir}: missing SKILL.md`);
  const zip = new JSZip();
  const add = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) add(full, `${prefix}${entry.name}/`);
      else zip.file(`${prefix}${entry.name}`, fs.readFileSync(full), { date: new Date('2026-01-01T00:00:00Z') });
    }
  };
  add(skillDir, `${name}/`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
