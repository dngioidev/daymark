import { useState } from 'react';
import type { InkPage } from '../types/daymark';
import { InkCanvas } from '../components/ink/InkCanvas';
import { encodePoints } from './inkModel';

/** Loaded only by the DEV query entry; no vault reads or writes. */
export default function InkBench() {
  const [page, setPage] = useState<InkPage>(() => ({
    noteId: 'ink-benchmark', page: 0, removed: [], updatedAt: '',
    strokes: Array.from({ length: 2000 }, (_, i) => ({
      id: `bench-${i}`, tool: i % 10 === 0 ? 'highlighter' : 'pen',
      color: i % 10 === 0 ? '#fde047' : '#1c1917', width: i % 10 === 0 ? 12 : 3, createdAt: '',
      points: encodePoints(Array.from({ length: 60 }, (_, j) => ({
        x: 20 + (i % 10) * 96 + j, y: 20 + Math.floor(i / 10) * 6.8 + Math.sin(j / 4) * 2, p: 0.5 + Math.sin(j / 8) * 0.3,
      }))),
    })),
  }));
  return <div data-inkbench style={{ width: 1000 }}><InkCanvas page={page} paper="lined" tool="pen" color="#1d4ed8" width={4} eraserMode="area" onChange={setPage} allowMouse /></div>;
}
