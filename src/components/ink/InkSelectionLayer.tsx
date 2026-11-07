import { useState } from 'react';
import { Trash2, Copy, Scissors, ClipboardPaste, CopyPlus, Palette } from 'lucide-react';
import { PEN_COLORS } from '../../ink/inkColors';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import type { Loop, Transform } from '../../ink/inkSelection';

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export function InkSelectionLayer({ bounds: resting, loop, hasClip = false, scale = 1, drag = null, onDelete, onCopy, onCut, onPaste, onDuplicate, onRecolor }: {
  hasClip?: boolean; scale?: number; drag?: Transform | null;
  bounds: Bounds | null; loop: Loop; onDelete: () => void; onCopy: () => void;
  onCut: () => void; onPaste: () => void; onDuplicate: () => void; onRecolor: (color: string) => void;
}) {
  const [recolor, setRecolor] = useState(false);
  // While dragging, the frame follows the lifted selection and the action bar steps aside.
  const bounds = resting && drag ? {
    minX: drag.originX + (resting.minX - drag.originX) * drag.scale + drag.dx, minY: drag.originY + (resting.minY - drag.originY) * drag.scale + drag.dy,
    maxX: drag.originX + (resting.maxX - drag.originX) * drag.scale + drag.dx, maxY: drag.originY + (resting.maxY - drag.originY) * drag.scale + drag.dy,
  } : resting;
  const handle = 8 / Math.max(scale, 0.01), pad = 4 / Math.max(scale, 0.01);
  const barWidth = (hasClip ? 6 : 5) * 48 + 4;
  const above = bounds && bounds.maxY * scale + (recolor ? 108 : 60) > PAGE_HEIGHT * scale;
  const buttonStyle = { width: 44, height: 44, flexShrink: 0 };
  return <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>
    <svg viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} style={{ width: '100%', height: '100%' }} aria-hidden="true">
      {!!loop.length && <polyline points={loop.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#78716c" strokeDasharray="6 4" />}
      {bounds && <g data-selection-frame className="text-stone-600 dark:text-stone-300" stroke="currentColor">
        <rect x={bounds.minX - pad} y={bounds.minY - pad} width={Math.max(1, bounds.maxX - bounds.minX + pad * 2)} height={Math.max(1, bounds.maxY - bounds.minY + pad * 2)}
          rx={pad} fill="currentColor" fillOpacity="0.04" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {[bounds.minX - pad, bounds.maxX + pad].flatMap(x => [bounds.minY - pad, bounds.maxY + pad].map(y => <circle key={`${x},${y}`} data-selection-handle cx={x} cy={y} r={handle}
          fill="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />))}
      </g>}
    </svg>
    {bounds && !drag && <div role="toolbar" aria-label="Selection actions" className="bg-stone-900 text-stone-100 rounded-xl shadow-lg p-1 flex flex-col gap-1" style={{ position: 'absolute',
      top: above ? undefined : `calc(${bounds.maxY / PAGE_HEIGHT * 100}% + 8px)`,
      bottom: above ? `calc(${(PAGE_HEIGHT - bounds.minY) / PAGE_HEIGHT * 100}% + 8px)` : undefined,
      left: Math.max(0, Math.min(bounds.minX * scale, PAGE_WIDTH * scale - barWidth)), maxWidth: '100%', overflowX: 'auto', pointerEvents: 'auto' }}>
      <div className="flex gap-1">
        {([['Delete', onDelete, Trash2], ['Copy', onCopy, Copy], ['Cut', onCut, Scissors], ...(hasClip ? [['Paste', onPaste, ClipboardPaste] as const] : []), ['Duplicate', onDuplicate, CopyPlus]] as const).map(([label, action, Icon]) => <button key={label} type="button" aria-label={label} title={label} className="inline-flex items-center justify-center rounded-lg hover:bg-stone-800" style={buttonStyle} onClick={action}><Icon size={20} aria-hidden="true" /></button>)}
        <button type="button" aria-label="Recolor selection" title="Recolor selection" aria-expanded={recolor} className="inline-flex items-center justify-center rounded-lg hover:bg-stone-800" style={buttonStyle} onClick={() => setRecolor(!recolor)}><Palette size={20} aria-hidden="true" /></button>
      </div>
      {recolor && <div className="flex gap-1" role="group" aria-label="Selection colors">{PEN_COLORS.map(color => <button key={color} type="button" aria-label={`Recolor ${color}`} style={buttonStyle} className="inline-flex items-center justify-center rounded-lg hover:bg-stone-800" onClick={() => { onRecolor(color); setRecolor(false); }}><span className="h-5 w-5 rounded-full border border-stone-400" style={{ backgroundColor: color }} /></button>)}</div>}
    </div>}
  </div>;
}
