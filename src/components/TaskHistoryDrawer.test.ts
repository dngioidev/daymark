import { describe, expect, it } from 'vitest';
import { humanizeLog } from './TaskHistoryDrawer';

describe('task history labels', () => {
  it('shows a move destination in plain words', () => {
    expect(humanizeLog('Moved from 2026-10-21 to 2026-10-22', '2026-10-21')).toBe('Moved to Tomorrow');
  });

  it('keeps other history labels readable', () => {
    expect(humanizeLog('Carried forward from 2026-10-20', '2026-10-21')).toBe('Carried forward from Yesterday');
  });
});
