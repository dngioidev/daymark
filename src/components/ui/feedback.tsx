import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Info, X } from 'lucide-react';
import { Dialog, buttonClass } from './Dialog';

/**
 * In-app replacements for alert()/confirm() and the toast. Both are tiny module-level stores so
 * any handler (including non-React code paths in App) can call them without prop drilling.
 * Mount <FeedbackHost /> once.
 */

// ---------- Confirm / alert ----------

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  /** Single OK button (alert). */
  alertOnly?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let confirmQueue: ConfirmRequest[] = [];
let confirmListener: (() => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmQueue = [...confirmQueue, { ...options, resolve }];
    confirmListener?.();
  });
}

export function alertDialog(title: string, message?: React.ReactNode): Promise<void> {
  return confirmDialog({ title, message, alertOnly: true, confirmLabel: 'OK' }).then(() => undefined);
}

// ---------- Toast ----------

export interface ToastOptions {
  tone?: 'success' | 'error' | 'info';
  /** e.g. { label: 'Undo', onClick } */
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

let currentToast: Toast | null = null;
let toastListener: (() => void) | null = null;
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, options: ToastOptions = {}) {
  currentToast = { id: ++toastSeq, message, tone: 'success', ...options };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissToast, options.action ? 6000 : 3500);
  toastListener?.();
}

export function dismissToast() {
  currentToast = null;
  toastListener?.();
}

// ---------- Host ----------

export const FeedbackHost: React.FC = () => {
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    confirmListener = rerender;
    toastListener = rerender;
    return () => {
      confirmListener = null;
      toastListener = null;
    };
  }, []);

  const request = confirmQueue[0];
  const settle = (ok: boolean) => {
    if (!request) return;
    confirmQueue = confirmQueue.slice(1);
    request.resolve(ok);
    force((n) => n + 1);
  };

  const toast = currentToast;
  const ToneIcon = toast?.tone === 'error' ? AlertCircle : toast?.tone === 'info' ? Info : Check;

  return (
    <>
      <Dialog
        isOpen={Boolean(request)}
        onClose={() => settle(false)}
        title={request?.title}
        role="alertdialog"
        size="sm"
        footer={
          request && (
            <>
              {!request.alertOnly && (
                <button type="button" className={buttonClass.secondary} onClick={() => settle(false)}>
                  {request.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                type="button"
                data-autofocus
                className={request.danger ? buttonClass.danger : buttonClass.primary}
                onClick={() => settle(true)}
              >
                {request.confirmLabel ?? 'OK'}
              </button>
            </>
          )
        }
      >
        {request?.message && <div className="px-5 py-4 text-sm text-stone-700 dark:text-stone-300 space-y-2">{request.message}</div>}
      </Dialog>

      {toast &&
        createPortal(
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="fixed z-[60] left-3 right-3 sm:left-auto sm:right-6 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:max-w-md flex items-center gap-3 pl-4 pr-1 py-1 min-h-12 bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 rounded-xl shadow-xl text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <ToneIcon
              className={`w-4 h-4 shrink-0 ${
                toast.tone === 'error' ? 'text-rose-400 dark:text-rose-700' : 'text-emerald-400 dark:text-emerald-700'
              }`}
            />
            <span className="flex-1 py-2">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  dismissToast();
                  toast.action!.onClick();
                }}
                className="min-h-11 px-3 rounded-lg font-semibold text-amber-300 hover:bg-white/10 dark:text-amber-800 dark:hover:bg-stone-900/10"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismissToast}
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-400 hover:text-white dark:text-stone-500 dark:hover:text-stone-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>,
          document.body
        )}
    </>
  );
};
