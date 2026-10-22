/**
 * Daymark Core Data Types
 * A Local-First Daily Markdown Notebook with Intelligent Task Carry-Forward
 */

export type LifecycleAction = 'keep' | 'carry-forward' | 'archive' | 'warn';

export interface StatusDefinition {
  id: string;
  label: string;
  action: LifecycleAction;
  color: string; // Tailwind color class or hex
  icon: string; // Lucide icon name
  isSystem?: boolean;
  participatesInAging: boolean;
}

export interface TaskHistoryItem {
  id: string;
  timestamp: string;
  date: string;
  action: 'created' | 'status_changed' | 'carried_forward' | 'historical_completion' | 'reopened' | 'archived' | 'moved';
  details: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: string; // maps to StatusDefinition.id
  statusBeforeDone?: string; // Checkbox untick restores the status before completion
  createdDate: string; // YYYY-MM-DD
  originalNoteDate: string; // YYYY-MM-DD where originally created
  carriedFromDate?: string; // YYYY-MM-DD of the immediate previous day it rolled from
  completedDate?: string; // Effective completion date (can be historical)
  heading: string; // e.g., 'Work', 'Meetings', 'Ideas', 'Attention'
  order: number;
  checklist?: ChecklistItem[];
  tags?: string[];
  dismissedAlertDate?: string; // If user snoozed/dismissed alert for this date
  historyLog: TaskHistoryItem[];
}

export interface HeadingSection {
  name: string;
  items: TaskItem[];
  notesContent?: string; // Free-form Markdown notes under this heading
}

export interface DailyDocument {
  date: string; // YYYY-MM-DD
  type: 'daily';
  headings: HeadingSection[];
  rawMarkdown?: string;
  /** Ids of tasks deleted from this day, so rollover and sync do not bring them back. Not written to markdown. */
  removedTaskIds?: string[];
  updatedAt: string;
}

export interface CalendarCell {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  done: number;
  total: number;
  hasNotes: boolean;
  titles: string[];
}

export interface StandaloneNote {
  id: string;
  title: string;
  folder: string; // e.g. 'Technical', 'Personal', 'Meetings'
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
}

export interface AgingThresholds {
  attentionDays: number; // default 3
  criticalDays: number; // default 7
  enabled: boolean;
  statuses: string[]; // default ['in-progress', 'blocked', 'waiting']
}

export interface SyncConfiguration {
  enabled: boolean;
  serverUrl: string;
  deviceId: string;
  authToken: string;
  lastSyncAt: string | null;
  status: 'offline' | 'synced' | 'syncing' | 'error';
}

export type ThemeMode = 'light' | 'dark';
export type TextSize = 's' | 'm' | 'l';
/** 'auto' or a '#rrggbb' colour. */
export type ColorChoice = string;
export interface ThemeColors {
  headerBg: string;
  headerOpacity: number;
  headerText: ColorChoice;
  pageText: ColorChoice;
  accent: ColorChoice;
}
export interface AppearanceSettings {
  theme: ThemeMode;
  textSize: TextSize;
  dim: number;
  blur: number;
  light: ThemeColors;
  dark: ThemeColors;
}
export interface ResolvedAppearance {
  theme: ThemeMode;
  rootFontPx: 15 | 16 | 17.5;
  headerBg: string;
  headerBgOpaque: string;
  headerText: string;
  pageText: string;
  accent: string;
  accentText: string;
  dim: number;
  blur: number;
  warnings: { field: 'headerText' | 'pageText' | 'accent'; ratio: number }[];
}

export interface AppSettings {
  appearance?: AppearanceSettings;
  defaultHeadings: string[];
  agingThresholds: AgingThresholds;
  statuses: StatusDefinition[];
  simulatedToday: string; // '' = real local date; YYYY-MM-DD = developer override for testing rollover
  timeZone: string;
  syncConfig: SyncConfiguration;
}

export type ViewTab = 'today' | 'calendar' | 'notes' | 'mobile-code' | 'server' | 'settings';

export type AppMode = 'desktop' | 'mobile-app' | 'web-server';

export type MobileTab = 'today' | 'calendar' | 'notes' | 'sync' | 'settings';

export interface ServerAuthState {
  isLoggedIn: boolean;
  username: string;
  token: string | null;
}

export type EditorMode = 'visual' | 'split' | 'raw';

export type SettingsTab = 'appearance' | 'storage' | 'sync' | 'lifecycle' | 'aging' | 'headings' | 'widget' | 'advanced';

/** Metadata for a background photo stored only on this device. */
export interface PhotoMeta {
  slot: number;
  addedAt: string;
  luminance: number;
  width: number;
  height: number;
}

/** Native-only preferences, stored per home-screen widget; never part of AppSettings or sync. */
export interface WidgetStyle {
  mode: 'match-app' | 'custom';
  background: string;
  opacity: number;
  text: 'auto' | string;
  accent: string;
  font: 'sans' | 'serif' | 'mono';
  size: 's' | 'm' | 'l' | 'xl';
  corners: 'square' | 'round' | 'extra';
  density: 'compact' | 'comfy';
  show: { done: boolean; age: boolean; quickAdd: boolean; sections: boolean };
}
