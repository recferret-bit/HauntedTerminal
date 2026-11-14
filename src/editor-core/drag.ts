export interface GestureSession {
  readonly startX: number;
  readonly startY: number;
  clientX: number;
  clientY: number;
  dx: number;
  dy: number;
  shiftKey: boolean;
}

export interface GestureSpec {
  threshold?: number;
  buttons?: readonly number[];
  cursor?: string;
  allowStart?: (target: Element, ev: PointerEvent) => boolean;
  onStart?: (session: GestureSession, ev: PointerEvent) => boolean | void;
  onMove: (session: GestureSession, ev: PointerEvent) => void;
  onEnd?: (session: GestureSession, ev: PointerEvent) => void;
}

const DRAG_ATTR = 'data-cx-dragging';

export function clampNum(val: number, min: number, max: number): number {
  return max < min ? min : Math.max(min, Math.min(max, val));
}

function makeSession(ev: PointerEvent, startX: number, startY: number): GestureSession {
  return {
    startX,
    startY,
    clientX: ev.clientX,
    clientY: ev.clientY,
    dx: ev.clientX - startX,
    dy: ev.clientY - startY,
    shiftKey: ev.shiftKey,
  };
}

/**
 * Binds a reusable pointer drag/resize gesture to `el` using window-level tracking
 * and a `data-cx-dragging` flag on `<html>` so cross-iframe pointer drags never drop.
 */
export function bindPointerGesture(el: HTMLElement, spec: GestureSpec): void {
  const buttons = spec.buttons ?? [0];
  const threshold = spec.threshold ?? 0;

  el.addEventListener('pointerdown', (downEv) => {
    if (!buttons.includes(downEv.button)) return;
    if (!(downEv.target instanceof Element)) return;
    if (spec.allowStart && !spec.allowStart(downEv.target, downEv)) return;

    const pointerId = downEv.pointerId;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    const prevCursor = document.body.style.cursor;
    let started = false;
    let latest = makeSession(downEv, startX, startY);

    const activate = (ev: PointerEvent, session: GestureSession): boolean => {
      if (spec.onStart && spec.onStart(session, ev) === false) return false;
      started = true;
      document.documentElement.setAttribute(DRAG_ATTR, 'true');
      if (spec.cursor) document.body.style.cursor = spec.cursor;
      ev.preventDefault();
      return true;
    };

    const cleanup = (): void => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinEnd);
      window.removeEventListener('pointercancel', onWinEnd);
      window.removeEventListener('blur', onBlur);
      if (started) {
        document.documentElement.removeAttribute(DRAG_ATTR);
        if (spec.cursor) document.body.style.cursor = prevCursor;
      }
    };

    const onWinMove = (moveEv: PointerEvent): void => {
      if (moveEv.pointerId !== pointerId) return;
      latest = makeSession(moveEv, startX, startY);
      if (!started) {
        if (Math.hypot(latest.dx, latest.dy) < threshold) return;
        if (!activate(moveEv, makeSession(downEv, startX, startY))) {
          cleanup();
          return;
        }
      }
      moveEv.preventDefault();
      spec.onMove(latest, moveEv);
    };

    const onWinEnd = (endEv: PointerEvent): void => {
      if (endEv.pointerId !== pointerId) return;
      latest = makeSession(endEv, startX, startY);
      cleanup();
      if (started) spec.onEnd?.(latest, endEv);
    };

    const onBlur = (): void => {
      cleanup();
      if (started) spec.onEnd?.(latest, downEv);
    };

    if (threshold <= 0) {
      if (!activate(downEv, latest)) return;
    }

    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinEnd);
    window.addEventListener('pointercancel', onWinEnd);
    window.addEventListener('blur', onBlur);
  });
}
