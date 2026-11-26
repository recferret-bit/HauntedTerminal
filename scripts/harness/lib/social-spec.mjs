// Declarative JSON spec validators & resolvers for Out Of Credits social videos, screenshots, infographics & ElevenLabs audio.
// Zero hardcoded chapter or level names: `{chapter}` and `{level:N}` resolve from chapters/<slug>/chapter.manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from './load.mjs';
import { loadChapter } from './visual-screens.mjs';

const PLATFORMS = new Set(['x', 'youtube', 'tiktok', 'shorts', 'steam']);
const MODES = new Set(['play', 'comix', 'storybook', 'laptop', 'page']);
const LOOKS = new Set(['comix', 'big', 'vertical']);
const CROPS = new Set(['square', 'vertical']);
const TRANSITIONS = new Set(['cut', 'flash', 'flash-amber', 'glitch', 'whip', 'zoom', 'dip', 'punch']);
const TRANS_DEF_DUR = { cut: 0, flash: 0.3, 'flash-amber': 0.34, glitch: 0.36, whip: 0.28, zoom: 0.36, dip: 0.44, punch: 0.32 };
const ACCENTS = new Set(['amber', 'orange', 'phosphor', 'cyan', 'magenta']);
const ALIGNS = new Set(['left', 'right', 'center']);
const PILL_POS = new Set(['top-left', 'top-center', 'top-right', 'above-caption']);
const DIALOG_POS = new Set(['right', 'left', 'center']);
const BURST_POS = new Set(['top-right', 'top-left', 'center', 'bottom-right']);
const SHOT_POS = new Set(['center', 'right', 'left', 'bottom-right', 'top-right']);
const FITS = new Set(['contain', 'cover']);
const SKINS = new Set(['iterm2', 'terminal-app', 'putty', 'windows-terminal', 'gnome-terminal', 'vt100']);
const MODALS = new Set(['manual', 'map', 'menu', 'editor', 'hint']);
const EVENT_DOS = new Set(['type', 'submit', 'typeAndSubmit', 'modal', 'skin', 'tick', 'scroll']);
const DIAGRAM_KINDS = new Set(['pipeline', 'funnel', 'versus', 'loop']);
const AUDIO_KINDS = new Set(['voice', 'sfx', 'music']);
const SLUG_RX = /^[a-z0-9][a-z0-9_-]*$/i;
const CUE_RX = /^[a-z0-9_]+$/;

const fail = (where, msg) => { throw new Error(`social spec ${where}: ${msg}`); };
const isRange2 = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';

function resolvePlaceholders(text, chapter) {
  return String(text)
    .replaceAll('{chapter}', chapter.id)
    .replace(/\{level:(\d+)\}/g, (_, n) => {
      const hit = chapter.levels.find((l) => l.index === Number(n));
      if (!hit) fail('url', `chapter "${chapter.id}" has no level index ${n}`);
      return hit.id;
    });
}

function loadJsonSpec(specPath) {
  const abs = path.resolve(specPath);
  return { abs, specDir: path.dirname(abs), raw: JSON.parse(fs.readFileSync(abs, 'utf8')) };
}

function expandSetupSteps(steps, chapter, where) {
  return (steps ?? []).flatMap((st, idx) => {
    if (typeof st === 'string') return [st];
    if (!st || typeof st !== 'object') fail(`${where}[${idx}]`, 'must be a command string or step object');
    if ('solution' in st) {
      const lvl = chapter.levels.find((l) => l.index === Number(st.solution?.level));
      if (!lvl) fail(`${where}[${idx}].solution`, `unknown level index ${st.solution?.level}`);
      const cmds = lvl.spec.solutionCommands ?? [];
      return cmds.slice(0, st.solution.count ?? cmds.length);
    }
    if ('ticks' in st) {
      if (!Number.isInteger(st.ticks) || st.ticks < 1 || st.ticks > 500) {
        fail(`${where}[${idx}].ticks`, 'must be an integer in [1, 500]');
      }
      return [{ ticks: st.ticks }];
    }
    if (typeof st.wait === 'number' || typeof st.until === 'string') return [st];
    fail(`${where}[${idx}]`, 'setup object must have solution, ticks, wait, or until');
  });
}

/** Resolves a music cue ID (`title_theme`), SFX cue ID (`kill`), social VO cue ID, or file path to an absolute path. */
export function resolveSocialAudioFile(src, { root = projectRoot, specDir = root, group = 'music', mustExist = true } = {}) {
  const clean = String(src ?? '').trim();
  if (!clean) fail('audio', 'empty audio reference');
  if (CUE_RX.test(clean) && !clean.includes('.')) {
    const candidates = group === 'sfx'
      ? [path.join(root, 'public/sfx', `${clean}.mp3`), path.join(root, 'social/media/out/audio', `${clean}.mp3`)]
      : group === 'voiceover'
        ? [path.join(root, 'social/media/out/audio', `${clean}.mp3`), path.join(root, 'public/sfx', `${clean}.mp3`)]
        : [path.join(root, 'public/music', `${clean}.mp3`), path.join(root, 'social/media/out/audio', `${clean}.mp3`)];
    const hit = candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
    if (mustExist && !fs.existsSync(hit)) fail(`audio (${group})`, `cue "${clean}" not found at ${path.relative(root, hit)}`);
    return hit;
  }
  const bases = [specDir, path.join(root, 'social/media'), path.join(root, 'social'), root];
  for (const base of bases) {
    const cand = path.resolve(base, clean);
    if (fs.existsSync(cand)) return cand;
  }
  const fallback = path.resolve(specDir, clean);
  if (mustExist) fail(`audio (${group})`, `audio file not found: ${fallback}`);
  return fallback;
}

function normalizeSfxCue(item, where, maxDur, root, specDir) {
  if (!item || typeof item !== 'object') fail(where, 'must be { at, cue, gainDb? }');
  if (typeof item.at !== 'number' || item.at < 0 || item.at >= maxDur) fail(`${where}.at`, `must be in [0, ${maxDur})`);
  if (typeof item.cue !== 'string' || !item.cue.trim()) fail(`${where}.cue`, 'must be a non-empty cue id or path');
  const gainDb = item.gainDb ?? 0;
  if (typeof gainDb !== 'number' || gainDb < -40 || gainDb > 20) fail(`${where}.gainDb`, 'must be in [-40, 20]');
  const abs = resolveSocialAudioFile(item.cue, { root, specDir, group: 'sfx', mustExist: true });
  return { at: +item.at.toFixed(4), cue: item.cue.trim(), abs, gainDb };
}

function normalizeAudioConfig(rawAudio, sceneSfx, total, root, specDir) {
  if (rawAudio === false || rawAudio == null) {
    return rawAudio === false ? null : { music: null, voiceover: null, resolvedCues: sceneSfx, autoGameSfx: true };
  }
  const cfg = typeof rawAudio === 'string' ? { music: rawAudio } : rawAudio;
  if (typeof cfg !== 'object' || Array.isArray(cfg)) fail('audio', 'must be false, a cue/path string, or an object');

  let music = null;
  const rawMusic = cfg.music ?? cfg.src ?? null;
  if (rawMusic) {
    const mObj = typeof rawMusic === 'string' ? { src: rawMusic, ...cfg } : rawMusic;
    const abs = resolveSocialAudioFile(mObj.src ?? mObj.cue, { root, specDir, group: 'music', mustExist: true });
    const offset = mObj.offset ?? 0;
    const fadeIn = mObj.fadeIn ?? 0.35;
    const fadeOut = mObj.fadeOut ?? Math.min(2.0, total * 0.15);
    const gainDb = mObj.gainDb ?? -2;
    const duckDb = mObj.duckDb ?? -5;
    if (typeof offset !== 'number' || offset < 0) fail('audio.offset', 'must be >= 0');
    if (!(fadeIn >= 0 && fadeIn <= 10)) fail('audio.fadeIn', 'must be in [0, 10]');
    if (!(fadeOut >= 0 && fadeOut <= 15)) fail('audio.fadeOut', 'must be in [0, 15]');
    if (typeof gainDb !== 'number' || gainDb < -40 || gainDb > 20) fail('audio.gainDb', 'must be in [-40, 20]');
    music = { src: String(mObj.src ?? mObj.cue), abs, offset, fadeIn, fadeOut, gainDb, duckDb, loop: mObj.loop !== false };
  }

  let voiceover = null;
  if (cfg.voiceover) {
    const vObj = typeof cfg.voiceover === 'string' ? { cue: cfg.voiceover } : cfg.voiceover;
    const required = vObj.required === true;
    const ref = vObj.src ?? vObj.cue;
    const abs = resolveSocialAudioFile(ref, { root, specDir, group: 'voiceover', mustExist: required });
    voiceover = {
      cue: String(ref),
      abs,
      present: fs.existsSync(abs),
      required,
      at: typeof vObj.at === 'number' && vObj.at >= 0 ? vObj.at : 0,
      gainDb: typeof vObj.gainDb === 'number' ? vObj.gainDb : 1.5,
    };
  }

  const topCues = (cfg.cues ?? []).map((c, i) => normalizeSfxCue(c, `audio.cues[${i}]`, total, root, specDir));
  return {
    music,
    voiceover,
    resolvedCues: [...topCues, ...sceneSfx].sort((a, b) => a.at - b.at),
    autoGameSfx: cfg.autoGameSfx !== false,
  };
}

function normalizeOverlays(s, w, dur, specDir, sceneIndex) {
  const tr = typeof s.transition === 'string' ? { type: s.transition } : (s.transition || { type: sceneIndex === 0 ? 'cut' : 'flash' });
  if (!TRANSITIONS.has(tr.type)) fail(`${w}.transition`, `"${tr.type}" not in ${[...TRANSITIONS].join('|')}`);
  const trDur = tr.dur ?? TRANS_DEF_DUR[tr.type];
  if (!(trDur >= 0 && trDur <= 1.2)) fail(`${w}.transition.dur`, 'must be in [0, 1.2]');

  let bumper = null;
  if (s.bumper) {
    const b = s.bumper;
    const at = b.at ?? 0;
    const bDur = b.dur ?? 1.3;
    if (!(at >= 0 && bDur >= 0.2 && at + bDur <= dur + 0.05)) fail(`${w}.bumper`, 'at/dur out of scene bounds');
    if (typeof b.head !== 'string' || !b.head.trim()) fail(`${w}.bumper.head`, 'must be non-empty string');
    const accent = b.accent ?? 'amber';
    if (!ACCENTS.has(accent)) fail(`${w}.bumper.accent`, `unknown accent "${accent}"`);
    bumper = { at, dur: bDur, tag: String(b.tag ?? ''), head: b.head.trim(), sub: String(b.sub ?? ''), accent };
  }

  const captions = (s.captions ?? []).map((c, k) => {
    const cw = `${w}.captions[${k}]`;
    if (typeof c?.head !== 'string' || !c.head.trim()) fail(`${cw}.head`, 'must be non-empty string');
    const at = c.at ?? 0.15;
    const cDur = c.dur ?? Math.max(0.35, dur - at - 0.12);
    if (!(at >= 0 && cDur >= 0.25 && at + cDur <= dur + 0.05)) fail(cw, `at+dur (${at}+${cDur}) exceeds scene dur ${dur}`);
    const align = c.align ?? 'left';
    const accent = c.accent ?? 'amber';
    if (!ALIGNS.has(align)) fail(`${cw}.align`, 'must be left|right|center');
    if (!ACCENTS.has(accent)) fail(`${cw}.accent`, `unknown accent "${accent}"`);
    return { n: c.n ? String(c.n) : '', tag: String(c.tag ?? ''), head: c.head.trim(), sub: String(c.sub ?? ''), at, dur: cDur, align, accent };
  });

  const pills = (s.pills ?? []).map((p, k) => {
    const pw = `${w}.pills[${k}]`;
    if (!Array.isArray(p?.items) || !p.items.length) fail(`${pw}.items`, 'must be non-empty string[]');
    const at = p.at ?? 0.2;
    const pDur = p.dur ?? Math.max(0.35, dur - at - 0.12);
    if (!(at >= 0 && pDur >= 0.25 && at + pDur <= dur + 0.05)) fail(pw, 'at+dur exceeds scene dur');
    const pos = p.pos ?? 'top-left';
    const accent = p.accent ?? 'phosphor';
    if (!PILL_POS.has(pos)) fail(`${pw}.pos`, `unknown pos "${pos}"`);
    if (!ACCENTS.has(accent)) fail(`${pw}.accent`, `unknown accent "${accent}"`);
    return { at, dur: pDur, pos, accent, items: p.items.map(String) };
  });

  const bursts = (s.bursts ?? []).map((b, k) => {
    const bw = `${w}.bursts[${k}]`;
    if (typeof b?.text !== 'string' || !b.text.trim()) fail(`${bw}.text`, 'must be non-empty string');
    const at = b.at ?? 0.25;
    const bDur = b.dur ?? 1.0;
    if (!(at >= 0 && bDur >= 0.2 && at + bDur <= dur + 0.05)) fail(bw, 'at+dur exceeds scene dur');
    const pos = b.pos ?? 'top-right';
    const accent = b.accent ?? 'amber';
    if (!BURST_POS.has(pos)) fail(`${bw}.pos`, `unknown pos "${pos}"`);
    if (!ACCENTS.has(accent)) fail(`${bw}.accent`, `unknown accent "${accent}"`);
    return { at, dur: bDur, text: b.text.trim(), pos, accent };
  });

  const dialogs = (s.dialogs ?? []).map((d, k) => {
    const dw = `${w}.dialogs[${k}]`;
    if (typeof d?.title !== 'string' || !d.title.trim()) fail(`${dw}.title`, 'must be non-empty string');
    if (!Array.isArray(d.rows) || d.rows.length < 1 || d.rows.length > 5) fail(`${dw}.rows`, 'must have 1..5 rows');
    const at = d.at ?? 0.2;
    const dDur = d.dur ?? Math.max(0.4, dur - at - 0.15);
    if (!(at >= 0 && dDur >= 0.3 && at + dDur <= dur + 0.05)) fail(dw, 'at+dur exceeds scene dur');
    const pos = d.pos ?? 'right';
    const accent = d.accent ?? 'amber';
    if (!DIALOG_POS.has(pos)) fail(`${dw}.pos`, `unknown pos "${pos}"`);
    if (!ACCENTS.has(accent)) fail(`${dw}.accent`, `unknown accent "${accent}"`);
    const rows = d.rows.map((r, ri) => {
      if (Array.isArray(r) && r.length === 2) return { label: String(r[0]), text: String(r[1]) };
      if (r && typeof r === 'object' && typeof r.label === 'string' && typeof r.text === 'string') return { label: r.label, text: r.text };
      fail(`${dw}.rows[${ri}]`, 'must be [label, text] or { label, text }');
    });
    const stats = (d.stats ?? []).map((st, si) => {
      if (Array.isArray(st) && st.length === 2) return { value: String(st[0]), label: String(st[1]) };
      if (st && typeof st === 'object' && typeof st.value === 'string' && typeof st.label === 'string') return { value: st.value, label: st.label };
      fail(`${dw}.stats[${si}]`, 'must be [value, label] or { value, label }');
    });
    return { at, dur: dDur, pos, accent, kicker: String(d.kicker ?? ''), title: d.title.trim(), rows, stats, foot: String(d.foot ?? '') };
  });

  const shots = (s.shots ?? []).map((sh, k) => {
    const sw = `${w}.shots[${k}]`;
    if (!sh?.file) fail(`${sw}.file`, 'required');
    const abs = path.resolve(specDir, sh.file);
    if (!fs.existsSync(abs)) fail(`${sw}.file`, `not found: ${abs}`);
    const at = sh.at ?? 0.25;
    const shDur = sh.dur ?? Math.max(0.3, dur - at - 0.2);
    if (!(at >= 0 && shDur > 0.2 && at + shDur <= dur + 0.05)) fail(sw, 'at+dur exceeds scene dur');
    const fit = sh.fit ?? 'contain';
    const pos = sh.pos ?? 'right';
    if (!FITS.has(fit)) fail(`${sw}.fit`, 'must be contain|cover');
    if (!SHOT_POS.has(pos)) fail(`${sw}.pos`, `unknown pos "${pos}"`);
    return { abs, name: `s${sceneIndex}_sh${k}_${path.basename(abs)}`, label: String(sh.label ?? path.basename(abs)), at, dur: shDur, fit, pos };
  });

  let card = null;
  if (s.card) {
    if (!Array.isArray(s.card.title) || !s.card.title.length) fail(`${w}.card.title`, 'must be [line1, line2?]');
    if (typeof s.card.cta !== 'string' || !s.card.cta.trim()) fail(`${w}.card.cta`, 'required');
    const at = s.card.at ?? 0;
    if (!(at >= 0 && at < dur)) fail(`${w}.card.at`, `must be in [0, ${dur})`);
    card = {
      at,
      eyebrow: String(s.card.eyebrow ?? ''),
      title: s.card.title.map(String),
      sub: String(s.card.sub ?? ''),
      steps: (s.card.steps ?? []).map(String),
      cta: s.card.cta.trim(),
      foot: String(s.card.foot ?? ''),
    };
  }

  return { transition: { type: tr.type, dur: trDur }, bumper, captions, pills, bursts, dialogs, shots, card };
}

function normalizeScene(s, i, { chapter, root, specDir }) {
  const w = `scenes[${i}]`;
  if (!s || typeof s !== 'object') fail(w, 'must be an object');
  const id = String(s.id || `s${i + 1}`);
  if (!SLUG_RX.test(id)) fail(`${w}.id`, `"${id}" must be a slug`);
  const dur = s.dur ?? 4;
  if (!(typeof dur === 'number' && dur >= 0.5 && dur <= 45)) fail(`${w}.dur`, 'must be in [0.5, 45]');
  const mode = s.mode ?? 'play';
  if (!MODES.has(mode)) fail(`${w}.mode`, `"${mode}" must be in ${[...MODES].join('|')}`);

  let targetUrl;
  let comix = null;
  let storybook = null;
  let laptop = null;
  let scrollY = null;
  let skin = null;
  let setup = [];

  if (mode === 'play') {
    const rawUrl = s.url ?? `/play/{chapter}/{level:${s.level ?? 1}}?nointro=1`;
    targetUrl = resolvePlaceholders(rawUrl, chapter);
    if (s.skin != null) {
      if (!SKINS.has(s.skin)) fail(`${w}.skin`, `must be in ${[...SKINS].join('|')}`);
      skin = s.skin;
    }
    setup = expandSetupSteps(s.setup, chapter, `${w}.setup`);
  } else if (mode === 'comix') {
    const cx = s.comix ?? {};
    const slug = String(cx.slug || 'intro');
    if (!SLUG_RX.test(slug)) fail(`${w}.comix.slug`, 'invalid comix slug');
    const from = cx.from ?? 0;
    const to = cx.to ?? from + dur;
    if (!(typeof from === 'number' && typeof to === 'number' && from >= 0 && to >= from)) fail(`${w}.comix`, 'requires 0 <= from <= to');
    const rank = cx.rank ? `&rank=${encodeURIComponent(cx.rank)}` : '';
    comix = { slug, from, to, rank: cx.rank ?? null };
    targetUrl = `/cinematic.html?play=${encodeURIComponent(slug)}&t=${from.toFixed(3)}&muted=1&skippable=0${rank}`;
  } else if (mode === 'storybook') {
    const sb = s.storybook ?? {};
    if (typeof sb.inspect !== 'string' || !sb.inspect.trim()) fail(`${w}.storybook.inspect`, 'must name a model/texture/fx id');
    const from = sb.from ?? 0;
    const to = sb.to ?? from + dur;
    if (!(typeof from === 'number' && typeof to === 'number' && from >= 0 && to >= from)) fail(`${w}.storybook`, 'requires 0 <= from <= to');
    storybook = {
      inspect: sb.inspect.trim(),
      tab: sb.tab ?? 'models',
      state: sb.state ?? 'normal',
      bg: sb.bg ?? 'floor1',
      from,
      to,
      pixel: sb.pixel !== false,
      crt: sb.crt !== false,
      lantern: Boolean(sb.lantern),
      flash: Boolean(sb.flash),
      guides: Boolean(sb.guides),
      ui: Boolean(sb.ui),
    };
    const qs = new URLSearchParams({
      inspect: storybook.inspect,
      tab: storybook.tab,
      state: storybook.state,
      bg: storybook.bg,
      pixel: storybook.pixel ? '1' : '0',
      crt: storybook.crt ? '1' : '0',
      lantern: storybook.lantern ? '1' : '0',
      flash: storybook.flash ? '1' : '0',
      guides: storybook.guides ? '1' : '0',
      ui: storybook.ui ? '1' : '0',
      t: from.toFixed(3),
    });
    targetUrl = `/storybook.html?${qs.toString()}`;
  } else if (mode === 'laptop') {
    const lp = s.laptop ?? {};
    const state = String(lp.state ?? 'desktop');
    const speed = typeof lp.speed === 'number' ? lp.speed : 0;
    const task = lp.task != null ? String(lp.task).trim() : null;
    if (task !== null && !SLUG_RX.test(task)) fail(`${w}.laptop.task`, 'must be a valid task slug');
    laptop = { state, speed, ui: Boolean(lp.ui), task };
    targetUrl = `/laptop-lab?state=${encodeURIComponent(state)}&speed=${speed}&mute=1`;
  } else {
    const pg = s.page ?? {};
    targetUrl = resolvePlaceholders(pg.url ?? s.url ?? '/', chapter);
    const rawScroll = pg.scrollY ?? s.scrollY;
    if (typeof rawScroll === 'number') scrollY = [rawScroll, rawScroll];
    else if (isRange2(rawScroll)) scrollY = [rawScroll[0], rawScroll[1]];
    else if (rawScroll != null) fail(`${w}.scrollY`, 'must be a number or [fromY, toY]');
  }

  const events = (s.events ?? []).map((ev, k) => {
    const ew = `${w}.events[${k}]`;
    if (!ev || typeof ev !== 'object') fail(ew, 'must be an object');
    if (!(typeof ev.t === 'number' && ev.t >= 0 && ev.t < dur)) fail(`${ew}.t`, `must be in [0, ${dur})`);
    if (!EVENT_DOS.has(ev.do)) fail(`${ew}.do`, `"${ev.do}" not in ${[...EVENT_DOS].join('|')}`);
    if (ev.do === 'type' && (typeof ev.text !== 'string' || !ev.text.length)) fail(`${ew}.text`, 'required');
    if ((ev.do === 'submit' || ev.do === 'typeAndSubmit') && typeof ev.line !== 'string') fail(`${ew}.line`, 'required');
    if (ev.do === 'modal' && (!MODALS.has(ev.modal) || !['open', 'close'].includes(ev.action ?? 'open'))) fail(`${ew}.modal`, 'invalid modal/action');
    if (ev.do === 'skin' && !SKINS.has(ev.skin)) fail(`${ew}.skin`, `unknown skin "${ev.skin}"`);
    return {
      ...ev,
      ...(ev.line ? { line: resolvePlaceholders(ev.line, chapter) } : {}),
      ...(ev.text ? { text: resolvePlaceholders(ev.text, chapter) } : {}),
    };
  });

  const sfx = (s.sfx ?? []).map((c, k) => normalizeSfxCue(c, `${w}.sfx[${k}]`, dur, root, specDir));
  const overlays = normalizeOverlays(s, w, dur, specDir, i);

  return {
    id,
    dur,
    mode,
    url: targetUrl,
    skin,
    setup,
    settleMs: typeof s.settleMs === 'number' && s.settleMs >= 0 ? s.settleMs : (mode === 'play' ? 700 : 500),
    comix,
    storybook,
    laptop,
    scrollY,
    events,
    sfx,
    ...overlays,
  };
}

export function readVideoSpec(specPath, { root = projectRoot } = {}) {
  const { specDir, raw } = loadJsonSpec(specPath);

  if (!raw.name || !SLUG_RX.test(raw.name)) fail('name', 'must be a simple slug');
  const platform = raw.platform ?? 'x';
  if (!PLATFORMS.has(platform)) fail('platform', `"${platform}" must be in ${[...PLATFORMS].join('|')}`);
  const fps = raw.fps ?? 24;
  if (!Number.isInteger(fps) || fps < 12 || fps > 60) fail('fps', 'must be an integer in [12, 60]');
  const look = raw.look ?? (platform === 'tiktok' || platform === 'shorts' ? 'vertical' : 'comix');
  if (!LOOKS.has(look)) fail('look', `"${look}" must be in ${[...LOOKS].join('|')}`);
  const crop = raw.crop ?? null;
  if (crop != null && !CROPS.has(crop)) fail('crop', `"${crop}" must be square|vertical`);

  const portraitDefault = look === 'vertical' || (crop === 'vertical' && raw.width == null && raw.height == null) || ((platform === 'tiktok' || platform === 'shorts') && raw.width == null && raw.height == null);
  const width = raw.width ?? (portraitDefault ? 1080 : 1280);
  const height = raw.height ?? (portraitDefault ? 1920 : 720);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || height < 240) fail('dimensions', 'width/height must be integers >= 240');

  const maxSeconds = raw.maxSeconds ?? 30;
  if (!(typeof maxSeconds === 'number' && maxSeconds >= 1 && maxSeconds <= 180)) fail('maxSeconds', 'must be in [1, 180]');
  const seed = Number.isInteger(raw.seed) ? raw.seed : 1995;
  const gif = { maxMB: 15, width: portraitDefault ? 420 : 600, fps: 12, ...raw.gif };

  const chapter = loadChapter(root, raw.chapter);
  if (!Array.isArray(raw.scenes) || !raw.scenes.length) fail('scenes', 'need at least one scene');
  const scenes = raw.scenes.map((s, i) => normalizeScene(s, i, { chapter, root, specDir }));

  let t = 0;
  const sceneSfx = [];
  for (const s of scenes) {
    s.t0 = +t.toFixed(6);
    s.t1 = +(t + s.dur).toFixed(6);
    for (const c of s.sfx) sceneSfx.push({ ...c, at: +(s.t0 + c.at).toFixed(4) });
    t += s.dur;
  }
  const total = +t.toFixed(6);
  if (total > maxSeconds + 1e-6) fail('scenes', `total duration ${total.toFixed(2)}s exceeds maxSeconds (${maxSeconds}s)`);

  const audio = normalizeAudioConfig(raw.audio, sceneSfx, total, root, specDir);
  return {
    name: raw.name,
    platform,
    fps,
    width,
    height,
    maxSeconds,
    total,
    seed,
    gif,
    look,
    crop,
    chapterId: chapter.id,
    ticker: raw.ticker === false ? '' : String(raw.ticker ?? 'OUT OF CREDITS  ·  1995 COMIX ZONE TERMINAL DUNGEON CRAWLER  ·  REAL UNIX & JS LAPTOP  ·  PLAY FREE & WISHLIST ON STEAM'),
    badge: raw.badge === false ? '' : String(raw.badge ?? 'ISSUE #1 · KIROWEEN'),
    scenes,
    specDir,
    audio,
  };
}

export function readScreenshotsSpec(specPath, { root = projectRoot } = {}) {
  const { specDir, raw } = loadJsonSpec(specPath);
  const width = raw.width ?? 1920;
  const height = raw.height ?? 1080;
  const fps = raw.fps ?? 24;
  const seed = Number.isInteger(raw.seed) ? raw.seed : 1995;
  if (!Array.isArray(raw.shots) || !raw.shots.length) fail('shots', 'must be a non-empty array');
  const chapter = loadChapter(root, raw.chapter);
  const seen = new Set();
  let t = 0;
  const shots = raw.shots.map((sh, i) => {
    if (!sh?.id || !SLUG_RX.test(sh.id)) fail(`shots[${i}].id`, 'must be a unique slug');
    if (seen.has(sh.id)) fail(`shots[${i}].id`, `duplicate id "${sh.id}"`);
    seen.add(sh.id);
    if (typeof sh.title !== 'string' || !sh.title.trim()) fail(`shots[${i}].title`, 'required');
    const norm = normalizeScene({ ...sh, dur: sh.dur ?? 3.0 }, i, { chapter, root, specDir });
    const captureAt = sh.captureAt ?? +(norm.dur * 0.75).toFixed(3);
    if (!(captureAt >= 0 && captureAt <= norm.dur)) fail(`shots[${i}].captureAt`, `must be in [0, ${norm.dur}]`);
    norm.t0 = +t.toFixed(6);
    norm.t1 = +(t + norm.dur).toFixed(6);
    t += norm.dur;
    return { ...norm, title: sh.title.trim(), captureAt, overlay: Boolean(sh.overlay) };
  });
  return { width, height, fps, seed, chapterId: chapter.id, shots };
}

export function readInfographicsSpec(specPath) {
  const { raw } = loadJsonSpec(specPath);
  const width = raw.width ?? 1920, height = raw.height ?? 1080, dpr = raw.dpr ?? 1.5;
  if (!Array.isArray(raw.cards) || !raw.cards.length) fail('cards', 'must be a non-empty array');
  const seen = new Set();
  const cards = raw.cards.map((c, i) => {
    const cw = `cards[${i}]`;
    if (!c?.id || !SLUG_RX.test(c.id)) fail(`${cw}.id`, 'must be a slug');
    if (seen.has(c.id)) fail(`${cw}.id`, `duplicate card id "${c.id}"`);
    seen.add(c.id);
    for (const k of ['num', 'category', 'kicker', 'title', 'subtitle', 'footer']) {
      if (typeof c[k] !== 'string' || !c[k].trim()) fail(`${cw}.${k}`, 'must be non-empty string');
    }
    const accent = c.accent ?? 'amber';
    if (!ACCENTS.has(accent)) fail(`${cw}.accent`, `unknown accent "${accent}"`);
    if (!c.diagram || !DIAGRAM_KINDS.has(c.diagram.kind) || !Array.isArray(c.diagram.nodes) || c.diagram.nodes.length < 2 || c.diagram.nodes.length > 5) {
      fail(`${cw}.diagram`, `requires kind in ${[...DIAGRAM_KINDS].join('|')} and 2..5 nodes`);
    }
    if (!Array.isArray(c.callouts) || c.callouts.length !== 3) fail(`${cw}.callouts`, 'must have exactly 3 callouts');
    if (!Array.isArray(c.metrics) || c.metrics.length !== 4) fail(`${cw}.metrics`, 'must have exactly 4 KPI metrics');
    const nodes = c.diagram.nodes.map((n, ni) => (!n?.label || !n?.sub) ? fail(`${cw}.diagram.nodes[${ni}]`, 'requires label & sub') : { label: String(n.label), sub: String(n.sub), tag: String(n.tag ?? `0${ni + 1}`) });
    const callouts = c.callouts.map((cl, ci) => (!cl?.head || !cl?.body) ? fail(`${cw}.callouts[${ci}]`, 'requires head & body') : { head: String(cl.head), body: String(cl.body) });
    const metrics = c.metrics.map((m, mi) => (!m?.value || !m?.label) ? fail(`${cw}.metrics[${mi}]`, 'requires value & label') : { value: String(m.value), label: String(m.label) });
    return {
      id: c.id, num: c.num.trim(), category: c.category.trim(), kicker: c.kicker.trim(),
      title: c.title.trim(), subtitle: c.subtitle.trim(), accent,
      screenshot: c.screenshot ? String(c.screenshot) : null,
      diagram: { kind: c.diagram.kind, caption: String(c.diagram.caption ?? ''), nodes },
      callouts, metrics, footer: c.footer.trim(),
    };
  });
  return { width, height, dpr, cards };
}

export function readSocialAudioSpec(specPath) {
  const { raw } = loadJsonSpec(specPath);
  if (!Array.isArray(raw.cues) || !raw.cues.length) fail('audio-cues.cues', 'must be a non-empty array');
  const seen = new Set();
  const cues = raw.cues.map((c, i) => {
    const cw = `audio-cues[${i}]`;
    if (!c?.id || !CUE_RX.test(c.id)) fail(`${cw}.id`, 'must be snake_case letters, digits and _');
    if (seen.has(c.id)) fail(`${cw}.id`, `duplicate cue "${c.id}"`);
    seen.add(c.id);
    if (!AUDIO_KINDS.has(c.kind)) fail(`${cw}.kind`, 'must be voice|sfx|music');
    if (typeof c.seconds !== 'number' || c.seconds < 0.5 || c.seconds > 180) fail(`${cw}.seconds`, 'must be in [0.5, 180]');
    if (c.kind === 'voice' && (typeof c.voice !== 'string' || !c.voice.trim() || typeof c.text !== 'string' || !c.text.trim())) fail(cw, 'voice & text required');
    if (c.kind !== 'voice' && (typeof c.prompt !== 'string' || !c.prompt.trim())) fail(`${cw}.prompt`, 'prompt required for sfx/music');
    const defModel = c.kind === 'voice' ? 'eleven_v4' : c.kind === 'music' ? 'music_v2_5' : 'eleven_text_to_sound_v3';
    return {
      id: c.id, kind: c.kind, platform: String(c.platform ?? 'all'), description: String(c.description ?? ''),
      seconds: c.seconds, loop: Boolean(c.loop), voice: c.voice ? String(c.voice) : null,
      model: String(c.model ?? defModel), filter: c.filter ? String(c.filter) : null,
      text: c.text ? String(c.text) : null, prompt: c.prompt ? String(c.prompt) : null,
    };
  });
  return { cues };
}

/** Offline check (`social-media.mjs --check`): validates all specs & research JSON with zero network calls. */
export function checkSocialSpecs(root = projectRoot) {
  const problems = [];
  const specsDir = path.join(root, 'social/media/specs');
  if (!fs.existsSync(specsDir)) return ['social/media/specs directory is missing'];

  const files = fs.readdirSync(specsDir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) problems.push('social/media/specs has no .json specs');

  let shotIds = new Set();
  for (const file of files) {
    const full = path.join(specsDir, file);
    try {
      if (file === 'screenshots.spec.json') {
        const sp = readScreenshotsSpec(full, { root });
        shotIds = new Set(sp.shots.map((s) => `${s.id}.png`));
      } else if (file === 'infographics.spec.json') {
        readInfographicsSpec(full);
      } else if (file === 'audio-cues.json') {
        readSocialAudioSpec(full);
      } else {
        readVideoSpec(full, { root });
      }
    } catch (err) {
      problems.push(`${path.relative(root, full)}: ${err.message}`);
    }
  }

  const igPath = path.join(specsDir, 'infographics.spec.json');
  if (fs.existsSync(igPath) && shotIds.size) {
    try {
      const ig = readInfographicsSpec(igPath);
      for (const card of ig.cards) {
        if (card.screenshot && !shotIds.has(card.screenshot)) {
          problems.push(`infographics.spec.json/${card.id}: references unknown screenshot "${card.screenshot}"`);
        }
      }
    } catch { /* already reported above */ }
  }

  const researchPath = path.join(root, 'social/research/competitors-and-benchmarks.json');
  if (!fs.existsSync(researchPath)) {
    problems.push('social/research/competitors-and-benchmarks.json is missing');
  } else {
    try {
      const r = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
      if (r.revenueTargetUsd !== 1000000) problems.push('competitors-and-benchmarks.json: revenueTargetUsd must be 1000000');
      if (!Array.isArray(r.comparables) || r.comparables.length < 8) problems.push('competitors-and-benchmarks.json: needs >= 8 Steam comparables');
      for (const p of ['x', 'tiktok', 'youtube']) {
        if (!r.platformPlaybooks?.[p]?.winningFormats?.length) problems.push(`competitors-and-benchmarks.json: missing platformPlaybooks.${p}`);
      }
    } catch (err) {
      problems.push(`competitors-and-benchmarks.json: ${err.message}`);
    }
  }
  return problems;
}
