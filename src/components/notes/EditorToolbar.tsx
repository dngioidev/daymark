import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { Menu } from '../ui/Menu';
import { Bold, Italic, Strikethrough, Heading, List, ListOrdered, ListChecks, Quote, Code, Table, Link, Image, Network, FileCode } from 'lucide-react';

export function EditorToolbar({ editor, onToggleMarkdown }: { editor: Editor; onToggleMarkdown?: () => void }) {
  const [placement, setPlacement] = useState({ phone: false, bottom: 0, visible: true });
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const keyboard = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]');
      const navRect = nav?.getBoundingClientRect();
      const navigation = navRect && navRect.height > 0 ? Math.max(0, window.innerHeight - navRect.top) : 0;
      setPlacement({ phone: window.innerWidth < 768, bottom: Math.max(keyboard, navigation), visible: editor.view.dom.getClientRects().length > 0 });
    };
    update();
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(editor.view.dom);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [editor]);
  const button = 'shrink-0 min-h-11 min-w-11 px-3 rounded-lg text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50';
  const actions = [
    ['Bold', Bold, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold')],
    ['Italic', Italic, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic')],
    ['Strike', Strikethrough, () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike')],
    ['Bullet list', List, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList')],
    ['Numbered list', ListOrdered, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList')],
    ['Checkbox list', ListChecks, () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList')],
    ['Quote', Quote, () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote')],
    ['Code block', Code, () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock')],
  ] as const;
  const bar = <div className="border-b border-stone-200 bg-stone-50 text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-1 overflow-x-auto px-2 py-1">
      <button type="button" aria-label="Markdown" title="Markdown" aria-pressed={false} className={button} onClick={onToggleMarkdown}><FileCode className="w-4 h-4" /></button>
      {actions.slice(0, 3).map(([label, Icon, run, active]) => <button key={label} type="button" aria-label={label} title={label} aria-pressed={active} className={button} onMouseDown={(event) => event.preventDefault()} onClick={run}><Icon className="w-4 h-4" /></button>)}
      <Menu sheetTitle="Heading" items={([1, 2, 3] as const).map((level) => ({ label: `Heading ${level}`, active: editor.isActive('heading', { level }), onSelect: () => { editor.chain().focus().toggleHeading({ level }).run(); } }))} trigger={(props) => <button type="button" {...props} aria-label="Heading" title="Heading" className={button}><Heading className="w-4 h-4" /></button>} />
      {actions.slice(3).map(([label, Icon, run, active]) => <button key={label} type="button" aria-label={label} title={label} aria-pressed={active} className={button} onMouseDown={(event) => event.preventDefault()} onClick={run}><Icon className="w-4 h-4" /></button>)}
      <Menu sheetTitle="Table" items={editor.isActive('table') ? [
        { label: 'Add row', onSelect: () => { editor.chain().focus().addRowAfter().run(); } },
        { label: 'Remove row', onSelect: () => { editor.chain().focus().deleteRow().run(); } },
        { label: 'Add column', onSelect: () => { editor.chain().focus().addColumnAfter().run(); } },
        { label: 'Remove column', onSelect: () => { editor.chain().focus().deleteColumn().run(); } },
        { label: 'Delete table', danger: true, onSelect: () => { editor.chain().focus().deleteTable().run(); } },
      ] : [{ label: 'Insert 3 × 3 table', onSelect: () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } }]} trigger={(props) => <button type="button" {...props} aria-label="Table" title="Table" className={button}><Table className="w-4 h-4" /></button>} />
      <button type="button" className={button} aria-label="Link" title="Link" aria-pressed={editor.isActive('link')} onMouseDown={(event) => event.preventDefault()} onClick={() => setLink(editor.getAttributes('link').href ?? '')}><Link className="w-4 h-4" /></button>
      <button type="button" className={button} aria-label="Picture" disabled title="Insert picture"><Image className="w-4 h-4" /></button>
      <button type="button" className={button} aria-label="Diagram" disabled title="Insert diagram"><Network className="w-4 h-4" /></button>
    </div>
    {link !== null && <form className="flex gap-2 p-2" onSubmit={(event) => {
      event.preventDefault();
      if (link.trim()) editor.chain().focus().extendMarkRange('link').setLink({ href: link.trim() }).run();
      else editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLink(null);
    }}>
      <input aria-label="Link URL" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://" autoFocus className="min-w-0 flex-1 min-h-11 rounded border border-stone-400 px-2 bg-white text-stone-900 dark:bg-stone-800 dark:text-stone-100" />
      <button type="submit" className={button}>Apply</button><button type="button" className={button} onClick={() => setLink(null)}>Cancel</button>
    </form>}
  </div>;
  // Portal avoids the photo card's backdrop-filter becoming a fixed containing block.
  return placement.phone ? placement.visible && createPortal(<div className="fixed inset-x-0 z-40 pb-[env(safe-area-inset-bottom)] bg-stone-50 dark:bg-stone-900" style={{ bottom: placement.bottom }}>{bar}</div>, document.body) : bar;
}
