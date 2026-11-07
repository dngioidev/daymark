import { useRef, type CSSProperties, type PointerEvent, type RefObject, type SyntheticEvent } from 'react';
import { AArrowDown, AArrowUp, Trash2 } from 'lucide-react';
import type { InkPage } from '../../types/daymark';
import { PEN_COLORS } from '../../ink/inkColors';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import type { Transform } from '../../ink/inkSelection';
import { clampBoxWidth, clampTextSize, textBoxAnchor, TEXT_BOX_MAX, TEXT_LINE_HEIGHT, TEXT_SIZE, TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_WIDTH_MIN, visibleTextBoxes } from '../../ink/inkText';

export type TextDraft = { id?: string; x: number; y: number; text: string; color: string; fontSize?: number; boxWidth?: number; seq?: number };
export type TextPatch = Partial<Pick<TextDraft, 'x' | 'boxWidth' | 'fontSize' | 'color'>>;
export const TEXT_SIZE_STEP = 4; // page units per Smaller / Larger press

const percent = (value: number, of: number) => `${value / of * 100}%`;
/** Shared by a saved box and the open one, so the text does not jump when a box opens or closes. */
function boxStyle(x: number, y: number, fontSize: number | undefined, boxWidth: number | undefined, scale: number, color: string): CSSProperties {
  return {
    position: 'absolute', left: percent(x, PAGE_WIDTH), top: percent(y, PAGE_HEIGHT),
    ...(boxWidth === undefined ? { maxWidth: percent(PAGE_WIDTH - x, PAGE_WIDTH) } : { width: percent(boxWidth, PAGE_WIDTH) }),
    font: `${(fontSize ?? TEXT_SIZE) * scale}px sans-serif`, lineHeight: TEXT_LINE_HEIGHT, color,
  };
}
// Buttons and handles on the open box must not take focus, or the box closes and the keyboard hides.
const keepFocus = (e: SyntheticEvent) => e.preventDefault();

export function InkTextLayer({ page, draft, scale, editing, textareaRef, selected = [], drag = null, onEdit, onCommit, onType, onPatch, onDelete }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  page: InkPage; draft: TextDraft | null; scale: number; editing: boolean;
  selected?: string[]; drag?: Transform | null;
  onEdit: (id: string) => void; onCommit: (draft: TextDraft, text: string) => void; onType: (draft: TextDraft, text: string) => void;
  onPatch: (draft: TextDraft, patch: TextPatch) => void; onDelete: (draft: TextDraft) => void;
}) {
  const tap = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ id: number; edge: 'left' | 'right' } | null>(null);
  const accepts = (e: PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse'
    || (e.pointerType === 'touch' && e.isPrimary && e.width <= 30 && e.height <= 30);
  const unit = Math.max(scale, 0.01);
  const resizeTo = (e: PointerEvent) => {
    if (!draft || resizing.current?.id !== e.pointerId) return;
    const at = (e.clientX - (layer.current?.getBoundingClientRect().left ?? 0)) / unit;
    if (resizing.current.edge === 'right') { onPatch(draft, { boxWidth: clampBoxWidth(at - draft.x, draft.x) }); return; }
    // The left edge moves the start of the box and keeps its right edge in place.
    const right = draft.x + (draft.boxWidth ?? PAGE_WIDTH - draft.x);
    const x = Math.max(0, Math.min(right - TEXT_WIDTH_MIN, at));
    onPatch(draft, { x, boxWidth: right - x });
  };
  const edgeHandle = (edge: 'left' | 'right') => <div role="separator" aria-orientation="vertical" data-text-handle={edge}
    aria-label={edge === 'right' ? 'Text box width' : 'Text box left edge'} title="Drag to change the box width"
    onMouseDown={keepFocus}
    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); resizing.current = { id: e.pointerId, edge }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
    onPointerMove={e => { e.preventDefault(); resizeTo(e); }}
    onPointerUp={e => { resizeTo(e); resizing.current = null; }}
    onPointerCancel={() => { resizing.current = null; }}
    // A 28 px touch target around a small visible grip, centred on the frame edge (5 px outside the text).
    style={{ position: 'absolute', top: 0, bottom: 0, [edge]: -19, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ew-resize', touchAction: 'none' }}>
    <span className="block h-6 w-2 rounded-full border border-stone-500 bg-white shadow-sm" />
  </div>;
  const selectedIds = new Set(selected);
  // A dragged text box moves with the lifted ink: the same page-space transform, around its own corner.
  const dragStyle = (x: number, y: number): CSSProperties => drag ? {
    transformOrigin: `${(drag.originX - x) * unit}px ${(drag.originY - y) * unit}px`,
    transform: `translate(${drag.dx * unit}px, ${drag.dy * unit}px) scale(${drag.scale})`,
  } : {};
  const draftWidth = draft ? draft.boxWidth ?? PAGE_WIDTH - draft.x : 0;
  const fontSize = draft?.fontSize ?? TEXT_SIZE;
  const barBelow = !!draft && draft.y * unit < 64;
  const barButton = 'inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-2 hover:bg-stone-800 disabled:opacity-40';
  return <div ref={layer} style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
    {visibleTextBoxes(page).filter(s => s.id !== draft?.id).map(s => {
      const at = textBoxAnchor(s);
      return <div key={s.id} data-ink-text={s.id} style={{ ...boxStyle(at.x, at.y, s.fontSize, s.boxWidth, scale, s.color), ...(selectedIds.has(s.id) ? dragStyle(at.x, at.y) : {}),
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', pointerEvents: editing ? 'auto' : 'none', touchAction: 'pan-y' }}
        onPointerDown={e => { tap.current = editing && accepts(e) ? { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false } : null; }}
        onPointerMove={e => { if (tap.current?.id === e.pointerId && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 6) tap.current.moved = true; }}
        onPointerCancel={() => { tap.current = null; }}
        onPointerUp={e => {
          const start = tap.current; tap.current = null;
          if (!editing || !accepts(e) || !start || start.id !== e.pointerId || start.moved) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 6) onEdit(s.id);
        }}>{s.text}</div>;
    })}
    {draft && <div data-ink-text-editor style={{ position: 'absolute', left: percent(draft.x, PAGE_WIDTH), top: percent(draft.y, PAGE_HEIGHT), width: percent(draftWidth, PAGE_WIDTH), pointerEvents: 'auto' }}>
      <div role="toolbar" aria-label="Text box" onMouseDown={keepFocus} onPointerDown={keepFocus}
        className="absolute left-0 flex items-center gap-0.5 rounded-xl bg-stone-900 p-1 text-stone-100 shadow-lg"
        style={{ [barBelow ? 'top' : 'bottom']: 'calc(100% + 10px)', whiteSpace: 'nowrap' }}>
        <button type="button" aria-label="Smaller text" title="Smaller text" className={barButton} disabled={fontSize <= TEXT_SIZE_MIN}
          onClick={() => onPatch(draft, { fontSize: clampTextSize(fontSize - TEXT_SIZE_STEP) })}><AArrowDown size={20} aria-hidden="true" /></button>
        <span className="w-8 text-center text-xs tabular-nums" role="status" aria-label={`Text size ${fontSize}`}>{fontSize}</span>
        <button type="button" aria-label="Larger text" title="Larger text" className={barButton} disabled={fontSize >= TEXT_SIZE_MAX}
          onClick={() => onPatch(draft, { fontSize: clampTextSize(fontSize + TEXT_SIZE_STEP) })}><AArrowUp size={20} aria-hidden="true" /></button>
        <span className="mx-1 h-6 w-px bg-stone-700" aria-hidden="true" />
        {PEN_COLORS.map(color => <button key={color} type="button" aria-label={`Text color ${color}`} aria-pressed={draft.color === color} className={barButton}
          onClick={() => onPatch(draft, { color })}>
          <span className={`h-5 w-5 rounded-full border ${draft.color === color ? 'border-white ring-2 ring-white/60' : 'border-stone-500'}`} style={{ backgroundColor: color }} />
        </button>)}
        <span className="mx-1 h-6 w-px bg-stone-700" aria-hidden="true" />
        <button type="button" aria-label="Delete text box" title="Delete text box" className={barButton} onClick={() => onDelete(draft)}><Trash2 size={20} aria-hidden="true" /></button>
      </div>
      <div className="rounded-md border border-dashed border-stone-400 bg-white/70" style={{ margin: -5, padding: 4 }}>
        <textarea ref={textareaRef} key={draft.seq ?? draft.id ?? `${draft.x},${draft.y}`} aria-label="Text box text" maxLength={TEXT_BOX_MAX} defaultValue={draft.text}
          onBlur={e => onCommit(draft, e.currentTarget.value)}
          onInput={e => { onType(draft, e.currentTarget.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
          className="block w-full bg-transparent outline-none"
          style={{ font: `${fontSize * scale}px sans-serif`, lineHeight: TEXT_LINE_HEIGHT, color: draft.color, minHeight: fontSize * TEXT_LINE_HEIGHT * scale, resize: 'none', overflow: 'hidden', border: 0, padding: 0 }} />
      </div>
      {edgeHandle('left')}
      {edgeHandle('right')}
    </div>}
  </div>;
}
