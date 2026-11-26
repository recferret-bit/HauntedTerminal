// public/sfx/manifest.json and public/music/manifest.json: patch one cue's entry without touching any other byte, and
// the offline consistency check (`audio-gen.mjs --check`). Spec: .kiro/specs/audio-agent/ (Req 5, 11).
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRows, rowFor } from './audio-gen-rows.mjs';

export const MANIFESTS = { sfx: { path: 'public/sfx/manifest.json', list: 'sounds' }, music: { path: 'public/music/manifest.json', list: 'cues' } };

/** End index (exclusive) of the JSON object starting at `text[start] === '{'`, honouring strings. */
function objectEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  throw new Error('unbalanced JSON object');
}

/** An entry in the style the manifests were written in: 2-space indent at depth 2, `4.0` seconds, ASCII escapes. */
function entryText(entry) {
  return JSON.stringify(entry, null, 2)
    .replace(/("[a-z_]*seconds": )(-?\d+)(,?)$/gm, '$1$2.0$3')
    .replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .split('\n').map((l) => `    ${l}`).join('\n');
}

/**
 * New text of manifest `text` with the entry named `entry.name` replaced (or appended to the list). Every other entry
 * keeps its bytes, so a human edit elsewhere in the file survives and an unchanged run is a zero-byte diff.
 */
export function patchManifest(text, listKey, entry) {
  const doc = JSON.parse(text);
  const list = doc[listKey];
  if (!Array.isArray(list)) throw new Error(`manifest has no "${listKey}" list`);
  const at = list.findIndex((e) => e.name === entry.name);
  const listStart = text.indexOf('[', text.indexOf(`"${listKey}"`));
  let pos = listStart + 1;
  const spans = list.map(() => {
    const start = text.indexOf('{', pos);
    const end = objectEnd(text, start);
    pos = end;
    return [start, end];
  });
  const body = entryText(entry).trimStart();
  if (at >= 0) return text.slice(0, spans[at][0]) + body + text.slice(spans[at][1]);
  if (!spans.length) return `${text.slice(0, listStart + 1)}\n    ${body}\n  ${text.slice(listStart + 1).trimStart()}`;
  const last = spans.at(-1)[1];
  return `${text.slice(0, last)},\n    ${body}${text.slice(last)}`;
}

/** Reads the manifest from disk right before the write, patches one entry, writes atomically (temp + rename). */
export function writeEntry(root, group, entry) {
  const { path, list } = MANIFESTS[group];
  const full = join(root, path);
  const next = patchManifest(readFileSync(full, 'utf8'), list, entry);
  writeFileSync(`${full}.tmp`, next);
  renameSync(`${full}.tmp`, full);
}

export function readManifest(root, group) {
  const full = join(root, MANIFESTS[group].path);
  return existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : { [MANIFESTS[group].list]: [] };
}

/** Text of every src/audio module but the id catalog: a cue is mapped when one of them names it (as audio-unit.mjs checks). */
function mappingSource(root) {
  const dir = join(root, 'src/audio');
  if (!existsSync(dir)) return '';
  return readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'catalog.ts').map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
}

/** Problems of the audio folders, offline: orphans both ways, names in no list row, cues no event or scene maps. */
export function checkAudio(root) {
  const problems = [];
  const rows = loadRows(root);
  const mapped = mappingSource(root);
  for (const [group, { path, list }] of Object.entries(MANIFESTS)) {
    const entries = readManifest(root, group)[list] ?? [];
    const listed = new Set();
    for (const e of entries) {
      for (const f of e.files ?? []) {
        listed.add(f.file);
        if (!existsSync(join(root, 'public', group, f.file))) problems.push(`${path}: ${e.name} names ${f.file}, which is missing`);
      }
      if (!rowFor(rows, e.name)) problems.push(`${path}: ${e.name} is in no row of docs/audio/${group === 'sfx' ? 'SFX' : 'MUSIC'}_LIST.md (add the row, with its prompt)`);
      if (!mapped.includes(`'${e.name}'`)) problems.push(`${path}: ${e.name} is played by no app event or scene (map it in src/audio/)`);
    }
    const dir = join(root, 'public', group);
    for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.mp3')) : []) {
      if (!listed.has(f)) problems.push(`public/${group}/${f} has no entry in ${path}`);
    }
  }
  return problems;
}
