import type { CSSProperties } from 'react';
import type { StandaloneNote } from '../../types/daymark';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';

export function paperStyle(paper: StandaloneNote['paper']): CSSProperties {
  const line = 'linear-gradient(to bottom, #d6d3d1 1px, transparent 1px)';
  return { backgroundColor: '#fafaf9', backgroundImage: paper === 'grid' ? `${line}, linear-gradient(to right, #d6d3d1 1px, transparent 1px)` : paper === 'lined' ? line : undefined };
}

/** Finger scrolling for surfaces that suppress native gestures to keep pen input. */
export function startFingerScroll(surface: HTMLElement, event: PointerEvent) {
  let target = surface.parentElement;
  while (target) {
    const style = getComputedStyle(target);
    const overflowY = style.overflowY && style.overflowY !== 'visible' ? style.overflowY : style.overflow;
    const overflowX = style.overflowX && style.overflowX !== 'visible' ? style.overflowX : style.overflow;
    if ((/(auto|scroll|overlay)/.test(overflowY) && target.scrollHeight > target.clientHeight)
      || (/(auto|scroll|overlay)/.test(overflowX) && target.scrollWidth > target.clientWidth)) break;
    target = target.parentElement;
  }
  const scroller = target ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  let x = event.clientX, y = event.clientY;
  return {
    id: event.pointerId,
    move(next: PointerEvent) {
      scroller.scrollLeft -= next.clientX - x; scroller.scrollTop -= next.clientY - y;
      x = next.clientX; y = next.clientY;
    },
  };
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
