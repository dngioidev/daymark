import { isPhotoStorageAvailable, kvGetRaw, kvPutRaw } from './vaultStore';

const KEY = 'ui:collapsedSections';
const FALLBACK_KEY = 'daymark_ui_collapsed';

function sectionNames(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string').map((name) => name.toLowerCase()) : []);
}

export async function loadCollapsed(): Promise<Set<string>> {
  try {
    const value = isPhotoStorageAvailable()
      ? await kvGetRaw(KEY)
      : JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]');
    return sectionNames(value);
  } catch {
    return new Set();
  }
}

export async function saveCollapsed(names: Set<string>): Promise<void> {
  const value = [...sectionNames([...names])];
  if (isPhotoStorageAvailable()) await kvPutRaw(KEY, value);
  else localStorage.setItem(FALLBACK_KEY, JSON.stringify(value));
}
