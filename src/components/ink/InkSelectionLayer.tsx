import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import type { Loop } from '../../ink/inkSelection';

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export function InkSelectionLayer({ bounds, loop, onDelete, onCopy, onCut, onPaste, onDuplicate, onRecolor }: {
  bounds: Bounds | null; loop: Loop; onDelete: () => void; onCopy: () => void;
  onCut: () => void; onPaste: () => void; onDuplicate: () => void; onRecolor: (color: string) => void;
}) {
  return <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>
    <svg viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} style={{ width: '100%', height: '100%' }} aria-hidden="true">
      {!!loop.length && <polyline points={loop.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#78716c" strokeDasharray="6 4" />}
      {bounds && <g fill="white" stroke="#78716c" strokeWidth="2">
        <rect x={bounds.minX} y={bounds.minY} width={Math.max(1, bounds.maxX - bounds.minX)} height={Math.max(1, bounds.maxY - bounds.minY)} fill="none" strokeDasharray="6 4" />
        {[bounds.minX, bounds.maxX].flatMap(x => [bounds.minY, bounds.maxY].map(y => <rect key={`${x},${y}`} x={x - 5} y={y - 5} width="10" height="10" />))}
      </g>}
    </svg>
    {bounds && <div role="toolbar" aria-label="Selection actions" className="bg-stone-900 text-stone-100 rounded flex flex-wrap" style={{ position: 'absolute', top: `${bounds.maxY / PAGE_HEIGHT * 100}%`, left: `${Math.min(bounds.minX, 500) / PAGE_WIDTH * 100}%`, pointerEvents: 'auto' }}>
      {([['Delete', onDelete], ['Copy', onCopy], ['Cut', onCut], ['Paste', onPaste], ['Duplicate', onDuplicate]] as const).map(([label, action]) => <button key={label} type="button" aria-label={label} style={{ minWidth: 44, minHeight: 44 }} onClick={action}>{label}</button>)}
      <input type="color" aria-label="Recolor selection" onChange={e => onRecolor(e.currentTarget.value)} style={{ width: 44, height: 44 }} />
    </div>}
  </div>;
}
