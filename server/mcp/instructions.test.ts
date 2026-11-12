import fs from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { expect, it } from 'vitest';
import { MCP_INSTRUCTIONS } from './instructions';
import { registerAllTools } from './tools';
import type { ToolContext } from './tools/define';

it('MCP_INSTRUCTIONS is at most 1500 chars and names get_day_summary and submit_daymark_feedback', () => {
  expect(MCP_INSTRUCTIONS.length).toBeLessThanOrEqual(1500);
  expect(MCP_INSTRUCTIONS).toContain('get_day_summary');
  expect(MCP_INSTRUCTIONS).toContain('submit_daymark_feedback');
});

it('SKILL.md names every registered tool', () => {
  const names: string[] = [];
  const server = { registerTool: (name: string) => { names.push(name); } } as unknown as McpServer;
  registerAllTools(server, {} as ToolContext);
  const skill = fs.readFileSync(new URL('../../skills/daymark/SKILL.md', import.meta.url), 'utf8');
  expect(skill).toMatch(/^---\r?\nname: daymark\r?\ndescription: .*Daymark/);
  expect(names).toContain('ping');
  expect(names).toContain('submit_daymark_feedback');
  for (const name of names) expect(skill, `Missing tool: ${name}`).toContain(`\`${name}\``);
});
