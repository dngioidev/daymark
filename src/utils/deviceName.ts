export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Linux';
  return `${os} browser`;
}

/** Random id kept for the lifetime of this install (lets the server recognise a repeat sign-in). */
export function getInstallId(): string {
  const KEY = 'daymark_install_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    // Not crypto.randomUUID: it only exists on HTTPS, and LAN servers are often plain http://
    id = `inst-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 12)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
