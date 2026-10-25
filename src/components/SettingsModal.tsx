import React, { useEffect, useRef, useState } from 'react';
import { Download, FlaskConical, LayoutGrid, Plus, Upload, X } from 'lucide-react';
import { AppSettings, LifecycleAction, StatusDefinition, SettingsTab } from '../types/daymark';
import { formatLocalDate } from '../utils/clock';
import { getNextDate } from '../utils/lifecycleEngine';
import { formatDateTime } from '../utils/dateFormat';
import { listAssets } from '../utils/noteAssets';
import { isNativeApp, pinHabitsWidget, requestPinWidget } from '../native/daymarkBridge';
import { Dialog, buttonClass } from './ui/Dialog';
import { alertDialog, confirmDialog, showToast } from './ui/feedback';

import { AppearanceTab } from './settings/AppearanceTab';
import { resetTab, useInstantSettings } from './settings/useInstantSettings';
import { DEFAULT_APPEARANCE } from '../utils/defaultData';
import { WidgetTab } from './settings/WidgetTab';
import type { WidgetAppColors } from '../utils/widgetStyle';

export type { SettingsTab } from '../types/daymark';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChangeSettings: (settings: AppSettings) => void;
  onExportZip: () => void;
  onExportJson: () => void;
  onImportJson: (jsonStr: string) => void;
  onImportZip: (file: File) => void;
  onResetVault: () => void;
  onRemoveUnusedPictures?: () => Promise<number>;
  /** Rendered in the Sync tab (connection to the self-hosted server). */
  syncPanel: React.ReactNode;
  initialTab?: SettingsTab;
  /** True when this device syncs with a server (changes what restore/sample data do). */
  isSynced?: boolean;
  /** ISO time of the last backup made on this device. */
  lastBackupAt?: string | null;
  photoSection?: React.ReactNode;
  photoMeta?: { luminance: number } | null;
  widgetEditorId?: number;
  widgetAppColors?: WidgetAppColors;
}

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'storage', label: 'Backup & restore' },
  { id: 'sync', label: 'Sync' },
  { id: 'lifecycle', label: 'Statuses' },
  { id: 'aging', label: 'Old-task warnings' },
  { id: 'headings', label: 'Sections' },
  { id: 'widget', label: 'Widget' },
  { id: 'advanced', label: 'Advanced' },
];

const ACTION_LABELS: Record<LifecycleAction, string> = {
  'carry-forward': 'Move to today',
  keep: 'Leave on that day',
  archive: 'Archive',
  warn: 'Leave, and warn',
};

const card = 'p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900';
const input =
  'px-3 min-h-11 sm:min-h-9 text-[15px] sm:text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100';
const hint = 'text-sm text-stone-600 dark:text-stone-400';

const daysAgo = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
  onExportZip,
  onExportJson,
  onImportJson,
  onImportZip,
  onResetVault,
  onRemoveUnusedPictures,
  syncPanel,
  initialTab = 'appearance',
  isSynced = false,
  lastBackupAt = null,
  photoSection,
  photoMeta,
  widgetEditorId,
  widgetAppColors,
}) => {
  const visibleTabs = SETTINGS_TABS.filter((tab) => tab.id !== 'widget' || isNativeApp());
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [pictureUsage, setPictureUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [removingPictures, setRemovingPictures] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const refreshPictures = async () => {
    const assets = await listAssets();
    setPictureUsage({ count: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0) });
  };
  useEffect(() => {
    if (!isOpen || activeTab !== 'storage') return;
    const refresh = () => { void refreshPictures().catch(() => setPictureError('Could not read picture storage.')); };
    refresh();
    window.addEventListener('daymark-assets-changed', refresh);
    return () => window.removeEventListener('daymark-assets-changed', refresh);
  }, [isOpen, activeTab]);
  const removePictures = async () => {
    if (!onRemoveUnusedPictures || removingPictures) return;
    setRemovingPictures(true);
    try {
      if (!(await confirmDialog({
        title: 'Remove unused pictures?',
        message: isSynced
          ? 'Daymark will sync first, then remove pictures that no note uses from this device and your server.'
          : 'Remove pictures that no note uses from this device.',
        confirmLabel: 'Remove unused pictures', danger: true,
      }))) return;
      setPictureError(null);
      const count = await onRemoveUnusedPictures();
      showToast(`Removed ${count} unused ${count === 1 ? 'picture' : 'pictures'}.`);
    } catch (error) {
      setPictureError(error instanceof Error ? error.message : 'Could not remove unused pictures.');
    } finally {
      await refreshPictures().catch(() => setPictureError('Could not read picture storage.'));
      setRemovingPictures(false);
    }
  };
  const { draft, setDraft, error, setError, saved, commit } = useInstantSettings(settings, onChangeSettings, isOpen);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusAction, setNewStatusAction] = useState<LifecycleAction>('carry-forward');
  const [newStatusAging, setNewStatusAging] = useState(true);
  const [newHeading, setNewHeading] = useState('');
  const [verticalTabs, setVerticalTabs] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    const update = () => setVerticalTabs(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const handleTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const forward = verticalTabs ? 'ArrowDown' : 'ArrowRight';
    const back = verticalTabs ? 'ArrowUp' : 'ArrowLeft';
    const index = visibleTabs.findIndex((t) => t.id === activeTab);
    let next: number;
    if (e.key === forward) next = (index + 1) % visibleTabs.length;
    else if (e.key === back) next = (index - 1 + visibleTabs.length) % visibleTabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visibleTabs.length - 1;
    else return;
    e.preventDefault();
    selectTab(visibleTabs[next].id);
    document.getElementById(`settings-tab-${visibleTabs[next].id}`)?.focus();
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setNewStatusLabel('');
    setNewHeading('');
  }, [isOpen, initialTab]);

  const selectTab = (tab: SettingsTab) => {
    setDraft(settings);
    setError(null);
    setActiveTab(tab);
  };
  const close = onClose;
  const reset = () => {
    const previous = settings;
    if (commit(resetTab(activeTab, settings))) showToast('Reset to defaults.', {
      action: { label: 'Undo', onClick: () => commit(previous) },
    });
  };

  const setStatus = (id: string, patch: Partial<StatusDefinition>) =>
    commit({ ...settings, statuses: settings.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const addStatus = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newStatusLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `status-${Date.now()}`;
    if (settings.statuses.some((s) => s.id === id)) return setError(`There is already a status called "${label}".`);
    commit({
      ...settings,
      statuses: [
        ...settings.statuses,
        {
          id,
          label,
          action: newStatusAction,
          color: 'text-stone-700 bg-stone-100 border-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700',
          icon: 'Circle',
          isSystem: false,
          participatesInAging: newStatusAging,
        },
      ],
    });
    setNewStatusLabel('');
    setError(null);
  };

  const addHeading = (e: React.FormEvent) => {
    e.preventDefault();
    const h = newHeading.trim();
    if (h && !settings.defaultHeadings.includes(h)) commit({ ...settings, defaultHeadings: [...settings.defaultHeadings, h] });
    setNewHeading('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.zip')) {
      onImportZip(file);
      onClose();
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportJson(content);
        onClose();
      }
    };
    reader.readAsText(file);
  };

  const replaceWithSample = async () => {
    const ok = await confirmDialog({
      title: 'Replace everything with sample data?',
      message: 'All days, tasks and notes on this device are replaced with demo content. Back up first if you want to keep them.',
      confirmLabel: 'Replace',
      danger: true,
    });
    if (ok) {
      onResetVault();
      onClose();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      variant="fullscreen-mobile"
      size="xl"
      title="Settings"
      headerStatus={<span role="status" className="text-xs text-stone-500">{saved ? 'Saved' : ''}</span>}
      fixedSettingsSize
    >
      <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <div role="tablist" aria-label="Settings sections" aria-orientation={verticalTabs ? 'vertical' : 'horizontal'} className="shrink-0 flex flex-nowrap overflow-x-auto gap-1.5 px-4 py-3 border-b sm:border-b-0 sm:border-r sm:w-[180px] sm:flex-col border-stone-200 dark:border-stone-800">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onKeyDown={handleTabKey}
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
            className={`min-h-11 sm:min-h-9 px-3.5 rounded-full sm:rounded-lg sm:text-left text-sm font-semibold whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'bg-stone-100 text-stone-700 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-300 dark:hover:text-stone-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`settings-panel-${activeTab}`} aria-labelledby={`settings-tab-${activeTab}`} className="min-w-0 min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">
        {error && activeTab !== 'aging' && (
          <p role="alert" className="p-3 rounded-lg bg-stone-50 text-stone-800 border border-stone-200 dark:bg-stone-950 dark:text-stone-200 dark:border-stone-800">
            {error}
          </p>
        )}

        {activeTab === 'appearance' && <AppearanceTab appearance={settings.appearance ?? DEFAULT_APPEARANCE} photoSection={photoSection} photoMeta={photoMeta} onChange={(appearance) => commit({ ...settings, appearance })} />}
        {activeTab === 'widget' && isNativeApp() && <WidgetTab initialWidgetId={widgetEditorId} app={widgetAppColors ?? null} />}

        {activeTab === 'storage' && (
          <>
            <div className={card}>
              <h3 className="font-semibold text-base">{pictureUsage ? `Pictures: ${pictureUsage.count} · ${(pictureUsage.bytes / 1_000_000).toFixed(1)} MB` : 'Pictures: loading…'}</h3>
              <p className={`${hint} mt-1`}>Picture storage on this device. Pictures are only removed when you choose.</p>
              <button type="button" onClick={removePictures} disabled={removingPictures || !onRemoveUnusedPictures} className={`${buttonClass.secondary} mt-3 min-h-11 w-full sm:w-auto`}>
                {removingPictures ? 'Checking pictures…' : 'Remove unused pictures'}
              </button>
              {pictureError && <p role="alert" className={`${hint} mt-2`}>{pictureError}</p>}
            </div>
            <div className={card}>
              <h3 className="font-semibold text-base">Back up</h3>
              <p className={`${hint} mt-1`}>
                Saves all your days and notes as plain Markdown files in a .zip you can open anywhere.{' '}
                <span className="font-medium text-stone-800 dark:text-stone-200">
                  {lastBackupAt ? `Last backup on this device: ${daysAgo(lastBackupAt)}.` : 'No backup made on this device yet.'}
                </span>
              </p>
              <button type="button" onClick={onExportZip} className={`${buttonClass.primary} mt-3 w-full sm:w-auto`}>
                <Download className="w-4 h-4" /> Back up now
              </button>
            </div>

            <div className={card}>
              <h3 className="font-semibold text-base">Restore</h3>
              <p className={`${hint} mt-1`}>
                Open a Daymark backup (.zip or .json) or a .zip of Markdown files.{' '}
                {isSynced
                  ? 'Because sync is on, it is merged with your server; nothing on your other devices is deleted.'
                  : 'It replaces what is on this device.'}
              </p>
              <input type="file" ref={fileInputRef} accept=".json,.zip" onChange={handleFileChange} className="hidden" aria-label="Backup file" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className={`${buttonClass.secondary} mt-3 w-full sm:w-auto`}>
                <Upload className="w-4 h-4" /> Choose a backup file…
              </button>
            </div>

            {isNativeApp() && (
              <div className={card}>
                <h3 className="font-semibold text-base">Home-screen widget</h3>
                <p className={`${hint} mt-1`}>See today's tasks and habits on your home screen and tick them off without opening Daymark.</p>
                <div className="flex flex-wrap gap-2">{(['tasks', 'habits'] as const).map((kind) => <button
                  key={kind}
                  type="button"
                  onClick={async () => {
                    if (!(await (kind === 'habits' ? pinHabitsWidget() : requestPinWidget())))
                      await alertDialog(
                        'Add the widget from your home screen',
                        `Your launcher cannot add widgets automatically. Long-press the home screen, choose Widgets, and pick Daymark ${kind === 'habits' ? 'Habits' : 'Today'}.`
                      );
                  }}
                  className={`${buttonClass.secondary} mt-3 w-full sm:w-auto`}
                >
                  <LayoutGrid className="w-4 h-4" /> Add {kind} widget
                </button>)}</div>
              </div>
            )}
          </>
        )}

        {activeTab === 'sync' && syncPanel}

        {activeTab === 'lifecycle' && (
          <>
            <p className={hint}>Choose what happens each morning to tasks left in each status.</p>
            <ul className="space-y-2">
              {settings.statuses.map((status) => (
                <li key={status.id} className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2`}>
                  <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${status.color}`}>{status.label}</span>
                  <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-1 min-w-48 basis-full sm:basis-auto">
                    <span className="text-stone-700 dark:text-stone-300 whitespace-nowrap">Each morning</span>
                    <select
                      value={status.action}
                      disabled={status.id === 'done'}
                      onChange={(e) => setStatus(status.id, { action: e.target.value as LifecycleAction })}
                      className={`${input} flex-1 min-w-0 disabled:opacity-60`}
                    >
                      {(Object.keys(ACTION_LABELS) as LifecycleAction[]).map((a) => (
                        <option key={a} value={a}>
                          {ACTION_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 min-h-11 sm:min-h-9">
                    <input
                      type="checkbox"
                      checked={status.participatesInAging}
                      disabled={status.id === 'done' || status.id === 'note'}
                      onChange={() => setStatus(status.id, { participatesInAging: !status.participatesInAging })}
                      className="w-5 h-5 accent-amber-700"
                    />
                    <span className="text-stone-700 dark:text-stone-300">Warn when it gets old</span>
                  </label>
                  {!status.isSystem && (
                    <button
                      type="button"
                      aria-label={`Remove status ${status.label}`}
                      onClick={() => commit({ ...settings, statuses: settings.statuses.filter((s) => s.id !== status.id) })}
                      className="ml-auto inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-500 hover:text-rose-700 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <form onSubmit={addStatus} className={`${card} space-y-2`}>
              <h3 className="font-semibold">Add a status</h3>
              <label htmlFor="new-status" className="sr-only">
                Status name
              </label>
              <input
                id="new-status"
                type="text"
                placeholder="Name, e.g. In review"
                value={newStatusLabel}
                onChange={(e) => setNewStatusLabel(e.target.value)}
                className={`${input} w-full`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-1 min-w-48 basis-full sm:basis-auto">
                  <span className="whitespace-nowrap text-stone-700 dark:text-stone-300">Each morning</span>
                  <select value={newStatusAction} onChange={(e) => setNewStatusAction(e.target.value as LifecycleAction)} className={`${input} flex-1 min-w-0`}>
                    {(['carry-forward', 'keep', 'archive'] as LifecycleAction[]).map((a) => (
                      <option key={a} value={a}>
                        {ACTION_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 min-h-11 sm:min-h-9">
                  <input type="checkbox" checked={newStatusAging} onChange={(e) => setNewStatusAging(e.target.checked)} className="w-5 h-5 accent-amber-700" />
                  <span className="text-stone-700 dark:text-stone-300">Warn when it gets old</span>
                </label>
                <button type="submit" disabled={!newStatusLabel.trim()} className={buttonClass.secondary}>
                  <Plus className="w-4 h-4" /> Add status
                </button>
              </div>
            </form>
          </>
        )}

        {activeTab === 'aging' && (
          <>
            <p className={hint}>
              Tasks that keep moving to the next day get a warning so they don't drift forever. Age counts calendar days since the task was
              created; changing its status doesn't reset it.
            </p>
            {(
              [
                ['attentionDays', 'Needs attention after', 'Amber marker on the task.', 1, 30],
                ['criticalDays', 'Urgent after', 'Red marker, and counted in the banner on Today.', draft.agingThresholds.attentionDays + 1, 60],
              ] as const
            ).map(([key, label, help, min, max]) => (
              <div key={key} className={card}>
                <label htmlFor={`aging-${key}`} className="block font-semibold">
                  {label}
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={`aging-${key}`}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    value={Number.isNaN(draft.agingThresholds[key]) ? '' : draft.agingThresholds[key]}
                    onChange={(e) => setDraft({ ...draft, agingThresholds: { ...draft.agingThresholds, [key]: e.target.value === '' ? NaN : Number(e.target.value) } })}
                    onBlur={() => commit()}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `aging-error-${key}` : undefined}
                    className={`${input} w-24`}
                  />
                  <span className="text-stone-700 dark:text-stone-300">days</span>
                </div>
                <p className={`${hint} mt-1`}>{help}</p>
                {error && <p id={`aging-error-${key}`} role="alert" className={hint}>{error}</p>}
              </div>
            ))}
          </>
        )}

        {activeTab === 'headings' && (
          <>
            <p className={hint}>Every new day starts with these sections.</p>
            <ul className="space-y-2">
              {settings.defaultHeadings.map((heading) => (
                <li key={heading} className={`${card} py-1.5 flex items-center justify-between`}>
                  <span className="font-semibold">{heading}</span>
                  <button
                    type="button"
                    aria-label={`Remove section ${heading}`}
                    disabled={settings.defaultHeadings.length === 1}
                    title={settings.defaultHeadings.length === 1 ? 'Keep at least one section' : undefined}
                    onClick={() => commit({ ...settings, defaultHeadings: settings.defaultHeadings.filter((h) => h !== heading) })}
                    className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-500 hover:text-rose-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addHeading} className="flex gap-2">
              <label htmlFor="new-heading" className="sr-only">
                New section name
              </label>
              <input
                id="new-heading"
                type="text"
                placeholder="New section, e.g. Follow-ups"
                value={newHeading}
                onChange={(e) => setNewHeading(e.target.value)}
                className={`${input} flex-1 min-w-0`}
              />
              <button type="submit" disabled={!newHeading.trim()} className={buttonClass.secondary}>
                Add
              </button>
            </form>
          </>
        )}

        {activeTab === 'advanced' && (
          <>
            <div className={card}>
              <h3 className="font-semibold">Technical backup (.json)</h3>
              <p className={`${hint} mt-1`}>One file with everything, including settings. Restore it the same way as a .zip backup.</p>
              <button type="button" onClick={onExportJson} className={`${buttonClass.secondary} mt-3`}>
                <Download className="w-4 h-4" /> Download .json
              </button>
            </div>

            <div className={card}>
              <h3 className="font-semibold">Sample data</h3>
              <p className={`${hint} mt-1`}>
                {isSynced
                  ? 'Not available while sync is on: the demo content would be added to your server and every device. Disconnect first.'
                  : 'Replace everything on this device with demo days, tasks and notes to explore Daymark.'}
              </p>
              <button type="button" onClick={replaceWithSample} disabled={isSynced} className={`${buttonClass.secondary} mt-3 text-rose-700 dark:text-rose-400 disabled:opacity-50`}>
                Replace with sample data…
              </button>
            </div>

            <div className={card}>
              <h3 className="font-semibold flex items-center gap-2">
                <FlaskConical className="w-4 h-4" /> Pretend it's another day
              </h3>
              <p className={`${hint} mt-1`}>For testing how unfinished tasks move to the next day. Leave empty to use the real date.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="date-override" className="sr-only">
                  Date override
                </label>
                <input
                  id="date-override"
                  type="date"
                  value={draft.simulatedToday}
                  onChange={(e) => setDraft({ ...draft, simulatedToday: e.target.value })}
                  onBlur={() => commit()}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                  className={input}
                />
                <button type="button" onClick={() => commit({ ...settings, simulatedToday: '' })} className={buttonClass.ghost}>
                  Use real date
                </button>
                <button type="button" onClick={() => commit({ ...settings, simulatedToday: getNextDate(formatLocalDate(), 1) })} className={buttonClass.ghost}>
                  Tomorrow
                </button>
              </div>
            </div>

            <p className={hint}>Daymark {__APP_VERSION__}{lastBackupAt ? ` · last backup ${formatDateTime(lastBackupAt)}` : ''}</p>
          </>
        )}
        {['appearance', 'lifecycle', 'aging', 'headings'].includes(activeTab) && <button type="button" onClick={reset} className={buttonClass.secondary}>Reset to defaults</button>}
      </div>
      </div>
    </Dialog>
  );
};
