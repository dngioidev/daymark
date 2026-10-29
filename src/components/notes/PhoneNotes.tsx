import React, { useLayoutEffect, useRef } from 'react';

/** Keep the tree mounted and restore the user's position after visiting the editor. */
export function PhoneNotes({ pane, navigation, editor }: { pane: 'list' | 'editor'; navigation: React.ReactNode; editor: React.ReactNode }) {
  const column = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  useLayoutEffect(() => {
    if (pane === 'list') {
      const tree = column.current?.querySelector<HTMLElement>('[role=tree]');
      if (tree) tree.scrollTop = scrollTop.current;
    }
  }, [pane]);
  return <>
    <div ref={column} className={pane === 'list' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}
      onScrollCapture={event => {
        const target = event.target as HTMLElement;
        if (pane === 'list' && target.getAttribute('role') === 'tree') scrollTop.current = target.scrollTop;
      }}>{navigation}</div>
    {pane === 'editor' && editor}
  </>;
}
