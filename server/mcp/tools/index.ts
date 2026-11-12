import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defineTool } from './define';
import type { ToolContext } from './define';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  defineTool(server, ctx, {
    name: 'ping',
    description: 'Checks that the Daymark connection works.',
    input: {},
    readOnly: true,
    run: async () => ({ result: { ok: true }, action: 'read' }),
  });
}
