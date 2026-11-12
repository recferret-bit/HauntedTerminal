/** Design scale of the game: the vibecoder (1.6 units) is about 92 px tall. */
export const GAME_PPU = 58;

export const BG_IDS = ['floor1', 'floor2', 'floor3', 'floor4', 'floor5', 'paper'] as const;
export type BgId = (typeof BG_IDS)[number];

/** `normal` is the animator's `idle`. The rest are the AnimState names of src/procgen/anim/states.ts. */
export const STATE_IDS = ['normal', 'walk', 'attack', 'hit', 'death', 'hidden', 'revealed', 'petrified', 'frozen', 'enraged'] as const;
export type StateId = (typeof STATE_IDS)[number];

/** `paletteMode` of src/shaders/pixel-art.ts, in order. */
export const PALETTE_NAMES = ['FULL', 'GAMEBOY', 'AMBER', 'NEON', 'COMIX', 'MANSION'] as const;

export const TAB_IDS = ['models', 'textures', 'fx'] as const;
export type TabId = (typeof TAB_IDS)[number];

export interface LabOptions {
  /** Model, texture or FX preset id shown large. null = gallery. */
  inspect: string | null;
  tab: TabId;
  /** `all` or a ModelCategory. */
  category: string;
  seed: number;
  pixel: boolean;
  crt: boolean;
  /** Pixel-art pass palette mode, 0..5 (PALETTE_NAMES). The game default is 0, full RGB. */
  palette: number;
  ink: boolean;
  tex: boolean;
  anim: boolean;
  /** Freeze the clock at this many seconds. null = running. */
  time: number | null;
  /** Hold the lightning flash uniform on (for screenshots). */
  flash: boolean;
  lantern: boolean;
  bg: BgId;
  /** `fit`, `game` (58 px per unit) or an explicit px-per-unit number. */
  scale: 'fit' | 'game' | number;
  silhouette: boolean;
  sockets: boolean;
  state: StateId;
  /** Debug only, degrees, clamped to ±40. The game camera never yaws. */
  yaw: number;
  plinth: boolean;
  guides: boolean;
  /** false: hide the control column, top bar, caption and tags (clean screenshots). Error captions still show. */
  ui: boolean;
}

export type OptionKey = keyof LabOptions;

export const DEFAULT_OPTIONS: Readonly<LabOptions> = {
  inspect: null,
  tab: 'models',
  category: 'all',
  seed: 1,
  pixel: true,
  crt: true,
  palette: 0,
  ink: true,
  tex: true,
  anim: true,
  time: null,
  flash: false,
  lantern: false,
  bg: 'floor1',
  scale: 'fit',
  silhouette: false,
  sockets: false,
  state: 'normal',
  yaw: 0,
  plinth: true,
  guides: true,
  ui: true,
};

/** Option key -> URL parameter name. */
export const URL_NAMES: Readonly<Record<OptionKey, string>> = {
  inspect: 'inspect',
  tab: 'tab',
  category: 'category',
  seed: 'seed',
  pixel: 'pixel',
  crt: 'crt',
  palette: 'palette',
  ink: 'ink',
  tex: 'tex',
  anim: 'anim',
  time: 't',
  flash: 'flash',
  lantern: 'lantern',
  bg: 'bg',
  scale: 'scale',
  silhouette: 'silhouette',
  sockets: 'sockets',
  state: 'state',
  yaw: 'yaw',
  plinth: 'plinth',
  guides: 'guides',
  ui: 'ui',
};

export function pxPerUnit(scale: LabOptions['scale']): number | null {
  if (scale === 'fit') return null;
  return scale === 'game' ? GAME_PPU : scale;
}
