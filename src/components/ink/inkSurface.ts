import type { CSSProperties } from 'react';
import type { StandaloneNote } from '../../types/daymark';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';

export function paperStyle(paper: StandaloneNote['paper']): CSSProperties {
  const line = 'linear-gradient(to bottom, #d6d3d1 1px, transparent 1px)';
  return { backgroundColor: '#fafaf9', backgroundImage: paper === 'grid' ? `${line}, linear-gradient(to right, #d6d3d1 1px, transparent 1px)` : paper === 'lined' ? line : undefined };
}

/** Bound pixel memory on high-DPR tablets; skip identical ResizeObserver notifications. */
export function sizeInkSurface(canvas: HTMLCanvasElement, cssWidth: number): boolean {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssWidth * PAGE_HEIGHT / PAGE_WIDTH * dpr));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.setTransform(width / PAGE_WIDTH, 0, 0, height / PAGE_HEIGHT, 0, 0);
  return true;
}
