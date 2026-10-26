import React, { useId, useState } from 'react';
import { Dialog, buttonClass } from './ui/Dialog';

interface MoveToSectionDialogProps {
  taskTitle: string;
  currentSection: string;
  sections: string[];
  onClose: () => void;
  onMove: (section: string) => void;
}

/** Mounted when opened so a dismissed new-section draft never leaks into the next move. */
export const MoveToSectionDialog: React.FC<MoveToSectionDialogProps> = ({ taskTitle, currentSection, sections, onClose, onMove }) => {
  const [name, setName] = useState('');
  const id = useId();
  const isCurrent = (section: string) => section.trim().toLowerCase() === currentSection.trim().toLowerCase();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && !isCurrent(name)) onMove(name.trim());
  };

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title="Move to section…"
      description={`Move “${taskTitle}” to a section of this day.`}
      size="sm"
      variant="sheet"
      footer={<>
        <button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button>
        <button type="submit" form={id} className={buttonClass.primary} disabled={!name.trim() || isCurrent(name)}>Move</button>
      </>}
    >
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1" aria-label="Sections">
          {sections.map((section) => <button
            key={section}
            type="button"
            disabled={isCurrent(section)}
            onClick={() => onMove(section)}
            className={`${buttonClass.ghost} w-full justify-start disabled:opacity-50 disabled:cursor-not-allowed`}
          >{section}</button>)}
        </div>
        <form id={id} onSubmit={submit} className="space-y-2">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium">New section</label>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            enterKeyHint="done"
            className="w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
          />
        </form>
      </div>
    </Dialog>
  );
};
