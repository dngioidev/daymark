import React from 'react';
import { Dialog } from './ui/Dialog';

export const ShortcutHelp: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Dialog isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" description="Ctrl on Windows and Linux; ⌘ on Mac.">
    <dl className="p-5 space-y-3 text-sm">
      {[
        ['Ctrl/⌘ K', 'New task'], ['Ctrl/⌘ Shift F', 'Search'], ['/', 'Search'],
        ['?', 'Keyboard shortcuts'], ['g t', 'Go to Today'], ['g c', 'Go to Calendar'],
        ['g n', 'Go to Notes'], ['Ctrl/⌘ .', 'Toggle focus mode in Notes'], ['Esc', 'Close dialog or leave Notes focus mode'],
      ].map(([keys, label]) => <div key={keys} className="flex items-center justify-between gap-4"><dt>{label}</dt><dd><kbd className="rounded border border-stone-300 dark:border-stone-600 px-2 py-1 whitespace-nowrap">{keys}</kbd></dd></div>)}
    </dl>
    <p className="px-5 pb-5 text-sm text-stone-600 dark:text-stone-400">Press the second key after g within 1.5 seconds. While typing, only New task and Notes focus mode work. Esc in the note editor keeps focus mode.</p>
  </Dialog>
);
