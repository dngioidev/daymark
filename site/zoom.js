/** Navigation helpers also used by the dependency-free node tests. */
export const nextIndex = (index, count, step) => count > 0 ? (index + step + count) % count : 0;
export const swipeStep = (dx, threshold = 40) => Math.abs(dx) < threshold ? 0 : dx < 0 ? 1 : -1;

export function installZoom(doc = document) {
  const links = [...doc.querySelectorAll('a[data-zoom]')];
  if (!links.length || typeof doc.createElement('dialog').showModal !== 'function') return;
  const dialog = doc.createElement('dialog');
  dialog.className = 'zoom-dialog';
  dialog.setAttribute('aria-label', 'Screenshot viewer');
  dialog.innerHTML = `<div class="zoom-panel">
    <div class="zoom-controls"><button type="button" data-prev aria-label="Previous screenshot">← Previous</button>
    <button type="button" data-close aria-label="Close screenshot viewer" autofocus>Close ×</button>
    <button type="button" data-next aria-label="Next screenshot">Next →</button></div>
    <figure><img alt=""><figcaption aria-live="polite"></figcaption></figure></div>`;
  doc.body.append(dialog);
  const img = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  let index = 0;
  let opener;
  let oldOverflow;
  let touch;
  const show = (i) => {
    index = i;
    const link = links[index];
    const source = link.querySelector('img');
    img.src = link.href;
    img.alt = source?.alt || '';
    caption.textContent = link.closest('figure')?.querySelector('figcaption')?.textContent || img.alt;
  };
  const browse = (step) => show(nextIndex(index, links.length, step));
  links.forEach((link, i) => link.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    opener = link;
    show(i);
    oldOverflow = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    dialog.showModal();
  }));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-prev]').addEventListener('click', () => browse(-1));
  dialog.querySelector('[data-next]').addEventListener('click', () => browse(1));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    doc.body.style.overflow = oldOverflow;
    opener?.focus({ preventScroll: true });
    img.removeAttribute('src');
    touch = undefined;
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      browse(event.key === 'ArrowRight' ? 1 : -1);
    }
    if (event.key === 'Tab') {
      const buttons = [...dialog.querySelectorAll('button')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  // Never cancel native touch behavior: pinch zoom remains available.
  dialog.addEventListener('touchstart', (event) => {
    touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : undefined;
  }, { passive: true });
  dialog.addEventListener('touchend', (event) => {
    if (touch && event.changedTouches.length === 1 && event.touches.length === 0) {
      const dx = event.changedTouches[0].clientX - touch.x;
      const dy = event.changedTouches[0].clientY - touch.y;
      const step = Math.abs(dx) > Math.abs(dy) ? swipeStep(dx) : 0;
      if (step) browse(step);
    }
    touch = undefined;
  }, { passive: true });
  dialog.addEventListener('touchcancel', () => { touch = undefined; }, { passive: true });
}

if (typeof document !== 'undefined') installZoom();
