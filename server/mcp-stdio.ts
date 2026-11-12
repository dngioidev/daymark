import path from 'node:path';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_VERSION } from './app';
import { FileStore } from './store';
import { VaultQueue } from './vault';
import { AuditLog } from './mcp/audit';
import { MCP_INSTRUCTIONS } from './mcp/instructions';
import { acquireDataLock, DataLockError } from './mcp/lock';
import { McpStore } from './mcp/mcpStore';
import { createCommit, type ToolContext } from './mcp/tools/define';
import { registerAllTools } from './mcp/tools/index';
import { todayIn } from './mcp/vaultView';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { data: { type: 'string' }, timezone: { type: 'string' } } });
  const dir = path.resolve(values.data ?? process.env.DATA_DIR ?? './data');
  const timezone = values.timezone ?? process.env.DAYMARK_TZ ?? null;
  // Fail before loading any vault state if another process owns this directory.
  const release = acquireDataLock(dir, 'stdio');
  process.once('exit', release);

  const store = new FileStore(dir);
  store.init('local', null, { requireAccount: false });
  const mcp = new McpStore(dir);
  mcp.init();
  const connection = mcp.ensureLocalConnection();
  await mcp.persist();
  const vault = new VaultQueue();
  const audit = new AuditLog(path.join(dir, 'mcp-audit'));
  const now = () => new Date();
  const ctx: ToolContext = {
    store, mcp, audit, vault, connection, now,
    today: () => todayIn(mcp.effectiveTimezone(timezone), now()),
    commit: createCommit(store, vault, connection, now),
  };
  const server = new McpServer({ name: 'daymark', version: SERVER_VERSION }, { instructions: MCP_INSTRUCTIONS });
  registerAllTools(server, ctx);
  const stop = async () => {
    await vault.run(async () => {});
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  process.stdin.once('end', () => { void stop(); });
  await server.connect(new StdioServerTransport());
}

main().catch(error => {
  console.error(error instanceof DataLockError ? error.message : `Could not start Daymark MCP: ${(error as Error).message}`);
  process.exit(1);
});
