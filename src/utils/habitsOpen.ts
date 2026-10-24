import { isPhotoStorageAvailable, kvGetRaw, kvPutRaw } from './vaultStore';

const KEY = 'ui:habitsOpen';
const FALLBACK_KEY = 'daymark_ui_habits_open';

export async function loadHabitsOpen(): Promise<boolean> {
  try {
    const value = isPhotoStorageAvailable()
      ? await kvGetRaw(KEY)
      : JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? 'false');
    return value === true;
  } catch {
    return false;
  }
}

export async function saveHabitsOpen(open: boolean): Promise<void> {
  if (isPhotoStorageAvailable()) await kvPutRaw(KEY, open);
  else localStorage.setItem(FALLBACK_KEY, JSON.stringify(open));
}
