/** Parse the shared source without filesystem APIs so Vite can bundle it offline. */
export function parseGuide(raw, slug) {
  const text = raw.replace(/\r\n/g, '\n');
  const metadata = text.match(/^---\n([\s\S]*?)\n---\n/);
  const title = metadata?.[1].match(/^title:\s*(.+)$/m)?.[1].trim();
  const order = Number(metadata?.[1].match(/^order:\s*(\d+)$/m)?.[1]);
  if (!title || !Number.isFinite(order)) throw new Error(`${slug}: missing title or order`);
  if (!/^## Web[ \t]*$/m.test(text)) throw new Error(`${slug}: missing Web section`);
  if (!/^## Mobile[ \t]*$/m.test(text)) throw new Error(`${slug}: missing Mobile section`);
  const parts = text.slice(metadata[0].length).match(/^## Web\s*\n([\s\S]*?)^## Mobile\s*\n([\s\S]*)$/m);
  if (!parts?.[1].trim()) throw new Error(`${slug}: missing or empty Web section`);
  if (!parts?.[2].trim()) throw new Error(`${slug}: missing or empty Mobile section`);
  return { slug, title, order, web: parts[1].trim(), mobile: parts[2].trim() };
}
