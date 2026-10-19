import React, { useState } from 'react';
import {
  Settings,
  X,
  Sliders,
  Clock,
  HardDrive,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Download,
  Upload,
  Server,
  Layers,
} from 'lucide-react';
import { AppSettings, LifecycleAction, StatusDefinition } from '../types/daymark';
import { SyncLogEntry } from '../utils/vaultStore';
import { formatLocalDate } from '../utils/clock';
import { getNextDate } from '../utils/lifecycleEngine';
import { isNativeApp, requestPinWidget } from '../native/daymarkBridge';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  syncLogs: SyncLogEntry[];
  onSaveSettings: (settings: AppSettings) => void;
  onExportZip: () => void;
  onExportJson: () => void;
  onImportJson: (jsonStr: string) => void;
  onImportZip: (file: File) => void;
  onResetVault: () => void;
  onTriggerSync: () => void;
}

type SettingsTab = 'lifecycle' | 'aging' | 'headings' | 'storage' | 'sync' | 'simulation';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  syncLogs,
  onSaveSettings,
  onExportZip,
  onExportJson,
  onImportJson,
  onImportZip,
  onResetVault,
  onTriggerSync,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<SettingsTab>('lifecycle');
  const [draftSettings, setDraftSettings] = useState<AppSettings>(JSON.parse(JSON.stringify(settings)));

  // Add new status state
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusAction, setNewStatusAction] = useState<LifecycleAction>('carry-forward');
  const [newStatusAging, setNewStatusAging] = useState(true);

  // Add new heading state
  const [newHeadingInput, setNewHeadingInput] = useState('');

  // Import file ref
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleSave = () => {
    // Validate aging thresholds
    if (draftSettings.agingThresholds.criticalDays <= draftSettings.agingThresholds.attentionDays) {
      alert('Critical aging threshold must be greater than Attention threshold.');
      return;
    }
    onSaveSettings(draftSettings);
    onClose();
  };

  const handleAddStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusLabel.trim()) return;
    const id = newStatusLabel.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const newStatus: StatusDefinition = {
      id,
      label: newStatusLabel.trim(),
      action: newStatusAction,
      color: 'text-stone-700 bg-stone-100 border-stone-200 dark:bg-stone-800 dark:text-stone-200',
      icon: 'Circle',
      isSystem: false,
      participatesInAging: newStatusAging,
    };
    setDraftSettings({
      ...draftSettings,
      statuses: [...draftSettings.statuses, newStatus],
    });
    setNewStatusLabel('');
  };

  const handleDeleteStatus = (id: string) => {
    setDraftSettings({
      ...draftSettings,
      statuses: draftSettings.statuses.filter((s) => s.id !== id),
    });
  };

  const handleUpdateStatusAction = (id: string, action: LifecycleAction) => {
    setDraftSettings({
      ...draftSettings,
      statuses: draftSettings.statuses.map((s) => (s.id === id ? { ...s, action } : s)),
    });
  };

  const handleToggleStatusAging = (id: string) => {
    setDraftSettings({
      ...draftSettings,
      statuses: draftSettings.statuses.map((s) =>
        s.id === id ? { ...s, participatesInAging: !s.participatesInAging } : s
      ),
    });
  };

  const handleAddHeading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHeadingInput.trim()) return;
    const h = newHeadingInput.trim();
    if (!draftSettings.defaultHeadings.includes(h)) {
      setDraftSettings({
        ...draftSettings,
        defaultHeadings: [...draftSettings.defaultHeadings, h],
      });
    }
    setNewHeadingInput('');
  };

  const handleDeleteHeading = (name: string) => {
    setDraftSettings({
      ...draftSettings,
      defaultHeadings: draftSettings.defaultHeadings.filter((h) => h !== name),
    });
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Daymark Preferences & Rules
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-stone-200 dark:border-stone-800 px-4 overflow-x-auto text-xs bg-stone-50/50 dark:bg-stone-900/50">
          <button
            onClick={() => setActiveTab('lifecycle')}
            className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'lifecycle'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Statuses & Lifecycle
          </button>

          <button
            onClick={() => setActiveTab('aging')}
            className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'aging'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Carry-Forward Aging
          </button>

          <button
            onClick={() => setActiveTab('headings')}
            className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'headings'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Default Headings
          </button>

          <button
            onClick={() => setActiveTab('simulation')}
            className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'simulation'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Date Simulator
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'storage'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Vault & Backup
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`py-3 px-3 font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'sync'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Self-Hosted Sync
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          {/* TAB 1: STATUSES & LIFECYCLE */}
          {activeTab === 'lifecycle' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Task Statuses and Rollover Lifecycle Rules
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Configure what happens during daily rollover for each status: keep in note, carry forward to tomorrow, or archive.
                </p>
              </div>

              {/* Status table */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden text-xs">
                <table className="w-full divide-y divide-stone-200 dark:divide-stone-800">
                  <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Status Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Daily Lifecycle Action</th>
                      <th className="px-3 py-2 text-center font-semibold">Participates in Aging</th>
                      <th className="px-3 py-2 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                    {draftSettings.statuses.map((status) => (
                      <tr key={status.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                        <td className="px-3 py-2 font-medium text-stone-900 dark:text-stone-100">
                          {status.label}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={status.action}
                            disabled={status.id === 'done'}
                            onChange={(e) =>
                              handleUpdateStatusAction(status.id, e.target.value as LifecycleAction)
                            }
                            className="px-2 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-stone-800 dark:text-stone-200 disabled:opacity-50"
                          >
                            <option value="keep">Keep in current note</option>
                            <option value="carry-forward">Carry forward</option>
                            <option value="archive">Archive</option>
                            <option value="warn">Warn only</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={status.participatesInAging}
                            disabled={status.id === 'done' || status.id === 'note'}
                            onChange={() => handleToggleStatusAging(status.id)}
                            className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!status.isSystem && (
                            <button
                              type="button"
                              onClick={() => handleDeleteStatus(status.id)}
                              className="text-stone-400 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add custom status */}
              <form
                onSubmit={handleAddStatus}
                className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-200 dark:border-stone-800 flex items-center gap-3 text-xs"
              >
                <input
                  type="text"
                  placeholder="New status name (e.g. In Review, Delegated)"
                  value={newStatusLabel}
                  onChange={(e) => setNewStatusLabel(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded text-stone-900 dark:text-stone-100"
                />
                <select
                  value={newStatusAction}
                  onChange={(e) => setNewStatusAction(e.target.value as LifecycleAction)}
                  className="px-2 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded text-stone-800 dark:text-stone-200"
                >
                  <option value="carry-forward">Carry forward</option>
                  <option value="keep">Keep in note</option>
                  <option value="archive">Archive</option>
                </select>
                <label className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
                  <input
                    type="checkbox"
                    checked={newStatusAging}
                    onChange={(e) => setNewStatusAging(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <span>Track Aging</span>
                </label>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-stone-800 dark:bg-stone-700 text-white rounded font-medium hover:bg-stone-900"
                >
                  Add Status
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: AGING THRESHOLDS */}
          {activeTab === 'aging' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Carry-Forward Aging & Alerts
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Configure calendar-day thresholds for deferred work indicators (Section 8 of PRD).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                  <label className="block text-xs font-semibold text-stone-800 dark:text-stone-200">
                    Attention Warning Threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draftSettings.agingThresholds.attentionDays}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          agingThresholds: {
                            ...draftSettings.agingThresholds,
                            attentionDays: parseInt(e.target.value, 10) || 1,
                          },
                        })
                      }
                      className="w-24 px-3 py-1.5 text-xs bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md font-mono"
                    />
                    <span className="text-xs text-stone-500">days carried forward</span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Displays amber accent and attention indicator on the task.
                  </p>
                </div>

                <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                  <label className="block text-xs font-semibold text-stone-800 dark:text-stone-200">
                    Critical Alert Threshold
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={draftSettings.agingThresholds.attentionDays + 1}
                      max={60}
                      value={draftSettings.agingThresholds.criticalDays}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          agingThresholds: {
                            ...draftSettings.agingThresholds,
                            criticalDays: parseInt(e.target.value, 10) || 1,
                          },
                        })
                      }
                      className="w-24 px-3 py-1.5 text-xs bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md font-mono"
                    />
                    <span className="text-xs text-stone-500">days carried forward</span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Displays prominent critical indicator and banner alert.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-950 dark:text-amber-200 space-y-1">
                <span className="font-semibold">Aging Rules Compliance:</span>
                <p className="text-[11px] text-stone-600 dark:text-stone-400">
                  Task age is derived from its tracking origin date and calendar days elapsed. Changing status between active states (e.g. In progress → Blocked) does NOT reset the counter. Completed tasks stop aging.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: DEFAULT HEADINGS */}
          {activeTab === 'headings' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Default Daily Notebook Headings
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  When a new daily document is created, these Markdown section headings are auto-populated.
                </p>
              </div>

              <div className="space-y-2">
                {draftSettings.defaultHeadings.map((heading) => (
                  <div
                    key={heading}
                    className="flex items-center justify-between p-2.5 bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-800 rounded-lg text-xs"
                  >
                    <span className="font-semibold text-stone-800 dark:text-stone-200">#{heading}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteHeading(heading)}
                      className="text-stone-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddHeading} className="flex gap-2 text-xs">
                <input
                  type="text"
                  placeholder="New heading name (e.g. Follow-ups, Learning)"
                  value={newHeadingInput}
                  onChange={(e) => setNewHeadingInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded text-stone-900 dark:text-stone-100"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-stone-800 dark:bg-stone-700 text-white rounded font-medium"
                >
                  Add Heading
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: DATE SIMULATION */}
          {activeTab === 'simulation' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Interactive Date Simulator
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Developer tool. Leave empty to use your real local date. Set a date to test the rollover and aging engine.
                </p>
              </div>

              <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3 text-xs">
                <label className="block font-semibold text-stone-800 dark:text-stone-200">
                  Date override (empty = real date)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={draftSettings.simulatedToday}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, simulatedToday: e.target.value })
                    }
                    className="px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, simulatedToday: '' })}
                    className="px-3 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 rounded text-xs font-mono"
                  >
                    Use real date
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, simulatedToday: getNextDate(formatLocalDate(), 1) })}
                    className="px-3 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 rounded text-xs font-mono"
                  >
                    Real today +1 day
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftSettings({ ...draftSettings, simulatedToday: getNextDate(formatLocalDate(), 2) })}
                    className="px-3 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 rounded text-xs font-mono"
                  >
                    Real today +2 days
                  </button>
                </div>
                <p className="text-[11px] text-stone-500">
                  With an override set, opening Today executes the idempotent rollover algorithm, carrying forward unfinished tasks and incrementing the carry-forward age.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: VAULT STORAGE & BACKUP */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Local-First Vault & Portability
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Export standard Markdown directories, create JSON backups, or restore data.
                </p>
              </div>

              {isNativeApp() && (
                <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-stone-900 dark:text-stone-100">Home-screen widget</div>
                    <p className="text-[11px] text-stone-500">
                      Show today's tasks on your home screen and tick them off without opening Daymark.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await requestPinWidget();
                      if (!ok) alert('Your launcher cannot add widgets automatically. Long-press the home screen, choose Widgets, and pick Daymark Today.');
                    }}
                    className="px-3.5 py-1.5 min-h-[36px] bg-amber-600 hover:bg-amber-700 rounded font-medium text-white shrink-0"
                  >
                    Add widget
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
                  <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <Download className="w-4 h-4 text-amber-600" />
                    <span>Export Full Vault (.zip)</span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Exports pure Markdown folder structure: <code>Daily/YYYY/MM-Month/YYYY-MM-DD.md</code>, <code>Notes/...</code>, and <code>.daymark/configuration.json</code>.
                  </p>
                  <button
                    type="button"
                    onClick={onExportZip}
                    className="w-full mt-2 py-2 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-semibold rounded-md hover:opacity-90"
                  >
                    Download Vault ZIP
                  </button>
                </div>

                <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
                  <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-amber-600" />
                    <span>JSON Snapshot Backup</span>
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Complete state snapshot for disaster recovery and cross-device migration.
                  </p>
                  <button
                    type="button"
                    onClick={onExportJson}
                    className="w-full mt-2 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold rounded-md border border-stone-300 dark:border-stone-700"
                  >
                    Download JSON Backup
                  </button>
                </div>
              </div>

              {/* Restore & Reset */}
              <div className="p-4 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-semibold text-stone-900 dark:text-stone-100">
                    Restore Backup (.zip or .json)
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Upload a Daymark vault ZIP, a JSON backup, or a ZIP of Markdown notes. This replaces the current vault.
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,.zip"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 rounded font-medium text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700"
                >
                  Select File...
                </button>
              </div>

              <div className="p-4 border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/20 rounded-xl flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-semibold text-rose-900 dark:text-rose-200">
                    Reset to Demonstration Seed Data
                  </div>
                  <p className="text-[11px] text-stone-500">
                    Replaces local storage with the original October 14–16 seed notes and carry-forward demo tasks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Reset all daily notes and standalone files to default seed data?')) {
                      onResetVault();
                      onClose();
                    }
                  }}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-medium shadow-2xs"
                >
                  Reset Vault
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: SELF-HOSTED SYNC */}
          {activeTab === 'sync' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Server className="w-4 h-4 text-amber-600" />
                  <span>Self-Hosted Synchronization Protocol</span>
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Synchronize your Markdown notebook with a private server under your control (Section 9.3 of PRD).
                </p>
              </div>

              <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                    Self-Hosted Server URL
                  </label>
                  <input
                    type="text"
                    value={draftSettings.syncConfig.serverUrl}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        syncConfig: { ...draftSettings.syncConfig, serverUrl: e.target.value },
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                      Device Identifier
                    </label>
                    <input
                      type="text"
                      value={draftSettings.syncConfig.deviceId}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          syncConfig: { ...draftSettings.syncConfig, deviceId: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                      Bearer Auth Token
                    </label>
                    <input
                      type="password"
                      value={draftSettings.syncConfig.authToken}
                      onChange={(e) =>
                        setDraftSettings({
                          ...draftSettings,
                          syncConfig: { ...draftSettings.syncConfig, authToken: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-stone-500 font-mono">
                    Last sync: {draftSettings.syncConfig.lastSyncAt || 'Never'}
                  </div>
                  <button
                    type="button"
                    onClick={onTriggerSync}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium flex items-center gap-1.5 shadow-2xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync Now</span>
                  </button>
                </div>
              </div>

              {/* Sync Log Entries */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                  Recent Sync Audit Log
                </h4>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {syncLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 bg-stone-50 dark:bg-stone-800/50 rounded border border-stone-200 dark:border-stone-800 flex items-center justify-between"
                    >
                      <span className="text-stone-700 dark:text-stone-300 truncate">{log.details}</span>
                      <span className="text-stone-400 shrink-0 ml-2">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 rounded-md shadow-2xs transition-colors"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
};
