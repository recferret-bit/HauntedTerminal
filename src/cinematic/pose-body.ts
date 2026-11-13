import type { PoseProgram } from './spec-types.js';
import { poseSeated, v3 } from './set.js';
import { easeIn, easeOutBack, lerp, span, stepped } from './stage.js';
import { markAt, pointAt, type ComixActor, type ComixWorld } from './reel.js';

/** Typing weight: 1 before `typingUntil`, `typingMid` until `typingMidUntil`, else 0. Does not move the group. */
function poseSeatedProgram(world: ComixWorld, program: Extract<PoseProgram, { kind: 'seated' }>, t: number): void {
  const member = world.actors.get(program.actor);
  if (!member) return;
  const until = markAt(world, program.typingUntil);
  const midUntil = program.typingMidUntil ? markAt(world, program.typingMidUntil) : undefined;
  let typing = 0;
  if (t < until) typing = 1;
  else if (midUntil !== undefined && t < midUntil) typing = program.typingMid ?? 0;
  poseSeated(member.actor, t, typing, program.lantern ?? false);
}

/** The desk worker stretched into the monitor. Numbers that are not on the program are the old pose. */
function poseSuck(world: ComixWorld, program: Extract<PoseProgram, { kind: 'suck' }>, t: number): void {
  const member = world.actors.get(program.actor);
  if (!member) return;
  const home = pointAt(world, program.home);
  const screen = pointAt(world, program.target);
  const g = member.actor.model.group;
  const pull = span(t, markAt(world, program.from), markAt(world, program.to));
  if (pull > 0) {
    const k = stepped(easeIn(pull), program.steps);
    const cx = home.x;
    const cy = home.y + 0.8;
    const dx = screen.x - cx;
    const dy = screen.y - cy;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const sy = lerp(1, 1.65, Math.min(1, k * 1.6)) * lerp(1, 0.08, span(k, 0.55, 1));
    const sx = lerp(1, 0.32, k) * lerp(1, 0.2, span(k, 0.55, 1));
    const reach = 1.25 * sy;
    g.position.set(lerp(home.x, screen.x - ux * reach, k), lerp(home.y, screen.y - uy * reach, k), lerp(home.z, 0.3, k));
    g.rotation.z = -(Math.PI / 2 - Math.atan2(uy, ux)) * Math.min(1, k * 2.2);
    g.scale.set(sx, sy, 1);
    g.visible = t < markAt(world, program.hideAt);
    return;
  }
  const recoilAt = program.recoilAt ? markAt(world, program.recoilAt) : undefined;
  const recoilDur = program.recoilDur;
  const recoil = recoilAt !== undefined && recoilDur !== undefined && t > recoilAt && t < recoilAt + recoilDur ? 0.06 : 0;
  g.position.set(home.x - recoil, home.y, home.z);
  g.rotation.z = recoil * 1.5;
  g.scale.set(1, 1, 1);
  g.visible = true;
}

function poseOneAgent(world: ComixWorld, program: Extract<PoseProgram, { kind: 'emerge' }>, member: ComixActor, t: number): void {
  const spec = member.spec;
  const grp = member.actor.model.group;
  const show = markAt(world, program.showFrom);
  const hide = markAt(world, program.hideAt);
  grp.visible = t >= show && t < hide;
  if (!grp.visible) return;
  const screen = pointAt(world, 'screen');
  const inScreen = pointAt(world, 'inScreen');
  const wake = markAt(world, program.wakeAt);
  const rise = markAt(world, program.riseAt);
  const order = spec.order ?? 0;
  const awake = t >= wake;
  const inScale = awake
    ? lerp(program.inScale, program.awakeScale, stepped(span(t, wake, wake + program.wakeDur), program.awakeSteps))
    : program.inScale;
  const inPos = v3(screen.x + (spec.inX ?? 0), inScreen.y + (awake ? 0.02 : -0.02), program.inZ);
  const start = rise + order * program.stagger;
  const e = stepped(easeOutBack(span(t, start, start + program.riseDur)), program.riseSteps);
  const lean = span(t, markAt(world, program.leanFrom), markAt(world, program.leanTo));
  const toX = spec.to?.[0] ?? inPos.x;
  const toY = spec.to?.[1] ?? inPos.y;
  grp.position.set(lerp(inPos.x, toX, e) - lean * 0.2, lerp(inPos.y, toY, e), lerp(inPos.z, program.outZ, Math.min(1, e)));
  grp.scale.setScalar(lerp(inScale, spec.scale ?? 1, Math.min(1.06, e)));
  grp.rotation.z = awake ? 0 : (order % 2 ? program.slump : -program.slump);
}

/** Agents slumped in the glass, then rising out. X is `screen.x + inX`; Y is `inScreen.y` plus the old bob. */
function poseEmerge(world: ComixWorld, program: Extract<PoseProgram, { kind: 'emerge' }>, t: number): void {
  for (const member of world.agents) poseOneAgent(world, program, member, t);
}

/** Thrown out of the monitor into the chair. `poseSeated` is the seated program, not this one. */
function poseFlight(world: ComixWorld, program: Extract<PoseProgram, { kind: 'flight' }>, t: number): void {
  const member = world.actors.get(program.actor);
  if (!member) return;
  const origin = pointAt(world, program.origin);
  const dest = pointAt(world, program.dest);
  const from = markAt(world, program.from);
  const to = markAt(world, program.to);
  const g = member.actor.model.group;
  const fly = span(t, from, to);
  g.visible = t >= from;
  if (fly < 1) {
    const k = stepped(fly, program.steps);
    g.position.set(
      lerp(origin.x, dest.x, k),
      lerp(origin.y + program.originDy, dest.y, k) + Math.sin(k * Math.PI) * program.arc,
      lerp(0.3, dest.z, k),
    );
    g.scale.set(lerp(0.25, 1, k), lerp(1.8, 1, k), 1);
    g.rotation.z = lerp(0.9, 0, k);
    return;
  }
  const land = t - to;
  const squash = land < 0.08 ? 0.82 : land < 0.16 ? 1.06 : 1;
  g.position.copy(dest);
  g.scale.set(2 - squash, squash, 1);
  g.rotation.z = 0;
}

/** Agents leave the screen toward `actor.fling`. Visible while the fling has started, they are not gone, and t < hideAt. */
function poseFling(world: ComixWorld, program: Extract<PoseProgram, { kind: 'fling' }>, t: number): void {
  const from = markAt(world, program.from);
  const to = markAt(world, program.to);
  const hide = markAt(world, program.hideAt);
  const origin = pointAt(world, program.origin);
  world.agents.forEach((member, i) => {
    if (!member.spec.fling) return;
    const dest = pointAt(world, member.spec.fling);
    const k = span(t, from + i * program.stagger, to);
    const grp = member.actor.model.group;
    grp.visible = k > 0 && member.actor.animator.deathProgress < 0.999 && t < hide;
    const e = stepped(easeOutBack(k), program.steps);
    grp.position.set(
      lerp(origin.x, dest.x, e),
      lerp(origin.y + program.originDy, dest.y, e),
      lerp(program.z, dest.z, Math.min(1, e)),
    );
    grp.scale.setScalar(lerp(0.1, program.scale, Math.min(1, e)));
  });
}

export function poseBody(world: ComixWorld, program: PoseProgram, t: number): boolean {
  switch (program.kind) {
    case 'seated':
      poseSeatedProgram(world, program, t);
      return true;
    case 'suck':
      poseSuck(world, program, t);
      return true;
    case 'emerge':
      poseEmerge(world, program, t);
      return true;
    case 'flight':
      poseFlight(world, program, t);
      return true;
    case 'fling':
      poseFling(world, program, t);
      return true;
    default:
      return false;
  }
}
