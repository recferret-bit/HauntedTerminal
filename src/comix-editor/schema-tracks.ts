import { b, n, opt, sel, t, type Field } from '../chapter-editor/schema.js';
import type { AudioCue, EaseName, PanelBeat, SceneTrack, StageFixtureSpec } from '../cinematic/spec-types.js';
import { ANIM_STATE_IDS } from '../procgen/anim/states.js';
import { ZONE_IDS } from '../procgen/core/palette.js';
import { ACTOR_WINDOW_FIELDS, FX_TARGET_FIELDS, ptRefField as ptRef, timeField as time } from './schema-fields.js';

const EASES: readonly EaseName[] = ['linear', 'in', 'out', 'outBack'];
const AUDIO_CUES: readonly AudioCue[] = ['rain_on', 'rain_off', 'thunder', 'distant_thunder', 'burst', 'shatter', 'zap'];

export const FIXTURE_VARIANTS = (): Record<StageFixtureSpec['kind'], Field[]> => ({
  rain: [
    t('id', 'Fixture id', { mono: true }),
    n('x', 'Centre X', { step: 0.05 }),
    n('y', 'Centre Y', { step: 0.05 }),
    n('w', 'Width', { step: 0.05 }),
    n('h', 'Height', { step: 0.05 }),
    n('z', 'Z depth', { step: 0.01 }),
    opt(n('drops', 'Drop count')),
  ],
  bolt: [
    t('id', 'Fixture id', { mono: true }),
    sel('style', 'Bolt style', ['bolt', 'comic']),
    ptRef('from', 'From point'),
    ptRef('to', 'To point'),
    opt(n('seed', 'Deterministic seed')),
  ],
  vortex: [
    t('id', 'Fixture id', { mono: true }),
    ptRef('at', 'Centre point'),
    n('z', 'Z depth', { step: 0.01 }),
    n('w', 'Width', { step: 0.02 }),
    n('h', 'Height', { step: 0.02 }),
  ],
});

export const BEAT_VARIANTS = (): Record<PanelBeat['kind'], Field[]> => ({
  lightning: [
    time('at', 'Strike at'),
    ptRef('point', 'Target point'),
    n('power', 'Bolt power (0 = flash only)', { step: 0.1 }),
    n('flash', 'Flash strength', { step: 0.1 }),
    opt(sel('audio', 'Thunder audio', ['distant', 'thunder'])),
  ],
  fx: [
    time('at', 'Fire at'),
    ...FX_TARGET_FIELDS,
    opt(t('text', 'Pop-up comic text')),
  ],
  fx_repeat: [
    time('at', 'Start at'),
    n('step', 'Repeat step (s)', { step: 0.05 }),
    n('count', 'Count'),
    ...FX_TARGET_FIELDS,
  ],
  arc: [
    time('at', 'Arc at'),
    ptRef('from', 'From point'),
    ptRef('to', 'To point'),
    opt(n('flash', 'Flash strength', { step: 0.05 })),
  ],
  look: [
    time('at', 'Look at'),
    { type: 'strings', key: 'actors', label: 'Actor ids (one per line)', rows: 2 },
    n('x', 'Look X (-1..1)', { step: 0.1 }),
    n('y', 'Look Y (-1..1)', { step: 0.1 }),
  ],
  state: [
    time('at', 'Trigger at'),
    { type: 'strings', key: 'actors', label: 'Actor ids (one per line)', rows: 2 },
    sel('state', 'Animator state', ANIM_STATE_IDS),
  ],
  audio: [
    time('at', 'Play at'),
    sel('cue', 'Sound cue', AUDIO_CUES),
    opt(n('seconds', 'Duration (s, zap)', { step: 0.1 })),
    opt(b('reverse', 'Reverse sweep (zap)')),
  ],
  key_clicks: [
    time('from', 'Start at'),
    time('until', 'Stop at'),
    n('hz', 'Ticks per second', { step: 1 }),
    n('chance', 'Click probability (0..1)', { step: 0.05 }),
  ],
});

export const TRACK_VARIANTS = (): Record<SceneTrack['kind'], Field[]> => ({
  actor_visibility: [
    ...ACTOR_WINDOW_FIELDS,
    b('visible', 'Visible'),
    opt(b('hideWhenDead', 'Hide once death animation finishes')),
  ],
  actor_motion: [
    ...ACTOR_WINDOW_FIELDS,
    opt({ type: 'strings', key: 'span', label: 'Motion span [start, end] (2 lines)', rows: 2 }),
    ptRef('fromPos', 'Start position'),
    opt(ptRef('toPos', 'End position')),
    opt(sel('ease', 'Ease', EASES)),
    opt(n('steps', 'Stepped pose count')),
    opt(n('arc', 'Parabolic Y arc height', { step: 0.05 })),
    opt(n('scaleFrom', 'Uniform start scale', { step: 0.02 })),
    opt(n('scaleTo', 'Uniform end scale', { step: 0.02 })),
    opt({ type: 'numbers', key: 'stretchFrom', label: 'Non-uniform start [sx, sy]' }),
    opt({ type: 'numbers', key: 'stretchTo', label: 'Non-uniform end [sx, sy]' }),
    opt(n('rotZFrom', 'Start Z rotation (rad)', { step: 0.02 })),
    opt(n('rotZTo', 'End Z rotation (rad)', { step: 0.02 })),
    opt(sel('deform', 'Comic deform', ['none', 'stretch_to_target', 'squash_land'])),
    opt(b('hideWhenDead', 'Hide once death animation finishes')),
  ],
  actor_rig: [
    ...ACTOR_WINDOW_FIELDS,
    opt(n('typing', 'Left-arm typing weight (0..1)', { step: 0.1 })),
    opt(b('restRightArm', 'Rest right arm at side')),
    opt({ type: 'strings', key: 'hideParts', label: 'Hidden part prefixes (one per line)', rows: 2 }),
  ],
  part_visibility: [
    t('target', 'Target ("room" or actor id)', { suggest: 'actors', mono: true }),
    { type: 'strings', key: 'parts', label: 'Part prefixes (one per line)', rows: 2 },
    time('from', 'From'),
    opt(time('until', 'Until')),
    b('visible', 'Visible'),
  ],
  material_tint: [
    t('target', 'Target ("room" or actor id)', { suggest: 'actors', mono: true }),
    sel('zone', 'Palette zone', ZONE_IDS),
    time('from', 'From'),
    opt(time('until', 'Until')),
    { type: 'color', key: 'color', label: 'Base colour' },
    opt({ type: 'strings', key: 'glitchColors', label: 'Glitch swap colours (#hex, one per line)', rows: 2 }),
    opt(n('glitchHz', 'Glitch rate (Hz)', { step: 1 })),
  ],
  fixture: [
    t('fixture', 'Fixture id', { suggest: 'fixtures', mono: true }),
    time('from', 'From'),
    opt(time('until', 'Until')),
    opt(n('growDur', 'Grow-in duration (s, vortex)', { step: 0.05 })),
    opt(n('steps', 'Grow pose steps')),
    opt(n('flickerHz', 'Flicker Hz (bolt)')),
    opt(n('flickerEvery', 'Flicker period')),
    opt(n('flickerSkip', 'Flicker skip frame')),
    opt(n('settleAfter', 'Solid after (s)', { step: 0.02 })),
  ],
  stage_light: [
    ptRef('anchor', 'Flash light anchor'),
    time('from', 'From'),
    time('until', 'Until'),
    n('intensity', 'Start intensity', { step: 0.05 }),
    opt(n('intensityTo', 'End intensity', { step: 0.05 })),
    opt(sel('ease', 'Ramp ease', ['linear', 'quad', 'in', 'out'])),
    opt(n('blinkHz', 'Blink Hz')),
    opt(n('blinkAmp', 'Blink amplitude', { step: 0.05 })),
  ],
  camera_shake: [
    time('from', 'From'),
    time('until', 'Until'),
    n('amp', 'Start amplitude (world units)', { step: 0.005 }),
    opt(n('ampTo', 'End amplitude (default 0)', { step: 0.005 })),
  ],
  pixelate: [
    time('from', 'From'),
    time('until', 'Until'),
    n('sizeFrom', 'Start pixel size (px)', { step: 0.5 }),
    n('sizeTo', 'End pixel size (px)', { step: 0.5 }),
    opt(n('steps', 'Stepped levels')),
    opt(sel('ease', 'Ease', EASES)),
  ],
});

export function beatTitle(bItem: Record<string, unknown>): string {
  const when = bItem.at ?? `${String(bItem.from ?? '')}..${String(bItem.until ?? '')}`;
  const detail = bItem.preset ?? bItem.cue ?? bItem.point ?? (Array.isArray(bItem.actors) ? bItem.actors.join(',') : '');
  return `${String(bItem.kind)} @ ${String(when)}${detail ? ` (${String(detail)})` : ''}`;
}

export function trackTitle(tr: Record<string, unknown>): string {
  const who = tr.actor ?? tr.fixture ?? tr.target ?? '';
  const window = `${String(tr.from ?? '0')}..${String(tr.until ?? 'end')}`;
  return `${String(tr.kind)}${who ? ` [${String(who)}]` : ''} (${window})`;
}
