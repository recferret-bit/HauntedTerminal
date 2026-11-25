import { wireLightDismissFallback } from './hint-dialog.js';

export interface NativeModal {
  open(focusEl?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Shared lifecycle wrapper around native `<dialog>` with `showModal()`, `closedby="any"` (+ Safari fallback),
 * close/cancel buttons, and `onClose(returnFocus)` restoration.
 */
export function createNativeModal(
  dialog: HTMLDialogElement,
  closeButtons: readonly HTMLButtonElement[],
  onClose?: (returnFocus: HTMLElement | null) => void,
): NativeModal {
  const hasShowModal = typeof dialog.showModal === 'function';
  let open = false;
  let returnFocus: HTMLElement | null = null;

  const isOpen = (): boolean => (hasShowModal ? Boolean(open && dialog.open) : open);

  const markClosed = (): void => {
    if (!open) return;
    open = false;
    dialog.returnValue = '';
    dialog.classList.remove('open');
    const back = returnFocus;
    returnFocus = null;
    onClose?.(back);
  };

  const close = (): void => {
    if (!open && (!hasShowModal || !dialog.open)) return;
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
      markClosed();
    } else {
      dialog.removeAttribute?.('open');
      markClosed();
    }
  };

  dialog.addEventListener?.('close', () => {
    if (hasShowModal && dialog.open) return;
    markClosed();
  });
  for (const btn of closeButtons) {
    btn.onclick = (ev) => {
      if (!hasShowModal) {
        ev.preventDefault();
        close();
      }
    };
  }
  wireLightDismissFallback(dialog, close);

  return {
    open(focusEl) {
      if (open && hasShowModal && !dialog.open) open = false;
      if (!open) {
        open = true;
        returnFocus = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
        dialog.classList.add('open');
        if (hasShowModal) {
          if (!dialog.open) dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      }
      focusEl?.focus?.({ preventScroll: true });
    },
    close,
    isOpen,
  };
}
