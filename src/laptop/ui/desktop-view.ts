/**
 * The desktop on the laptop's screen: icons, windows, the taskbar and its start menu. It draws a
 * `DesktopState` and changes it only through `reduceDesktop`; app views are built when their window
 * first opens and dropped when it closes.
 */
import { h } from '../../editor-core/dom.js';
import { APP_ORDER, APPS, type AppId } from '../domain/apps.js';
import { emptyDesktop, reduceDesktop, type DesktopAction, type DesktopState, type Win } from '../domain/desktop.js';
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
  bar.addEventListener('pointerdown', (ev) => { if (!(ev.target as HTMLElement).closest('button')) drag(ev); });
  const frame = h('section', { class: 'lt-window', 'data-app': app }, bar, h('div', { class: 'lt-wbody' }, view.el));
  frame.addEventListener('pointerdown', () => act({ type: 'focus', app }), true);
  return frame;
}

/** `scale()` is screen pixels per desktop pixel right now (the screen is zoomed by the camera). */
export function createDesktopView(ctx: LaptopContext, scale: () => number): DesktopView {
  let state = emptyDesktop();
  const open = new Map<AppId, Open>();
  const layer = h('div', { class: 'lt-windows' });
  const icons = h('div', { class: 'lt-icons' }, ...APP_ORDER.map((app) =>
    h('button', { class: 'lt-icon', 'data-app': app, title: APPS[app].blurb, ondblclick: () => dispatch({ type: 'open', app }), onkeydown: (ev: Event) => { if ((ev as KeyboardEvent).key === 'Enter') { ev.preventDefault(); ctx.sound.button(); dispatch({ type: 'open', app }); } } },
      h('span', { class: 'lt-iglyph' }, APPS[app].glyph), h('small', {}, APPS[app].file))));
  const menu = h('div', { class: 'lt-startmenu', hidden: true },
    h('div', { class: 'lt-startside' }, 'HAUNTED/OS'),
    h('div', { class: 'lt-startlist' },
      ...APP_ORDER.map((app) => h('button', { 'data-app': app, onclick: () => { menu.hidden = true; dispatch({ type: 'open', app }); } }, `${APPS[app].glyph}  ${APPS[app].title}`)),
      h('hr'),
      h('button', { onclick: () => { menu.hidden = true; ctx.shutdown(); } }, 'Shut down...')));
  const tasks = h('div', { class: 'lt-taskbtns' });
  const clock = h('span', { class: 'lt-clock' });
  const start = h('button', { class: 'lt-start', onclick: () => { menu.hidden = !menu.hidden; } }, 'Start');
  const bar = h('div', { class: 'lt-taskbar' }, start, tasks, clock);
  const el = h('div', { class: 'lt-desktop' }, icons, layer, menu, bar);
  el.addEventListener('pointerdown', (ev) => { if (!menu.contains(ev.target as Node) && ev.target !== start) menu.hidden = true; });

  const tick = (): void => { clock.textContent = new Date().toTimeString().slice(0, 5); };
  tick();
  window.setInterval(tick, 15000);

  const dragFrom = (app: AppId) => (ev: PointerEvent): void => {
    const win = state.windows.find((w) => w.app === app);
    if (!win) return;
    const k = scale() || 1;
    const sx = ev.clientX, sy = ev.clientY;
    const move = (e: PointerEvent): void => dispatch({ type: 'move', app, x: win.x + (e.clientX - sx) / k, y: win.y + (e.clientY - sy) / k });
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const place = (w: Win, o: Open): void => {
    Object.assign(o.frame.style, { left: `${w.x}px`, top: `${w.y}px`, width: `${w.w}px`, height: `${w.h}px`, zIndex: String(w.z) });
    o.frame.hidden = w.minimized;
    o.frame.classList.toggle('focus', state.focus === w.app);
  };

  const render = (): void => {
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

  function dispatch(action: DesktopAction): void {
    const before = state.focus;
    state = reduceDesktop(state, action);
    render();
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
      render();
    },
    dispose() {
      for (const [, o] of open) o.view.dispose?.();
      open.clear();
      state = emptyDesktop();
      menu.hidden = true;
      layer.replaceChildren();
    },
  };
}
