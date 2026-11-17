/** The programs on the laptop's desktop: plain data the desktop draws icons and windows from. */
export type AppId = 'quests' | 'jspad' | 'weaver' | 'sysinfo';

export interface AppDef {
  id: AppId;
  title: string;
  /** Desktop icon label (8.3 file name, it is an old machine). */
  file: string;
  /** Two or three characters drawn on the icon. */
  glyph: string;
  /** Default window size in desktop pixels. */
  size: [number, number];
  blurb: string;
}

export const APPS: Readonly<Record<AppId, AppDef>> = {
  quests: { id: 'quests', title: 'Quests', file: 'QUESTS.EXE', glyph: '!?', size: [300, 330], blurb: 'Coding tasks. Pick one; it opens in the right editor.' },
  jspad: { id: 'jspad', title: 'JS Pad', file: 'JSPAD.EXE', glyph: 'JS', size: [420, 360], blurb: 'Write JavaScript, run it, read the console.' },
  weaver: { id: 'weaver', title: 'Web Weaver', file: 'WEAVER.EXE', glyph: '</>', size: [600, 420], blurb: 'HTML, CSS and JavaScript with a live page preview.' },
  sysinfo: { id: 'sysinfo', title: 'System', file: 'SYSTEM.INI', glyph: 'i', size: [280, 220], blurb: 'What this machine is, and the power switch.' },
};

export const APP_ORDER: readonly AppId[] = ['quests', 'jspad', 'weaver', 'sysinfo'];
