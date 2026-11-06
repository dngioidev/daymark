export interface PointerState {
  penActive: boolean;
  allowMouse?: boolean;
}

export type PointerAction = 'draw' | 'erase' | 'scroll' | 'ignore';

export function isPenEraserButton(e: { pointerType: string; buttons?: number; button?: number }): boolean {
  return e.pointerType === 'pen' && (((e.buttons ?? 0) & 2) !== 0 || ((e.buttons ?? 0) & 32) !== 0 || e.button === 5);
}

export function classifyPointer(state: PointerState, e: { pointerType: string; width: number; height: number; isPrimary: boolean; buttons?: number; button?: number }): { action: PointerAction; state: PointerState } {
  if (e.pointerType === 'pen') return { action: isPenEraserButton(e) ? 'erase' : 'draw', state: { ...state, penActive: true } };
  if (e.pointerType === 'touch') return { action: e.width > 30 || e.height > 30 || state.penActive || !e.isPrimary ? 'ignore' : 'scroll', state };
  return { action: e.pointerType === 'mouse' && state.allowMouse ? 'draw' : 'ignore', state };
}
