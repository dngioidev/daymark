import { useRef, type CSSProperties, type PointerEvent, type RefObject } from 'react';
import type { InkPage } from '../../types/daymark';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import { clampBoxWidth, textBoxAnchor, TEXT_BOX_MAX, TEXT_LINE_HEIGHT, TEXT_SIZE, visibleTextBoxes } from '../../ink/inkText';

export type TextDraft = { id?: string; x: number; y: number; text: string; color: string; fontSize?: number; boxWidth?: number; seq?: number };

const percent = (value: number, of: number) => `${value / of * 100}%`;
/** Shared by a saved box and the open one, so the text does not jump when a box opens or closes. */
function boxStyle(x: number, y: number, fontSize: number | undefined, boxWidth: number | undefined, scale: number, color: string): CSSProperties {
  return {
    position: 'absolute', left: percent(x, PAGE_WIDTH), top: percent(y, PAGE_HEIGHT),
    ...(boxWidth === undefined ? { maxWidth: percent(PAGE_WIDTH - x, PAGE_WIDTH) } : { width: percent(boxWidth, PAGE_WIDTH) }),
    font: `${(fontSize ?? TEXT_SIZE) * scale}px sans-serif`, lineHeight: TEXT_LINE_HEIGHT, color,
  };
}

export function InkTextLayer({ page, draft, scale, editing, textareaRef, onEdit, onCommit, onType, onResize }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  page: InkPage; draft: TextDraft | null; scale: number; editing: boolean;
  onEdit: (id: string) => void; onCommit: (draft: TextDraft, text: string) => void; onType: (draft: TextDraft, text: string) => void;
  onResize: (draft: TextDraft, boxWidth: number) => void;
}) {
  const tap = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const resizing = useRef<number | null>(null);
  const accepts = (e: PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse'
    || (e.pointerType === 'touch' && e.isPrimary && e.width <= 30 && e.height <= 30);
  const resizeTo = (e: PointerEvent) => {
    if (!draft || resizing.current !== e.pointerId) return;
    const left = layer.current?.getBoundingClientRect().left ?? 0;
    onResize(draft, clampBoxWidth((e.clientX - left) / Math.max(scale, 0.01) - draft.x, draft.x));
  };
  const draftWidth = draft ? draft.boxWidth ?? PAGE_WIDTH - draft.x : 0;
  return <div ref={layer} style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
    {visibleTextBoxes(page).filter(s => s.id !== draft?.id).map(s => {
      const at = textBoxAnchor(s);
      return <div key={s.id} data-ink-text={s.id} style={{ ...boxStyle(at.x, at.y, s.fontSize, s.boxWidth, scale, s.color), whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pointerEvents: editing ? 'auto' : 'none', touchAction: 'pan-y' }}
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
      style={{ ...boxStyle(draft.x, draft.y, draft.fontSize, draft.boxWidth, scale, draft.color), width: percent(draftWidth, PAGE_WIDTH), maxWidth: undefined,
        minHeight: (draft.fontSize ?? TEXT_SIZE) * TEXT_LINE_HEIGHT * scale + 6, resize: 'none', overflow: 'hidden', pointerEvents: 'auto' }} />}
    {draft && <div role="separator" aria-orientation="vertical" aria-label="Text box width" title="Drag to change the box width"
      // Keeps the keyboard and focus on the box while its edge is dragged.
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); resizing.current = e.pointerId; e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerMove={e => { e.preventDefault(); resizeTo(e); }}
      onPointerUp={e => { resizeTo(e); resizing.current = null; }}
      onPointerCancel={() => { resizing.current = null; }}
      className="rounded-full bg-stone-500/70 dark:bg-stone-400/70"
      style={{ position: 'absolute', left: `calc(${percent(draft.x + draftWidth, PAGE_WIDTH)} - 10px)`, top: percent(draft.y, PAGE_HEIGHT),
        width: 8, height: Math.max(24, (draft.fontSize ?? TEXT_SIZE) * TEXT_LINE_HEIGHT * scale), marginLeft: 6, cursor: 'ew-resize', touchAction: 'none', pointerEvents: 'auto' }} />}
  </div>;
}
