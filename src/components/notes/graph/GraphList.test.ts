import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GraphList } from './GraphList';
it('exposes each visible node and its actionable connections in a semantic keyboard list', () => {
  const html = renderToStaticMarkup(React.createElement(GraphList, { nodes: ['a', 'b'].map(id => ({ id, title: id, folder: '', tags: [], degree: 1 })), edges: [{ a: 'a', b: 'b', kind: 'suggested' }], onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} }));
  for (const text of ['<ul', '<li', '<button', 'Open note', '>Link<', 'Not related', 'suggested']) expect(html).toContain(text);
});
