import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GraphDetail } from './GraphDetail';
const nodes = ['a', 'unsafe|title', 'c'].map(id => ({ id, title: id, folder: 'Tech', tags: [], degree: 1 }));
it('renders selected note, linked notes and disabled unsafe suggestion with explanation', () => {
  const html = renderToStaticMarkup(React.createElement(GraphDetail, { nodes, edges: [{ a: 'a', b: 'unsafe|title', kind: 'suggested', terms: ['java'] }, { a: 'a', b: 'c', kind: 'link' }], selectedId: 'a', onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} }));
  for (const text of ['Open note', 'Not related', 'Linked notes', 'java', 'disabled', 'Rename this note']) expect(html).toContain(text);
});
