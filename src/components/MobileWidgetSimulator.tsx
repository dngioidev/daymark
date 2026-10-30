import React, { useState } from 'react';
import {
  Smartphone,
  Check,
  Plus,
  Clock,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { CountingDays, DailyDocument, StatusDefinition, TaskItem } from '../types/daymark';
import { calculateTaskAge, getAgingSeverity, getPreviousDate } from '../utils/lifecycleEngine';

interface MobileWidgetSimulatorProps {
  countingDays?: CountingDays;
  currentDocument: DailyDocument;
  simulatedToday: string;
  statuses: StatusDefinition[];
  onToggleTaskDone: (taskId: string) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onQuickAddTask: (title: string, section: string) => void;
}

type WidgetSize = 'medium' | 'small' | 'large' | 'lockscreen';

export const MobileWidgetSimulator: React.FC<MobileWidgetSimulatorProps> = ({
  countingDays = 'all',
  currentDocument,
  simulatedToday,
  statuses,
  onToggleTaskDone,
  onQuickHistoricalDone,
  onQuickAddTask,
}) => {
  const [widgetSize, setWidgetSize] = useState<WidgetSize>('medium');
  const [quickInput, setQuickInput] = useState('');
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');

  const allTasks = currentDocument.headings.flatMap((h) => h.items);
  const activeTasks = allTasks.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const completedCount = allTasks.filter((t) => t.status === 'done').length;

  const handleAddFromWidget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onQuickAddTask(quickInput.trim(), 'Work');
    setQuickInput('');
  };

  const prevDate = getPreviousDate(currentDocument.date, 1);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <span>Mobile Home-Screen Widget Simulator</span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Interactive preview of Android Glance & iOS WidgetKit widgets with 1-tap task actions and carry-forward alerts.
          </p>
        </div>

        {/* Size & OS Controls */}
        <div className="flex items-center gap-3">
          {/* OS Switcher */}
          <div className="flex items-center p-1 bg-stone-100 dark:bg-stone-900 rounded-lg text-xs">
            <button
              onClick={() => setPlatform('android')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                platform === 'android'
                  ? 'bg-white dark:bg-stone-800 font-semibold shadow-2xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Android (Glance)
            </button>
            <button
              onClick={() => setPlatform('ios')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                platform === 'ios'
                  ? 'bg-white dark:bg-stone-800 font-semibold shadow-2xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              iOS (WidgetKit)
            </button>
          </div>

          {/* Size Switcher */}
          <div className="flex items-center p-1 bg-stone-100 dark:bg-stone-900 rounded-lg text-xs">
            <button
              onClick={() => setWidgetSize('small')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                widgetSize === 'small'
                  ? 'bg-white dark:bg-stone-800 font-semibold shadow-2xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Small 2×2
            </button>
            <button
              onClick={() => setWidgetSize('medium')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                widgetSize === 'medium'
                  ? 'bg-white dark:bg-stone-800 font-semibold shadow-2xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Medium 4×2
            </button>
            <button
              onClick={() => setWidgetSize('large')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                widgetSize === 'large'
                  ? 'bg-white dark:bg-stone-800 font-semibold shadow-2xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Large 4×4
            </button>
            <button
              onClick={() => setWidgetSize('lockscreen')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                widgetSize === 'lockscreen'
                  ? 'bg-white dark:bg-stone-800 font-semibold shadow-2xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Lock Screen
            </button>
          </div>
        </div>
      </div>

      {/* Simulator Device Frame */}
      <div className="flex justify-center py-6">
        <div className="w-[360px] min-h-[620px] bg-stone-950 p-4 rounded-[40px] shadow-2xl border-4 border-stone-800 relative flex flex-col overflow-hidden">
          {/* Top Speaker / Camera Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-4 bg-stone-900 rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-stone-950 border border-stone-800" />
          </div>

          {/* Device Status Bar */}
          <div className="pt-3 pb-4 px-3 flex items-center justify-between text-[11px] font-mono text-stone-400">
            <span>09:41</span>
            <div className="flex items-center gap-1.5">
              <span>5G</span>
              <span className="w-4 h-2 border border-stone-400 rounded-xs flex items-center p-0.5">
                <span className="h-full w-2.5 bg-stone-400 rounded-2xs" />
              </span>
            </div>
          </div>

          {/* Simulated Home Screen Wallpaper / Widget Zone */}
          <div className="flex-1 flex flex-col justify-start pt-3 space-y-4">
            <div className="text-center text-[10px] uppercase font-mono tracking-wider text-stone-500">
              {platform === 'android' ? 'Material You Widget' : 'iOS Smart Stack'}
            </div>

            {/* WIDGET RENDER */}
            {widgetSize === 'medium' && (
              <div className="w-full bg-stone-900/90 backdrop-blur-md rounded-2xl p-4 border border-stone-800 shadow-xl text-stone-100 space-y-3">
                {/* Widget Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
                    <span className="text-xs font-bold tracking-tight">Today's Daymark</span>
                  </div>
                  <span className="text-[10px] font-mono text-stone-400 tabular-nums">
                    {completedCount}/{allTasks.length} Done
                  </span>
                </div>

                {/* Outstanding Tasks */}
                <div className="space-y-2">
                  {activeTasks.slice(0, 3).map((task) => {
                    const age = calculateTaskAge(task, currentDocument.date, countingDays);
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-stone-800/60 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => onToggleTaskDone(task.id)}
                            className="w-3.5 h-3.5 rounded-xs border border-stone-600 hover:border-amber-500 flex items-center justify-center shrink-0"
                          />
                          <span className="truncate text-stone-200 text-[11px]">{task.title}</span>
                        </div>

                        {/* Age badge */}
                        {age > 0 && (
                          <span className="font-mono text-[9px] text-amber-400 shrink-0">
                            +{age}d
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {activeTasks.length === 0 && (
                    <div className="text-center py-2 text-stone-500 text-[11px]">
                      All work completed for today!
                    </div>
                  )}
                </div>

                {/* 1-Tap Quick Action */}
                <form onSubmit={handleAddFromWidget} className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Quick capture..."
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    className="flex-1 text-[11px] px-2.5 py-1 bg-stone-800 border border-stone-700 rounded-md text-stone-100 placeholder:text-stone-500 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    className="p-1 px-2 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded-md font-semibold"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </form>
              </div>
            )}

            {widgetSize === 'small' && (
              <div className="w-36 h-36 mx-auto bg-stone-900/90 backdrop-blur-md rounded-2xl p-3 border border-stone-800 shadow-xl text-stone-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
                  <span className="text-[10px] font-mono text-stone-400">{allTasks.length - completedCount} Left</span>
                </div>
                <div>
                  <div className="text-2xl font-bold font-mono text-amber-400">
                    {activeTasks.length}
                  </div>
                  <div className="text-[10px] text-stone-400">Pending tasks</div>
                </div>
                <div className="text-[9px] text-stone-500 font-mono">
                  {currentDocument.date}
                </div>
              </div>
            )}

            {widgetSize === 'large' && (
              <div className="w-full bg-stone-900/90 backdrop-blur-md rounded-2xl p-4 border border-stone-800 shadow-xl text-stone-100 space-y-3">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-xs bg-amber-500" />
                    <span className="text-xs font-bold">Daily Priority List</span>
                  </div>
                  <span className="text-[10px] font-mono text-stone-400">{currentDocument.date}</span>
                </div>

                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {allTasks.map((task) => {
                    const isDone = task.status === 'done';
                    const age = calculateTaskAge(task, currentDocument.date, countingDays);
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-1.5 bg-stone-800/50 rounded text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={() => onToggleTaskDone(task.id)}
                            className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 ${
                              isDone ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-600'
                            }`}
                          >
                            {isDone && <Check className="w-2.5 h-2.5" />}
                          </button>
                          <span className={`truncate text-[11px] ${isDone ? 'line-through text-stone-500' : 'text-stone-200'}`}>
                            {task.title}
                          </span>
                        </div>
                        {age > 0 && !isDone && (
                          <span className="text-[9px] font-mono text-amber-400">+{age}d</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleAddFromWidget} className="flex gap-1.5 pt-1">
                  <input
                    type="text"
                    placeholder="Capture to Today..."
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    className="flex-1 text-[11px] px-2.5 py-1 bg-stone-800 border border-stone-700 rounded text-stone-100"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-[10px] bg-amber-600 text-white rounded font-medium"
                  >
                    Add
                  </button>
                </form>
              </div>
            )}

            {widgetSize === 'lockscreen' && (
              <div className="w-full bg-stone-900/60 backdrop-blur-xs rounded-xl p-3 border border-stone-800/80 text-stone-200 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
                  <span>DAYMARK TODAY</span>
                  <span>{activeTasks.length} active</span>
                </div>
                <div className="text-xs font-semibold truncate text-white">
                  {activeTasks[0]?.title || 'No active tasks left'}
                </div>
                {activeTasks.length > 1 && (
                  <div className="text-[10px] text-stone-400">
                    +{activeTasks.length - 1} more pending
                  </div>
                )}
              </div>
            )}

            {/* App Icons Grid (Simulated Home Screen) */}
            <div className="pt-4 grid grid-cols-4 gap-4 px-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-xl bg-amber-600 flex items-center justify-center text-white font-bold shadow-md">
                  DM
                </div>
                <span className="text-[10px] text-stone-300">Daymark</span>
              </div>
              <div className="flex flex-col items-center gap-1 opacity-50">
                <div className="w-12 h-12 rounded-xl bg-stone-800 flex items-center justify-center text-stone-400">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-stone-400">Files</span>
              </div>
              <div className="flex flex-col items-center gap-1 opacity-50">
                <div className="w-12 h-12 rounded-xl bg-stone-800 flex items-center justify-center text-stone-400">
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-stone-400">Clock</span>
              </div>
              <div className="flex flex-col items-center gap-1 opacity-50">
                <div className="w-12 h-12 rounded-xl bg-stone-800 flex items-center justify-center text-stone-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-stone-400">Tasks</span>
              </div>
            </div>
          </div>

          {/* Bottom Navigation Indicator Bar */}
          <div className="pb-2 pt-4 flex justify-center">
            <div className="w-28 h-1 bg-stone-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
