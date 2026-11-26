import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';

export type NativeModalMode = 'closed' | 'open';
export type NativeModalEvent = 'OPEN' | 'CLOSE';

export const NATIVE_MODAL_TRANSITIONS: TransitionTable<NativeModalMode, NativeModalEvent> = {
  closed: { OPEN: 'open' },
  open: { CLOSE: 'closed' },
};

export function createNativeModalMachine(): StateMachine<NativeModalMode, NativeModalEvent> {
  return createStateMachine({ initial: 'closed', transitions: NATIVE_MODAL_TRANSITIONS });
}

/** Safari fallback for `closedby="any"`: require pointerdown and pointerup outside the dialog box. */
export function wireLightDismissFallback(
  dialog: HTMLDialogElement,
  onDismiss: () => void,
  forceFallback = false,
): void {
  const hasNative = !forceFallback && typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
  if (hasNative || typeof dialog.addEventListener !== 'function') return;
  const isOutside = (ev: Event): boolean => {
    const pe = ev as PointerEvent;
    if (typeof dialog.getBoundingClientRect !== 'function') return false;
    const r = dialog.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return pe.clientX < r.left || pe.clientX > r.right || pe.clientY < r.top || pe.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (ev) => {
    pressedOutside = ev.target === dialog && isOutside(ev);
  });
  dialog.addEventListener('pointerup', (ev) => {
    if (pressedOutside && ev.target === dialog && isOutside(ev)) onDismiss();
    pressedOutside = false;
  });
  dialog.addEventListener('pointercancel', () => {
    pressedOutside = false;
  });
  dialog.addEventListener('close', () => {
    pressedOutside = false;
  });
}

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
  const fsm = createNativeModalMachine();
  let returnFocus: HTMLElement | null = null;

  const isOpen = (): boolean => (hasShowModal ? Boolean(fsm.state === 'open' && dialog.open) : fsm.state === 'open');

  const markClosed = (): void => {
    if (!fsm.send('CLOSE')) return;
    dialog.returnValue = '';
    dialog.classList.remove('open');
    const back = returnFocus;
    returnFocus = null;
    onClose?.(back);
  };

  const close = (): void => {
    if (fsm.state === 'closed' && (!hasShowModal || !dialog.open)) return;
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
      if (fsm.state === 'open' && hasShowModal && !dialog.open) fsm.send('CLOSE');
      if (fsm.send('OPEN')) {
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
