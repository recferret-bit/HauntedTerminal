import {
  BG_IDS, DEFAULT_OPTIONS, PALETTE_NAMES, STATE_IDS, TAB_IDS, URL_NAMES,
  type BgId, type LabOptions, type OptionKey,
} from './options.js';

const ALIASES: Readonly<Record<string, OptionKey>> = {
  t: 'time',
  textures: 'tex',
  texture: 'tex',
  animation: 'anim',
  background: 'bg',
  floor: 'bg',
};

function toBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw !== 'string') return fallback;
  const s = raw.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(s)) return true;
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  return fallback;
}

function toNum(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function toBg(raw: unknown, fallback: BgId): BgId {
  if (typeof raw === 'number' || (typeof raw === 'string' && /^[1-5]$/.test(raw))) return oneOf(`floor${raw}`, BG_IDS, fallback);
  return oneOf(raw, BG_IDS, fallback);
}

/** Set one option from an untyped value (URL string, automation call, control). Unknown keys return false. */
export function assignOption(opts: LabOptions, key: string, raw: unknown): boolean {
  if (key === 'post') {
    const on = toBool(raw, true);
    opts.pixel = on;
    opts.crt = on;
    return true;
  }
  const k = (key in DEFAULT_OPTIONS ? key : ALIASES[key]) as OptionKey | undefined;
  if (!k) return false;
  const d = DEFAULT_OPTIONS;
  switch (k) {
    case 'inspect': opts.inspect = typeof raw === 'string' && raw !== '' ? raw : null; break;
    case 'tab': opts.tab = oneOf(raw, TAB_IDS, d.tab); break;
    case 'category': opts.category = typeof raw === 'string' && raw !== '' ? raw : 'all'; break;
    case 'palette': {
      const named = typeof raw === 'string' ? PALETTE_NAMES.indexOf(raw.toUpperCase() as (typeof PALETTE_NAMES)[number]) : -1;
      opts.palette = named >= 0 ? named : Math.min(5, Math.max(0, Math.round(toNum(raw, d.palette))));
      break;
    }
    case 'seed': opts.seed = Math.max(0, Math.round(toNum(raw, d.seed))); break;
    case 'time': opts.time = raw === null || raw === '' || raw === undefined ? null : Math.max(0, toNum(raw, 0)); break;
    case 'bg': opts.bg = toBg(raw, d.bg); break;
    case 'scale': {
      if (raw === 'fit' || raw === 'game') opts.scale = raw;
      else {
        const n = toNum(raw, NaN);
        opts.scale = Number.isFinite(n) && n > 0 ? Math.min(600, Math.max(8, n)) : 'fit';
      }
      break;
    }
    case 'state': opts.state = oneOf(raw === 'idle' ? 'normal' : raw, STATE_IDS, d.state); break;
    case 'yaw': opts.yaw = Math.min(40, Math.max(-40, toNum(raw, 0))); break;
    default: opts[k] = toBool(raw, d[k]);
  }
  return true;
}

export function readOptions(search: string): LabOptions {
  const opts: LabOptions = { ...DEFAULT_OPTIONS };
  const params = new URLSearchParams(search);
  // `post` first so `pixel=` / `crt=` can override it.
  if (params.has('post')) assignOption(opts, 'post', params.get('post'));
  for (const key of Object.keys(URL_NAMES) as OptionKey[]) {
    const raw = params.get(URL_NAMES[key]);
    if (raw !== null) assignOption(opts, key, raw);
  }
  const known = new Set<string>([...Object.values(URL_NAMES), 'post', 'dpr', 'fixtures']);
  const unknown = [...params.keys()].filter((name) => !known.has(name));
  if (unknown.length) console.warn(`storybook: ignoring unknown URL parameter(s) ${unknown.join(', ')}. See src/storybook/domain/options.ts.`);
  return opts;
}

/** Query string holding only the options that differ from the defaults. `keep` carries boot-only params (dpr, fixtures). */
export function writeOptions(opts: LabOptions, keep: URLSearchParams = new URLSearchParams()): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(URL_NAMES) as OptionKey[]) {
    const value = opts[key];
    if (value === DEFAULT_OPTIONS[key]) continue;
    params.set(URL_NAMES[key], typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  for (const name of ['dpr', 'fixtures']) {
    const v = keep.get(name);
    if (v !== null) params.set(name, v);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
