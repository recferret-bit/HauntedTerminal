// The prompt lists as data: every table row of docs/audio/SFX_LIST.md and docs/audio/MUSIC_LIST.md, with the cue names
// it stands for (ranges expanded), its length, loop flag, prompt, and for voice rows the voice and filter.
// Spec: .kiro/specs/audio-agent/ (Req 5, 11).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SFX_LIST = 'docs/audio/SFX_LIST.md';
export const MUSIC_LIST = 'docs/audio/MUSIC_LIST.md';
export const CUE_NAME = /^[a-z0-9_]+$/;

/** Cells of every Markdown table row that is not a header or a separator. */
function tableRows(md) {
  return md.split('\n')
    .filter((l) => l.startsWith('| ') && !/^\|\s*#\s*\|/.test(l) && !/^\|[-\s|]+\|$/.test(l))
    .map((l) => l.trim().replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(' | ').map((c) => c.trim()));
}

/**
 * Names a Name cell stands for: `` `a` `` -> [a]; `` `a_1` .. `_10` `` -> a_1..a_10;
 * `` `a` / `_2` .. `_10` `` -> a, a_2..a_10.
 */
export function expandNames(cell) {
  const ticks = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const first = ticks[0];
  if (!first || !CUE_NAME.test(first)) return [];
  if (!cell.includes('..')) return [first];
  const own = /_(\d+)$/.exec(first);
  const prefix = own ? first.slice(0, -own[0].length) : first;
  const nums = ticks.slice(1).map((t) => /^_(\d+)$/.exec(t)?.[1]).filter(Boolean).map(Number);
  const lo = own ? Number(own[1]) : nums[0];
  const hi = nums.at(-1);
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) return [first];
  const range = Array.from({ length: hi - lo + 1 }, (_, i) => `${prefix}_${lo + i}`);
  return own ? range : [first, ...range];
}

/** `0.1s`, `~3s`, `10s, loop`, `48 s, loop`, `5 s, one-shot` -> seconds and loop. */
export function parseLength(cell) {
  const m = /~?\s*([\d.]+)\s*s\b/.exec(cell);
  return { seconds: m ? Number(m[1]) : null, loop: /\bloop\b/.test(cell) };
}

/** A voice row names `eleven_v4`, the voice in parentheses and the filter (`` `robot` filter (`Laura`) ``). */
function voiceOf(prompt) {
  if (!/eleven_v4/.test(prompt)) return null;
  const voice = /\(`([A-Z][a-z]+)`/.exec(prompt)?.[1] ?? null;
  const filter = /`([a-z_]+)` filter/.exec(prompt)?.[1] ?? null;
  return voice ? { voice, filter, model: 'eleven_v4' } : null;
}

/** Rows of one list. `group` is `sfx` or `music`; a row of the SFX list with a voice is `kind: 'voice'`. */
export function parseList(md, group) {
  return tableRows(md).filter((c) => c.length >= 5).map((c) => {
    const [num, nameCell, effect, lengthCell, ...rest] = c;
    const prompt = rest.join(' | ');
    const voice = group === 'sfx' ? voiceOf(prompt) : null;
    const { seconds, loop } = parseLength(lengthCell);
    return { group, kind: voice ? 'voice' : group, row: num, names: expandNames(nameCell), effect, seconds, loop, prompt, ...(voice ?? {}) };
  }).filter((r) => r.names.length);
}

/** Both lists from `root`. A missing list is an empty one (the check reports names it cannot place). */
export function loadRows(root) {
  const read = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : '');
  return [...parseList(read(SFX_LIST), 'sfx'), ...parseList(read(MUSIC_LIST), 'music')];
}

/** The row a cue name belongs to: its own name, or a variant `<name>_<n>` of a row name (key_press_2). */
export function rowFor(rows, name) {
  const exact = rows.find((r) => r.names.includes(name));
  if (exact) return { row: exact, base: name, variant: 1 };
  const m = /^(.+)_(\d+)$/.exec(name);
  if (!m) return null;
  const row = rows.find((r) => r.names.includes(m[1]));
  return row ? { row, base: m[1], variant: Number(m[2]) } : null;
}

/** Tempo of a music prompt, for the length of one bar (loop joins). */
export function barSeconds(prompt) {
  const bpm = Number(/(\d+)\s*BPM/.exec(prompt ?? '')?.[1]);
  return bpm > 0 ? 240 / bpm : 2;
}
