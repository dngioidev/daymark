import React from 'react';
import { BookOpen, FileText } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onStartEmpty: () => void;
  onLoadSample: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onStartEmpty, onLoadSample }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl p-6 space-y-4"
      >
        <div>
          <h2 id="welcome-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Welcome to Daymark
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            A daily Markdown notebook that carries unfinished tasks forward. Your notes stay on this device and export as
            plain Markdown at any time.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartEmpty}
          className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm text-left"
        >
          <FileText className="w-5 h-5 shrink-0" />
          <span>
            Start with an empty vault
            <span className="block text-xs font-normal text-amber-100">Recommended for real use</span>
          </span>
        </button>

        <button
          type="button"
          onClick={onLoadSample}
          className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 font-semibold text-sm text-left"
        >
          <BookOpen className="w-5 h-5 shrink-0 text-stone-500" />
          <span>
            Explore with sample data
            <span className="block text-xs font-normal text-stone-500">
              Demo notes and tasks; you can reset them later in Settings
            </span>
          </span>
        </button>

        <p className="text-[11px] text-stone-500">
          Already have a backup? Choose either option, then open Settings → Backup &amp; restore.
        </p>
      </div>
    </div>
  );
};
