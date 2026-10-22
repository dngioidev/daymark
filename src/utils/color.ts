export function parseHex(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Invalid hex colour: ${hex}`);
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function composite(fgHex: string, alpha: number, bgHex: string): string {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) throw new Error('Invalid composite colour');
  const opacity = Math.max(0, Math.min(1, alpha));
  return toHex(fg.map((v, i) => v * opacity + bg[i] * (1 - opacity)) as [number, number, number]);
}

export function autoTextOn(bgHex: string): '#ffffff' | '#1c1917' {
  return contrastRatio('#ffffff', bgHex) >= contrastRatio('#1c1917', bgHex) ? '#ffffff' : '#1c1917';
}
