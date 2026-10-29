import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Accessible modal used by every dialog in the app: role=dialog + aria-modal, focus moves in
 * and is trapped, Esc and the backdrop close it, focus returns to the opener, and the app
 * behind it is made inert. `variant="sheet"` docks to the bottom on phones (thumb reach) and
 * centres on wider screens.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack: HTMLElement[] = [];

/** Read at keydown time so nested and locally-owned dialogs block global navigation. */
export function isDialogOpen(): boolean {
  return stack.length > 0;
}

function setAppInert(inert: boolean) {
  const root = document.getElementById('root');
  if (!root) return;
  if (inert) root.setAttribute('inert', '');
  else root.removeAttribute('inert');
}

interface DialogProps {
  isOpen: boolean;
  /** Stable return target for drawers whose opener can be temporarily unmounted. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  title: React.ReactNode;
  /** Short line under the title. */
  description?: React.ReactNode;
  /** Optional live status alongside the heading, outside the accessible title. */
  headerStatus?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Sticky action row at the bottom. */
  footer?: React.ReactNode;
  variant?: 'center' | 'sheet' | 'fullscreen-mobile' | 'drawer';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Fixed settings shell; tab content owns scrolling. */
  fixedSettingsSize?: boolean;
  /** Close on backdrop tap (default true). */
  dismissible?: boolean;
  /** Use "alertdialog" for confirmations. */
  role?: 'dialog' | 'alertdialog';
}

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-3xl' };

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  returnFocusRef,
  onClose,
  title,
  description,
  headerStatus,
  icon,
  children,
  footer,
  variant = 'center',
  size = 'md',
  dismissible = true,
  fixedSettingsSize = false,
  role = 'dialog',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current!;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(panel);
    setAppInert(true);

    // Focus the element marked autoFocus/data-autofocus, else the first field, else the panel
    const firstVisible = (selector: string) =>
      [...panel.querySelectorAll<HTMLElement>(selector)].find((el) => el.offsetParent !== null);
    const target = firstVisible('[data-autofocus], [autofocus]') ?? firstVisible('input, select, textarea') ?? panel;
    requestAnimationFrame(() => target.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== panel) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (items.length === 0) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(panel), 1);
      if (stack.length === 0) setAppInert(false);
      (returnFocusRef?.current ?? opener)?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const layout =
    variant === 'drawer' ? 'items-stretch justify-start!' : variant === 'sheet'
      ? 'items-end sm:items-center'
      : variant === 'fullscreen-mobile'
        ? 'items-stretch sm:items-center sm:p-4'
        : 'items-center p-4';
  const panelShape = variant === 'drawer' ? 'h-dvh !w-80 !max-w-[calc(100vw-2rem)]' : fixedSettingsSize
    ? 'h-dvh sm:w-[min(760px,calc(100vw-2rem))] sm:h-[min(560px,calc(100vh-2rem))] sm:rounded-xl pb-[env(safe-area-inset-bottom)] sm:pb-0'
    :
    variant === 'sheet'
      ? 'rounded-t-2xl sm:rounded-xl max-h-[92dvh] pb-[env(safe-area-inset-bottom)] sm:pb-0'
      : variant === 'fullscreen-mobile'
        ? 'h-dvh sm:h-auto sm:max-h-[90dvh] sm:rounded-xl pb-[env(safe-area-inset-bottom)] sm:pb-0'
        : 'rounded-xl max-h-[90dvh]';

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-stone-950/50 backdrop-blur-xs ${layout}`}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`dm-card relative w-full ${fixedSettingsSize ? '' : SIZES[size]} flex flex-col bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 shadow-2xl outline-hidden overflow-hidden animate-in fade-in duration-150 ${panelShape}`}
      >
        {variant === 'fullscreen-mobile' && (
          // Dark strip under the Android status bar so its light icons stay visible
          <div aria-hidden="true" className="sm:hidden shrink-0 h-[env(safe-area-inset-top)] bg-stone-900" />
        )}
        <div className="shrink-0 flex items-start gap-3 px-5 pt-4 pb-3 border-b border-stone-200 dark:border-stone-800">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-semibold leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                {description}
              </p>
            )}
          </div>
          {headerStatus}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className={`flex-1 min-h-0 ${fixedSettingsSize ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}>{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/** Shared button styles so primary/secondary/danger look the same everywhere. */
export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-4 text-sm font-semibold rounded-lg bg-accent text-accent-fg hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-4 text-sm font-medium rounded-lg text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 dark:text-stone-100 dark:bg-stone-800 dark:border-stone-700 dark:hover:bg-stone-700',
  ghost:
    'inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-3 text-sm font-medium rounded-lg text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
  danger:
    'inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-9 px-4 text-sm font-semibold rounded-lg text-white bg-rose-700 hover:bg-rose-800 dark:bg-rose-500 dark:text-stone-950 dark:hover:bg-rose-400',
};
