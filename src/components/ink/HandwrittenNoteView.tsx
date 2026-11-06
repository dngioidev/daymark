import { useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight, FilePlus2, MousePointer2, Type } from 'lucide-react';
import type { InkPage, StandaloneNote } from '../../types/daymark';
import { canWrite, rememberPen } from '../../ink/handwrittenNotes';
import { InkStoreContext } from '../../ink/inkStore';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';
import { InkCanvas, type EraserMode, type InkCanvasHandle, type InkCanvasTool } from './InkCanvas';
import { InkToolbar, inkToolbarButton, inkRailButton, readEraserMode, type InkToolbarProps } from './InkToolbar';

import { InkRail, readRailSide } from './InkRail';

export { canWrite, createHandwrittenNote, HANDWRITTEN_PLACEHOLDER } from '../../ink/handwrittenNotes';

export interface HandwrittenNoteViewProps {
  note: StandaloneNote;
  pages: InkPage[];
  onUpdatePage(page: InkPage): void;
  fullScreen?: boolean;
  onExitFullScreen?: () => void;
}

export function HandwrittenNoteView({ note, pages: pagesProp, onUpdatePage, fullScreen = false, onExitFullScreen }: HandwrittenNoteViewProps) {
  // With App's ink store, follow the live pages: App re-renders only after a writing pause, and a
  // stale `pages` prop must never reach the canvas (it would replace newer strokes).
  const store = useContext(InkStoreContext);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : () => {}, [store]);
  const pages = useSyncExternalStore(subscribe, () => store ? store.pagesFor(note.id) : pagesProp);
  const [penSeen, setPenSeen] = useState(canWrite);
  const [selected, setSelected] = useState(0);
  const [tool, setTool] = useState<InkCanvasTool>('pen');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState<string>(HIGHLIGHTER_COLORS[0]);
  const [penWidth, setPenWidth] = useState(4);
  const [highlightWidth, setHighlightWidth] = useState(24);
  const [eraserMode, setEraserMode] = useState<EraserMode>(readEraserMode);
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [railSide, setRailSide] = useState(readRailSide);
  const [selectionCount, setSelectionCount] = useState(0);
  const canvas = useRef<InkCanvasHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Ink entities use zero-based page numbers; the notebook labels start at 1.
  const count = Math.max(1, ...pages.map(page => page.page + 1));
  const number = Math.min(selected, count - 1);
  const emptyPage = (page: number): InkPage => ({ noteId: note.id, page, strokes: [], removed: [], updatedAt: note.updatedAt });
  const page = pages.find(page => page.page === number) ?? emptyPage(number);
  const navigate = (next: number) => {
    setSelected(next); setSelectionCount(0); setHistory({ undo: false, redo: false });
    scroller.current?.scrollTo?.({ top: 0 });
  };
  const color = tool === 'highlighter' ? highlightColor : penColor;
  const width = tool === 'highlighter' ? highlightWidth : tool === 'eraser' ? 24 : penWidth;
  const buttonStyle = fullScreen ? inkRailButton : inkToolbarButton;
  const pageControls = <div className={fullScreen ? 'flex flex-col items-center gap-1 border-t border-stone-700' : 'flex shrink-0 items-center gap-1 border-l border-stone-300 pl-2 dark:border-stone-700'}>
    {!fullScreen && (['select', 'text'] as const).map(value => <button key={value} type="button" aria-label={value === 'select' ? 'Select' : 'Text'}
      aria-pressed={tool === value} className={`${buttonStyle} ${tool === value ? 'bg-stone-200 dark:bg-stone-700' : ''}`}
      onClick={() => setTool(value)}>{value === 'select' ? <MousePointer2 size={20} aria-hidden="true" /> : <Type size={20} aria-hidden="true" />}</button>)}
    <button type="button" aria-label="Previous page" title="Previous page" className={buttonStyle} disabled={number === 0} onClick={() => navigate(number - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
    <span role="status" className="whitespace-nowrap text-xs tabular-nums">
      <span aria-hidden="true">{number + 1} / {count}</span><span className="sr-only">Page {number + 1} of {count}</span>
    </span>
    <button type="button" aria-label="Next page" title="Next page" className={buttonStyle} disabled={number >= count - 1} onClick={() => navigate(number + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
    <button type="button" aria-label="Add page" title="Add page" className={buttonStyle} onClick={() => {
      if (!pages.some(page => page.page === number)) onUpdatePage(page);
      onUpdatePage({ ...emptyPage(count), updatedAt: new Date().toISOString() });
      navigate(count);
    }}><FilePlus2 size={20} aria-hidden="true" /></button>
  </div>;
  const toolProps: InkToolbarProps = {
    tool, color, width, onToolChange: setTool,
    onColorChange: tool === 'highlighter' ? setHighlightColor : setPenColor,
    onWidthChange: tool === 'highlighter' ? setHighlightWidth : setPenWidth,
    onEraserModeChange: setEraserMode, onUndo: () => canvas.current?.undo(), onRedo: () => canvas.current?.redo(),
    canUndo: history.undo, canRedo: history.redo, pageControls,
  };
  return <section aria-label="Handwritten notebook" className={`flex flex-1 min-h-0 min-w-0 text-stone-900 dark:text-stone-100 ${fullScreen ? (railSide === 'right' ? 'flex-row-reverse' : 'flex-row') : 'flex-col'}`}
    onPointerDownCapture={event => {
      if (event.pointerType === 'pen' && !penSeen) { rememberPen(); setPenSeen(true); }
    }}>
    {fullScreen && <InkRail {...toolProps} side={railSide} onSideChange={setRailSide} onExit={() => onExitFullScreen?.()}
      selectionCount={selectionCount} onDelete={() => canvas.current?.deleteSelection()} onCopy={() => canvas.current?.copySelection()}
      onCut={() => canvas.current?.cutSelection()} onPaste={() => canvas.current?.paste()} onDuplicate={() => canvas.current?.duplicateSelection()}
      onRecolor={value => canvas.current?.recolorSelection(value)} />}
    <div ref={scroller} className="flex-1 min-h-0 min-w-0 overflow-y-auto">
      {!fullScreen && <InkToolbar {...toolProps} />}
      <div className="p-2">
        {/* A single fixed page is mounted; turning pages releases its canvas buffers. */}
        <InkCanvas key={`${note.id}:${number}`} ref={canvas} page={page} paper={note.paper}
          tool={tool} color={color} textColor={penColor} width={width} eraserMode={eraserMode} allowMouse={!penSeen} onChange={onUpdatePage}
          onSelectionChange={ids => setSelectionCount(ids.length)}
          onHistoryChange={(undo, redo) => setHistory({ undo, redo })} />
      </div>
    </div>
  </section>;
}
