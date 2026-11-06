import type { InkPage } from '../../types/daymark';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import { textBoxAnchor, TEXT_BOX_MAX, visibleTextBoxes } from '../../ink/inkText';

export type TextDraft = { id?: string; x: number; y: number; text: string; color: string };
export function InkTextLayer({ page, draft, scale, editing, onEdit, onCommit }: {
  page: InkPage; draft: TextDraft | null; scale: number; editing: boolean;
  onEdit: (id: string) => void; onCommit: (text: string) => void;
}) {
  return <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
    {visibleTextBoxes(page).filter(s => s.id !== draft?.id).map(s => {
      const at = textBoxAnchor(s);
      return <div key={s.id} data-ink-text={s.id} style={{ position: 'absolute', left: `${at.x / PAGE_WIDTH * 100}%`, top: `${at.y / PAGE_HEIGHT * 100}%`, maxWidth: `${(PAGE_WIDTH - at.x) / PAGE_WIDTH * 100}%`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: `${20 * scale}px sans-serif`, color: s.color, pointerEvents: editing ? 'auto' : 'none', touchAction: 'pan-y' }}
        onPointerDown={e => { if (e.pointerType === 'pen' || e.pointerType === 'mouse') e.currentTarget.dataset.tap = `${e.clientX},${e.clientY}`; }}
        onPointerUp={e => {
          const start = e.currentTarget.dataset.tap; delete e.currentTarget.dataset.tap;
          if (!start || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
          const [x, y] = start.split(',').map(Number);
          if (Math.hypot(e.clientX - x, e.clientY - y) <= 6) onEdit(s.id);
        }}>{s.text}</div>;
    })}
    {draft && <textarea key={draft.id ?? `${draft.x},${draft.y}`} aria-label="Text box" autoFocus maxLength={TEXT_BOX_MAX} defaultValue={draft.text}
      onBlur={e => onCommit(e.currentTarget.value)}
      onInput={e => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
      style={{ position: 'absolute', left: `${draft.x / PAGE_WIDTH * 100}%`, top: `${draft.y / PAGE_HEIGHT * 100}%`, width: `${(PAGE_WIDTH - draft.x) / PAGE_WIDTH * 100}%`, minHeight: 30 * scale, font: `${20 * scale}px sans-serif`, color: draft.color, resize: 'none', overflow: 'hidden', pointerEvents: 'auto' }} />}
  </div>;
}
