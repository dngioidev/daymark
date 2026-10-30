import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS } from '../../utils/defaultData';
import { resetTab, validateSettingsPatch } from './useInstantSettings';

describe('instant settings validation and resets', () => {
  it('rejects reversed thresholds with the required sentence', () => {
    expect(validateSettingsPatch({ ...DEFAULT_SETTINGS, agingThresholds: {
      ...DEFAULT_SETTINGS.agingThresholds, attentionDays: 5, criticalDays: 3,
    } })).toBe('"Urgent after" must be more than "Needs attention after".');
  });
  it('accepts defaults', () => expect(validateSettingsPatch(DEFAULT_SETTINGS)).toBeNull());
  it('resets alert choices with the aging tab without adding them to untouched settings', () => {
    const custom = { ...DEFAULT_SETTINGS, alertDays: { tasks: 'weekdays' as const, habits: 'weekend' as const } };
    expect(resetTab('aging', custom).alertDays).toEqual({ tasks: 'all', habits: 'all' });
    expect(resetTab('aging', DEFAULT_SETTINGS)).not.toHaveProperty('alertDays');
    expect(resetTab('appearance', custom).alertDays).toEqual(custom.alertDays);
  });
  it.each([NaN, Infinity, 0, -1, 1.5, 31])('rejects invalid attention days %s', (attentionDays) => {
    expect(validateSettingsPatch({ ...DEFAULT_SETTINGS, agingThresholds: {
      ...DEFAULT_SETTINGS.agingThresholds, attentionDays,
    } })).not.toBeNull();
  });
  it('rejects empty sections and invalid dates', () => {
    expect(validateSettingsPatch({ ...DEFAULT_SETTINGS, defaultHeadings: [] })).not.toBeNull();
    expect(validateSettingsPatch({ ...DEFAULT_SETTINGS, simulatedToday: '2026-02-30' })).not.toBeNull();
  });
  it('resets only the selected preference group', () => {
    const custom = { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE, textSize: 'l' as const } };
    expect(resetTab('appearance', custom).appearance).toEqual(DEFAULT_APPEARANCE);
    expect(resetTab('appearance', custom).statuses).toBe(custom.statuses);
    expect(resetTab('lifecycle', custom).statuses).toEqual(DEFAULT_SETTINGS.statuses);
    expect(resetTab('aging', custom).agingThresholds).toEqual(DEFAULT_SETTINGS.agingThresholds);
    expect(resetTab('headings', custom).defaultHeadings).toEqual(DEFAULT_SETTINGS.defaultHeadings);
    expect(resetTab('storage', custom)).toBe(custom);
  });
});
