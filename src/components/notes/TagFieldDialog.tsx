import React, { useState } from 'react';
import type { StandaloneNote } from '../../types/daymark';
import { parseTagField } from '../../utils/noteTags';
import { Dialog, buttonClass } from '../ui/Dialog';

/** Tags for a note with no text to hold them (handwritten notes). Stored in `note.tags`. */
export function TagFieldDialog({ note, onSave, onClose }: { note: StandaloneNote; onSave(tags: string[]): void; onClose(): void }) {
  const [value, setValue] = useState(() => note.tags.map(tag => `#${tag}`).join(' '));
  const save = () => { onSave(parseTagField(value)); onClose(); };
  return <Dialog isOpen onClose={onClose} title="Tags" description="Separate tags with spaces or commas. #tags in text boxes count too." size="sm"
    footer={<><button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button><button type="button" className={buttonClass.primary} onClick={save}>Save</button></>}>
    <form className="p-5" onSubmit={event => { event.preventDefault(); save(); }}>
      <input aria-label="Tags" autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder="#project #ideas"
        className="w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" />
    </form>
  </Dialog>;
}
