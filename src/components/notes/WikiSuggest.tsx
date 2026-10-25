import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { SuggestionProps } from '@tiptap/suggestion';
import { placeMenu } from '../../utils/menuPlacement';
import type { WikiOption } from './wikiLink';

export interface WikiSuggestHandle { onKeyDown(event: KeyboardEvent): boolean }
export const WikiSuggest = forwardRef<WikiSuggestHandle, SuggestionProps<WikiOption>>(function WikiSuggest(props, ref) {
  const [selected, setSelected] = useState(0);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { setSelected(0); }, [props.query, props.items]);
  useLayoutEffect(() => {
    const position = () => {
      const element = menu.current; const rect = props.clientRect?.();
      if (!element || !rect) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const x = viewport?.offsetLeft ?? 0; const y = viewport?.offsetTop ?? 0;
      element.style.width = `${Math.min(320, width - 16)}px`;
      const placement = placeMenu({ top: rect.top - y, bottom: rect.bottom - y, left: rect.left - x, right: rect.right - x }, { width: element.offsetWidth || Math.min(320, width - 16), height: element.scrollHeight }, { width, height }, 'left');
      Object.assign(element.style, { top: `${placement.top + y}px`, left: `${placement.left + x}px`, maxHeight: `${placement.maxHeight}px` });
    };
    position();
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [props]);
  useLayoutEffect(() => { menu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [selected]);
  useImperativeHandle(ref, () => ({ onKeyDown(event) {
    if (!props.items.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setSelected(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + props.items.length) % props.items.length); return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') { props.command(props.items[selected] ?? props.items[0]); return true; }
    return false;
  } }), [props, selected]);
  return <div ref={menu} role="listbox" aria-label="Link to note" className="fixed z-[100] overflow-y-auto rounded-lg border border-stone-300 bg-stone-50 p-1 text-stone-900 shadow-lg dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
    {props.items.map((item, index) => <button key={`${item.create ? 'create' : 'note'}-${index}`} type="button" role="option" aria-selected={index === selected} tabIndex={-1}
      className={`min-h-11 w-full rounded px-3 py-2 text-left break-words ${index === selected ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
      onMouseDown={event => event.preventDefault()} onClick={() => props.command(item)}>{item.create ? `Create note "${item.title}"` : item.title}</button>)}
  </div>;
});
