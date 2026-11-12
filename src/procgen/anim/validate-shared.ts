/**
 * Types and small helpers shared by the AnimTag rule checks (validate.ts, validate-part.ts,
 * validate-gait.ts). Plain data only.
 */
import type { AnimTag, PartSpec, Vec3 } from '../core/types.js';

export type AnimIssueCode =
  | 'ANIM_SPEED_RANGE'
  | 'ANIM_AMP_RANGE'
  | 'ANIM_PHASE_RANGE'
  | 'ANIM_DISK_FIELDS'
  | 'ANIM_PIVOT_OUTSIDE'
  | 'ANIM_PIVOT_DETACHED'
  | 'ANIM_DETACH'
  | 'ANIM_BELOW_GROUND'
  | 'ANIM_SIDE_PHASE'
  | 'ANIM_NO_COUNTER_PHASE'
  | 'ANIM_ARM_PHASE'
  | 'ANIM_LIMB_SPLIT'
  | 'ANIM_INVISIBLE_AXIS'
  | 'ANIM_BLINK_NOT_EMISSIVE'
  | 'ANIM_MALWARE_NO_JITTER'
  | 'ANIM_PICKUP_STILL';

export interface AnimIssue {
  severity: 'error' | 'warn';
  code: AnimIssueCode;
  /** Part name, or '' for a model-level issue. */
  part: string;
  message: string;
}

/** Records one issue; the rule checks never build `AnimIssue`s by hand. */
export type AddIssue = (severity: AnimIssue['severity'], code: AnimIssueCode, part: string, message: string) => void;

/** A part that carries an AnimTag. */
export type Tagged = PartSpec & { anim: AnimTag };

/** Tags that hinge a limb on a pivot. */
export const HINGED = new Set(['swing', 'legWalk', 'armSwing']);

export const pivotOf = (part: Tagged): Vec3 => part.anim.pivot ?? part.pos;
export const pivotKey = (part: Tagged): string => pivotOf(part).map((v) => v.toFixed(3)).join(',');

/** Key that groups the parts of one limb: same tag type on the same pivot. */
export const limbKey = (part: Tagged): string => `${part.anim.type}:${pivotKey(part)}`;

export const sameMotion = (a: AnimTag, b: AnimTag): boolean =>
  a.type === b.type && a.axis === b.axis && a.speed === b.speed && a.amp === b.amp && (a.phase ?? 0) === (b.phase ?? 0);

/** Distance between two phases on the 0..1 circle. */
export const phaseGap = (a: number, b: number): number => {
  const d = Math.abs((((a - b) % 1) + 1) % 1);
  return Math.min(d, 1 - d);
};
