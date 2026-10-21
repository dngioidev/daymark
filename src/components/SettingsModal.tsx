import React, { useEffect, useRef, useState } from 'react';
import { Download, FlaskConical, LayoutGrid, Plus, Upload, X } from 'lucide-react';
import { AppSettings, LifecycleAction, StatusDefinition } from '../types/daymark';
import { formatLocalDate } from '../utils/clock';
import { getNextDate } from '../utils/lifecycleEngine';
import { formatDateTime } from '../utils/dateFormat';
import { isNativeApp, requestPinWidget } from '../native/daymarkBridge';
import { Dialog, buttonClass } from './ui/Dialog';
import { alertDialog, confirmDialog } from './ui/feedback';

export type SettingsTab = 'storage' | 'sync' | 'lifecycle' | 'aging' | 'headings' | 'advanced';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onExportZip: () => void;
  onExportJson: () => void;
  onImportJson: (jsonStr: string) => void;
  onImportZip: (file: File) => void;
  onResetVault: () => void;
  /** Rendered in the Sync tab (connection to the self-hosted server). */
  syncPanel: React.ReactNode;
  initialTab?: SettingsTab;
  /** True when this device syncs with a server (changes what restore/sample data do). */
  isSynced?: boolean;
  /** ISO time of the last backup made on this device. */
  lastBackupAt?: string | null;
}

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'storage', label: 'Backup & restore' },
  { id: 'sync', label: 'Sync' },
  { id: 'lifecycle', label: 'Statuses' },
  { id: 'aging', label: 'Old-task warnings' },
  { id: 'headings', label: 'Sections' },
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
  onSaveSettings,
  onExportZip,
  onExportJson,
  onImportJson,
  onImportZip,
  onResetVault,
  syncPanel,
  initialTab = 'storage',
  isSynced = false,
  lastBackupAt = null,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [error, setError] = useState<string | null>(null);
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusAction, setNewStatusAction] = useState<LifecycleAction>('carry-forward');
  const [newStatusAging, setNewStatusAging] = useState(true);
  const [newHeading, setNewHeading] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setDraft(JSON.parse(JSON.stringify(settings)));
    setError(null);
  }, [isOpen, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const actsImmediately = activeTab === 'storage' || activeTab === 'sync';

  const close = async () => {
    if (dirty && !(await confirmDialog({ title: 'Discard unsaved changes?', confirmLabel: 'Discard', danger: true }))) return;
    onClose();
  };

  const save = () => {
    if (draft.agingThresholds.criticalDays <= draft.agingThresholds.attentionDays) {
      setActiveTab('aging');
      setError('"Urgent" must be more days than "Needs attention".');
      return;
    }
    onSaveSettings(draft);
    onClose();
  };

  const setStatus = (id: string, patch: Partial<StatusDefinition>) =>
    setDraft({ ...draft, statuses: draft.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const addStatus = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newStatusLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `status-${Date.now()}`;
    if (draft.statuses.some((s) => s.id === id)) return setError(`There is already a status called "${label}".`);
    setDraft({
      ...draft,
      statuses: [
        ...draft.statuses,
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
    if (h && !draft.defaultHeadings.includes(h)) setDraft({ ...draft, defaultHeadings: [...draft.defaultHeadings, h] });
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
      footer={
        actsImmediately ? (
          <button type="button" onClick={onClose} className={buttonClass.primary}>
            Done
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className={buttonClass.ghost}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={!dirty} className={buttonClass.primary}>
              Save changes
            </button>
          </>
        )
      }
    >
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-11 sm:min-h-9 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                : 'bg-stone-100 text-stone-700 hover:text-stone-900 dark:bg-stone-800 dark:text-stone-300 dark:hover:text-stone-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="p-4 sm:p-5 space-y-4 text-sm">
        {error && (
          <p role="alert" className="p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900">
            {error}
          </p>
        )}

        {activeTab === 'storage' && (
          <>
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
                <p className={`${hint} mt-1`}>See today's tasks on your home screen, tick them off and add new ones without opening Daymark.</p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await requestPinWidget()))
                      await alertDialog(
                        'Add the widget from your home screen',
                        'Your launcher cannot add widgets automatically. Long-press the home screen, choose Widgets, and pick Daymark Today.'
                      );
                  }}
                  className={`${buttonClass.secondary} mt-3 w-full sm:w-auto`}
                >
                  <LayoutGrid className="w-4 h-4" /> Add widget
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'sync' && syncPanel}

        {activeTab === 'lifecycle' && (
          <>
            <p className={hint}>Choose what happens each morning to tasks left in each status.</p>
            <ul className="space-y-2">
              {draft.statuses.map((status) => (
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
                      onClick={() => setDraft({ ...draft, statuses: draft.statuses.filter((s) => s.id !== status.id) })}
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
                    value={draft.agingThresholds[key]}
                    onChange={(e) => setDraft({ ...draft, agingThresholds: { ...draft.agingThresholds, [key]: parseInt(e.target.value, 10) || 1 } })}
                    className={`${input} w-24`}
                  />
                  <span className="text-stone-700 dark:text-stone-300">days</span>
                </div>
                <p className={`${hint} mt-1`}>{help}</p>
              </div>
            ))}
          </>
        )}

        {activeTab === 'headings' && (
          <>
            <p className={hint}>Every new day starts with these sections.</p>
            <ul className="space-y-2">
              {draft.defaultHeadings.map((heading) => (
                <li key={heading} className={`${card} py-1.5 flex items-center justify-between`}>
                  <span className="font-semibold">{heading}</span>
                  <button
                    type="button"
                    aria-label={`Remove section ${heading}`}
                    onClick={() => setDraft({ ...draft, defaultHeadings: draft.defaultHeadings.filter((h) => h !== heading) })}
                    className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-500 hover:text-rose-700 hover:bg-stone-100 dark:hover:bg-stone-800"
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
                  className={input}
                />
                <button type="button" onClick={() => setDraft({ ...draft, simulatedToday: '' })} className={buttonClass.ghost}>
                  Use real date
                </button>
                <button type="button" onClick={() => setDraft({ ...draft, simulatedToday: getNextDate(formatLocalDate(), 1) })} className={buttonClass.ghost}>
                  Tomorrow
                </button>
              </div>
            </div>

            <p className={hint}>Daymark {__APP_VERSION__}{lastBackupAt ? ` · last backup ${formatDateTime(lastBackupAt)}` : ''}</p>
          </>
        )}
      </div>
    </Dialog>
  );
};
