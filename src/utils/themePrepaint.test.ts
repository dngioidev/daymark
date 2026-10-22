import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe.each(['index.html', 'signin.html'])('%s pre-paint theme', (file) => {
  const html = readFileSync(file, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  it.each([
    ['{"theme":"light","textSize":"s"}', true, false, '15px'],
    ['{"theme":"dark","textSize":"l"}', false, true, '17.5px'],
    [null, true, true, '16px'],
    [null, false, false, '16px'],
  ])('applies %s with system dark %s', (saved, systemDark, dark, fontSize) => {
    const classes = new Set<string>();
    const root = { classList: {
      add: (name: string) => classes.add(name),
      toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name),
    }, style: { fontSize: '' } };
    runInNewContext(script, { document: { documentElement: root },
      localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: systemDark }),
      window: { matchMedia: () => ({ matches: systemDark }) },
    });
    expect(classes.has('dark')).toBe(dark);
    expect(root.style.fontSize).toBe(fontSize);
  });
  it('does not block startup on malformed or inaccessible storage', () => {
    for (const getItem of [() => '{', () => { throw new Error('blocked'); }]) {
      expect(() => runInNewContext(script, { localStorage: { getItem } })).not.toThrow();
    }
  });
});
