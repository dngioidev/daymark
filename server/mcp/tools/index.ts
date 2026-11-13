import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool } from './define';
import type { ToolContext } from './define';
import { registerReadTools } from './read';
import { registerTaskTools } from './tasks';
import { registerContentTools } from './content';
import { registerFeedbackTools } from './feedback';
import { registerFolderTools } from './folders';
import { SERVER_VERSION } from '../../app';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  defineTool(server, ctx, {
    name: 'ping',
    description: 'Checks that the Daymark connection works.',
    input: {},
    readOnly: true,
    run: async () => ({ result: { ok: true, version: SERVER_VERSION }, action: 'read' }),
  });
  registerReadTools(server, ctx);
  registerTaskTools(server, ctx);
  registerContentTools(server, ctx);
  registerFolderTools(server, ctx);
  registerFeedbackTools(server, ctx);
}

/** Names of every registered tool, without a live connection. */
export function toolNames(): string[] {
  const names: string[] = [];
  registerAllTools({ registerTool: (name: string) => { names.push(name); } } as unknown as McpServer, {} as ToolContext);
  return names;
}
