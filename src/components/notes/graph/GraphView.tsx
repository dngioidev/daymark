import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { StandaloneNote } from '../../../types/daymark';
import type { FolderNode } from '../../../utils/noteFolders';
import type { NoteIndex } from '../../../utils/noteRelated';
import { buildGraph, defaultGraphScope, type GraphEdge, type GraphOptions } from '../../../utils/graphData';
import { createLayout } from '../../../utils/graphLayout';
import { scheduleGraphSuggestions, type SuggestionProgress } from '../../../utils/graphSuggestions';
import { loadPanePrefs, savePanePrefs } from '../../../utils/notesPanes';
import { GraphFilters } from './GraphFilters';
import { GraphDetail, ConnectionActions } from './GraphDetail';
import { ViewSwitch, type ViewSwitchProps } from '../ViewSwitch';
import { GraphList } from './GraphList';

export interface GraphViewProps {
  notes: StandaloneNote[]; index: NoteIndex; dismissed: Set<string>; folderTree: FolderNode[];
  onViewChange?: ViewSwitchProps['onChange']; focusViewSwitch?: React.RefObject<boolean>;
  selectedFolder: string | 'all'; activeNoteId?: string;
  onOpenNote(id: string): void; onLink(fromId: string, toId: string): void; onDismiss(a: string, b: string): void;
}
type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
const button = 'min-h-11 min-w-11 px-2 border border-stone-300 dark:border-stone-700 rounded hover:bg-stone-100 dark:hover:bg-stone-800';
const NO_DISMISSALS = new Set<string>();

export default function GraphView(props: GraphViewProps) {
  const [options, setOptions] = useState<GraphOptions>(() => ({ ...defaultGraphScope(props.notes.length, props.selectedFolder), showSuggestions: true, showTags: false }));
  const [selectedId, setSelectedId] = useState(props.activeNoteId);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [listView, setListView] = useState(false), [prefs, setPrefs] = useState(loadPanePrefs);
  const canvas = useRef<HTMLCanvasElement>(null), surface = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, zoom: 1 }), hovered = useRef<string | undefined>(undefined);
  const invalidate = useRef<() => void>(() => {});
  const [suggestions, setSuggestions] = useState<SuggestionProgress & { notes: StandaloneNote[]; index: NoteIndex; dismissed: Set<string> }>(() => ({ edges: [], pending: true, completed: 0, batchMs: 0, notes: props.notes, index: props.index, dismissed: props.dismissed }));
  useEffect(() => {
    const identity = { notes: props.notes, index: props.index, dismissed: props.dismissed };
    // Keep the previous edges until the first new publish: buildGraph drops edges
    // to missing notes and dismissed pairs, so nothing stale is shown, and nodes
    // held only by suggestions do not blink away while rescoring.
    setSuggestions(previous => ({ ...identity, edges: previous.edges, pending: true, completed: 0, batchMs: 0 }));
    // Scoring still yields every 12ms. Publish at most four progressive graph
    // snapshots: rebuilding the accessible list for every idle callback causes
    // a render backlog on large vaults even when scoring itself is inexpensive.
    const stride = Math.max(1, Math.ceil(props.notes.length / 4));
    let published = 0;
    return scheduleGraphSuggestions(props.notes, props.index, props.dismissed, progress => {
      if (progress.pending && progress.completed - published < stride) return;
      published = progress.completed; setSuggestions({ ...identity, ...progress });
    });
  }, [props.notes, props.index, props.dismissed]);
  const currentSuggestions = suggestions.notes === props.notes && suggestions.index === props.index && suggestions.dismissed === props.dismissed;
  const structuralOptions = useMemo(() => ({ ...options, query: undefined }), [options.folderPaths, options.tag, options.showTags, options.showSuggestions, options.showOrphans, options.local]);
  const baseGraph = useMemo(() => buildGraph(props.notes, props.index, NO_DISMISSALS, { folderPaths: options.folderPaths, tag: options.tag, showTags: options.showTags, showSuggestions: false, showOrphans: true }), [props.notes, props.index, options.folderPaths, options.tag, options.showTags]);
  // Suggestions only draw over these stable positions. They never reseed or add
  // spring forces. Include filtered orphans so newly connected nodes already
  // have a position when their progressive suggestions arrive.
  const layout = useMemo(() => createLayout(baseGraph.nodes, baseGraph.edges), [baseGraph]);
  const graph = useMemo(() => buildGraph(props.notes, props.index, props.dismissed, structuralOptions, suggestions.edges), [props.notes, props.index, props.dismissed, structuralOptions, suggestions.edges]);
  const matches = useMemo(() => {
    const query = options.query?.trim().toLocaleLowerCase();
    return new Set(graph.nodes.filter(node => query && `${node.title} ${node.folder} ${node.tags.join(' ')}`.toLocaleLowerCase().includes(query)).map(node => node.id));
  }, [graph.nodes, options.query]);
  const matchesRef = useRef(matches); matchesRef.current = matches;
  // The accessible list follows the canvas at transition priority, so a folder
  // toggle commits the filtered graph first and the list never blocks it.
  const searching = !!options.query?.trim();
  const listInput = useDeferredValue(useMemo(() => ({ nodes: graph.nodes, edges: graph.edges, matches: searching ? matches : undefined }), [graph.nodes, graph.edges, searching, matches]));
  useEffect(() => { invalidate.current(); }, [matches]);
  const localUnavailable = !!options.local && !graph.nodes.some(node => node.id === options.local!.noteId);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const allById = useMemo(() => new Map(props.notes.map(note => [note.id, note])), [props.notes]);
  const tags = useMemo(() => [...new Set(props.notes.flatMap(note => note.tags))].sort(), [props.notes]);
  const actions = useMemo(() => {
    const chooseEndpoints = (a: string, b: string) => {
      const from = selectedId === a || selectedId === b ? selectedId :
        (allById.get(a)?.updatedAt ?? '') >= (allById.get(b)?.updatedAt ?? '') ? a : b;
      return { from, to: from === a ? b : a };
    };
    return {
      onOpenNote: props.onOpenNote,
      onLink: (a: string, b: string) => { const { from, to } = chooseEndpoints(a, b); props.onLink(from, to); setSelectedEdge(null); },
      onDismiss: (a: string, b: string) => { props.onDismiss(a, b); setSelectedEdge(null); },
      linkTarget: (a: string, b: string) => byId.get(chooseEndpoints(a, b).to),
    };
  }, [selectedId, allById, byId, props.onOpenNote, props.onLink, props.onDismiss]);
  const visibleEdge = selectedEdge && graph.edges.find(edge => edge.kind === 'suggested' &&
    ((edge.a === selectedEdge.a && edge.b === selectedEdge.b) || (edge.a === selectedEdge.b && edge.b === selectedEdge.a)));
  const filterMin = (prefs.graphFilters ?? (window.innerWidth < 1100 ? 'min' : 'open')) === 'min';
  const detailMin = (prefs.graphDetail ?? (window.innerWidth < 1280 ? 'min' : 'open')) === 'min';
  const togglePane = (field: 'graphFilters' | 'graphDetail') => {
    const minimized = field === 'graphFilters' ? filterMin : detailMin;
    const next = { ...loadPanePrefs(), [field]: minimized ? 'open' as const : 'min' as const };
    setPrefs(next); savePanePrefs(next);
  };
  useEffect(() => { if (listView) list.current?.querySelector<HTMLButtonElement>('[data-node-id] button')?.focus(); }, [listView]);

  useEffect(() => {
    const el = canvas.current, wrapper = surface.current;
    if (!el || !wrapper) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = motion?.matches ?? false, moving = !reduced, frame = 0, width = 0, height = 0;
    const neighbours = new Map(graph.nodes.map(node => [node.id, new Set<string>()]));
    for (const edge of graph.edges) { neighbours.get(edge.a)?.add(edge.b); neighbours.get(edge.b)?.add(edge.a); }
    let fg = '', bg = '', amber = '';
    function colours() { const style = getComputedStyle(el!); fg = style.borderTopColor; bg = style.backgroundColor; amber = style.color; }
    colours();
    const dashed = [5, 5], solid: number[] = [];
    const draw = () => {
      const c = camera.current, dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2 + c.x, height / 2 + c.y); ctx.scale(c.zoom, c.zoom);
      const hover = hovered.current;
      dashed[0] = dashed[1] = 5 / c.zoom;
      for (const edge of graph.edges) {
        const a = layout.positions.get(edge.a)!, b = layout.positions.get(edge.b)!;
        ctx.globalAlpha = hover && edge.a !== hover && edge.b !== hover ? .08 : edge.kind === 'tag' ? .16 : .65;
        ctx.strokeStyle = edge.kind === 'suggested' ? amber : fg;
        ctx.lineWidth = (hover && (edge.a === hover || edge.b === hover) ? 2 : 1) / c.zoom;
        ctx.setLineDash(edge.kind === 'suggested' ? dashed : solid);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash(solid);
      let labels = 0;
      for (const node of graph.nodes) {
        const p = layout.positions.get(node.id)!;
        const x = p.x * c.zoom + width / 2 + c.x, y = p.y * c.zoom + height / 2 + c.y;
        if (x < -60 || y < -20 || x > width + 60 || y > height + 20) continue;
        const selected = node.id === selectedId, match = matchesRef.current.has(node.id), near = node.id === hover || !!neighbours.get(hover ?? '')?.has(node.id);
        const radius = selected ? 10 : Math.min(8, 3 + Math.sqrt(node.degree));
        ctx.globalAlpha = hover && !near && !selected ? .25 : 1;
        ctx.fillStyle = selected || match ? amber : fg;
        ctx.beginPath(); ctx.arc(p.x, p.y, radius / Math.sqrt(c.zoom), 0, Math.PI * 2); ctx.fill();
        if (selected || node.id === hover || (labels < 70 && (match || near || c.zoom >= .85)) || (c.zoom >= .4 && node.degree >= 4 && labels < 25)) {
          ctx.globalAlpha = 1; ctx.font = `${12 / c.zoom}px sans-serif`; ctx.textBaseline = 'middle';
          const label = node.title.length > 36 ? node.title.slice(0, 35) + '…' : node.title;
          ctx.strokeStyle = bg; ctx.lineWidth = 4 / c.zoom; ctx.strokeText(label, p.x + (radius + 5) / c.zoom, p.y);
          ctx.fillStyle = fg; ctx.fillText(label, p.x + (radius + 5) / c.zoom, p.y); labels++;
        }
      }
      ctx.globalAlpha = 1;
    };
    const animate = () => {
      frame = 0;
      if (moving) moving = layout.step() > 0;
      draw(); if (moving) frame = requestAnimationFrame(animate);
    };
    const requestDraw = () => { if (!frame) frame = requestAnimationFrame(animate); };
    invalidate.current = requestDraw;
    const resize = () => {
      width = wrapper.clientWidth || 600; height = wrapper.clientHeight || 500;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); el.width = width * dpr; el.height = height * dpr; requestDraw();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(wrapper); window.addEventListener('resize', resize);
    const theme = new MutationObserver(() => { colours(); requestDraw(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    const motionChange = () => { reduced = motion?.matches ?? false; if (reduced) { layout.settle(); moving = false; } requestDraw(); };
    motion?.addEventListener?.('change', motionChange);
    if (reduced) layout.settle();
    // Fit the initial spread once; pan/zoom are retained through selection changes.
    resize();
    if (camera.current.x === 0 && camera.current.y === 0 && camera.current.zoom === 1 && graph.nodes.length > 100) {
      camera.current.zoom = Math.min(1, Math.min(width, height) / (Math.sqrt(graph.nodes.length) * 40));
    }
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); theme.disconnect(); window.removeEventListener('resize', resize); motion?.removeEventListener?.('change', motionChange); invalidate.current = () => {}; };
  }, [layout, graph, selectedId]);

  const world = (clientX: number, clientY: number): Point => {
    const rect = canvas.current!.getBoundingClientRect(), c = camera.current;
    return { x: (clientX - rect.left - rect.width / 2 - c.x) / c.zoom, y: (clientY - rect.top - rect.height / 2 - c.y) / c.zoom };
  };
  const nodeAt = (p: Point) => {
    let hit: string | undefined, best = 16 / camera.current.zoom;
    for (const [id, point] of layout.positions) { const d = Math.hypot(p.x - point.x, p.y - point.y); if (d < best) { hit = id; best = d; } }
    return hit;
  };
  const edgeAt = (p: Point) => {
    let hit: GraphEdge | undefined, best = 7 / camera.current.zoom;
    for (const edge of graph.edges) {
      if (edge.kind !== 'suggested') continue;
      const a = layout.positions.get(edge.a)!, b = layout.positions.get(edge.b)!;
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      if (distance < best) { hit = edge; best = distance; }
    }
    return hit;
  };
  const pointers = useRef(new Map<number, Point>()), drag = useRef<{ x: number; y: number; moved: boolean } | null>(null), pinch = useRef(0);
  const zoomAt = (factor: number, x = 0, y = 0) => {
    const c = camera.current, next = Math.max(.08, Math.min(5, c.zoom * factor)), ratio = next / c.zoom;
    c.x = x - (x - c.x) * ratio; c.y = y - (y - c.y) * ratio; c.zoom = next; invalidate.current();
  };
  const zoomRef = useRef(zoomAt); zoomRef.current = zoomAt;
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const rect = el.getBoundingClientRect(); zoomRef.current(Math.exp(-e.deltaY * .002), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, []);

  return <div className="flex flex-1 min-h-0 min-w-0 gap-2 text-stone-900 dark:text-stone-100" aria-label="Knowledge graph">
    <aside aria-label="Graph filters" className={`${filterMin ? 'w-12' : 'w-52'} shrink-0 overflow-y-auto rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950`}>
      <button type="button" className={`${button} w-full`} aria-label={`${filterMin ? 'Expand' : 'Minimize'} graph filters`} aria-expanded={!filterMin} onClick={() => togglePane('graphFilters')}>{filterMin ? <ChevronRight size={16} aria-hidden="true" className="mx-auto" /> : <span className="flex items-center justify-center gap-1"><ChevronLeft size={16} aria-hidden="true" />Filters</span>}</button>
      {!filterMin && <GraphFilters tree={props.folderTree} tags={tags} options={options} onChange={setOptions} activeNoteId={selectedId ?? props.activeNoteId} />}
    </aside>
    <div className="flex-1 flex flex-col min-w-0 min-h-0 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 overflow-hidden">
      <div role="group" aria-label="Graph controls" className="flex flex-wrap gap-1 p-2 items-center">
        {props.onViewChange && <ViewSwitch size="toolbar" value="graph" focusOnMount={props.focusViewSwitch} onChange={props.onViewChange} />}
        <button type="button" className={button} aria-label="List view" aria-pressed={listView} onClick={() => setListView(!listView)}>List view</button>
        <button type="button" className={button} aria-label="Zoom in" onClick={() => zoomAt(1.25)}><Plus size={16} aria-hidden="true" className="mx-auto" /></button>
        <button type="button" className={button} aria-label="Zoom out" onClick={() => zoomAt(.8)}><Minus size={16} aria-hidden="true" className="mx-auto" /></button>
        <button type="button" className={button} onClick={() => { camera.current = { x: 0, y: 0, zoom: Math.min(1, 500 / Math.max(500, Math.sqrt(graph.nodes.length) * 40)) }; invalidate.current(); }}>Reset view</button>
        <span className="text-xs" role="status">{graph.nodes.length} notes · {graph.edges.length} connections</span>
        {options.query?.trim() && <span className="text-xs" role="status">{matches.size} matching notes</span>}
        {(!currentSuggestions || suggestions.pending) && <span className="text-xs text-stone-600 dark:text-stone-400" role="status">Finding suggestions…</span>}
      </div>
      <p className="px-3 text-xs">Solid: links · Faint: tags · Dashed amber: suggestions</p>
      {localUnavailable && <div className="p-3" role="status">Local note is missing or outside these filters. <button type="button" className={button} onClick={() => setOptions({ ...options, local: undefined })}>Switch to Whole vault</button></div>}
      <div ref={surface} className={`relative flex-1 min-h-0 ${listView ? 'hidden' : ''}`}>
        <canvas ref={canvas} role="img" aria-label={`Knowledge graph: ${graph.nodes.length} notes, ${graph.edges.length} connections. Use List view for keyboard actions.`} className="absolute inset-0 w-full h-full touch-none bg-white dark:bg-stone-950 text-amber-700 dark:text-amber-400 border-stone-700 dark:border-stone-300"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag.current = { x: e.clientX, y: e.clientY, moved: false }; pinch.current = 0; }}
          onPointerMove={e => {
            if (pointers.current.has(e.pointerId)) {
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch.current) zoomAt(distance / pinch.current); pinch.current = distance; if (drag.current) drag.current.moved = true;
              } else if (drag.current) {
                const d = drag.current, dx = e.clientX - d.x, dy = e.clientY - d.y;
                if (d.moved || Math.hypot(dx, dy) > 3) { camera.current.x += dx; camera.current.y += dy; d.x = e.clientX; d.y = e.clientY; d.moved = true; invalidate.current(); }
              }
            } else { const hit = nodeAt(world(e.clientX, e.clientY)); if (hit !== hovered.current) { hovered.current = hit; invalidate.current(); } }
          }}
          onPointerUp={e => {
            pointers.current.delete(e.pointerId);
            if (drag.current && !drag.current.moved) { const p = world(e.clientX, e.clientY), id = nodeAt(p); if (id) { setSelectedId(id); setSelectedEdge(null); } else { const edge = edgeAt(p); setSelectedEdge(edge ?? null); } }
            drag.current = null; pinch.current = 0;
          }}
          onPointerCancel={e => { pointers.current.delete(e.pointerId); drag.current = null; }}
          onPointerLeave={() => { hovered.current = undefined; invalidate.current(); }}
          onDoubleClick={e => { const id = nodeAt(world(e.clientX, e.clientY)); if (id) props.onOpenNote(id); }} />
        {graph.nodes.length === 0 && !localUnavailable && <p className="absolute inset-0 flex items-center justify-center pointer-events-none">No notes match these filters.</p>}
      </div>
      {visibleEdge && <div className="p-3 border-t" role="group" aria-label="Selected suggestion"><p>{byId.get(visibleEdge.a)?.title} ↔ {byId.get(visibleEdge.b)?.title}</p><ConnectionActions {...actions} a={visibleEdge.a} b={visibleEdge.b} target={byId.get(visibleEdge.b)!} /></div>}
      <div ref={list} className={listView ? 'p-3 overflow-y-auto flex-1 min-h-0' : 'sr-only'}><GraphList nodes={listInput.nodes} edges={listInput.edges} matches={listInput.matches} {...actions} tabIndex={listView ? 0 : -1} /></div>
    </div>
    <aside aria-label="Graph detail" className={`${detailMin ? 'w-12' : 'w-56'} shrink-0 overflow-y-auto rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950`}>
      <button type="button" className={`${button} w-full`} aria-label={`${detailMin ? 'Expand' : 'Minimize'} graph detail`} aria-expanded={!detailMin} onClick={() => togglePane('graphDetail')}>{detailMin ? <ChevronLeft size={16} aria-hidden="true" className="mx-auto" /> : <span className="flex items-center justify-center gap-1">Detail<ChevronRight size={16} aria-hidden="true" /></span>}</button>
      {!detailMin && <GraphDetail nodes={graph.nodes} edges={graph.edges} selectedId={selectedId} {...actions} />}
    </aside>
  </div>;
}
