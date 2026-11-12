import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool } from './define';
import type { ToolContext } from './define';
import { registerReadTools } from './read';
import { registerTaskTools } from './tasks';
import { registerContentTools } from './content';
import { registerFeedbackTools } from './feedback';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  defineTool(server, ctx, {
    name: 'ping',
    description: 'Checks that the Daymark connection works.',
    input: {},
    readOnly: true,
    run: async () => ({ result: { ok: true }, action: 'read' }),
  });
  registerReadTools(server, ctx);
  registerTaskTools(server, ctx);
  registerContentTools(server, ctx);
  registerFeedbackTools(server, ctx);
}
