import { useRef, type PointerEvent, type RefObject } from 'react';
import type { InkPage } from '../../types/daymark';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import { textBoxAnchor, TEXT_BOX_MAX, visibleTextBoxes } from '../../ink/inkText';

export type TextDraft = { id?: string; x: number; y: number; text: string; color: string; seq?: number };
export function InkTextLayer({ page, draft, scale, editing, textareaRef, onEdit, onCommit, onType }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  page: InkPage; draft: TextDraft | null; scale: number; editing: boolean;
  onEdit: (id: string) => void; onCommit: (draft: TextDraft, text: string) => void; onType: (draft: TextDraft, text: string) => void;
}) {
  const tap = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const accepts = (e: PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse'
    || (e.pointerType === 'touch' && e.isPrimary && e.width <= 30 && e.height <= 30);
  return <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
    {visibleTextBoxes(page).filter(s => s.id !== draft?.id).map(s => {
      const at = textBoxAnchor(s);
      return <div key={s.id} data-ink-text={s.id} style={{ position: 'absolute', left: `${at.x / PAGE_WIDTH * 100}%`, top: `${at.y / PAGE_HEIGHT * 100}%`, maxWidth: `${(PAGE_WIDTH - at.x) / PAGE_WIDTH * 100}%`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: `${20 * scale}px sans-serif`, color: s.color, pointerEvents: editing ? 'auto' : 'none', touchAction: 'pan-y' }}
        onPointerDown={e => { tap.current = editing && accepts(e) ? { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false } : null; }}
        onPointerMove={e => { if (tap.current?.id === e.pointerId && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 6) tap.current.moved = true; }}
        onPointerCancel={() => { tap.current = null; }}
        onPointerUp={e => {
          const start = tap.current; tap.current = null;
          if (!editing || !accepts(e) || !start || start.id !== e.pointerId || start.moved) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 6) onEdit(s.id);
        }}>{s.text}</div>;
    })}
    {draft && <textarea ref={textareaRef} key={draft.seq ?? draft.id ?? `${draft.x},${draft.y}`} aria-label="Text box" maxLength={TEXT_BOX_MAX} defaultValue={draft.text}
      onBlur={e => onCommit(draft, e.currentTarget.value)}
      onInput={e => { onType(draft, e.currentTarget.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
      style={{ position: 'absolute', left: `${draft.x / PAGE_WIDTH * 100}%`, top: `${draft.y / PAGE_HEIGHT * 100}%`, width: `${(PAGE_WIDTH - draft.x) / PAGE_WIDTH * 100}%`, minHeight: 30 * scale, font: `${20 * scale}px sans-serif`, color: draft.color, resize: 'none', overflow: 'hidden', pointerEvents: 'auto' }} />}
  </div>;
}
