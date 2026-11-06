import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Eraser, Highlighter, PenLine, Redo2, Undo2, MousePointer2, Type, ClipboardPaste } from 'lucide-react';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';
import type { EraserMode, InkCanvasTool } from './InkCanvas';

export interface InkToolbarProps {
  tool: InkCanvasTool; color: string; width: number;
  onToolChange: (tool: InkCanvasTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onEraserModeChange: (mode: EraserMode) => void;
  onUndo: () => void; onRedo: () => void;
  canUndo?: boolean; canRedo?: boolean;
  hasClip?: boolean; onPaste?: () => void;
  pageControls?: ReactNode;
}
export function readEraserMode(): EraserMode {
  try { return localStorage.getItem('dm.ink.eraserMode') === 'stroke' ? 'stroke' : 'area'; } catch { return 'area'; }
}
export const inkToolbarSurface = 'sticky top-0 z-10 shrink-0 border-b border-stone-200 bg-stone-50 text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100';
export const inkToolbarButton = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-500 disabled:opacity-30 dark:hover:bg-stone-800';
export const inkRailButton = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-stone-400 disabled:opacity-30';
const tools = [{ tool: 'pen', label: 'Pen', Icon: PenLine }, { tool: 'highlighter', label: 'Highlighter', Icon: Highlighter }, { tool: 'eraser', label: 'Eraser', Icon: Eraser }, { tool: 'select', label: 'Select', Icon: MousePointer2 }, { tool: 'text', label: 'Text', Icon: Type }] as const;

export function InkToolbar(props: InkToolbarProps) { return <InkWritingTools {...props} />; }

// Shared tool list and settings keep the horizontal toolbar and side rail consistent.
export function InkWritingTools(props: InkToolbarProps & { railSide?: 'left' | 'right' }) {
  const rail = props.railSide !== undefined;
  const buttonStyle = rail ? inkRailButton : inkToolbarButton;
  const selectedStyle = rail ? 'bg-stone-700' : 'bg-stone-200 dark:bg-stone-700';
  const [mode, setMode] = useState(readEraserMode);
  const [settings, setSettings] = useState<{ tool: InkCanvasTool; left: number; top?: number } | null>(null);
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
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const colors = props.tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const colorButtons = (inPopover = false) => colors.map(color => <button type="button" key={color} aria-label={`Colour ${color}`} aria-pressed={props.color === color}
    className={buttonStyle} onClick={() => { props.onColorChange(color); if (inPopover) close(); }}>
    <span aria-hidden="true" className={`h-5 w-5 rounded-full border border-stone-400 ${props.color === color ? 'ring-2 ring-stone-500 ring-offset-2 ring-offset-stone-50 dark:ring-stone-300 dark:ring-offset-stone-900' : ''}`} style={{ backgroundColor: color }} />
  </button>);
  const openSettings = (button: HTMLButtonElement) => {
    if (open) { close(); return; }
    trigger.current = button;
    const rect = surface.current?.getBoundingClientRect();
    if (rail && rect) {
      const left = props.railSide === 'right' ? rect.left - 240 : rect.right;
      setSettings({ tool: props.tool, left: Math.max(0, Math.min(left, window.innerWidth - 240)), top: Math.max(0, Math.min(button.getBoundingClientRect().top, window.innerHeight - 240)) });
      return;
    }
    const left = button.getBoundingClientRect().left - (surface.current?.getBoundingClientRect().left ?? 0);
    setSettings({ tool: props.tool, left: Math.max(0, Math.min(left, (surface.current?.clientWidth ?? 240) - 240)) });
  };
  const history = <div className={rail ? 'flex flex-col items-center border-t border-stone-700' : 'flex shrink-0 items-center border-l border-stone-300 pl-1 dark:border-stone-700'}>
    <button type="button" aria-label="Undo" title="Undo" className={buttonStyle} disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={20} aria-hidden="true" /></button>
    <button type="button" aria-label="Redo" title="Redo" className={buttonStyle} disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={20} aria-hidden="true" /></button>
  </div>;
  return <div ref={surface} role={rail ? undefined : 'toolbar'} aria-label={rail ? undefined : 'Writing tools'} className={rail ? 'relative flex flex-col items-center' : inkToolbarSurface}>
    <div className={rail ? 'flex flex-col items-center gap-1' : 'flex flex-nowrap items-center gap-1 p-2'}>
      <div className={rail ? 'flex flex-col items-center gap-1' : 'flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto'}>
        <div className={rail ? 'flex flex-col items-center gap-1' : 'flex shrink-0 items-center gap-1'}>
          {tools.filter(t => rail || (t.tool !== 'select' && t.tool !== 'text')).map(({ tool, label, Icon }) => <button key={tool} type="button" aria-label={label} title={label} aria-pressed={props.tool === tool}
            aria-haspopup="dialog" aria-expanded={props.tool === tool && open} aria-controls={props.tool === tool && open ? id : undefined}
            className={`${buttonStyle} ${props.tool === tool ? selectedStyle : ''}`}
            onClick={event => {
              if (props.tool !== tool) { setSettings(null); props.onToolChange(tool); if (tool === 'eraser') props.onEraserModeChange(mode); return; }
              openSettings(event.currentTarget);
            }}><Icon size={21} aria-hidden="true" /></button>)}
        </div>
        {!rail && history}
        {props.hasClip && <button type="button" aria-label="Paste" title="Paste" className={rail ? inkRailButton : `${inkToolbarButton} h-11 w-11`} onClick={props.onPaste}><ClipboardPaste size={20} aria-hidden="true" /></button>}
        {props.tool !== 'eraser' && <div className={rail ? 'flex flex-col items-center' : 'flex shrink-0 items-center border-l border-stone-300 pl-1 dark:border-stone-700'}>{colorButtons()}</div>}
        {rail && (props.tool === 'pen' || props.tool === 'highlighter') && <button type="button" aria-label="Width" title="Width" className={buttonStyle}
          aria-haspopup="dialog" aria-expanded={open} onClick={event => openSettings(event.currentTarget)}>
          <span aria-hidden="true" className="w-6 rounded-full bg-stone-100" style={{ height: props.tool === 'highlighter' ? props.width / 3 : props.width }} />
        </button>}
        {rail && history}
      </div>
      {props.pageControls}
    </div>
    {open && <div ref={popover} id={id} role="dialog" aria-label={`${tools.find(t => t.tool === props.tool)!.label} settings`}
      className={`${rail ? 'fixed' : 'absolute'} z-20 w-60 rounded-xl border p-3 shadow-lg ${rail ? 'top-0 border-stone-700 bg-stone-900 text-stone-100' : 'top-full mt-1 border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900'}`}
      style={rail ? { top: settings.top, left: settings.left } : { left: settings.left }}>
      {props.tool === 'eraser' ? <div className="flex flex-col gap-1">
        {(['area', 'stroke'] as const).map(value => <button key={value} type="button" aria-label={`Erase by ${value}`} aria-pressed={mode === value}
          className={`${rail ? 'min-h-11 min-w-11 hover:bg-stone-800' : 'min-h-10 hover:bg-stone-200 dark:hover:bg-stone-800'} rounded-lg px-3 text-left text-sm ${mode === value ? selectedStyle : ''}`}
          onClick={() => {
            setMode(value);
            try { localStorage.setItem('dm.ink.eraserMode', value); } catch { /* Device preferences are optional when storage is unavailable. */ }
            props.onEraserModeChange(value); close();
          }}>Erase by {value}</button>)}
      </div> : <>
        <div className="flex items-center justify-between">{colorButtons(true)}</div>
        {(props.tool === 'pen' || props.tool === 'highlighter') && <div className="mt-2 flex items-center justify-between border-t border-stone-200 pt-2 dark:border-stone-700">
          {(['Fine', 'Medium', 'Thick'] as const).map((name, i) => {
            const width = (props.tool === 'highlighter' ? [12, 24, 36] : [2, 4, 8])[i];
            return <button key={name} type="button" aria-label={name} title={name} aria-pressed={props.width === width}
              className={`${buttonStyle} ${props.width === width ? selectedStyle : ''}`} onClick={() => { props.onWidthChange(width); close(); }}>
              <span aria-hidden="true" className={`w-8 rounded-full ${rail ? 'bg-stone-100' : 'bg-stone-800 dark:bg-stone-100'}`} style={{ height: props.tool === 'highlighter' ? width / 3 : width }} />
            </button>;
          })}
        </div>}
      </>}
    </div>}
  </div>;
}
