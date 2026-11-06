// Fullscreen is a progressive enhancement; writing still works when it is unavailable.
export async function enterFullscreen(el: HTMLElement): Promise<void> {
  try { if (document.fullscreenEnabled) await el.requestFullscreen?.(); } catch { /* The platform may deny fullscreen. */ }
}
export async function exitFullscreen(): Promise<void> {
  try { if (document.fullscreenEnabled) await document.exitFullscreen?.(); } catch { /* Already exited or unavailable. */ }
}
