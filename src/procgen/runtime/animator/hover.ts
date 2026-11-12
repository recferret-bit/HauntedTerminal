/**
 * Rigid hover bob: one y offset added to every part so a floating body moves as one (a part carries
 * only one AnimTag, so this cannot be a tag). Decides whether it is on and which tag drives it.
 */
import type { BuiltModel } from '../build.js';
import { isHostile, type AnimTag } from '../../core/types.js';
import type { AnimBase, AnimContext } from '../../anim/tags.js';
import type { AnimatorOptions } from './types.js';

export interface HoverRig {
  on: boolean;
  /** The y `bob` the offset is read from. */
  tag: AnimTag;
  /** A y `bob` already carried by at least half the parts: it IS the body bob. */
  bodyBob: AnimTag | null;
  base: AnimBase;
  ctx: AnimContext;
}

export const sameBob = (x: AnimTag, y: AnimTag): boolean => x.speed === y.speed && x.amp === y.amp && (x.phase ?? 0) === (y.phase ?? 0);

const isYBob = (tag: AnimTag | undefined): boolean => tag?.type === 'bob' && (tag.axis ?? 'y') === 'y';

/** Does this part already carry the body bob (so it must not get the hover offset on top)? */
export const carriesBodyBob = (tag: AnimTag | undefined, bodyBob: AnimTag | null): boolean =>
  !!bodyBob && !!tag && isYBob(tag) && sameBob(tag, bodyBob);

export function resolveHover(model: BuiltModel, opts: AnimatorOptions): HoverRig {
  const hoverTagged = model.spec.tags?.includes('hover') ?? false;
  const hoverCategory = model.spec.category === 'pickup' || isHostile(model.spec.category);
  const hoverDefault = model.spec.category === 'pickup' ? { amp: 0.05, speed: 0.8 } : { amp: 0.04, speed: 0.6 };
  const on = opts.hoverBob === false ? false : opts.hoverBob ? true : hoverTagged && hoverCategory;
  // If at least half the parts already share one y `bob` tag, that tag IS the body bob: the animator only
  // fills it in on the parts that spent their one tag on something else (the pickup's pulsing light).
  // Otherwise every part gets the default hover, and a stray y `bob` (a jaw) rides on top of it.
  const yBobs = model.spec.parts.filter((p) => isYBob(p.anim)).map((p) => p.anim!);
  const bodyBob = yBobs.find((t) => yBobs.filter((o) => sameBob(o, t)).length * 2 >= model.spec.parts.length) ?? null;
  const tag: AnimTag = bodyBob ?? {
    type: 'bob', axis: 'y',
    amp: opts.hoverBob ? opts.hoverBob.amp ?? hoverDefault.amp : hoverDefault.amp,
    speed: opts.hoverBob ? opts.hoverBob.speed ?? hoverDefault.speed : hoverDefault.speed,
  };
  return {
    on, tag, bodyBob,
    base: { pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] },
    ctx: { fps: 0, ampMul: 1 },
  };
}
