import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseSyncResult } from '../../hooks/useSync';
import type { McpConnectionSummary } from '../../sync/mcpProtocol';
import { NO_GRANTS } from '../../sync/mcpProtocol';
import { AiConnectionsPanel, ConnectionRow, ScopeEditor, ToolRefreshNotice, adoptDeviceTimezone, revokeConnection, saveGrants, saveRetention } from './AiConnectionsPanel';

const sync: UseSyncResult = {
  mode: 'server', status: 'idle', account: null, lastSyncAt: null, error: null,
  connect: vi.fn(), disconnect: vi.fn(), signOut: vi.fn(), pendingChanges: () => 0,
  authFetch: vi.fn(), syncNow: vi.fn(), rebaseAfterReplace: vi.fn(),
};

const connection = (patch: Partial<McpConnectionSummary> = {}): McpConnectionSummary => ({
  id: 'c1', name: 'Claude', clientName: 'Claude Desktop', createdAt: '2026-11-01T00:00:00Z', lastUsedAt: null,
  access: 'full', grants: { ...NO_GRANTS, all: true }, builtIn: false, ...patch,
});

describe('AiConnectionsPanel', () => {
  it('a granted heading that differs only in case or spacing is not flagged as unused', () => {
    const render = (headings: string[]) => renderToStaticMarkup(React.createElement(ScopeEditor, {
      connection: connection({ grants: { ...NO_GRANTS, headings } }), knownHeadings: ['Work', 'Personal'], knownFolders: [],
      onSave: vi.fn(), onCancel: vi.fn(),
    }));
    expect(render(['work', ' Personal '])).not.toContain('not used recently');
    expect(render(['Gone'])).toContain('Gone (not used recently)');
  });

  it('signed out shows the sign-in hint', () => {
    const html = renderToStaticMarkup(React.createElement(AiConnectionsPanel, { sync }));
    expect(html).toContain('Sign in to sync to manage AI connections.');
    expect(html).not.toContain('AI access');
  });

  it('first load with empty timezone saves the device zone once', async () => {
    const api = vi.fn(async () => ({}));
    expect(await adoptDeviceTimezone(api, '', 'Europe/Paris')).toBe('Europe/Paris');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/api/mcp/settings', { method: 'PUT', body: JSON.stringify({ timezone: 'Europe/Paris' }) });
    expect(await adoptDeviceTimezone(api, 'Asia/Tokyo', 'Europe/Paris')).toBeNull();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('revoke asks for confirmation and calls DELETE', async () => {
    const api = vi.fn(async () => ({ ok: true }));
    const confirm = vi.fn(async () => false);
    expect(await revokeConnection(api, confirm, connection())).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revoke "Claude"? It will need to be added again.' }));
    expect(api).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    expect(await revokeConnection(api, confirm, connection())).toBe(true);
    expect(api).toHaveBeenCalledWith('/api/mcp/connections/c1', { method: 'DELETE' });
  });

  it('Local has no Revoke', () => {
    const render = (c: McpConnectionSummary) => renderToStaticMarkup(React.createElement(ConnectionRow, {
      connection: c, onEdit: vi.fn(), onRevoke: vi.fn(),
    }));
    const local = render(connection({ id: 'local', name: 'Local', builtIn: true }));
    expect(local).toContain('Edit');
    expect(local).not.toContain('Revoke');
    expect(render(connection())).toContain('Revoke');
  });

  it('edit scope PUTs the chosen grants', async () => {
    const api = vi.fn(async () => ({}));
    const grants = { all: false, headings: ['Work'], folders: ['Ideas'], backlog: true, habits: false };
    await saveGrants(api, 'c1', grants, 'read-only');
    expect(api).toHaveBeenCalledWith('/api/mcp/connections/c1', { method: 'PUT', body: JSON.stringify({ grants, access: 'read-only' }) });
  });

  it('custom retention outside 1..365 is not saved', async () => {
    const api = vi.fn(async () => ({}));
    for (const bad of [0, 366, -3, 2.5, NaN]) expect(await saveRetention(api, bad)).toBe(false);
    expect(api).not.toHaveBeenCalled();
    expect(await saveRetention(api, 90)).toBe(true);
    expect(api).toHaveBeenCalledWith('/api/mcp/settings', { method: 'PUT', body: JSON.stringify({ auditRetentionDays: 90 }) });
  });

  it('a connection with an old tool list is marked and the notice says how to refresh each client', () => {
    const row = (stale: boolean) => renderToStaticMarkup(React.createElement(ConnectionRow, { connection: connection(), stale, onEdit: vi.fn(), onRevoke: vi.fn() }));
    expect(row(true)).toContain('Needs refresh');
    expect(row(false)).not.toContain('Needs refresh');
    const notice = renderToStaticMarkup(React.createElement(ToolRefreshNotice, {
      toolset: { version: '1.13.3', changedAt: '2026-11-13T12:00:00Z', added: ['list_folders', 'delete_folder'] },
      stale: [connection({ name: 'ChatGPT' }), connection({ id: 'c2', name: 'Claude Code' })],
    }));
    expect(notice).toContain('Daymark 1.13.3 changed its AI tools (new: list_folders, delete_folder)');
    expect(notice).toContain('ChatGPT, Claude Code still use the old list');
    expect(notice).toContain('<strong>Refresh</strong>');
  });
});
