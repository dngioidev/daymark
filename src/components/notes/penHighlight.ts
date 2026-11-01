import type { Node } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';
import { startFingerScroll } from '../ink/inkSurface';
import { classifyPointer } from '../../ink/pointerPolicy';

const wordPattern = /[\p{L}\p{N}\p{M}_]+(?:['’][\p{L}\p{N}\p{M}_]+)*/gu;

/** Selection ends are exclusive; whitespace alone never pulls in a neighbour. */
export function wordRangeForSelection(doc: Node, start: number, end: number): { from: number; to: number } | null {
  let from = Infinity;
  let to = -Infinity;
  doc.nodesBetween(start, end, (node, position) => {
    if (!node.isTextblock || node.type.spec.code) return;
    const text = node.textBetween(0, node.content.size, '', '\ufffc');
    for (const word of text.matchAll(wordPattern)) {
      const wordStart = position + 1 + word.index;
      const wordEnd = wordStart + word[0].length;
      if (wordStart < end && wordEnd > start) {
        from = Math.min(from, wordStart);
        to = Math.max(to, wordEnd);
      }
    }
    return false;
  });
  return from < to ? { from, to } : null;
}

function applyHighlightRange(editor: Editor, range: { from: number; to: number }, color: string, toggle: boolean) {
  let sameColor = true;
  editor.state.doc.nodesBetween(range.from, range.to, node => {
    if (node.isText && !node.marks.some(mark => mark.type.name === 'highlight' && mark.attrs.color === color)) sameColor = false;
  });
  const { selection, storedMarks } = editor.state;
  const chain = editor.chain().setTextSelection(range);
  if (toggle && sameColor) chain.unsetHighlight();
  else chain.setHighlight({ color });
  chain.command(({ tr }) => {
    tr.setSelection(selection.map(tr.doc, tr.mapping)).setStoredMarks(storedMarks);
    closeHistory(tr);
    return true;
  }).run();
  // Keep the next typing/stroke operation out of this highlight's Undo step.
  editor.view.dispatch(closeHistory(editor.state.tr));
}

export function highlightSelection(editor: Editor, color: string, toggle = true): void {
  const { selection, doc } = editor.state;
  if (!editor.isEditable || !(selection instanceof TextSelection) || selection.empty) return;
  const range = wordRangeForSelection(doc, selection.from, selection.to);
  if (range) applyHighlightRange(editor, range, color, toggle);
}

export function wordRangeForStroke(doc: Node, positions: number[]): { from: number; to: number } | null {
  let from = Infinity;
  let to = -Infinity;
  for (const position of positions) {
    if (!Number.isInteger(position) || position < 0 || position > doc.content.size) continue;
    const resolved = doc.resolve(position);
    if (!resolved.parent.isTextblock || resolved.parent.type.spec.code) continue;
    // textBetween preserves position offsets across marks and inline atoms.
    const text = resolved.parent.textBetween(0, resolved.parent.content.size, '', '\ufffc');
    for (const word of text.matchAll(wordPattern)) {
      const end = word.index + word[0].length;
      if (resolved.parentOffset >= word.index && (resolved.parentOffset < end || (end === text.length && resolved.parentOffset === end))) {
        from = Math.min(from, resolved.start() + word.index);
        to = Math.max(to, resolved.start() + end);
        break;
      }
    }
  }
  return from < to ? { from, to } : null;
}

/** Installed only while the tool is on; ordinary editing has no pointer work. */
export function attachPenHighlighter(editor: Editor, color: string): () => void {
  const dom = editor.view.dom;
  // Decide gesture ownership before contact, so the browser cannot cancel a
  // pen drag to pan. Touch pointers scroll manually while this tool is active.
  const previousTouchAction = dom.style.touchAction;
  dom.style.touchAction = 'none';
  const key = new PluginKey<DecorationSet>('penHighlightPreview');
  editor.registerPlugin(new Plugin({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, value) => tr.docChanged ? DecorationSet.empty : tr.getMeta(key) ?? value,
    },
    props: { decorations: state => key.getState(state) },
  }));
  let stroke: { id: number; positions: number[]; doc: Node; x: number; y: number; moved: boolean } | null = null;
  let touch: ReturnType<typeof startFingerScroll> | null = null;
  const stopTouch = () => {
    const id = touch?.id;
    touch = null;
    if (id !== undefined && dom.hasPointerCapture?.(id)) dom.releasePointerCapture(id);
  };
  const preview = (range: { from: number; to: number } | null) => {
    editor.view.dispatch(editor.state.tr.setMeta(key, range ? DecorationSet.create(editor.state.doc, [
      Decoration.inline(range.from, range.to, { 'data-pen-highlight-preview': '', style: `background-color: ${color}80` }),
    ]) : DecorationSet.empty));
  };
  const cancel = () => {
    const id = stroke?.id;
    stroke = null;
    if (id !== undefined && dom.hasPointerCapture?.(id)) dom.releasePointerCapture(id);
    if (!editor.isDestroyed) preview(null);
  };
  const collect = (event: PointerEvent) => {
    if (!stroke) return;
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const sample of [...samples, event]) {
      if (sample.clientX !== stroke.x || sample.clientY !== stroke.y) stroke.moved = true;
      const position = editor.view.posAtCoords({ left: sample.clientX, top: sample.clientY })?.pos;
      if (position !== undefined) stroke.positions.push(position);
    }
    preview(wordRangeForStroke(editor.state.doc, stroke.positions));
  };
  const down = (event: PointerEvent) => {
    if (classifyPointer({ penActive: !!stroke }, event).action === 'scroll' && !touch) {
      touch = startFingerScroll(dom, event);
      event.preventDefault(); dom.setPointerCapture?.(event.pointerId); return;
    }
    if (event.pointerType !== 'pen' || event.button !== 0 || stroke || !editor.isEditable) return;
    stopTouch();
    event.preventDefault();
    stroke = { id: event.pointerId, positions: [], doc: editor.state.doc, x: event.clientX, y: event.clientY, moved: false };
    dom.setPointerCapture(event.pointerId);
    collect(event);
  };
  const move = (event: PointerEvent) => {
    if (touch?.id === event.pointerId) {
      if (classifyPointer({ penActive: !!stroke }, event).action !== 'scroll') { stopTouch(); return; }
      event.preventDefault(); touch.move(event); return;
    }
    if (event.pointerType !== 'pen' || stroke?.id !== event.pointerId) return;
    event.preventDefault();
    if (stroke.doc !== editor.state.doc) { cancel(); return; }
    collect(event);
  };
  const up = (event: PointerEvent) => {
    if (touch?.id === event.pointerId) { stopTouch(); return; }
    if (event.pointerType !== 'pen' || stroke?.id !== event.pointerId) return;
    event.preventDefault();
    if (stroke.doc !== editor.state.doc) { cancel(); return; }
    collect(event);
    const range = wordRangeForStroke(editor.state.doc, stroke.positions);
    const dragged = stroke.moved;
    cancel();
    if (!range || !dragged) return;
    applyHighlightRange(editor, range, color, true);
  };
  const interrupted = (event: PointerEvent) => {
    if (touch?.id === event.pointerId) stopTouch();
    if (stroke?.id === event.pointerId) cancel();
  };
  dom.addEventListener('pointerdown', down, true);
  dom.addEventListener('pointermove', move, true);
  dom.addEventListener('pointerup', up, true);
  dom.addEventListener('pointercancel', interrupted, true);
  dom.addEventListener('lostpointercapture', interrupted, true);
  return () => {
    stopTouch();
    cancel();
    dom.style.touchAction = previousTouchAction;
    dom.removeEventListener('pointerdown', down, true);
    dom.removeEventListener('pointermove', move, true);
    dom.removeEventListener('pointerup', up, true);
    dom.removeEventListener('pointercancel', interrupted, true);
    dom.removeEventListener('lostpointercapture', interrupted, true);
    if (!editor.isDestroyed) editor.unregisterPlugin(key);
  };
}
