/** Viewport coordinates for a fixed menu, with room reserved for its scrollable content. */
export function placeMenu(
  anchor: { top: number; bottom: number; left: number; right: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  align: 'left' | 'right',
  gap = 4,
  margin = 8,
): { top: number; left: number; maxHeight: number; placement: 'below' | 'above' } {
  const below = Math.max(0, viewport.height - margin - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - margin - gap);
  const placement = menu.height <= below || below >= above ? 'below' : 'above';
  const maxHeight = placement === 'below' ? below : above;
  const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - Math.min(menu.height, maxHeight);
  const left = Math.max(margin, Math.min(align === 'right' ? anchor.right - menu.width : anchor.left, viewport.width - menu.width - margin));
  return { top, left, maxHeight, placement };
}
