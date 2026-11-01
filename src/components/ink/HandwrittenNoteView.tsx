import { useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, FilePlus2 } from 'lucide-react';
import type { InkPage, InkTool, StandaloneNote } from '../../types/daymark';
import { canWrite, rememberPen } from '../../ink/handwrittenNotes';
import { InkStoreContext } from '../../ink/inkStore';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';
import { InkCanvas, type EraserMode, type InkCanvasHandle } from './InkCanvas';
import { InkPageView } from './InkPageView';
import { InkToolbar, inkToolbarButton, inkToolbarSurface, readEraserMode } from './InkToolbar';

export { canWrite, createHandwrittenNote, HANDWRITTEN_PLACEHOLDER } from '../../ink/handwrittenNotes';

export interface HandwrittenNoteViewProps {
  note: StandaloneNote;
  pages: InkPage[];
  onUpdatePage(page: InkPage): void;
}

export function HandwrittenNoteView({ note, pages: pagesProp, onUpdatePage }: HandwrittenNoteViewProps) {
  // With App's ink store, follow the live pages: App re-renders only after a writing pause, and a
  // stale `pages` prop must never reach the canvas (it would replace newer strokes).
  const store = useContext(InkStoreContext);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : () => {}, [store]);
  const pages = useSyncExternalStore(subscribe, () => store ? store.pagesFor(note.id) : pagesProp);
  const [writable, setWritable] = useState(canWrite);
  const [selected, setSelected] = useState(0);
  const [tool, setTool] = useState<InkTool | 'eraser'>('pen');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState<string>(HIGHLIGHTER_COLORS[0]);
  const [penWidth, setPenWidth] = useState(4);
  const [highlightWidth, setHighlightWidth] = useState(24);
  const [eraserMode, setEraserMode] = useState<EraserMode>(readEraserMode);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const canvas = useRef<InkCanvasHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Ink entities use zero-based page numbers; the notebook labels start at 1.
  const count = Math.max(1, ...pages.map(page => page.page + 1));
  const number = Math.min(selected, count - 1);
  const emptyPage = (page: number): InkPage => ({ noteId: note.id, page, strokes: [], removed: [], updatedAt: note.updatedAt });
  const page = pages.find(page => page.page === number) ?? emptyPage(number);
  const navigate = (next: number) => {
    setSelected(next); setHistory({ undo: false, redo: false });
    scroller.current?.scrollTo?.({ top: 0 });
  };
  const color = tool === 'highlighter' ? highlightColor : penColor;
  const width = tool === 'highlighter' ? highlightWidth : tool === 'eraser' ? 24 : penWidth;
  const pageControls = <div className="flex shrink-0 items-center gap-1 border-l border-stone-300 pl-2 dark:border-stone-700">
    <button type="button" aria-label="Previous page" title="Previous page" className={inkToolbarButton} disabled={number === 0} onClick={() => navigate(number - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
    <span role="status" className="whitespace-nowrap text-xs tabular-nums">
      <span aria-hidden="true">{number + 1} / {count}</span><span className="sr-only">Page {number + 1} of {count}</span>
    </span>
    <button type="button" aria-label="Next page" title="Next page" className={inkToolbarButton} disabled={number >= count - 1} onClick={() => navigate(number + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
    {writable && <button type="button" aria-label="Add page" title="Add page" className={inkToolbarButton} onClick={() => {
      if (!pages.some(page => page.page === number)) onUpdatePage(page);
      onUpdatePage({ ...emptyPage(count), updatedAt: new Date().toISOString() });
      navigate(count);
    }}><FilePlus2 size={20} aria-hidden="true" /></button>}
  </div>;
  return <section aria-label="Handwritten notebook" className="flex flex-1 min-h-0 min-w-0 flex-col text-stone-900 dark:text-stone-100"
    onPointerDownCapture={event => {
      if (event.pointerType === 'pen' && !writable) { rememberPen(); setWritable(true); }
    }}>
    <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto">
      {writable ? <InkToolbar tool={tool} color={color} width={width}
        onToolChange={setTool} onColorChange={tool === 'highlighter' ? setHighlightColor : setPenColor}
        onWidthChange={tool === 'highlighter' ? setHighlightWidth : setPenWidth}
        onEraserModeChange={setEraserMode} onUndo={() => canvas.current?.undo()} onRedo={() => canvas.current?.redo()}
        canUndo={history.undo} canRedo={history.redo} pageControls={pageControls} />
        : <div role="toolbar" aria-label="Page navigation" className={inkToolbarSurface}><div className="flex flex-nowrap items-center justify-end p-2">{pageControls}</div></div>}
      <div className="p-2">
        {/* A single fixed page is mounted; turning pages releases its canvas buffers. */}
        {writable ? <InkCanvas key={`${note.id}:${number}`} ref={canvas} page={page} paper={note.paper}
          tool={tool} color={color} width={width} eraserMode={eraserMode} onChange={onUpdatePage}
          onHistoryChange={(undo, redo) => setHistory({ undo, redo })} />
          : <InkPageView key={`${note.id}:${number}`} page={page} paper={note.paper} />}
      </div>
    </div>
  </section>;
}
