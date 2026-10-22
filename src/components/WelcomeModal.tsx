import React from 'react';
import { BookOpen, FileText, Upload, RefreshCw } from 'lucide-react';
import { Dialog } from './ui/Dialog';

interface WelcomeModalProps {
  isOpen: boolean;
  onStartEmpty: () => void;
  onLoadSample: () => void;
  /** Start empty and open Backup & restore. */
  onRestore?: () => void;
  onSignIn?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onStartEmpty, onLoadSample, onRestore, onSignIn }) => (
  <Dialog
    isOpen={isOpen}
    onClose={onStartEmpty}
    dismissible={false}
    size="sm"
    title="Welcome to Daymark"
    description="Plan each day as a simple list. Anything you don't finish moves to tomorrow on its own. Everything stays on this device as plain Markdown."
  >
    <div className="p-5 space-y-3 text-sm">
      {onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="w-full flex items-center gap-3 px-4 py-3 min-h-14 rounded-xl text-left font-semibold border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800"
        >
          <RefreshCw className="w-5 h-5 shrink-0 text-stone-600 dark:text-stone-400" />Sign in to sync
        </button>
      )}
      <button
        type="button"
        data-autofocus
        onClick={onStartEmpty}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-14 rounded-xl text-left font-semibold bg-accent text-accent-fg hover:brightness-95"
      >
        <FileText className="w-5 h-5 shrink-0" />
        <span>
          Start fresh
          <span className="block font-normal">An empty notebook for real use</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onLoadSample}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-14 rounded-xl text-left font-semibold border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800"
      >
        <BookOpen className="w-5 h-5 shrink-0 text-stone-600 dark:text-stone-400" />
        <span>
          Try it with sample data
          <span className="block font-normal text-stone-600 dark:text-stone-400">Demo tasks and notes; replace them any time</span>
        </span>
      </button>
      {onRestore && (
        <button
          type="button"
          onClick={onRestore}
          className="w-full flex items-center gap-3 px-4 min-h-12 rounded-xl text-left font-medium text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <Upload className="w-5 h-5 shrink-0 text-stone-600 dark:text-stone-400" />I have a backup to restore
        </button>
      )}
    </div>
  </Dialog>
);
