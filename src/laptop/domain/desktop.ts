/**
 * The desktop's window manager as a reducer: one window per app, a z order, one focused window.
 * Pure: the desktop view renders a `DesktopState` and dispatches `DesktopAction`s.
 */
import { APP_ORDER, APPS, type AppId } from './apps.js';

export interface Win {
  app: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
}

export interface IconPos {
  x: number;
  y: number;
}

export interface DesktopState {
  windows: readonly Win[];
  focus: AppId | null;
  /** Next z value: the most recently focused window is on top. */
  top: number;
  icons: Readonly<Record<AppId, IconPos>>;
}

export type DesktopAction =
  | { type: 'open'; app: AppId }
  | { type: 'close'; app: AppId }
  | { type: 'focus'; app: AppId }
  | { type: 'minimize'; app: AppId }
  | { type: 'move'; app: AppId; x: number; y: number }
  | { type: 'move-icon'; app: AppId; x: number; y: number }
  | { type: 'arrange-icons' };

/** The screen the windows live on, in desktop pixels (a 640 x 480 panel minus the taskbar). */
export const SCREEN = { w: 640, h: 452 } as const;
export const ICON = { w: 78, h: 58 } as const;

export function defaultIcons(): Record<AppId, IconPos> {
  const out = {} as Record<AppId, IconPos>;
  APP_ORDER.forEach((app, i) => { out[app] = { x: 8, y: 8 + i * 68 }; });
  return out;
}

export const emptyDesktop = (): DesktopState => ({ windows: [], focus: null, top: 1, icons: defaultIcons() });

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Keeps at least the title bar on screen. */
function placed(win: Win, x: number, y: number): Win {
  return { ...win, x: clamp(Math.round(x), 40 - win.w, SCREEN.w - 40), y: clamp(Math.round(y), 0, SCREEN.h - 24) };
}

function raise(state: DesktopState, app: AppId, patch: Partial<Win> = {}): DesktopState {
  return {
    ...state,
    windows: state.windows.map((w) => (w.app === app ? { ...w, ...patch, z: state.top } : w)),
    focus: app,
    top: state.top + 1,
  };
}

function topVisible(windows: readonly Win[]): AppId | null {
  const shown = windows.filter((w) => !w.minimized);
  return shown.length ? shown.reduce((a, b) => (b.z > a.z ? b : a)).app : null;
}

export function reduceDesktop(state: DesktopState, action: DesktopAction): DesktopState {
  const has = 'app' in action && state.windows.some((w) => w.app === action.app);
  switch (action.type) {
    case 'open': {
      if (has) return raise(state, action.app, { minimized: false });
      const def = APPS[action.app];
      // Cascade new windows so two never open exactly on top of each other, bounded within the screen.
      const step = state.windows.length % 5;
      const maxX = Math.max(0, SCREEN.w - def.size[0]);
      const maxY = Math.max(0, SCREEN.h - def.size[1]);
      const win = placed(
        { app: action.app, x: 0, y: 0, w: def.size[0], h: def.size[1], z: state.top, minimized: false },
        Math.min(96 + step * 22, maxX),
        Math.min(12 + step * 18, maxY),
      );
      return { ...state, windows: [...state.windows, win], focus: action.app, top: state.top + 1 };
    }
    case 'focus':
      return has ? raise(state, action.app, { minimized: false }) : state;
    case 'close': {
      if (!has) return state;
      const windows = state.windows.filter((w) => w.app !== action.app);
      return { ...state, windows, focus: state.focus === action.app ? topVisible(windows) : state.focus };
    }
    case 'minimize': {
      if (!has) return state;
      const windows = state.windows.map((w) => (w.app === action.app ? { ...w, minimized: true } : w));
      return { ...state, windows, focus: state.focus === action.app ? topVisible(windows) : state.focus };
    }
    case 'move':
      return has ? { ...state, windows: state.windows.map((w) => (w.app === action.app ? placed(w, action.x, action.y) : w)) } : state;
    case 'move-icon':
      return {
        ...state,
        icons: {
          ...state.icons,
          [action.app]: {
            x: clamp(Math.round(action.x), 0, SCREEN.w - ICON.w),
            y: clamp(Math.round(action.y), 0, SCREEN.h - ICON.h),
          },
        },
      };
    case 'arrange-icons':
      return { ...state, icons: defaultIcons() };
  }
}
