import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z, ZodRawShape } from 'zod';
import { isBacklogEntityKey } from '../../../src/sync/merge';
import type { AuditAction, AuditEntry } from '../../../src/sync/mcpProtocol';
import type { FileStore } from '../../store';
import { isValidEntityValue, reconcileBacklogAfterWrite, VaultQueue, writeEntity } from '../../vault';
import type { AuditLog } from '../audit';
import type { McpConnection, McpStore } from '../mcpStore';
import { NOT_SHARED, ScopeError } from '../scope';

export interface ToolContext {
  store: FileStore;
  mcp: McpStore;
  audit: AuditLog;
  vault: VaultQueue;
  connection: McpConnection;
  now: () => Date;
  today: () => string;
  commit: (changes: { key: string; value: unknown | null }[]) => Promise<void>;
}

export interface ToolOutcome {
  result: unknown;
  action: AuditAction;
  targets?: AuditEntry['targets'];
  count?: number;
}

type ToolArgs<S extends ZodRawShape> = { [K in keyof S]: z.output<S[K]> };

/** Validated, serialized vault write on behalf of one connection. */
export function createCommit(store: FileStore, vault: VaultQueue, connection: McpConnection, now: () => Date): ToolContext['commit'] {
  return (changes) => vault.run(async () => {
    for (const change of changes) {
      if (change.value !== null && !isValidEntityValue(change.key, change.value)) throw new Error('invalid write');
    }
    const actor = `mcp:${connection.id}`;
    const nowIso = now().toISOString();
    const touched = new Set<string>();
    let backlogOrDoc = false;
    for (const change of changes) {
      writeEntity(store, change.key, change.value, actor, nowIso);
      touched.add(change.key);
      if (change.key.startsWith('doc:') || isBacklogEntityKey(change.key)) backlogOrDoc = true;
    }
    if (backlogOrDoc) reconcileBacklogAfterWrite(store, actor, nowIso, touched, true);
    await store.persist('vault.json');
  });
}

const textResult = (text: string, isError = false): CallToolResult => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });

/** Registers a tool whose every call is checked against the connection and leaves exactly one audit entry. */
export function defineTool<S extends ZodRawShape>(server: McpServer, ctx: ToolContext, def: {
  name: string;
  description: string;
  input: S;
  readOnly: boolean;
  destructive?: boolean;
  allowReadOnlyConnection?: boolean;
  run: (args: ToolArgs<S>, ctx: ToolContext) => Promise<ToolOutcome>;
}): void {
  const conn = ctx.connection;
  const audit = async (action: AuditAction, extra: Partial<Pick<AuditEntry, 'targets' | 'count' | 'message'>> = {}) => {
    try {
      await ctx.audit.append({
        connectionId: conn.id, connectionName: conn.name, tool: def.name, action, targets: extra.targets ?? [],
        ...(extra.count !== undefined ? { count: extra.count } : {}),
        ...(extra.message !== undefined ? { message: extra.message } : {}),
      }, ctx.now());
    } catch (err) {
      console.error('Audit write failed:', (err as Error).message);
    }
  };

  server.registerTool(
    def.name,
    {
      description: def.description,
      inputSchema: def.input,
      annotations: { readOnlyHint: def.readOnly, destructiveHint: def.destructive ?? false },
    },
    (async (args: ToolArgs<S>): Promise<CallToolResult> => {
      try {
        if (!ctx.mcp.settings.enabled) throw new ScopeError('AI access is turned off.');
        const active = ctx.mcp.activeConnection(conn.id);
        if (!active) throw new ScopeError(NOT_SHARED);
        if (!def.readOnly && active.access === 'read-only' && !def.allowReadOnlyConnection) throw new ScopeError(NOT_SHARED);
        // Scope is read from the live connection so edits and revocation apply to the next call.
        const outcome = await def.run(args, { ...ctx, connection: active });
        await audit(outcome.action, { targets: outcome.targets, count: outcome.count });
        return textResult(JSON.stringify(outcome.result));
      } catch (err) {
        if (err instanceof ScopeError) {
          await audit('refused', { message: err.message });
          return textResult(err.message, true);
        }
        console.error(`MCP tool ${def.name} failed:`, err);
        await audit('error', { message: 'internal error' });
        return textResult('Something went wrong in Daymark.', true);
      }
    }) as never,
  );
}
