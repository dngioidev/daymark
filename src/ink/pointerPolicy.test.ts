import { describe, expect, it } from 'vitest';
import { classifyPointer } from './pointerPolicy';

describe('pointer policy', () => {
  it.each([
    ['pen', 1, true, false, false, 'draw'],
    ['touch', 10, true, false, false, 'scroll'],
    ['touch', 31, true, false, false, 'ignore'],
    ['touch', 10, false, true, false, 'ignore'],
    ['mouse', 1, true, false, false, 'ignore'],
    ['mouse', 1, true, false, true, 'draw'],
  ] as const)('%s contact %s primary %s active %s mouse %s → %s', (pointerType, width, isPrimary, penActive, allowMouse, action) => {
    const result = classifyPointer({ penActive, allowMouse }, { pointerType, width, height: 1, isPrimary });
    expect(result.action).toBe(action);
    if (pointerType === 'pen') expect(result.state.penActive).toBe(true);
  });
});
