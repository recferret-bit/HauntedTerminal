import { DEFAULT_CRT_PARAMS, type CrtParams } from '../shaders/crt-pass.js';
import { DEFAULT_PIXEL_PARAMS, type PixelArtParams } from '../shaders/pixel-art.js';
import { LIGHT_MODES, type LightMode } from '../renderer/stage-light.js';

export interface InkParams {
  outline: number;
  halftone: number;
}

export interface ShaderHooks {
  setPixel(on: boolean, params: PixelArtParams): void;
  setCrt(on: boolean, params: CrtParams): void;
  setInk(params: InkParams): void;
  setStorm(on: boolean, intensity: number): void;
  setProjection(zoom: number): void;
  /** Scene light source (radio buttons). Optional so other hosts can omit it. */
  setLight?(mode: LightMode): void;
}

export interface ShaderBoot {
  pixelOn: boolean;
  crtOn: boolean;
  pixel: PixelArtParams;
  crt: CrtParams;
  ink: InkParams;
  stormOn: boolean;
  storm: number;
  zoom: number;
  light: LightMode;
}

export const DEFAULT_INK: InkParams = { outline: 1, halftone: 0.85 };
export const DEFAULT_STORM = 0.65;
export const DEFAULT_ZOOM = 1;
const PREFIX = 'haunted.lab.';

export const TABS = ['crt', 'pixel', 'ink', 'storm', 'projection'] as const;
export type TabId = (typeof TABS)[number];

interface SliderView {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt?: (value: number) => string;
}

const PALETTE_NAMES = ['FULL', 'GAMEBOY', 'AMBER', 'NEON', 'COMIX', 'MANSION'] as const;

function formatPalette(value: number): string {
  const index = Math.round(value);
  return PALETTE_NAMES[index] ?? 'FULL';
}

const CRT_SLIDERS: readonly SliderView[] = [
  { key: 'scanlineIntensity', label: 'SCANLINES', min: 0, max: 0.65, step: 0.01 },
  { key: 'rollIntensity', label: 'ROLL', min: 0, max: 0.25, step: 0.01 },
  { key: 'noiseOpacity', label: 'GRAIN', min: 0, max: 0.3, step: 0.005 },
  { key: 'flickerStrength', label: 'FLICKER', min: 0, max: 0.25, step: 0.01 },
  { key: 'vignetteStrength', label: 'VIGNETTE', min: 0, max: 0.95, step: 0.01 },
  { key: 'mix', label: 'MIX', min: 0, max: 1, step: 0.01 },
  { key: 'distort', label: 'BARREL DISTORT', min: 0, max: 0.08, step: 0.002 },
];

const PIXEL_SLIDERS: readonly SliderView[] = [
  { key: 'pixelSize', label: 'PIXEL SIZE', min: 1, max: 8, step: 0.5 },
  { key: 'colorLevels', label: 'COLOR LEVELS', min: 2, max: 32, step: 1 },
  { key: 'dither', label: 'DITHER', min: 0, max: 1.5, step: 0.01 },
  { key: 'edgeStrength', label: 'EDGE', min: 0, max: 1.5, step: 0.01 },
  { key: 'saturation', label: 'SATURATION', min: 0, max: 2, step: 0.01 },
  { key: 'contrast', label: 'CONTRAST', min: 0.5, max: 1.6, step: 0.01 },
  { key: 'gridStrength', label: 'GRID', min: 0, max: 0.25, step: 0.01 },
  { key: 'paletteMode', label: 'PALETTE', min: 0, max: 5, step: 1, fmt: formatPalette },
];

const INK_SLIDERS: readonly SliderView[] = [
  { key: 'outline', label: 'OUTLINE', min: 0, max: 2, step: 0.05 },
  { key: 'halftone', label: 'HALFTONE', min: 0, max: 1, step: 0.05 },
];

const STORM_SLIDERS: readonly SliderView[] = [
  { key: 'storm', label: 'INTENSITY', min: 0, max: 1.5, step: 0.05 },
];

const PROJECTION_SLIDERS: readonly SliderView[] = [
  { key: 'zoom', label: 'ZOOM', min: 0.75, max: 1.6, step: 0.05 },
];

export const TAB_LABEL: Record<TabId, string> = {
  crt: 'CRT',
  pixel: 'PIXEL',
  ink: 'INK',
  storm: 'STORM',
  projection: 'PROJECTION',
};

export const TAB_STATUS: Record<TabId, string> = {
  crt: 'CRT OVERLAY',
  pixel: 'COMIX PIXEL',
  ink: 'INK PLATE',
  storm: 'STORM',
  projection: 'PROJECTION',
};

export function isTab(value: string | null | undefined): value is TabId {
  return value === 'crt' || value === 'pixel' || value === 'ink' || value === 'storm' || value === 'projection';
}

export function snap(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value) || !(step > 0)) return min;
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  const snapped = Number((min + steps * step).toFixed(6));
  return Math.min(max, Math.max(min, snapped));
}

function formatStep(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  const places = Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))));
  return value.toFixed(places);
}

export function formatSlider(spec: SliderView, value: number): string {
  return spec.fmt ? spec.fmt(value) : formatStep(value, spec.step);
}

export function clonePixel(src: PixelArtParams): PixelArtParams {
  return {
    pixelSize: src.pixelSize,
    colorLevels: src.colorLevels,
    dither: src.dither,
    edgeStrength: src.edgeStrength,
    saturation: src.saturation,
    contrast: src.contrast,
    gridStrength: src.gridStrength,
    paletteMode: src.paletteMode,
  };
}

export function cloneCrt(src: CrtParams): CrtParams {
  return {
    scanlineIntensity: src.scanlineIntensity,
    rollIntensity: src.rollIntensity,
    noiseOpacity: src.noiseOpacity,
    flickerStrength: src.flickerStrength,
    vignetteStrength: src.vignetteStrength,
    mix: src.mix,
    distort: src.distort,
  };
}

export function cloneInk(src: InkParams): InkParams {
  return { outline: src.outline, halftone: src.halftone };
}

export function writePixel(target: PixelArtParams, key: string, value: number): boolean {
  switch (key) {
    case 'pixelSize': target.pixelSize = value; return true;
    case 'colorLevels': target.colorLevels = value; return true;
    case 'dither': target.dither = value; return true;
    case 'edgeStrength': target.edgeStrength = value; return true;
    case 'saturation': target.saturation = value; return true;
    case 'contrast': target.contrast = value; return true;
    case 'gridStrength': target.gridStrength = value; return true;
    case 'paletteMode': target.paletteMode = value; return true;
    default: return false;
  }
}

export function writeCrt(target: CrtParams, key: string, value: number): boolean {
  switch (key) {
    case 'scanlineIntensity': target.scanlineIntensity = value; return true;
    case 'rollIntensity': target.rollIntensity = value; return true;
    case 'noiseOpacity': target.noiseOpacity = value; return true;
    case 'flickerStrength': target.flickerStrength = value; return true;
    case 'vignetteStrength': target.vignetteStrength = value; return true;
    case 'mix': target.mix = value; return true;
    case 'distort': target.distort = value; return true;
    default: return false;
  }
}

function writeInk(target: InkParams, key: string, value: number): boolean {
  switch (key) {
    case 'outline': target.outline = value; return true;
    case 'halftone': target.halftone = value; return true;
    default: return false;
  }
}

export function storageGet(name: string): string | null {
  try {
    return localStorage.getItem(PREFIX + name);
  } catch {
    return null;
  }
}

export function storageSet(name: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + name, value);
  } catch {
    /* private mode or quota */
  }
}

function readRecord(name: string): Record<string, unknown> | null {
  const raw = storageGet(name);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) out[key] = value;
    return out;
  } catch {
    return null;
  }
}

function readNum(name: string, fallback: number): number {
  const raw = storageGet(name);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = storageGet(name);
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

function overlaySliders(
  rec: Record<string, unknown> | null,
  specs: readonly SliderView[],
  write: (key: string, value: number) => void,
): void {
  if (!rec) return;
  for (const spec of specs) {
    const raw = rec[spec.key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    write(spec.key, snap(raw, spec.min, spec.max, spec.step));
  }
}

function readPixel(): PixelArtParams {
  const out = clonePixel(DEFAULT_PIXEL_PARAMS);
  overlaySliders(readRecord('pixel'), PIXEL_SLIDERS, (key, value) => { writePixel(out, key, value); });
  return out;
}

function readCrt(): CrtParams {
  const out = cloneCrt(DEFAULT_CRT_PARAMS);
  overlaySliders(readRecord('crt'), CRT_SLIDERS, (key, value) => { writeCrt(out, key, value); });
  return out;
}

function readInk(): InkParams {
  const out = cloneInk(DEFAULT_INK);
  overlaySliders(readRecord('ink'), INK_SLIDERS, (key, value) => { writeInk(out, key, value); });
  return out;
}

export function readInkHold(currentHalftone: number): number {
  const fallback = currentHalftone > 0.05 ? currentHalftone : DEFAULT_INK.halftone;
  const snapped = snap(readNum('inkHold', fallback), 0, 1, 0.05);
  return snapped > 0.05 ? snapped : DEFAULT_INK.halftone;
}

/** Bump when shader defaults change on purpose: older saved slider values are dropped once. */
const STORAGE_VERSION = '3';

function migrateStorage(): void {
  if (storageGet('version') === STORAGE_VERSION) return;
  try {
    for (const key of ['pixel', 'pixelOn', 'crt', 'crtOn', 'ink']) localStorage.removeItem(PREFIX + key);
  } catch { /* private mode */ }
  storageSet('version', STORAGE_VERSION);
}

function readLight(): LightMode {
  const saved = storageGet('light');
  return LIGHT_MODES.some((m) => m.id === saved) ? (saved as LightMode) : 'lantern';
}

export function readInitialShaderState(): ShaderBoot {
  migrateStorage();
  const stormSpec = STORM_SLIDERS[0];
  const zoomSpec = PROJECTION_SLIDERS[0];
  return {
    light: readLight(),
    pixelOn: readBool('pixelOn', true),
    crtOn: readBool('crtOn', true),
    pixel: readPixel(),
    crt: readCrt(),
    ink: readInk(),
    stormOn: readBool('stormOn', true),
    storm: stormSpec ? snap(readNum('storm', DEFAULT_STORM), stormSpec.min, stormSpec.max, stormSpec.step) : DEFAULT_STORM,
    zoom: zoomSpec ? snap(readNum('zoom', DEFAULT_ZOOM), zoomSpec.min, zoomSpec.max, zoomSpec.step) : DEFAULT_ZOOM,
  };
}

export function slidersFor(active: TabId): readonly SliderView[] {
  if (active === 'crt') return CRT_SLIDERS;
  if (active === 'pixel') return PIXEL_SLIDERS;
  if (active === 'ink') return INK_SLIDERS;
  if (active === 'storm') return STORM_SLIDERS;
  return PROJECTION_SLIDERS;
}
