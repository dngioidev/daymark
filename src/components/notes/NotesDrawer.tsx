import React from 'react';
import { Dialog } from '../ui/Dialog';

/** Reuse modal focus, Escape, inert background and opener restoration. */
export function NotesDrawer({ children, onClose, returnFocusRef }: { children: React.ReactNode; onClose(): void; returnFocusRef: React.RefObject<HTMLButtonElement | null> }) {
  return <Dialog isOpen title="Notes" variant="drawer" returnFocusRef={returnFocusRef} onClose={onClose}>
    <div className="h-[calc(100dvh-5rem)] min-h-0 flex flex-col p-2">{children}</div>
  </Dialog>;
}
