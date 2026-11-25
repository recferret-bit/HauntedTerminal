/**
 * The desktop on the laptop's screen: icons, windows, the taskbar and its start menu. It draws a
 * `DesktopState` and changes it only through `reduceDesktop`; app views are built when their window
 * first opens and dropped when it closes.
 */
import { h } from '../../editor-core/dom.js';
import { APP_ORDER, APPS, type AppId } from '../domain/apps.js';
import { emptyDesktop, reduceDesktop, SCREEN, type DesktopAction, type DesktopState, type Win } from '../domain/desktop.js';
import type { AppView, LaptopContext } from './apps/app-types.js';
import { createApp } from './apps/catalog.js';

export interface DesktopView {
  el: HTMLElement;
  dispatch(action: DesktopAction): void;
  state(): DesktopState;
  /** The open app's view, if its window is open. */
  view(app: AppId): AppView | undefined;
  /** Closes every window (a shutdown). */
  reset(): void;
  /** Drops every window and disposes all active views. */
  dispose(): void;
}

interface Open {
  frame: HTMLElement;
  view: AppView;
}

/** A window: title bar (drag to move, minimise, close) around an app's view. */
function windowFrame(app: AppId, view: AppView, act: (a: DesktopAction) => void, drag: (ev: PointerEvent) => void): HTMLElement {
  const bar = h('div', { class: 'lt-titlebar' },
    h('span', { class: 'lt-wglyph' }, APPS[app].glyph),
    h('b', {}, APPS[app].title),
    h('button', { class: 'lt-wbtn', 'aria-label': `Minimise ${APPS[app].title}`, onclick: () => act({ type: 'minimize', app }) }, '_'),
    h('button', { class: 'lt-wbtn', 'aria-label': `Close ${APPS[app].title}`, onclick: () => act({ type: 'close', app }) }, 'x'));
  bar.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && !(ev.target as HTMLElement).closest('button')) drag(ev); });
  const frame = h('section', { class: 'lt-window', 'data-app': app }, bar, h('div', { class: 'lt-wbody' }, view.el));
  frame.addEventListener('pointerdown', (ev) => {
    if (!(ev.target as HTMLElement).closest('.lt-wbtn')) act({ type: 'focus', app });
  }, true);
  return frame;
}

function appMenuButtons(exclude: AppId | undefined, onOpen: (app: AppId) => void): HTMLElement[] {
  return APP_ORDER
    .filter((app) => app !== exclude)
    .map((app) => h('button', { 'data-app': app, onclick: () => onOpen(app) }, `${APPS[app].glyph}  ${APPS[app].title}`));
}

function trackDrag(
  ev: PointerEvent,
  scale: () => number,
  threshold: number,
  onMove: (dx: number, dy: number) => void,
  onEnd?: () => void,
): void {
  const k = scale() || 1;
  const sx = ev.clientX, sy = ev.clientY;
  let moved = threshold <= 0;
  const move = (e: PointerEvent): void => {
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) <= threshold) return;
    moved = true;
    onMove((e.clientX - sx) / k, (e.clientY - sy) / k);
  };
  const up = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function showDesktopContextMenu(opts: {
  ctxMenu: HTMLElement;
  desktopEl: HTMLElement;
  ev: MouseEvent;
  scale: number;
  onOpen: (app: AppId) => void;
  onArrange: () => void;
  onMinimizeAll: () => void;
  onShutdown: () => void;
}): void {
  const { ctxMenu, desktopEl, ev, scale, onOpen, onArrange, onMinimizeAll, onShutdown } = opts;
  const iconApp = (ev.target as HTMLElement).closest<HTMLElement>('.lt-icon')?.dataset.app as AppId | undefined;
  const closeThen = (fn: () => void) => (): void => { ctxMenu.hidden = true; fn(); };
  const items: HTMLElement[] = [];
  if (iconApp && APPS[iconApp]) {
    items.push(
      h('button', { class: 'lt-ctx-primary', onclick: closeThen(() => onOpen(iconApp)) }, `Open ${APPS[iconApp].title}`),
      h('hr'),
    );
  }
  items.push(
    ...appMenuButtons(iconApp, (app) => { ctxMenu.hidden = true; onOpen(app); }),
    h('hr'),
    h('button', { onclick: closeThen(onArrange) }, 'Arrange icons'),
    h('button', { onclick: closeThen(onMinimizeAll) }, 'Minimise all'),
    h('button', { onclick: closeThen(onShutdown) }, 'Shut down...'),
  );
  ctxMenu.replaceChildren(...items);
  ctxMenu.hidden = false;
  const r = desktopEl.getBoundingClientRect();
  const k = scale || 1;
  const mw = ctxMenu.offsetWidth || 168;
  const mh = ctxMenu.offsetHeight || 180;
  ctxMenu.style.left = `${Math.max(4, Math.min(Math.round((ev.clientX - r.left) / k), SCREEN.w - mw - 4))}px`;
  ctxMenu.style.top = `${Math.max(4, Math.min(Math.round((ev.clientY - r.top) / k), SCREEN.h - mh - 4))}px`;
}

function createDesktopIcons(
  scale: () => number,
  getPos: (app: AppId) => { x: number; y: number },
  act: (action: DesktopAction) => void,
  onEnterSound: () => void,
): { el: HTMLElement; map: Map<AppId, HTMLElement> } {
  const map = new Map<AppId, HTMLElement>();
  const el = h('div', { class: 'lt-icons' }, ...APP_ORDER.map((app) => {
    const btn = h('button', {
      class: 'lt-icon', 'data-app': app, title: APPS[app].blurb,
      ondblclick: () => act({ type: 'open', app }),
      onkeydown: (ev: Event) => { if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); onEnterSound(); act({ type: 'open', app }); } },
    }, h('span', { class: 'lt-iglyph' }, APPS[app].glyph), h('small', {}, APPS[app].file));
    btn.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const startPos = getPos(app);
      trackDrag(ev, scale, 3, (dx, dy) => {
        btn.classList.add('dragging');
        act({ type: 'move-icon', app, x: startPos.x + dx, y: startPos.y + dy });
      }, () => btn.classList.remove('dragging'));
    });
    map.set(app, btn);
    return btn;
  }));
  return { el, map };
}

/** `scale()` is screen pixels per desktop pixel right now (the screen is zoomed by the camera). */
export function createDesktopView(ctx: LaptopContext, scale: () => number): DesktopView {
  let state = emptyDesktop();
  const open = new Map<AppId, Open>();
  const layer = h('div', { class: 'lt-windows' });
  const { el: icons, map: iconEls } = createDesktopIcons(scale, (app) => state.icons[app], (a) => dispatch(a), () => ctx.sound.button());
  const menu = h('div', { class: 'lt-startmenu', hidden: true },
    h('div', { class: 'lt-startside' }, 'HAUNTED/OS'),
    h('div', { class: 'lt-startlist' },
      ...appMenuButtons(undefined, (app) => { menu.hidden = true; dispatch({ type: 'open', app }); }),
      h('hr'),
      h('button', { onclick: () => { menu.hidden = true; ctx.shutdown(); } }, 'Shut down...')));
  const ctxMenu = h('div', { class: 'lt-ctxmenu', hidden: true });
  const tasks = h('div', { class: 'lt-taskbtns' });
  const clock = h('span', { class: 'lt-clock' });
  const start = h('button', { class: 'lt-start', onclick: () => { ctxMenu.hidden = true; menu.hidden = !menu.hidden; } }, 'Start');
  const bar = h('div', { class: 'lt-taskbar' }, start, tasks, clock);
  const el = h('div', { class: 'lt-desktop' }, icons, layer, menu, ctxMenu, bar);
  el.addEventListener('pointerdown', (ev) => {
    const t = ev.target as Node;
    if (!menu.contains(t) && ev.target !== start) menu.hidden = true;
    if (!ctxMenu.contains(t)) ctxMenu.hidden = true;
  });
  el.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if ((ev.target as HTMLElement).closest('.lt-window, .lt-taskbar, .lt-startmenu')) {
      ctxMenu.hidden = true;
      return;
    }
    menu.hidden = true;
    showDesktopContextMenu({
      ctxMenu, desktopEl: el, ev, scale: scale(),
      onOpen: (app) => dispatch({ type: 'open', app }),
      onArrange: () => dispatch({ type: 'arrange-icons' }),
      onMinimizeAll: () => { for (const w of state.windows) if (!w.minimized) dispatch({ type: 'minimize', app: w.app }); },
      onShutdown: () => ctx.shutdown(),
    });
  });

  const tick = (): void => { clock.textContent = new Date().toTimeString().slice(0, 5); };
  tick();
  const clockTimer = window.setInterval(tick, 15000);

  const dragFrom = (app: AppId) => (ev: PointerEvent): void => {
    const win = state.windows.find((w) => w.app === app);
    if (win) trackDrag(ev, scale, 0, (dx, dy) => dispatch({ type: 'move', app, x: win.x + dx, y: win.y + dy }));
  };

  const place = (w: Win, o: Open): void => {
    Object.assign(o.frame.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px`, zIndex: String(w.z) });
    o.frame.hidden = w.minimized;
    o.frame.classList.toggle('focus', state.focus === w.app);
  };

  const render = (): void => {
    for (const app of APP_ORDER) {
      const pos = state.icons[app];
      const iconEl = iconEls.get(app);
      if (iconEl) Object.assign(iconEl.style, { left: `${pos.x}px`, top: `${pos.y}px` });
    }
    for (const [app, o] of open) {
      if (!state.windows.some((w) => w.app === app)) {
        o.view.dispose?.();
        o.frame.remove();
        open.delete(app);
      }
    }
    for (const w of state.windows) {
      let o = open.get(w.app);
      if (!o) {
        const view = createApp(w.app, ctx);
        o = { view, frame: windowFrame(w.app, view, dispatch, dragFrom(w.app)) };
        open.set(w.app, o);
        layer.append(o.frame);
      }
      place(w, o);
    }
    tasks.replaceChildren(...state.windows.map((w) => h('button', {
      class: `lt-taskbtn${state.focus === w.app ? ' on' : ''}`, 'data-app': w.app,
      onclick: () => dispatch(state.focus === w.app && !w.minimized ? { type: 'minimize', app: w.app } : { type: 'focus', app: w.app }),
    }, APPS[w.app].title)));
  };
  render();

  function dispatch(action: DesktopAction): void {
    const before = state.focus;
    const prevWin = 'app' in action ? state.windows.find((w) => w.app === action.app) : undefined;
    state = reduceDesktop(state, action);
    render();
    if (action.type === 'open' && (!prevWin || prevWin.minimized || before !== action.app)) ctx.sound.note('win-open');
    else if (action.type === 'focus' && prevWin?.minimized) ctx.sound.note('win-open');
    else if (action.type === 'minimize' && prevWin && !prevWin.minimized) ctx.sound.note('win-min');
    else if (action.type === 'close' && prevWin) ctx.sound.note('win-close');
    if (state.focus && state.focus !== before) open.get(state.focus)?.view.shown?.();
  }

  return {
    el,
    dispatch,
    state: () => state,
    view: (app) => open.get(app)?.view,
    reset() {
      state = emptyDesktop();
      menu.hidden = true;
      ctxMenu.hidden = true;
      render();
    },
    dispose() {
      window.clearInterval(clockTimer);
      for (const [, o] of open) o.view.dispose?.();
      open.clear();
      state = emptyDesktop();
      menu.hidden = true;
      ctxMenu.hidden = true;
      layer.replaceChildren();
    },
  };
}
