import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Plug } from 'lucide-react';
import { UseSyncResult } from '../../hooks/useSync';
import { relativeTime } from '../sync/SyncPanel';
import { formatDateTime } from '../../utils/dateFormat';
import { buttonClass } from '../ui/Dialog';
import { ConfirmOptions, confirmDialog } from '../ui/feedback';
import { MAX_AUDIT_RETENTION_DAYS } from '../../sync/mcpProtocol';
import type {
  AuditAction, AuditEntry, FeedbackDestination, McpAccess, McpConnectionSummary, McpGrants, McpOverview,
} from '../../sync/mcpProtocol';

export type McpApi = (path: string, init?: RequestInit) => Promise<any>;

const PAGE = 200;
const ACTIONS: AuditAction[] = ['read', 'search', 'create', 'update', 'complete', 'delete', 'refused', 'error', 'connect', 'refresh', 'revoke'];

const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) });

/** Saves the device's zone when the server has none yet. Returns the saved zone, or null when nothing was needed. */
export async function adoptDeviceTimezone(api: McpApi, current: string, deviceZone: string): Promise<string | null> {
  if (current !== '' || !deviceZone) return null;
  await api('/api/mcp/settings', put({ timezone: deviceZone }));
  return deviceZone;
}

export async function revokeConnection(
  api: McpApi, confirm: (options: ConfirmOptions) => Promise<boolean>, connection: McpConnectionSummary,
): Promise<boolean> {
  const ok = await confirm({
    title: `Revoke "${connection.name}"? It will need to be added again.`,
    confirmLabel: 'Revoke',
    danger: true,
  });
  if (!ok) return false;
  await api(`/api/mcp/connections/${connection.id}`, { method: 'DELETE' });
  return true;
}

export async function saveGrants(api: McpApi, id: string, grants: McpGrants, access: McpAccess): Promise<void> {
  await api(`/api/mcp/connections/${id}`, put({ grants, access }));
}

/** Rejects anything outside 1..365 days before it reaches the server. */
export async function saveRetention(api: McpApi, days: number): Promise<boolean> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_AUDIT_RETENTION_DAYS) return false;
  await api('/api/mcp/settings', put({ auditRetentionDays: days }));
  return true;
}

export function describeScope(grants: McpGrants): string {
  if (grants.all) return 'Everything';
  const parts = [...grants.headings, ...grants.folders.map(f => `${f}/`), ...(grants.backlog ? ['Backlog'] : []), ...(grants.habits ? ['Habits'] : [])];
  return parts.length ? parts.join(', ') : 'Nothing';
}

const card = 'p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800';
const heading = 'text-base font-semibold flex items-center gap-2 mb-3';
const hint = 'text-xs text-stone-600 dark:text-stone-400';
const input =
  'w-full min-h-11 px-3 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-[15px] sm:text-sm placeholder:text-stone-500';
const label = 'block text-sm font-medium mb-1';

interface ConnectionRowProps {
  connection: McpConnectionSummary;
  onEdit: () => void;
  onRevoke: () => void;
}

export const ConnectionRow: React.FC<ConnectionRowProps> = ({ connection, onEdit, onRevoke }) => (
  <div className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
    <div className="min-w-0 flex-1">
      <div className="font-medium truncate">{connection.name}</div>
      <div className={hint}>
        {connection.clientName} · Last used {relativeTime(connection.lastUsedAt)} · {connection.access === 'full' ? 'Full access' : 'Read only'}
      </div>
      <div className={`${hint} break-words`}>{describeScope(connection.grants)}</div>
    </div>
    <div className="flex gap-2">
      <button type="button" onClick={onEdit} className={buttonClass.secondary}>Edit</button>
      {!connection.builtIn && <button type="button" onClick={onRevoke} className={buttonClass.secondary}>Revoke</button>}
    </div>
  </div>
);

interface ScopeEditorProps {
  connection: McpConnectionSummary;
  knownHeadings: string[];
  knownFolders: string[];
  onSave: (grants: McpGrants, access: McpAccess) => void;
  onCancel: () => void;
}

const toggle = (list: string[], value: string, on: boolean) => (on ? [...list.filter(v => v !== value), value] : list.filter(v => v !== value));

const ScopeEditor: React.FC<ScopeEditorProps> = ({ connection, knownHeadings, knownFolders, onSave, onCancel }) => {
  const [grants, setGrants] = useState<McpGrants>(connection.grants);
  const [access, setAccess] = useState<McpAccess>(connection.access);
  const stale = grants.headings.filter(h => !knownHeadings.includes(h));
  const box = (id: string, text: string, checked: boolean, onChange: (on: boolean) => void) => (
    <label key={id} className="flex items-center gap-2 min-h-11 sm:min-h-8">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4" />
      <span className="break-words min-w-0">{text}</span>
    </label>
  );
  return (
    <div className="mb-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 space-y-2">
      <div className="font-medium">Edit "{connection.name}"</div>
      {box('all', 'Everything', grants.all, on => setGrants({ ...grants, all: on }))}
      {!grants.all && (
        <div className="pl-2 sm:pl-4">
          {[...knownHeadings, ...stale].map(h => box(`h:${h}`, knownHeadings.includes(h) ? h : `${h} (not used recently)`, grants.headings.includes(h), on => setGrants({ ...grants, headings: toggle(grants.headings, h, on) })))}
          {knownFolders.map(f => box(`f:${f}`, `${f}/`, grants.folders.includes(f), on => setGrants({ ...grants, folders: toggle(grants.folders, f, on) })))}
          {box('backlog', 'Backlog', grants.backlog, on => setGrants({ ...grants, backlog: on }))}
          {box('habits', 'Habits', grants.habits, on => setGrants({ ...grants, habits: on }))}
        </div>
      )}
      <fieldset className="flex flex-wrap gap-x-4">
        <legend className="sr-only">Access</legend>
        {(['full', 'read-only'] as const).map(value => (
          <label key={value} className="flex items-center gap-2 min-h-11 sm:min-h-8">
            <input type="radio" name={`access-${connection.id}`} checked={access === value} onChange={() => setAccess(value)} />
            {value === 'full' ? 'Full access' : 'Read only'}
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <button type="button" className={buttonClass.primary} onClick={() => onSave(grants, access)}>Save</button>
        <button type="button" className={buttonClass.secondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};

const deviceZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
};
const supportedZones = () => {
  try { return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone'); } catch { return []; }
};

/** Settings tab for the device-only /api/mcp routes: master switch, connections and activity. */
export const AiConnectionsPanel: React.FC<{ sync: UseSyncResult }> = ({ sync }) => {
  const [overview, setOverview] = useState<McpOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zone, setZone] = useState('');
  const [customRetention, setCustomRetention] = useState(false);
  const [retentionText, setRetentionText] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [filterConnection, setFilterConnection] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const adoptedZone = useRef(false);

  const api = useCallback<McpApi>(
    async (path, init = {}) => {
      const res = await sync.authFetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      return data;
    },
    [sync.authFetch]
  );

  const fail = (err: unknown) => setError((err as Error).message);

  const refresh = useCallback(async () => {
    if (!sync.account) return;
    try {
      const data: McpOverview = await api('/api/mcp');
      setOverview(data);
      setZone(data.settings.timezone);
      setRetentionText(String(data.settings.auditRetentionDays));
      setCustomRetention(![7, 30].includes(data.settings.auditRetentionDays));
      setError(null);
      if (data.settings.timezone === '' && !adoptedZone.current) {
        adoptedZone.current = true;
        const saved = await adoptDeviceTimezone(api, '', deviceZone());
        if (saved) {
          setZone(saved);
          setOverview({ ...data, settings: { ...data.settings, timezone: saved } });
        }
      }
    } catch (err) {
      fail(err);
    }
  }, [api, sync.account?.serverUrl, sync.account?.username]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadActivity = useCallback(async () => {
    if (!sync.account || !overview?.endpoint) return;
    const query = new URLSearchParams({ limit: String(limit) });
    if (filterConnection) query.set('connectionId', filterConnection);
    if (filterAction) query.set('action', filterAction);
    try {
      setEntries((await api(`/api/mcp/audit?${query}`)).entries);
    } catch (err) {
      fail(err);
    }
  }, [api, sync.account, overview?.endpoint, limit, filterConnection, filterAction]);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  if (!sync.account) return <p className="text-sm text-stone-700 dark:text-stone-300">Sign in to sync to manage AI connections.</p>;
  if (!overview) {
    return error
      ? <div role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-sm">{error}</div>
      : <p className="text-sm text-stone-600 dark:text-stone-400">Loading…</p>;
  }
  if (overview.endpoint === '') return <p className="text-sm text-stone-700 dark:text-stone-300">AI connections are turned off on this server.</p>;

  const { settings, connections, knownHeadings, knownFolders, endpoint } = overview;

  const saveSettings = async (patch: Partial<typeof settings>) => {
    try {
      await api('/api/mcp/settings', put(patch));
      setOverview({ ...overview, settings: { ...settings, ...patch } });
      setError(null);
    } catch (err) {
      fail(err);
      await refresh();
    }
  };

  const setFeedbackKind = (kind: FeedbackDestination['kind']) => {
    if (kind === 'backlog') void saveSettings({ feedback: { kind } });
    else if (kind === 'heading' && knownHeadings[0]) void saveSettings({ feedback: { kind, heading: knownHeadings[0] } });
    else if (kind === 'folder' && knownFolders[0]) void saveSettings({ feedback: { kind, folder: knownFolders[0] } });
  };

  const changeZone = (value: string) => {
    const next = value.trim();
    if (next === settings.timezone) return;
    void saveSettings({ timezone: next });
  };

  const commitRetention = async (text: string) => {
    const days = Number(text);
    try {
      if (!(await saveRetention(api, days))) {
        setError(`Enter a whole number of days from 1 to ${MAX_AUDIT_RETENTION_DAYS}.`);
        return;
      }
      setOverview({ ...overview, settings: { ...settings, auditRetentionDays: days } });
      setError(null);
    } catch (err) {
      fail(err);
    }
  };

  const onRevoke = async (connection: McpConnectionSummary) => {
    try {
      if (await revokeConnection(api, confirmDialog, connection)) {
        setEditing(null);
        await refresh();
        await loadActivity();
      }
    } catch (err) {
      fail(err);
    }
  };

  const onSaveScope = async (connection: McpConnectionSummary, grants: McpGrants, access: McpAccess) => {
    try {
      await saveGrants(api, connection.id, grants, access);
      setEditing(null);
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      fail(err);
    }
  };

  const retentionValue = customRetention ? 'custom' : String(settings.auditRetentionDays);
  const feedback = settings.feedback;
  const zones = supportedZones();

  return (
    <div className="space-y-4 text-sm text-stone-900 dark:text-stone-100">
      {error && <div role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200">{error}</div>}

      <div className={card}>
        <h3 className={heading}><Plug className="w-4 h-4 text-stone-600 dark:text-stone-400" /> AI connections</h3>
        <label className="flex items-center justify-between gap-3 min-h-11 font-medium">
          AI access
          <input type="checkbox" role="switch" checked={settings.enabled} onChange={e => void saveSettings({ enabled: e.target.checked })} className="w-5 h-5" />
        </label>
        <p className={hint}>When off, every AI connection is refused. Connections are kept.</p>

        <div className="mt-4">
          <label htmlFor="ai-endpoint" className={label}>Connector address</label>
          <div className="flex gap-2">
            <input id="ai-endpoint" readOnly value={endpoint} className={`${input} min-w-0 flex-1`} onFocus={e => e.currentTarget.select()} />
            <button type="button" onClick={() => void copyEndpoint()} className={buttonClass.secondary} aria-label="Copy connector address">
              <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="ai-timezone" className={label}>Time zone</label>
          <input
            id="ai-timezone" className={input} list="ai-timezones" value={zone} placeholder="e.g. Europe/Paris"
            onChange={e => setZone(e.target.value)} onBlur={e => changeZone(e.target.value)}
          />
          <datalist id="ai-timezones">{zones.map(z => <option key={z} value={z} />)}</datalist>
        </div>

        <div className="mt-4">
          <label htmlFor="ai-retention" className={label}>Keep activity for</label>
          <div className="flex gap-2">
            <select
              id="ai-retention" className={input} value={retentionValue}
              onChange={e => {
                if (e.target.value === 'custom') setCustomRetention(true);
                else { setCustomRetention(false); setRetentionText(e.target.value); void commitRetention(e.target.value); }
              }}
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="custom">Custom…</option>
            </select>
            {customRetention && (
              <input
                type="number" min={1} max={MAX_AUDIT_RETENTION_DAYS} step={1} aria-label="Custom days" className={`${input} w-28`}
                value={retentionText} onChange={e => setRetentionText(e.target.value)} onBlur={e => void commitRetention(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="ai-feedback" className={label}>Daymark feedback goes to</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select id="ai-feedback" className={input} value={feedback.kind} onChange={e => setFeedbackKind(e.target.value as FeedbackDestination['kind'])}>
              <option value="backlog">Backlog</option>
              <option value="heading" disabled={knownHeadings.length === 0 && feedback.kind !== 'heading'}>A section</option>
              <option value="folder" disabled={knownFolders.length === 0 && feedback.kind !== 'folder'}>A note folder</option>
            </select>
            {feedback.kind === 'heading' && (
              <select aria-label="Section" className={input} value={feedback.heading} onChange={e => void saveSettings({ feedback: { kind: 'heading', heading: e.target.value } })}>
                {[...new Set([...knownHeadings, feedback.heading])].map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            )}
            {feedback.kind === 'folder' && (
              <select aria-label="Note folder" className={input} value={feedback.folder} onChange={e => void saveSettings({ feedback: { kind: 'folder', folder: e.target.value } })}>
                {[...new Set([...knownFolders, feedback.folder])].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className={heading}>Connections</h3>
        {connections.length === 0 && <p className={hint}>No AI connections yet.</p>}
        <div className="divide-y divide-stone-100 dark:divide-stone-800">
          {connections.map(c => (
            <div key={c.id}>
              <ConnectionRow connection={c} onEdit={() => setEditing(editing === c.id ? null : c.id)} onRevoke={() => void onRevoke(c)} />
              {editing === c.id && (
                <ScopeEditor
                  key={c.id} connection={c} knownHeadings={knownHeadings} knownFolders={knownFolders}
                  onSave={(grants, access) => void onSaveScope(c, grants, access)} onCancel={() => setEditing(null)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className={heading}>Activity</h3>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <select aria-label="Filter by connection" className={input} value={filterConnection} onChange={e => { setFilterConnection(e.target.value); setLimit(PAGE); }}>
            <option value="">All connections</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Filter by action" className={input} value={filterAction} onChange={e => { setFilterAction(e.target.value); setLimit(PAGE); }}>
            <option value="">All actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {entries.length === 0 ? (
          <p className={hint}>No activity yet.</p>
        ) : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {entries.map(e => (
              <li key={e.id} className="break-words">
                <div className={hint}>{formatDateTime(e.at)} · {e.connectionName}</div>
                <div>
                  <span className="font-medium">{e.action}</span> · {e.tool}
                  {e.targets.length > 0 && <span className="text-stone-700 dark:text-stone-300"> · {e.targets.map(t => t.title || t.key).join(', ')}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {entries.length >= limit && (
          <button type="button" className={`${buttonClass.secondary} mt-3`} onClick={() => setLimit(limit + PAGE)}>Load more</button>
        )}
      </div>
    </div>
  );
};
