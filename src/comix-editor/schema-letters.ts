import { b, n, opt, sel, t, type Field } from '../editor-core/schema.js';
import type { PageOverlay, PanelLetter } from '../cinematic/spec-types.js';
import { colorField as col, ptRefField as ptRef, timeField as time } from './schema-fields.js';

const SFX_FIELDS: Field[] = [
  t('text', 'Onomatopoeia'),
  time('at', 'Appear at'),
  n('hold', 'Hold (s)', { step: 0.1 }),
  col('color', 'Colour'),
  n('tilt', 'Tilt (deg)', { step: 1 }),
  sel('anchor', 'Placement mode', ['frac', 'point']),
  opt(n('x', 'Panel X (0..1, frac mode)', { step: 0.02 })),
  opt(n('y', 'Panel Y (0..1, frac mode)', { step: 0.02 })),
  opt(ptRef('point', 'Stage point (point mode)')),
  opt(n('dx', 'Point offset dX (panel frac)', { step: 0.01 })),
  opt(n('dy', 'Point offset dY (panel frac)', { step: 0.01 })),
  n('size', 'Font size (fraction of panel min)', { step: 0.01 }),
  opt(b('activePanelOnly', 'Only draw while panel is active')),
  opt(b('freezeOnCut', 'Keep frozen word after cut')),
];

const SFX_SEQ_FIELDS: Field[] = [
  { type: 'strings', key: 'words', label: 'Words (one per line)', rows: 4 },
  { type: 'numbers', key: 'tilts', label: 'Tilts in degrees (comma separated)' },
  time('from', 'First word at'),
  n('step', 'Step between words (s)', { step: 0.1 }),
  n('hold', 'Hold per word (s)', { step: 0.1 }),
  opt(n('lastHold', 'Hold on last word (s)', { step: 0.5 })),
  col('color', 'Colour'),
  ptRef('point', 'Anchor point'),
  n('dx', 'Base dX', { step: 0.01 }),
  n('dy', 'Base dY', { step: 0.01 }),
  n('dxStep', 'Step dX', { step: 0.01 }),
  n('dyStep', 'Step dY', { step: 0.01 }),
  n('dxMod', 'Modulo X'),
  n('dyMod', 'Modulo Y'),
  n('size', 'Font size (panel min frac)', { step: 0.005 }),
  opt(b('activePanelOnly', 'Only update while panel is active')),
  opt(b('freezeOnCut', 'Keep frozen after cut')),
];

const BUBBLE_FIELDS: Field[] = [
  t('text', 'Dialogue line', { rows: 2 }),
  time('at', 'Appear at'),
  opt(time('until', 'Hide at')),
  sel('style', 'Bubble shape', ['speech', 'shout', 'thought']),
  opt(col('fill', 'Fill colour')),
  opt(b('activePanelOnly', 'Only while panel is active')),
  opt(b('freezeOnCut', 'Keep frozen after cut', { defaultTrue: true })),
  sel('anchor', 'Anchor mode', ['panel', 'world']),
  n('x', 'X (panel 0..1 or world dX)', { step: 0.02 }),
  n('y', 'Y (panel 0..1 or world dY)', { step: 0.02 }),
  opt(n('w', 'Width (panel 0..1)', { step: 0.02 })),
  opt(n('wChars', 'Max width in em/chars', { step: 1 })),
  opt(n('yFloor', 'Min top in font multiples', { step: 0.1 })),
  opt(n('minXChars', 'Min left in font multiples', { step: 0.5 })),
  n('fontH', 'Font height factor', { step: 0.005 }),
  n('fontW', 'Font width factor', { step: 0.005 }),
  n('minFont', 'Min font px', { step: 1 }),
  opt(n('fontOfMin', 'Font of min(w,h) override', { step: 0.005 })),
  opt(n('fontScale', 'Font scale multiplier', { step: 0.05 })),
  opt(t('tailActor', 'Tail actor id (live)', { suggest: 'actors', mono: true })),
  opt(ptRef('tailPoint', 'Tail world point')),
  opt(n('tailLift', 'Tail lift on actor', { step: 0.05 })),
  opt(n('tailZ', 'Tail Z on actor', { step: 0.05 })),
  opt(n('tailDx', 'Tail dX (world mode)', { step: 0.01 })),
  opt(n('tailDy', 'Tail dY (world mode)', { step: 0.01 })),
];

const STATS_CARD_FIELDS: Field[] = [
  t('title', 'Heading'),
  time('at', 'Show card at'),
  time('keyAt', 'Show press-key prompt at'),
  { type: 'record', key: 'rankColor', label: 'Rank burst colours', keyLabel: 'Rank', value: 'string' },
  { type: 'record', key: 'rankWord', label: 'Rank titles', keyLabel: 'Rank', value: 'string' },
  {
    type: 'object',
    key: 'labels',
    label: 'Field labels',
    fields: [
      t('rank', 'Rank label'),
      t('time', 'Time label'),
      t('commands', 'Commands label'),
      t('shortcuts', 'Shortcuts label'),
      t('press', 'Continue prompt'),
    ],
  },
  t('emptyShortcuts', 'Empty shortcuts text'),
  col('fallbackBackground', 'No-WebGL fallback background'),
];

export const LETTER_VARIANTS = (): Record<PanelLetter['kind'], Field[]> => ({
  caption: [
    t('text', 'Caption text', { rows: 2 }),
    time('from', 'Start'),
    opt(time('until', 'Hide at')),
    n('typeDur', 'Typewriter duration (s)', { step: 0.05 }),
    opt(b('mono', 'Monospace paper style')),
    opt(sel('position', 'Position', ['top', 'bottom'])),
    opt(t('maxWidth', 'Max width CSS (e.g. 46cqw)', { mono: true })),
  ],
  banner: [
    t('text', 'Banner text', { rows: 2 }),
    time('at', 'Appear at'),
    opt(time('until', 'Hide at')),
    sel('edge', 'Edge', ['top', 'bottom']),
  ],
  sfx: SFX_FIELDS,
  sfx_seq: SFX_SEQ_FIELDS,
  bubble: BUBBLE_FIELDS,
  label_tag: [
    t('text', 'Tag label'),
    time('at', 'Appear at'),
    opt(time('until', 'Hide at')),
    ptRef('point', 'World point'),
    opt(b('activePanelOnly', 'Only while panel is active')),
    opt(b('freezeOnCut', 'Keep frozen after cut', { defaultTrue: true })),
  ],
  prompt_list: [
    t('title', 'Header prefix'),
    n('baseCount', 'Starting counter'),
    time('from', 'Start at'),
    n('every', 'New item every (s)', { step: 0.05 }),
    { type: 'strings', key: 'items', label: 'Prompts (one per line)', rows: 6 },
  ],
  glitch_text: [
    time('from', 'Start at'),
    n('step', 'Step per line (s)', { step: 0.05 }),
    { type: 'strings', key: 'texts', label: 'Progressive lines (one per line)', rows: 4 },
    opt(b('jitter', 'Jitter while active')),
  ],
  tier_stack: [
    time('from', 'Start at'),
    n('step', 'Reveal step (s)', { step: 0.05 }),
    {
      type: 'array',
      key: 'rows',
      label: 'Rows',
      item: {
        title: (r) => `${String(r.who)}: ${String(r.what)}`,
        fields: [
          t('who', 'Speaker badge'),
          t('what', 'Doctrine text'),
          t('bg', 'CSS background (hex or gradient)', { mono: true }),
          n('glow', 'Brain glow tier (0..3)'),
        ],
      },
    },
  ],
  panel_flash: [
    time('at', 'Flash at'),
    n('dur', 'Duration (s)', { step: 0.01 }),
    n('opacity', 'Peak opacity (0..1)', { step: 0.05 }),
    opt(n('fade', 'Fade tail (s)', { step: 0.02 })),
    opt(n('fadeFrom', 'Fade start opacity', { step: 0.05 })),
    opt(b('hold', 'Hold flash opacity after peak')),
    opt(b('activePanelOnly', 'Only while panel is active')),
  ],
  invert: [
    time('at', 'Reference cue'),
    n('fromOffset', 'Invert start offset (s)', { step: 0.01 }),
    n('toOffset', 'Invert end offset (s)', { step: 0.01 }),
  ],
  stats_card: STATS_CARD_FIELDS,
});

export const OVERLAY_VARIANTS = (): Record<PageOverlay['kind'], Field[]> => ({
  title_card: [
    time('at', 'Appear at'),
    t('title', 'Big card title'),
    t('subtitle', 'Typed terminal subtitle', { mono: true }),
    time('typeFrom', 'Type start'),
    time('typeTo', 'Type end'),
    time('fadeFrom', 'Fade start'),
    time('fadeTo', 'Fade end'),
  ],
});

export function letterTitle(l: Record<string, unknown>): string {
  const detail = l.text ?? l.title ?? (Array.isArray(l.words) ? l.words.join(' ') : '') ?? '';
  const when = l.at ?? l.from ?? '';
  return `${String(l.kind)}${when !== '' ? ` @ ${String(when)}` : ''}${detail ? ` — ${String(detail).slice(0, 52)}` : ''}`;
}
