import { useState } from 'react';
import { LogOut, MoreHorizontal } from 'lucide-react';
import { InkWritingTools, inkRailButton, type InkToolbarProps } from './InkToolbar';

export interface InkRailProps extends InkToolbarProps {
  side: 'left' | 'right'; onExit(): void; onSideChange?: (side: 'left' | 'right') => void;
  selectionCount: number;
  onDelete(): void; onCopy(): void; onCut(): void; onPaste(): void; onDuplicate(): void; onRecolor(color: string): void;
}
export function readRailSide(): 'left' | 'right' {
  try { return localStorage.getItem('dm.ink.railSide') === 'right' ? 'right' : 'left'; } catch { return 'left'; }
}
export function InkRail(props: InkRailProps) {
  const [overflow, setOverflow] = useState(false);
  const nextSide = props.side === 'left' ? 'right' : 'left';
  return <aside role="toolbar" aria-label="Writing tools" aria-orientation="vertical" data-side={props.side}
    className="relative z-10 flex w-14 shrink-0 flex-col items-center bg-stone-900 text-stone-100 pb-[env(safe-area-inset-bottom,0px)]" style={{ paddingTop: 'var(--dm-safe-top)' }}>
    <div className="min-h-0 flex-1 w-full overflow-y-auto [scrollbar-width:none]">
      <InkWritingTools {...props} railSide={props.side} />
      {props.selectionCount > 0 && <div role="group" aria-label="Selection actions" className="flex flex-col items-center border-t border-stone-700">
        {([['Delete', props.onDelete], ['Copy', props.onCopy], ['Cut', props.onCut], ['Duplicate', props.onDuplicate]] as const).map(([label, action]) =>
          <button key={label} type="button" aria-label={label} title={label} className={`${inkRailButton} text-[10px]`} onClick={action}>{label}</button>)}
        <input type="color" aria-label="Recolor selection" className="h-11 w-11" value={props.color} onChange={event => props.onRecolor(event.currentTarget.value)} />
      </div>}
      <div className="flex flex-col items-center">
        <button type="button" aria-label="More writing options" title="More writing options" aria-expanded={overflow} className={inkRailButton} onClick={() => setOverflow(!overflow)}><MoreHorizontal size={20} aria-hidden="true" /></button>
        {overflow && <button type="button" aria-label={`Move rail to ${nextSide}`} className="min-h-11 min-w-11 text-xs hover:bg-stone-800" onClick={() => {
          try { localStorage.setItem('dm.ink.railSide', nextSide); } catch { /* Preferences are optional. */ }
          props.onSideChange?.(nextSide); setOverflow(false);
        }}>Move rail to {nextSide}</button>}
      </div>
    </div>
    <button type="button" aria-label="Exit full screen" title="Exit full screen" className={`${inkRailButton} mt-auto`} onClick={props.onExit}><LogOut size={20} aria-hidden="true" /></button>
  </aside>;
}
