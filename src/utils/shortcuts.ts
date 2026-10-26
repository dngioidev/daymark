export type ShortcutAction = 'new-task' | 'search' | 'help' | 'go-today' | 'go-calendar' | 'go-notes' | 'go-backlog' | 'focus-notes';

export function shortcutFor(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  pendingG: boolean,
  target: EventTarget | null,
  modalOpen = false,
): ShortcutAction | 'g-prefix' | null {
  if (e.altKey) return null;
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  // Preserve new-task from anywhere; focus-notes is the other explicit typing exception.
  if (mod && key === 'k') return 'new-task';
  if (mod && !e.shiftKey && key === '.') return 'focus-notes';
  if (modalOpen) return null;
  const element = target as Element | null;
  if (element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
  if (mod) return e.shiftKey && key === 'f' ? 'search' : null;
  if (key === '?') return 'help';
  if (e.shiftKey) return null;
  if (key === '/') return 'search';
  if (key === 'g') return 'g-prefix';
  if (pendingG) {
    if (key === 't') return 'go-today';
    if (key === 'c') return 'go-calendar';
    if (key === 'n') return 'go-notes';
    if (key === 'b') return 'go-backlog';
  }
  return null;
}
