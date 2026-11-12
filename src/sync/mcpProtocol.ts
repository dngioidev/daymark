/** Types and constants shared by the MCP server and the Settings UI. */

export type McpAccess = 'full' | 'read-only';

export interface McpGrants {
  all: boolean;
  headings: string[];
  folders: string[];
  backlog: boolean;
  habits: boolean;
}

export type FeedbackDestination =
  | { kind: 'backlog' }
  | { kind: 'heading'; heading: string }
  | { kind: 'folder'; folder: string };

export interface McpSettings {
  enabled: boolean;
  /** IANA time zone; '' = unset. */
  timezone: string;
  auditRetentionDays: number;
  feedback: FeedbackDestination;
}

export interface McpConnectionSummary {
  id: string;
  name: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
  access: McpAccess;
  grants: McpGrants;
  builtIn: boolean;
}

export type AuditAction =
  | 'read' | 'search' | 'create' | 'update' | 'complete' | 'delete'
  | 'refused' | 'error' | 'connect' | 'refresh' | 'revoke';

export interface AuditEntry {
  id: string;
  at: string;
  connectionId: string;
  connectionName: string;
  tool: string;
  action: AuditAction;
  targets: { key: string; title?: string }[];
  count?: number;
  message?: string;
}

export interface McpOverview {
  settings: McpSettings;
  connections: McpConnectionSummary[];
  knownHeadings: string[];
  knownFolders: string[];
  endpoint: string;
}

export const NO_GRANTS: McpGrants = { all: false, headings: [], folders: [], backlog: false, habits: false };

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: true,
  timezone: '',
  auditRetentionDays: 30,
  feedback: { kind: 'backlog' },
};

export const MAX_AUDIT_RETENTION_DAYS = 365;
export const FEEDBACK_TAG = 'daymark-feedback';
export const FEEDBACK_CATEGORY = 'Daymark feedback';
