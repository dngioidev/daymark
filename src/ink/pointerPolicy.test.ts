import { describe, expect, it } from 'vitest';
import { classifyPointer, isPenEraserButton } from './pointerPolicy';

describe('pointer policy', () => {
  it.each([
    ['pen with barrel button (buttons=3) erases', { buttons: 3 }, 'erase'],
    ['pen eraser end (buttons=32) erases', { buttons: 32 }, 'erase'],
    ['pen button===5 erases', { button: 5 }, 'erase'],
    ['pen without button draws', { buttons: 1 }, 'draw'],
  ] as const)('%s', (_name, buttons, action) => {
    const result = classifyPointer({ penActive: false }, { pointerType: 'pen', width: 1, height: 1, isPrimary: true, ...buttons });
    expect(result.action).toBe(action);
    expect(result.state.penActive).toBe(true);
  });

  it('mouse draws only with allowMouse', () => {
    const event = { pointerType: 'mouse', width: 1, height: 1, isPrimary: true, buttons: 3 };
    expect(classifyPointer({ penActive: false }, event).action).toBe('ignore');
    expect(classifyPointer({ penActive: false, allowMouse: true }, event).action).toBe('draw');
  });

  it.each([
    [false, 10, true, 'scroll'],
    [true, 10, true, 'ignore'],
    [false, 31, true, 'ignore'],
    [false, 10, false, 'ignore'],
  ] as const)('touch never draws or erases (active=%s width=%s primary=%s)', (penActive, width, isPrimary, action) => {
    const state = { penActive };
    const result = classifyPointer(state, { pointerType: 'touch', width, height: 1, isPrimary, buttons: 3 });
    expect(result.action).toBe(action);
    expect(result.state).toBe(state);
  });

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

describe('isPenEraserButton', () => {
  it.each([
    [{ pointerType: 'pen', buttons: 2 }, true],
    [{ pointerType: 'pen', buttons: 3 }, true],
    [{ pointerType: 'pen', buttons: 32 }, true],
    [{ pointerType: 'pen', button: 5 }, true],
    [{ pointerType: 'pen', buttons: 1 }, false],
    [{ pointerType: 'pen' }, false],
    [{ pointerType: 'mouse', buttons: 3, button: 5 }, false],
    [{ pointerType: 'touch', buttons: 32, button: 5 }, false],
  ] as const)('%o returns %s', (event, expected) => {
    expect(isPenEraserButton(event)).toBe(expected);
  });
});
