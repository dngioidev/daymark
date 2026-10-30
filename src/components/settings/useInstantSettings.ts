import { useEffect, useRef, useState } from 'react';
import type { AppSettings, SettingsTab } from '../../types/daymark';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS } from '../../utils/defaultData';

export function validateSettingsPatch(next: AppSettings): string | null {
  const { attentionDays, criticalDays } = next.agingThresholds;
  if (criticalDays <= attentionDays) return '"Urgent after" must be more than "Needs attention after".';
  if (!Number.isInteger(attentionDays) || attentionDays < 1 || attentionDays > 30)
    return '"Needs attention after" must be a whole number from 1 to 30.';
  if (!Number.isInteger(criticalDays) || criticalDays < 2 || criticalDays > 60)
    return '"Urgent after" must be a whole number from 2 to 60.';
  if (!next.defaultHeadings.length || next.defaultHeadings.some((h) => !h.trim()))
    return 'Keep at least one section with a name.';
  if (next.simulatedToday && (!/^\d{4}-\d{2}-\d{2}$/.test(next.simulatedToday)
    || !Number.isFinite(Date.parse(next.simulatedToday))
    || new Date(next.simulatedToday).toISOString().slice(0, 10) !== next.simulatedToday))
    return 'Choose a valid date.';
  return null;
}

export function resetTab(tab: SettingsTab, s: AppSettings): AppSettings {
  switch (tab) {
    case 'appearance': return { ...s, appearance: structuredClone(DEFAULT_APPEARANCE) };
    case 'lifecycle': return { ...s, statuses: structuredClone(DEFAULT_SETTINGS.statuses) };
    case 'aging': return {
      ...s,
      agingThresholds: structuredClone(DEFAULT_SETTINGS.agingThresholds),
      ...(s.alertDays ? { alertDays: { tasks: 'all', habits: 'all' } as const } : {}),
    };
    case 'headings': return { ...s, defaultHeadings: [...DEFAULT_SETTINGS.defaultHeadings] };
    default: return s;
  }
}

/** Draft text never reaches persistence until a blur/Enter commits a valid object. */
export function useInstantSettings(settings: AppSettings, onChange: (next: AppSettings) => void, isOpen: boolean) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(settings);
  latest.current = settings;
  useEffect(() => {
    setDraft(settings);
    setError(null);
  }, [settings, isOpen]);
  useEffect(() => {
    setSaved(false);
    clearTimeout(timer.current);
  }, [isOpen]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (next: AppSettings = draft) => {
    const message = validateSettingsPatch(next);
    setError(message);
    if (message) return false;
    setDraft(next);
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return true;
    latest.current = next;
    onChange(next);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
    return true;
  };
  return { draft, setDraft, error, setError, saved, commit };
}
