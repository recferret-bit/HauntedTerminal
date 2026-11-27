import type { RoomSocketId, StageLightMode } from '../contracts/room-view.js';
import { alt, b, n, nv3, opt, sel, type Field } from './schema.js';

export const ROOM_SOCKETS = ['door.left', 'door.right', 'door.down'] as const satisfies readonly RoomSocketId[];
const LIGHT_MODES = ['off', 'lantern', 'monitor', 'blacklight', 'neon', 'storm'] as const satisfies readonly StageLightMode[];

export function transformFields(opts: { includeY?: boolean; includeRotationZ?: boolean } = {}): Field[] {
  return [
    ...(opts.includeY ? [opt(n('y', 'Height above floor', { step: 0.1 }))] : []),
    opt(n('zOrder', 'Z order (0 = actors, <0 back, >0 front)', { step: 0.5 })),
    opt(nv3('scale', 'Scale (number or [x, y, z])', { step: 0.05, defaultScalar: 1 })),
    opt(nv3('rotation', 'Rotation deg (Z-tilt or [rx, ry, rz])', { step: 1, defaultScalar: 0 })),
    ...(opts.includeRotationZ ? [opt(n('rotationZ', 'Legacy Z tilt (deg)', { step: 1 }))] : []),
  ];
}

export function ambientObjectField(): Field {
  return {
    type: 'object',
    key: 'ambient',
    label: 'Ambient lighting, storm, bats & loops',
    optional: true,
    fields: [
      opt(sel('lightMode', 'Light mode', LIGHT_MODES)),
      alt(
        'bats',
        'Bats ambient',
        'bool',
        [
          opt(b('enabled', 'Enabled', { defaultTrue: true })),
          opt(n('minGapSec', 'Min gap (s)', { step: 0.5 })),
          opt(n('maxGapSec', 'Max gap (s)', { step: 0.5 })),
          opt({ type: 'numbers', key: 'count', label: 'Count range [min, max]' }),
          opt(n('scale', 'Scale multiplier', { step: 0.05 })),
        ],
        { optional: true, defaultScalar: false },
      ),
      alt(
        'storm',
        'Storm ambient',
        'bool',
        [opt(b('enabled', 'Enabled', { defaultTrue: true })), opt(n('intensity', 'Intensity (0..1)', { step: 0.05 }))],
        { optional: true, defaultScalar: false },
      ),
      opt({ type: 'strings', key: 'loops', label: 'Ambient sound loop cues (one per line)' }),
    ],
  };
}
