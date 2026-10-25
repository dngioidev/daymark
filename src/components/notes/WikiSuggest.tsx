import React, { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { SuggestionProps } from '@tiptap/suggestion';
import { placeMenu } from '../../utils/menuPlacement';
import type { WikiOption } from './wikiLink';

export interface WikiSuggestHandle { onKeyDown(event: KeyboardEvent): boolean }
export const WikiSuggest = forwardRef<WikiSuggestHandle, SuggestionProps<WikiOption>>(function WikiSuggest(props, ref) {
  const [selected, setSelected] = useState(() => props.items.findIndex(item => !item.disabled));
  const listId = useId();
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { setSelected(props.items.findIndex(item => !item.disabled)); }, [props.query, props.items]);
  useLayoutEffect(() => {
    const editor = props.editor.view.dom;
    if (!props.items.length) return;
    editor.setAttribute('aria-controls', listId);
    editor.setAttribute('aria-autocomplete', 'list');
    if (selected >= 0 && props.items[selected] && !props.items[selected].disabled) editor.setAttribute('aria-activedescendant', `${listId}-${selected}`);
    return () => {
      editor.removeAttribute('aria-controls');
      editor.removeAttribute('aria-autocomplete');
      editor.removeAttribute('aria-activedescendant');
    };
  }, [props.editor, props.items, selected, listId]);
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
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setSelected(index => {
        for (let step = 1; step <= props.items.length; step++) {
          const next = (index + direction * step + 2 * props.items.length) % props.items.length;
          if (!props.items[next].disabled) return next;
        }
        return -1;
      });
      return true;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const item = props.items[selected];
      if (item && !item.disabled) props.command(item);
      return true;
    }
    return false;
  } }), [props, selected]);
  if (!props.items.length) return null;
  return <div ref={menu} id={listId} role="listbox" aria-label="Link to note" className="fixed z-[100] overflow-y-auto rounded-lg border border-stone-300 bg-stone-50 p-1 text-stone-900 shadow-lg dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
    {props.items.map((item, index) => <button key={`${item.create ? 'create' : 'note'}-${index}`} id={`${listId}-${index}`} type="button" role="option" disabled={item.disabled} aria-disabled={item.disabled || undefined} aria-selected={index === selected} tabIndex={-1}
      className={`min-h-11 w-full rounded px-3 py-2 text-left break-words disabled:cursor-not-allowed disabled:text-stone-600 dark:disabled:text-stone-300 ${index === selected ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
      onMouseDown={event => event.preventDefault()} onClick={() => props.command(item)}>{item.create ? `Create note "${item.title}"` : item.title}{item.disabled && <span className="block text-sm">Title has [ ] or |</span>}</button>)}
  </div>;
});
