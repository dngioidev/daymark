import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { placeMenu } from '../../utils/menuPlacement';
import { useBackHandler } from '../../native/backButton';

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
  sheetTitle?: string;
  className?: string;
  /** Resolve a stable owning control, such as a roving tree row, on close. */
  returnFocusTo?: () => HTMLElement | null;
}

export const Menu: React.FC<MenuProps> = ({ trigger, items, align = 'left', heading, sheetTitle, className = '', returnFocusTo }) => {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);
  const [position, setPosition] = useState<React.CSSProperties>({});
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const close = () => {
    setOpen(false);
    (returnFocusTo ? returnFocusTo() : triggerRef.current)?.focus({ preventScroll: true });
  };
  useBackHandler(() => { close(); return true; }, open);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const narrow = window.innerWidth < 768;
      setPhone(narrow);
      const anchor = triggerRef.current;
      const list = listRef.current;
      if (!anchor || !list) return;
      if (narrow) {
        const nav = document.querySelector<HTMLElement>('nav[aria-label="Main"]');
        const bottom = nav ? Math.max(0, window.innerHeight - nav.getBoundingClientRect().top) : 0;
        setPosition({ bottom, maxHeight: Math.max(0, window.innerHeight - bottom - 8) });
      } else {
        const result = placeMenu(anchor.getBoundingClientRect(), { width: list.getBoundingClientRect().width, height: list.scrollHeight + 2 }, { width: window.innerWidth, height: window.innerHeight }, align);
        setPosition({ top: result.top, left: result.left, maxHeight: result.maxHeight });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update);
    if (listRef.current) observer.observe(listRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer.disconnect();
    };
  }, [open, align, phone]);

  useEffect(() => {
    if (!open) return;
    openMenus += 1;
    const onPointer = (e: PointerEvent) => {
      // The phone backdrop owns dismissal and consumes the rest of that tap.
      // Desktop outside clicks should keep their normal focus/activation behaviour.
      if (window.innerWidth >= 768 && !rootRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer, true);
    // Window capture runs before a containing Dialog's document-level Escape handler.
    window.addEventListener('keydown', onKey, true);
    const frame = requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }));
    return () => {
      openMenus -= 1;
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(frame);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {trigger({ onClick: () => {
        if (open) return close();
        triggerRef.current = rootRef.current?.querySelector<HTMLElement>('[aria-haspopup]') ?? null;
        setPortalTarget(triggerRef.current?.closest('[role="dialog"], [role="alertdialog"]') ?? document.body);
        setPhone(window.innerWidth < 768);
        setOpen(true);
      }, 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && createPortal(
        <>
        {phone && <div className="fixed inset-0 z-[55] bg-black/40" aria-hidden="true" onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Closing removes the backdrop before click. Consume that follow-up even
          // if the browser retargets it to a control underneath the removed backdrop.
          const swallowClick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.removeEventListener('click', swallowClick, true);
            window.clearTimeout(timeout);
          };
          window.addEventListener('click', swallowClick, true);
          // Some browsers cancel click after preventDefault on pointerdown.
          // Do not leave a guard behind to consume a later unrelated interaction.
          const timeout = window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 700);
          close();
        }} />}
        <div
          ref={listRef}
          role="menu"
          aria-label={phone ? sheetTitle ?? heading : heading}
          style={position}
          onTouchStart={(e) => { touchStart.current = listRef.current?.scrollTop === 0 ? e.touches[0].clientY : null; }}
          onTouchEnd={(e) => {
            if (touchStart.current !== null && e.changedTouches[0].clientY - touchStart.current >= 60) close();
            touchStart.current = null;
          }}
          onTouchCancel={() => { touchStart.current = null; }}
          className={`fixed z-[55] overflow-y-auto overscroll-contain py-1 bg-white dark:bg-stone-900 shadow-lg border border-stone-200 dark:border-stone-700 text-sm ${phone ? 'bottom-0 left-0 right-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'min-w-52 max-w-[calc(100vw-1rem)] rounded-lg'}`}
        >
          {(phone ? sheetTitle ?? heading ?? '' : heading) && (
            <div className="px-3 pt-1.5 pb-1 text-xs font-semibold text-stone-600 dark:text-stone-400">{phone ? sheetTitle ?? heading ?? '' : heading}</div>
          )}
          {items.map((item, i) => (
            <React.Fragment key={i}>
              {item.separatorBefore && <div className="my-1 border-t border-stone-200 dark:border-stone-700" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={`w-full ${phone ? 'min-h-12' : 'min-h-11'} px-3 flex items-center gap-2.5 text-left hover:bg-stone-100 focus:bg-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800 outline-hidden ${
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
        </>, portalTarget ?? document.body
      )}
    </div>
  );
};
