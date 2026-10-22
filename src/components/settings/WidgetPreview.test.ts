import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WidgetPreview } from './WidgetPreview';
import { parseWidgetStyle } from '../../utils/widgetStyle';

it('previews the chosen typography, corners and visibility flags', () => {
  const html = renderToStaticMarkup(React.createElement(WidgetPreview, { style: parseWidgetStyle({
    font: 'mono', size: 'xl', corners: 'extra', show: { done: false, age: false, quickAdd: false, sections: true },
  }), app: null }));
  expect(html).toContain('font-family:monospace');
  expect(html).toContain('font-size:17px');
  expect(html).toContain('border-radius:28px');
  expect(html).toContain('Work');
  expect(html).not.toContain('Send the invoice');
  expect(html).not.toContain('New task');
  expect(html).not.toContain('>3d<');
});

it('previews resolved app colours with background-only opacity', () => {
  const html = renderToStaticMarkup(React.createElement(WidgetPreview, {
    style: parseWidgetStyle({ mode: 'match-app', opacity: 40 }),
    app: { headerBg: '#123456', headerText: '#ffffff', accent: '#abcdef' },
  }));
  expect(html).toContain('rgb(18 52 86 / 0.4)');
  expect(html).toContain('color:#ffffff');
  expect(html).toContain('background-color:#abcdef');
});

it('keeps the default rows at 30px and hides done rows without changing the count', () => {
  const html = renderToStaticMarkup(React.createElement(WidgetPreview, { style: parseWidgetStyle({}), app: null }));
  expect(html).toContain('height:30px');
  expect(html).not.toContain('padding-block:6px');
  expect(html).not.toContain('Send the invoice');
  expect(html).toContain('2 left · 1 done');
});

it('makes Compact tighter and done rows opt-in', () => {
  const html = renderToStaticMarkup(React.createElement(WidgetPreview, { style: parseWidgetStyle({ density: 'compact', show: { done: true } }), app: null }));
  expect(html).toContain('height:24px');
  expect(html).toContain('Send the invoice');
  expect(html).toContain('2 left · 1 done');
});
