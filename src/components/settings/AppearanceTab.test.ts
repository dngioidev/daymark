import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AppearanceTab } from './AppearanceTab';
import { DEFAULT_APPEARANCE } from '../../utils/defaultData';

it('renders theme, text size, colour fields, per-theme caption, photo slot and contrast warning', () => {
  const html = renderToStaticMarkup(React.createElement(AppearanceTab, {
    appearance: { ...DEFAULT_APPEARANCE, light: { ...DEFAULT_APPEARANCE.light, headerText: '#fafaf9' } },
    onChange: () => {}, photoSection: React.createElement('p', null, 'Task 4 photos'),
  }));
  for (const text of ['\u2600 Light', '\u263e Dark', 'Header text', 'Page text', 'Accent', 'Automatic',
    'Hard to read: contrast 1.0:1 (needs 4.5:1)', 'Editing Light colours.', 'Task 4 photos',
    'Saved in the app and synced. Your browser or phone setting is ignored.']) expect(html).toContain(text);
});
