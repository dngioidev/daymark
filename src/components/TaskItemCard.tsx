import React, { useState } from 'react';
import {
  Check,
  Circle,
  Clock,
  AlertCircle,
  AlertTriangle,
  History,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Archive,
  ArrowRight,
  BellOff,
  Edit2,
} from 'lucide-react';
import { AgingThresholds, StatusDefinition, TaskItem } from '../types/daymark';
import {
  calculateTaskAge,
  getAgingSeverity,
  getPreviousDate,
  getRelativeDateLabel,
  isAlertDismissedForDate,
} from '../utils/lifecycleEngine';

interface TaskItemCardProps {
  task: TaskItem;
  currentDate: string;
  statuses: StatusDefinition[];
  agingThresholds: AgingThresholds;
  onUpdateTask: (task: TaskItem) => void;
  onDeleteTask: (taskId: string) => void;
  onOpenHistoricalModal: (task: TaskItem) => void;
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onToggleAlertDismiss: (taskId: string) => void;
}

export const TaskItemCard: React.FC<TaskItemCardProps> = ({
  task,
  currentDate,
  statuses,
  agingThresholds,
  onUpdateTask,
  onDeleteTask,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onToggleAlertDismiss,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [descDraft, setDescDraft] = useState(task.description || '');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const currentStatusDef = statuses.find((s) => s.id === task.status) || {
    id: task.status,
    label: task.status,
    action: 'keep' as const,
    color: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
    icon: 'Circle',
    participatesInAging: false,
  };

  const isDone = task.status === 'done';
  const ageDays = calculateTaskAge(task, currentDate);
  const severity = getAgingSeverity(task, currentDate, agingThresholds, statuses);
  const isSnoozed = isAlertDismissedForDate(task, currentDate);

  const prevDate = task.carriedFromDate || getPreviousDate(currentDate, 1);
  const prevDateLabel = getRelativeDateLabel(prevDate, currentDate);

  const handleToggleDone = () => {
    if (isDone) {
      // Uncheck -> set to in-progress or not-started
      onUpdateTask({
        ...task,
        status: 'in-progress',
        completedDate: undefined,
      });
    } else {
      // Check -> mark done today
      onUpdateTask({
        ...task,
        status: 'done',
        completedDate: currentDate,
      });
    }
  };

  const handleStatusSelect = (statusId: string) => {
    setShowStatusMenu(false);
    const newStatus = statuses.find((s) => s.id === statusId);
    const isNowDone = statusId === 'done';
    onUpdateTask({
      ...task,
      status: statusId,
      completedDate: isNowDone ? currentDate : undefined,
    });
  };

  const handleSaveTitle = () => {
    if (titleDraft.trim()) {
      onUpdateTask({ ...task, title: titleDraft.trim(), description: descDraft.trim() || undefined });
    }
    setIsEditingTitle(false);
  };

  const handleAddChecklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistText.trim()) return;
    const newItem = {
      id: `chk-${Date.now()}`,
      text: newChecklistText.trim(),
      done: false,
    };
    onUpdateTask({
      ...task,
      checklist: [...(task.checklist || []), newItem],
    });
    setNewChecklistText('');
  };

  const handleToggleChecklist = (checkId: string) => {
    const updated = (task.checklist || []).map((c) =>
      c.id === checkId ? { ...c, done: !c.done } : c
    );
    onUpdateTask({ ...task, checklist: updated });
  };

  const handleDeleteChecklist = (checkId: string) => {
    const updated = (task.checklist || []).filter((c) => c.id !== checkId);
    onUpdateTask({ ...task, checklist: updated });
  };

  // Severity visual indicator class (anti-slop: subtle border / text tone, no candy pills)
  let severityClasses = 'border-stone-200/80 dark:border-stone-800 bg-white dark:bg-stone-900';
  if (!isDone && !isSnoozed) {
    if (severity === 'critical') {
      severityClasses = 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10';
    } else if (severity === 'attention') {
      severityClasses = 'border-amber-300 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10';
    }
  }

  return (
    <div
      className={`group relative rounded-lg border transition-all ${severityClasses} p-3 hover:shadow-xs`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={handleToggleDone}
          className={`mt-0.5 w-4.5 h-4.5 rounded-sm flex items-center justify-center border transition-colors shrink-0 ${
            isDone
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'border-stone-300 dark:border-stone-600 hover:border-stone-400 dark:hover:border-stone-500 bg-white dark:bg-stone-800'
          }`}
          title={isDone ? 'Mark uncompleted' : 'Mark completed today'}
        >
          {isDone && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
        </button>

        {/* Main Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Dropdown Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 border ${currentStatusDef.color}`}
              >
                <span>{currentStatusDef.label}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {showStatusMenu && (
                <div className="absolute left-0 top-full mt-1 z-30 w-48 bg-white dark:bg-stone-900 rounded-md shadow-lg border border-stone-200 dark:border-stone-800 py-1 text-xs animate-in fade-in duration-100">
                  <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                    Change Status
                  </div>
                  {statuses.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleStatusSelect(s.id)}
                      className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors ${
                        s.id === task.status ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      <span className="truncate">{s.label}</span>
                      <span className="text-[10px] text-stone-400 capitalize">{s.action}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title */}
            {isEditingTitle ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  className="flex-1 px-2 py-1 text-sm bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded text-stone-900 dark:text-stone-100"
                  autoFocus
                />
                <button
                  onClick={handleSaveTitle}
                  className="px-2 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded"
                >
                  Save
                </button>
              </div>
            ) : (
              <span
                onClick={() => setIsExpanded(!isExpanded)}
                className={`text-sm font-medium cursor-pointer transition-colors ${
                  isDone
                    ? 'line-through text-stone-400 dark:text-stone-500'
                    : 'text-stone-900 dark:text-stone-100 hover:text-amber-700 dark:hover:text-amber-400'
                }`}
              >
                {task.title}
              </span>
            )}
          </div>

          {/* Unboxed Metadata with Typographic Separators (Strict Zero-Pill Discipline) */}
          <div className="mt-1.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 flex-wrap">
            {/* Carry-Forward Age Indicator */}
            {ageDays > 0 && !isDone && (
              <span
                className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                  severity === 'critical'
                    ? 'text-rose-600 dark:text-rose-400 font-semibold'
                    : severity === 'attention'
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {severity === 'critical' ? (
                  <AlertCircle className="w-3 h-3 shrink-0" />
                ) : severity === 'attention' ? (
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 shrink-0" />
                )}
                <span>Carried forward · {ageDays} {ageDays === 1 ? 'day' : 'days'}</span>
              </span>
            )}

            {task.carriedFromDate && (
              <>
                <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">·</span>
                <span className="font-mono text-[11px]">From {task.carriedFromDate}</span>
              </>
            )}

            {task.completedDate && (
              <>
                <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">·</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                  Completed on {task.completedDate}
                </span>
              </>
            )}

            {task.checklist && task.checklist.length > 0 && (
              <>
                <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">·</span>
                <span className="text-[11px] font-mono">
                  {task.checklist.filter((c) => c.done).length}/{task.checklist.length} subtasks
                </span>
              </>
            )}

            {/* Details toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 ml-1 inline-flex items-center gap-0.5"
            >
              <span>{isExpanded ? 'Hide' : 'Details'}</span>
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>

          {/* HISTORICAL COMPLETION QUICK ACTION: Section 7 of PRD */}
          {/* If the task is carried forward and not completed yet, provide immediate retroactive completion */}
          {!isDone && (task.carriedFromDate || ageDays > 0) && (
            <div className="mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-800/80 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                Actually finished yesterday?
              </span>
              <button
                type="button"
                onClick={() => onQuickHistoricalDone(task.id, prevDate)}
                title={`Mark completed on ${prevDate} and remove from today's list`}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-100/80 hover:bg-amber-200/90 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 rounded-md transition-colors"
              >
                <Check className="w-3 h-3" />
                <span>Done on {prevDateLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenHistoricalModal(task)}
                className="text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline decoration-stone-300 hover:decoration-stone-500 transition-colors"
              >
                Other past date...
              </button>
            </div>
          )}

          {/* Expanded Content (Description, Subtasks, Audit trigger) */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-stone-200/70 dark:border-stone-800 space-y-3">
              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                  Notes / Context
                </label>
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={handleSaveTitle}
                  rows={2}
                  placeholder="Add notes, links, or technical details..."
                  className="w-full text-xs p-2 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Subtask Checklist */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
                  Checklist
                </label>
                <div className="space-y-1.5 mb-2">
                  {(task.checklist || []).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group/item text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleChecklist(item.id)}
                        className={`w-3.5 h-3.5 rounded-xs flex items-center justify-center border ${
                          item.done
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-stone-300 dark:border-stone-600'
                        }`}
                      >
                        {item.done && <Check className="w-2.5 h-2.5" />}
                      </button>
                      <span
                        className={`flex-1 ${
                          item.done ? 'line-through text-stone-400' : 'text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklist(item.id)}
                        className="opacity-0 group-hover/item:opacity-100 text-stone-400 hover:text-rose-500 transition-opacity p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddChecklist} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add subtask..."
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 rounded transition-colors"
                  >
                    Add
                  </button>
                </form>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-100 dark:border-stone-800/80 text-stone-500">
                <button
                  type="button"
                  onClick={() => onOpenHistoryDrawer(task)}
                  className="inline-flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Inspect Audit Log</span>
                </button>

                <div className="flex items-center gap-2">
                  {severity !== 'normal' && (
                    <button
                      type="button"
                      onClick={() => onToggleAlertDismiss(task.id)}
                      className="inline-flex items-center gap-1 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
                    >
                      <BellOff className="w-3 h-3" />
                      <span>{isSnoozed ? 'Restore Alert' : 'Snooze Alert for Today'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    className="inline-flex items-center gap-1 text-stone-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Menu button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showOptionsMenu && (
            <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white dark:bg-stone-900 rounded-md shadow-lg border border-stone-200 dark:border-stone-800 py-1 text-xs animate-in fade-in duration-100">
              <button
                onClick={() => {
                  setShowOptionsMenu(false);
                  setIsEditingTitle(true);
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Rename Task</span>
              </button>

              <button
                onClick={() => {
                  setShowOptionsMenu(false);
                  onOpenHistoryDrawer(task);
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <History className="w-3.5 h-3.5" />
                <span>View Full History</span>
              </button>

              <button
                onClick={() => {
                  setShowOptionsMenu(false);
                  onOpenHistoricalModal(task);
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Historical Done...</span>
              </button>

              <div className="my-1 border-t border-stone-200 dark:border-stone-800" />

              <button
                onClick={() => {
                  setShowOptionsMenu(false);
                  onDeleteTask(task.id);
                }}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
