import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Eraser, Highlighter, PenLine, Redo2, Undo2 } from 'lucide-react';
import type { InkTool } from '../../types/daymark';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';
import type { EraserMode } from './InkCanvas';

export interface InkToolbarProps {
  tool: InkTool | 'eraser'; color: string; width: number;
  onToolChange: (tool: InkTool | 'eraser') => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onEraserModeChange: (mode: EraserMode) => void;
  onUndo: () => void; onRedo: () => void;
  canUndo?: boolean; canRedo?: boolean;
  pageControls?: ReactNode;
}
export function readEraserMode(): EraserMode {
  try { return localStorage.getItem('dm.ink.eraserMode') === 'stroke' ? 'stroke' : 'area'; } catch { return 'area'; }
}

export const inkToolbarSurface = 'sticky top-0 z-10 shrink-0 border-b border-stone-200 bg-stone-50 pt-[var(--dm-safe-top,0px)] text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100';
export const inkToolbarButton = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-500 disabled:opacity-30 dark:hover:bg-stone-800';
const selectedStyle = 'bg-stone-200 dark:bg-stone-700';
const tools = [{ tool: 'pen', label: 'Pen', Icon: PenLine }, { tool: 'highlighter', label: 'Highlighter', Icon: Highlighter }, { tool: 'eraser', label: 'Eraser', Icon: Eraser }] as const;

export function InkToolbar(props: InkToolbarProps) {
  const [mode, setMode] = useState(readEraserMode);
  const [settings, setSettings] = useState<{ tool: InkToolbarProps['tool']; left: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = settings?.tool === props.tool;
  const close = () => { setSettings(null); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    popover.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !popover.current?.contains(event.target) && !trigger.current?.contains(event.target)) {
        setSettings(null); trigger.current?.focus();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSettings(null); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const colors = props.tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const colorButtons = (inPopover = false) => colors.map(color => <button type="button" key={color} aria-label={`Colour ${color}`} aria-pressed={props.color === color}
    className={inkToolbarButton} onClick={() => { props.onColorChange(color); if (inPopover) close(); }}>
    <span aria-hidden="true" className={`h-5 w-5 rounded-full border border-stone-400 ${props.color === color ? 'ring-2 ring-stone-500 ring-offset-2 ring-offset-stone-50 dark:ring-stone-300 dark:ring-offset-stone-900' : ''}`} style={{ backgroundColor: color }} />
  </button>);
  return <div ref={surface} role="toolbar" aria-label="Writing tools" className={inkToolbarSurface}>
    <div className="flex flex-nowrap items-center gap-1 overflow-x-auto p-2">
      <div className="flex shrink-0 items-center gap-1">
        {tools.map(({ tool, label, Icon }) => <button key={tool} type="button" aria-label={label} title={label} aria-pressed={props.tool === tool}
          aria-haspopup="dialog" aria-expanded={props.tool === tool && open} aria-controls={props.tool === tool && open ? id : undefined}
          className={`${inkToolbarButton} ${props.tool === tool ? selectedStyle : ''}`}
          onClick={event => {
            if (props.tool !== tool) { setSettings(null); props.onToolChange(tool); if (tool === 'eraser') props.onEraserModeChange(mode); return; }
            if (open) { close(); return; }
            trigger.current = event.currentTarget;
            const left = event.currentTarget.getBoundingClientRect().left - (surface.current?.getBoundingClientRect().left ?? 0);
            setSettings({ tool, left: Math.max(0, Math.min(left, (surface.current?.clientWidth ?? 240) - 240)) });
          }}><Icon size={21} aria-hidden="true" /></button>)}
      </div>
      {props.tool !== 'eraser' && <div className="flex shrink-0 items-center border-l border-stone-300 pl-1 dark:border-stone-700">{colorButtons()}</div>}
      <div className="flex shrink-0 items-center border-l border-stone-300 pl-1 dark:border-stone-700">
        <button type="button" aria-label="Undo" title="Undo" className={inkToolbarButton} disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={20} aria-hidden="true" /></button>
        <button type="button" aria-label="Redo" title="Redo" className={inkToolbarButton} disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={20} aria-hidden="true" /></button>
      </div>
      {props.pageControls}
    </div>
    {open && <div ref={popover} id={id} role="dialog" aria-label={`${tools.find(t => t.tool === props.tool)!.label} settings`}
      className="absolute top-full mt-1 w-60 rounded-xl border border-stone-300 bg-stone-50 p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900" style={{ left: settings.left }}>
      {props.tool === 'eraser' ? <div className="flex flex-col gap-1">
        {(['area', 'stroke'] as const).map(value => <button key={value} type="button" aria-label={`Erase by ${value}`} aria-pressed={mode === value}
          className={`min-h-10 rounded-lg px-3 text-left text-sm hover:bg-stone-200 dark:hover:bg-stone-800 ${mode === value ? selectedStyle : ''}`}
          onClick={() => {
            setMode(value);
            try { localStorage.setItem('dm.ink.eraserMode', value); } catch { /* Device preferences are optional when storage is unavailable. */ }
            props.onEraserModeChange(value); close();
          }}>Erase by {value}</button>)}
      </div> : <>
        <div className="flex items-center justify-between">{colorButtons(true)}</div>
        <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 dark:border-stone-700">
          {(['Fine', 'Medium', 'Thick'] as const).map((name, i) => {
            const width = (props.tool === 'highlighter' ? [12, 24, 36] : [2, 4, 8])[i];
            return <button key={name} type="button" aria-label={name} title={name} aria-pressed={props.width === width}
              className={`${inkToolbarButton} ${props.width === width ? selectedStyle : ''}`} onClick={() => { props.onWidthChange(width); close(); }}>
              <span aria-hidden="true" className="w-8 rounded-full bg-stone-800 dark:bg-stone-100" style={{ height: props.tool === 'highlighter' ? width / 3 : width }} />
            </button>;
          })}
        </div>
      </>}
    </div>}
  </div>;
}
