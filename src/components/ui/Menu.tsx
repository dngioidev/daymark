import React, { useEffect, useRef, useState } from 'react';

let openMenus = 0;

export function isMenuOpen(): boolean {
  return openMenus > 0;
}

/**
 * Small dropdown menu: closes on outside tap, Esc and after picking an item; arrow keys move
 * between items. `trigger` receives the props to spread on the button that opens it.
 */

export interface MenuItem {
  label: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
  /** Trailing marker, e.g. a check for the current value. */
  trailing?: React.ReactNode;
  danger?: boolean;
  active?: boolean;
  separatorBefore?: boolean;
}

interface MenuProps {
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
  }) => React.ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  heading?: string;
  className?: string;
}

export const Menu: React.FC<MenuProps> = ({ trigger, items, align = 'left', heading, className = '' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    openMenus += 1;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        (rootRef.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => {
      openMenus -= 1;
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && (
        <div
          ref={listRef}
          role="menu"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-30 min-w-52 max-w-[calc(100vw-2rem)] py-1 bg-white dark:bg-stone-900 rounded-lg shadow-lg border border-stone-200 dark:border-stone-700 text-sm`}
        >
          {heading && (
            <div className="px-3 pt-1.5 pb-1 text-xs font-semibold text-stone-600 dark:text-stone-400">{heading}</div>
          )}
          {items.map((item, i) => (
            <React.Fragment key={i}>
              {item.separatorBefore && <div className="my-1 border-t border-stone-200 dark:border-stone-700" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`w-full min-h-11 sm:min-h-9 px-3 flex items-center gap-2.5 text-left hover:bg-stone-100 focus:bg-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800 outline-hidden ${
                  item.danger
                    ? 'text-rose-700 dark:text-rose-400'
                    : item.active
                      ? 'font-semibold text-stone-900 dark:text-stone-50'
                      : 'text-stone-800 dark:text-stone-200'
                }`}
              >
                {item.icon && <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                <span className="flex-1 truncate">{item.label}</span>
                {item.trailing}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
