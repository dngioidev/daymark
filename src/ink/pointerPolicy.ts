export interface PointerState {
  penActive: boolean;
  allowMouse?: boolean;
}

export function classifyPointer(state: PointerState, e: { pointerType: string; width: number; height: number; isPrimary: boolean }): { action: 'draw' | 'scroll' | 'ignore'; state: PointerState } {
  if (e.pointerType === 'pen') return { action: 'draw', state: { ...state, penActive: true } };
  if (e.pointerType === 'touch') return { action: e.width > 30 || e.height > 30 || state.penActive || !e.isPrimary ? 'ignore' : 'scroll', state };
  return { action: e.pointerType === 'mouse' && state.allowMouse ? 'draw' : 'ignore', state };
}
