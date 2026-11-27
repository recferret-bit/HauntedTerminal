// One ElevenLabs request per take: the argv for the `elevenlabs` CLI (run without a shell), the file it writes, and its
// estimated cost. House settings come from docs/audio/SFX_LIST.md and MUSIC_LIST.md. Spec: .kiro/specs/audio-agent/.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readManifest } from './audio-gen-manifest.mjs';
import { CUE_NAME } from './audio-gen-rows.mjs';

export const OUTPUT_FORMAT = 'mp3_44100_192';
export const SFX_MODEL = 'eleven_text_to_sound_v3';
export const MUSIC_MODEL = 'music_v2_5';
export const PROMPT_INFLUENCE = 0.8;
/** The API refuses a sound effect under 0.5 s and over 30 s; music is 3 s to 600 s. */
const SFX_SECONDS = [0.5, 30];
const MUSIC_MS = [3000, 600000];

/**
 * Credits per unit, kept on the high side. ElevenLabs: SFX 40 credits per second when the duration is set. Music and
 * speech prices are not published per unit, so these are guesses; the wrapper re-reads the balance after every request
 * and stops when the measured spend passes the cap.
 */
export const COST = { sfxPerSecond: 40, musicPerSecond: 120, speechPerChar: 1, speechMin: 50 };

const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

/** File name of take `variant` of `base`: base.mp3, base_2.mp3, ... (the convention of both manifests). */
export function takeName(base, variant) {
  return variant > 1 ? `${base}_${variant}` : base;
}

/** The plan stored for a music cue (public/music/plans/<name>.json), or null. A plan wins over the prompt. */
export function storedPlan(root, name) {
  const path = join(root, 'public/music/plans', `${name}.json`);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return { plan: doc.plan ?? null, ms: doc.plan_ms ?? null };
}

function sfxArgs(row) {
  const seconds = clamp(row.seconds ?? 1, SFX_SECONDS);
  const argv = ['text-to-sound-effects', 'convert', '--text', row.prompt, '--model-id', SFX_MODEL, '--duration-seconds', String(seconds),
    '--prompt-influence', String(PROMPT_INFLUENCE), ...(row.loop ? ['--loop', 'true'] : [])];
  return { argv, estimate: Math.ceil(seconds * COST.sfxPerSecond), seconds };
}

function musicArgs(row, root, name) {
  const stored = storedPlan(root, name);
  const ms = clamp(stored?.ms ?? Math.round((row.seconds ?? 20) * 1000), MUSIC_MS);
  // A stored plan goes in as the JSON body: CLI 1.13.0's --composition-plan flag validates the older sections shape and
  // refuses the chunk plans in public/music/plans/ (probed with --dry-run, 2026-11-28).
  const body = stored?.plan
    ? ['--json', JSON.stringify({ composition_plan: stored.plan, model_id: MUSIC_MODEL })]
    : ['--prompt', row.prompt, '--music-length-ms', String(ms), '--force-instrumental', 'true', '--model-id', MUSIC_MODEL];
  return { argv: ['music', 'compose', ...body], estimate: Math.ceil((ms / 1000) * COST.musicPerSecond), seconds: ms / 1000, plan: Boolean(stored?.plan) };
}

function voiceArgs(row, text, voiceId) {
  if (!text) throw new Error(`${row.names[0]}: a voice line needs --text "<the line>" (the list holds examples only)`);
  const argv = ['text-to-speech', 'convert', '--voice-id', voiceId ?? `<${row.voice}>`, '--text', text, '--model-id', row.model,
    ...(row.filter ? ['--audio-effects.filter-preset-id', row.filter] : [])];
  return { argv, estimate: Math.max(COST.speechMin, Math.ceil(text.length * COST.speechPerChar)), seconds: row.seconds };
}

/** Runtime SFX ids declared in `src/audio/catalog.ts` (`SFX_IDS`), so music-generated stingers resolve to `public/sfx/`. */
function catalogSfxIds(root) {
  const path = join(root, 'src/audio/catalog.ts');
  if (!existsSync(path)) return new Set();
  const text = readFileSync(path, 'utf8');
  const m = /SFX_IDS\s*=\s*\[([\s\S]*?)\]/.exec(text);
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((hit) => hit[1]));
}

/** Stingers live in `docs/audio/MUSIC_LIST.md` (`music_v2_5` / plans) but ship in `public/sfx/` and `public/sfx/manifest.json`. */
function targetGroup(root, row, name) {
  if (row.group !== 'music') return row.group;
  const base = name.replace(/_\d+$/, '');
  const names = [name, base, ...(row.names ?? [])];
  if (names.some((n) => n.startsWith('sting_'))) return 'sfx';
  const catalogIds = catalogSfxIds(root);
  if (names.some((n) => catalogIds.has(n))) return 'sfx';
  const manifestIds = new Set((readManifest(root, 'sfx').sounds ?? []).map((e) => e.name));
  return names.some((n) => manifestIds.has(n)) ? 'sfx' : row.group;
}

/**
 * Requests for `variants` takes of cue `name` (a row name) in `row`. `voiceId` is the looked-up id of a voice row
 * (a placeholder in a dry run). The output path is computed here from the cue name; a caller never passes a path.
 */
export function buildRequests({ root, row, name, variants = 1, text, voiceId }) {
  if (!CUE_NAME.test(name)) throw new Error(`cue name must be snake_case letters, digits and _: ${name}`);
  const group = targetGroup(root, row, name);
  const one = row.kind === 'voice' ? voiceArgs(row, text, voiceId) : row.kind === 'music' ? musicArgs(row, root, name) : sfxArgs(row);
  return Array.from({ length: variants }, (_, i) => {
    const take = takeName(name, i + 1);
    const out = `public/${group}/${take}.mp3`;
    const intent = `generate the ${row.kind} cue ${take} for the game's audio`;
    return { take, out, kind: row.kind, group, estimate: one.estimate, seconds: one.seconds, plan: one.plan ?? false,
      argv: [...one.argv, '--output-format', OUTPUT_FORMAT, '--intent', intent, '--output', join(root, out)] };
  });
}
