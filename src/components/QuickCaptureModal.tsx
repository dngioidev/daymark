import React, { useState, useEffect } from 'react';
import { Plus, X, Calendar, CheckCircle2, FileText, CornerDownLeft } from 'lucide-react';
import { StatusDefinition } from '../types/daymark';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  headings: string[];
  statuses: StatusDefinition[];
  simulatedToday: string;
  onCapture: (task: {
    title: string;
    description?: string;
    heading: string;
    status: string;
  }) => void;
}

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({
  isOpen,
  onClose,
  headings,
  statuses,
  simulatedToday,
  onCapture,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [heading, setHeading] = useState(headings[0] || 'Work');
  const [status, setStatus] = useState('in-progress');

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setHeading(headings[0] || 'Work');
      setStatus('in-progress');
    }
  }, [isOpen, headings]);

  // Global keydown handler for Escape & ⌘K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // toggle modal
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCapture({
      title: title.trim(),
      description: description.trim() || undefined,
      heading,
      status,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/50 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
      <div className="relative w-full max-w-lg bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-600" />
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Quick Capture · Today ({simulatedToday})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div>
            <input
              type="text"
              placeholder="What did you work on or need to remember?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm font-medium px-3 py-2 bg-stone-50 dark:bg-stone-800/60 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400"
              autoFocus
            />
          </div>

          <div>
            <textarea
              placeholder="Optional notes, code links, or subtasks..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-xs px-3 py-2 bg-stone-50 dark:bg-stone-800/60 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Section selector */}
            <div>
              <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                Notebook Heading
              </label>
              <select
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100"
              >
                {headings.map((h) => (
                  <option key={h} value={h}>
                    #{h}
                  </option>
                ))}
              </select>
            </div>

            {/* Status selector */}
            <div>
              <label className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-1">
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end sm:justify-between border-t border-stone-200 dark:border-stone-800">
            <span className="text-[11px] text-stone-400 hidden sm:flex items-center gap-1 font-mono">
              <CornerDownLeft className="w-3 h-3" /> Press Enter to capture
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 min-h-[44px] sm:min-h-0 sm:py-1.5 text-sm sm:text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Capture</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
