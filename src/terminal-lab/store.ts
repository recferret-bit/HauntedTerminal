import { objectShape } from '../editor-core/schema-check.js';
import { newLabScript } from './lab-pack.js';
import type { LabScript } from './lab-types.js';
import { LAB_FIELDS } from './schema.js';

/**
 * Where labs live in the browser: one `localStorage` entry per lab, plus the id of the last one opened, and the lab document
 * format (`exportLabText` / `parseLabText`). Committed labs (`scripts/harness/terminal-lab/*.lab.json`) come through `disk.ts`.
 */
const PREFIX = 'ht-terminal-lab/script:';
const LAST = 'ht-terminal-lab/last';

/** A lab id: the file name is `<id>.lab.json`. Lowercase, so ids and file names agree on every file system. Same rule as the dev API. */
export const LAB_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export interface LabListing {
  id: string;
  title: string;
}

const storage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/** Fills what an older or hand-written document leaves out, so the rest of the lab can rely on the full shape. */
function normaliseLab(raw: Partial<LabScript> & { id: string }): LabScript {
  const base = newLabScript(raw.id, raw.title ?? raw.id);
  const { id: _id, title: _title, driver, room: _room, player: _player, clock, enemyFire, setup, steps, ...extra } = raw;
  return {
    id: base.id,
    title: base.title,
    ...(driver !== undefined && driver !== 'chapter' ? { driver } : {}),
    room: { ...base.room, ...raw.room },
    player: { ...base.player, ...raw.player },
    clock: clock ?? base.clock,
    enemyFire: enemyFire ?? base.enemyFire,
    setup: Array.isArray(setup) ? setup : base.setup,
    steps: Array.isArray(steps) ? steps : [],
    ...extra,
  };
}

/** The canonical text of a lab file (2-space JSON and a newline). Keep in step with `scripts/harness/lib/lab-json.mjs`. */
export function exportLabText(script: LabScript): string {
  return `${JSON.stringify(script, null, 2)}\n`;
}

/** Why `script` is not a valid lab document (unknown keys, wrong types, unknown kinds), or an empty list. */
export function validateLab(script: LabScript): string[] {
  if (!LAB_ID_RE.test(script.id)) return [`"${script.id}" is not a lab id: lowercase letters, digits and dashes, at most 64`];
  return objectShape(script, LAB_FIELDS, 'lab').map((i) => i.message);
}

/** Parses an imported `.lab.json`. Returns the lab, or the reasons it was refused. */
export function parseLabText(text: string): { script?: LabScript; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { problems: [`not JSON: ${(err as Error).message}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { problems: ['the document must be a JSON object'] };
  const doc = raw as Partial<LabScript>;
  if (typeof doc.id !== 'string') return { problems: ['"id" must be a lab id: lowercase letters, digits and dashes'] };
  const script = normaliseLab(doc as Partial<LabScript> & { id: string });
  const problems = validateLab(script);
  return problems.length > 0 ? { problems } : { script, problems: [] };
}

export function listLabs(): LabListing[] {
  const s = storage();
  if (!s) return [];
  const out: LabListing[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const doc = JSON.parse(s.getItem(key) ?? '') as { id?: string; title?: string };
      if (doc.id) out.push({ id: doc.id, title: doc.title ?? doc.id });
    } catch {
      /* a broken entry is skipped, never shown */
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadLab(id: string): LabScript | null {
  try {
    const raw = storage()?.getItem(PREFIX + id);
    return raw ? normaliseLab(JSON.parse(raw) as LabScript) : null;
  } catch {
    return null;
  }
}

export function saveLab(script: LabScript): void {
  try {
    storage()?.setItem(PREFIX + script.id, JSON.stringify(script));
    storage()?.setItem(LAST, script.id);
  } catch {
    /* storage full or blocked: the lab keeps working, it just will not be remembered */
  }
}

export function deleteLab(id: string): void {
  storage()?.removeItem(PREFIX + id);
}

export function lastLabId(): string | null {
  return storage()?.getItem(LAST) ?? null;
}

/** `base`, or `base-2`, `base-3`... whichever is free. */
export function uniqueLabId(base: string, taken: readonly string[]): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56).replace(/-+$/, '') || 'lab';
  if (!taken.includes(clean)) return clean;
  for (let i = 2; ; i += 1) if (!taken.includes(`${clean}-${i}`)) return `${clean}-${i}`;
}

export function duplicateLab(script: LabScript, taken: readonly string[]): LabScript {
  const id = uniqueLabId(`${script.id}-copy`, taken);
  return { ...structuredClone(script), id, title: `${script.title} (copy)` };
}
