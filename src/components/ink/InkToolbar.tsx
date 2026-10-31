import { useState } from 'react';
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
}
export function readEraserMode(): EraserMode {
  try { return localStorage.getItem('dm.ink.eraserMode') === 'stroke' ? 'stroke' : 'area'; } catch { return 'area'; }
}

export function InkToolbar(props: InkToolbarProps) {
  const [mode, setMode] = useState(readEraserMode);
  return <div role="toolbar" aria-label="Writing tools" className="flex flex-wrap items-center gap-2 border-b border-stone-300 bg-stone-50 p-2 text-stone-900">
    {(['pen', 'highlighter', 'eraser'] as const).map(tool => <button key={tool} type="button" aria-pressed={props.tool === tool} onClick={() => { props.onToolChange(tool); if (tool === 'eraser') props.onEraserModeChange(mode); }}>{tool === 'pen' ? 'Pen' : tool === 'highlighter' ? 'Highlighter' : 'Eraser'}</button>)}
    {props.tool !== 'eraser' && <>
      {(props.tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS).map(color => <button type="button" key={color} aria-label={`Colour ${color}`} aria-pressed={props.color === color} onClick={() => props.onColorChange(color)} style={{ backgroundColor: color, width: 28, height: 28, borderRadius: '50%', border: props.color === color ? '3px solid #78716c' : '1px solid #d6d3d1' }} />)}
      {(['Fine', 'Medium', 'Thick'] as const).map((name, i) => { const width = (props.tool === 'highlighter' ? [12, 24, 36] : [2, 4, 8])[i]; return <button type="button" key={name} aria-pressed={props.width === width} onClick={() => props.onWidthChange(width)}>{name}</button>; })}
    </>}
    {props.tool === 'eraser' && <select aria-label="Eraser mode" value={mode} onChange={e => {
      const next = e.target.value as EraserMode; setMode(next);
      try { localStorage.setItem('dm.ink.eraserMode', next); } catch { /* Device preferences are optional when storage is unavailable. */ }
      props.onEraserModeChange(next);
    }}><option value="area">Erase by area</option><option value="stroke">Erase by stroke</option></select>}
    <button type="button" disabled={!props.canUndo} onClick={props.onUndo}>Undo</button>
    <button type="button" disabled={!props.canRedo} onClick={props.onRedo}>Redo</button>
  </div>;
}
