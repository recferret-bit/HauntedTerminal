/**
 * Worked example: tag a model for motion, check the tags, drive it with the animator.
 * A small socket-headed walker ("prop.example_walker" is not registered anywhere: it is a teaching model).
 *
 * The self-test loads and runs this file, so it always matches the real API:
 *   node .kiro/skills/procedural-animation-3d/scripts/self-test.mjs
 */
import { buildModel } from '../../../../src/procgen/core/build.js';
import type { AnimTag, ModelSpec, PartSpec } from '../../../../src/procgen/core/types.js';
import {
  animReactionsFor, animStateForActor, createAnimator, createAnimMaterialTint, validateAnimTags,
  type AnimState,
} from '../../../../src/procgen/anim/index.js';

const HIP_Y = 0.42;
const SHOULDER_Y = 0.86;

/**
 * What gets a tag, and why:
 *  - legs: `legWalk`, pivot at the hip, the two sides half a cycle apart. A leg and its foot are one
 *    limb: same pivot, same phase, same everything, or the foot leaves the leg.
 *  - arm: `armSwing` with the phase of the leg on its own side. The evaluator swings it the other way.
 *  - body: `breathe`, pivot at its base so it grows upward and the feet stay planted.
 *  - the LED: `blink`. It is an emissive zone, so the blink shows.
 *  - antenna: `swing` about its root, slow and small. Secondary motion: it tells the eye the thing is alive.
 *  - head, face plate, feet soles: no tag. Most of a model stays still so the moving parts read.
 */
export function exampleWalkerSpec(): ModelSpec {
  const parts: PartSpec[] = [];

  // Model space: feet at y = 0, the model faces -z, +x is screen-left.
  for (const [side, x, phase] of [['l', 0.11, 0], ['r', -0.11, 0.5]] as const) {
    // axis 'x': the leg swings toward the camera. On the front orthographic camera that reads as the
    // foot lifting and the leg shortening: a front-on march. Use axis 'z' for creatures drawn in profile.
    const walk: AnimTag = { type: 'legWalk', axis: 'x', amp: 0.45, speed: 2, phase, pivot: [x, HIP_Y, 0] };
    parts.push(
      { name: `leg.${side}`, shape: { kind: 'box', size: [0.1, 0.34, 0.1], bevel: 0.02 }, zone: 'plastic', pos: [x, 0.25, 0], anim: walk },
      { name: `foot.${side}`, shape: { kind: 'box', size: [0.14, 0.08, 0.2], bevel: 0.02 }, zone: 'rubber', pos: [x, 0.04, -0.03], anim: walk },
    );
  }

  parts.push(
    { name: 'body', shape: { kind: 'box', size: [0.44, 0.5, 0.26], bevel: 0.04 }, zone: 'solder', pos: [0, 0.66, 0],
      anim: { type: 'breathe', amp: 0.025, speed: 0.25, pivot: [0, HIP_Y, 0] } },
    { name: 'faceplate', shape: { kind: 'box', size: [0.3, 0.2, 0.04] }, zone: 'plastic', pos: [0, 0.72, -0.14] },
    { name: 'led', shape: { kind: 'sphere', radius: 0.035 }, zone: 'phosphor', pos: [0.08, 0.76, -0.17], outline: false,
      anim: { type: 'blink', speed: 0.4, amp: 0.12 } },
    { name: 'arm.l', shape: { kind: 'capsule', radius: 0.045, length: 0.26 }, zone: 'plastic', pos: [0.28, 0.68, 0],
      anim: { type: 'armSwing', axis: 'x', amp: 0.35, speed: 2, phase: 0, pivot: [0.28, SHOULDER_Y, 0] } },
    { name: 'antenna', shape: { kind: 'box', size: [0.03, 0.22, 0.03] }, zone: 'copper', pos: [-0.12, 1.02, 0],
      anim: { type: 'swing', axis: 'z', amp: 0.12, speed: 0.5, pivot: [-0.12, 0.91, 0] } },
  );

  return {
    id: 'prop.example_walker', category: 'prop', label: 'Example walker', parts,
    sockets: { bubble: [0, 1.2, 0], fx: [0, 0.66, -0.2] },
  };
}

export interface ExampleReport {
  issues: string[];
  /** Whole-body x offset at each attack beat. */
  beats: Record<string, number>;
  restState: AnimState;
  statesVisited: AnimState[];
}

/** Build, validate, and play one second of walking, an attack, a SIGSTOP and a reset. */
export function runTaggedModelExample(): ExampleReport {
  const spec = exampleWalkerSpec();

  // 1. Numbers first: the tag validator works on the plain spec.
  const issues = validateAnimTags(spec).map((i) => `${i.severity} ${i.code} ${i.part}: ${i.message}`);

  // 2. Build and animate. One animator per BuiltModel.
  const model = buildModel(spec);
  const beats: Record<string, number> = {};
  const visited: AnimState[] = [];
  const body = model.parts.get('faceplate')!;
  const animator = createAnimator(model, {
    facing: -1, // forward = -x = screen-right
    onTint: createAnimMaterialTint(model), // stone / ice / rage colours; write your own hook to do more
    onBeat: (state, beat) => {
      if (state === 'attack') beats[beat] = body.position.x;
    },
    onStateEnd: (_state, next) => {
      if (next) visited.push(next);
    },
  });

  // 3. The game loop calls update(dt) once per frame. The stage owns model.group (position, tweens).
  const frame = 1 / 60;
  animator.setState('walk');
  for (let i = 0; i < 60; i++) animator.update(frame);

  // A one-shot: plays its three held poses and returns to `walk` by itself.
  animator.setState('attack');
  for (let i = 0; i < 45; i++) animator.update(frame);

  // 4. Game events pick states through the shared table, not through ad-hoc code in the stage.
  const reactions = animReactionsFor({ type: 'PROC_SIGNALED', pid: 42, signal: 'SIGSTOP', outcome: 'FROZEN' });
  for (const r of reactions) {
    if (r.role === 'subject' && r.state) {
      animator.setState(r.state);
      visited.push(r.state);
    }
  }
  for (let i = 0; i < 30; i++) animator.update(frame); // nothing moves; emissive glints

  // 5. Room sync: flags on the RoomActor decide the resting state.
  const restState = animStateForActor({ hidden: false, frozen: false, alpha: 0.04 });

  animator.reset(); // authored pose and uniforms, exactly
  animator.dispose();
  return { issues, beats, restState, statesVisited: visited };
}
