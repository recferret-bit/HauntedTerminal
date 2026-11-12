---
name: procedural-animation-3d
description: "[ASSET PCG] How generated assets move: AnimTags on model parts (spin, bob, pulse, swing, jitter, blink, breathe, legWalk, armSwing, orbit), the CPU animator in `src/procgen/anim` (states idle / walk / windup / attack / hit / death / hidden / revealed / petrified / frozen / enraged), comic timing (stepped poses at 12 fps, anticipation, hold, snap), and the table mapping terminal commands and KernelEvents to motion. Use whenever you add or change an `anim:` tag, make anything walk, bob, blink, attack, die, freeze or react to a command, or when something 'feels stiff' or 'needs to feel alive'."
---

# Procedural animation

Read [haunted-art-direction](../haunted-art-direction/SKILL.md) first. Enemies have their own acting
guide on top of this one: [procedural-malware-animation](../procedural-malware-animation/SKILL.md).

## How motion works in this game

The player types shell commands. That is the only input: there is no joystick and no click. One
command makes the kernel emit `KernelEvent`s (`src/contracts/events.ts`), and the stage
(`src/renderer/comic-stage.ts`, `handleEvent`) turns each event into a reaction. So nothing moves
"because a key is held": every motion is either an **idle loop** (the thing is alive) or a **beat**
(the command landed). Three layers, each with one owner:

- **Part poses**: `createAnimator(model)` (`src/procgen/anim`) moves each part mesh and writes `uEmissive` / `uOpacity`.
- **Actor placement**: the stage's `TweenManager` (`src/renderer/tween.ts`) moves `model.group` (run, hop, slide).
- **The page**: the stage shakes the camera, letters onomatopoeia, changes panels, strikes lightning.

The animator never touches `model.group` and the stage never touches part meshes, so a frozen enemy
can still be pushed by a tween and a walking hero keeps walking while he hops.

Why a CPU animator: one `THREE.Mesh` per part and a handful of actors per panel, so a few dozen
transforms per frame is cheap, readable and testable in node. No skinning, no vertex-shader rig.

## Comic timing

The image goes through a pixel-art quantizer, and the look is a comic page. Both want **poses**,
not interpolation: a smooth sine drawn on a coarse pixel grid turns into shimmer.

- **Stepped time.** Everything is drawn "on twos": 12 poses per second (`ANIM_STEP_FPS`). A pose is
  held for 83 ms, then replaced. Enemies run lower (the zombie at 6) to look broken.
- **Hold and snap.** Periodic motion uses `animHoldWave`, a sine that lingers at its extremes and
  snaps through the middle. An arm is up or down, almost never halfway.
- **Anticipation, strike, recover.** An action is three held poses: pull back the opposite way
  (250 ms), snap to the extreme in one frame and hold it as a smear (120 ms), ease back (230 ms).
  The wind-up is what makes the snap readable, and for enemies it is what makes the fight fair.
- **The beat.** Shake, lettering (`KRAK!`, `PERMISSION DENIED!`), flash and particles all fire on the
  strike frame, never on the first frame of the wind-up. Use the animator's `onBeat`.
- **Hit-stop.** A hit or a death holds its first pose for one or two frames before anything falls.
- **Secondary motion stays small**: one breathing body, one blinking light. If everything moves, nothing reads.

## The 2D projection rule

The camera is orthographic, on −z, level with the page. World **+x is screen-left**.

- Motion happens in the **XY page plane**. Moving along z is invisible except through overlap: a part
  that must pass in front of another needs a different z, not motion along z.
- Rotation about **z** is a pendulum, a waving arm, a profile leg. About **x** the part foreshortens and
  its far end rises: a front-on march, a nod. About **y** it squashes sideways: a coin flip, fine for
  pickups, wrong for limbs.

## AnimTag vocabulary

A tag is plain data on a `PartSpec` (`AnimTag` in `src/procgen/core/types.ts`). Defaults live in
`ANIM_TAG_DEFAULTS`; math, good and bad uses are in [anim-tags.md](./references/anim-tags.md).

| type | What it does | Default axis / speed / amp |
|---|---|---|
| `spin` | Continuous rotation about `axis` through `pivot` | y / 0.5 Hz / - |
| `bob` | Held up-down (or sideways) translation | y / 0.8 Hz / 0.05 units |
| `pulse` | Heartbeat: sharp swell about `pivot`, eased decay, emissive up | - / 1 Hz / +8% |
| `swing` | Pendulum about `axis` through `pivot` | z / 0.6 Hz / 0.25 rad |
| `jitter` | Hashed stepped offsets, rest frames, rare big glitch frames | page plane / 10 steps/s / 0.02 units |
| `blink` | Emissive shut for a share (`amp`) of each cycle | - / 0.4 Hz / 12% shut |
| `breathe` | Slow stretch along `axis` from `pivot`, squash on the other two | y / 0.25 Hz / 3% |
| `legWalk` | `swing` scaled by locomotion (0 standing, 1 walking) | x / 2 Hz / 0.45 rad |
| `armSwing` | `legWalk` with the sign flipped | x / 2 Hz / 0.35 rad |
| `orbit` | Circles `pivot` in the page plane, orientation kept | - / 0.4 Hz / radius |

## Tagging a model

1. **Decide what stays still.** The silhouette-carrying mass (torso, shell, frame) gets at most
   `breathe`. Tag the things that say "alive": limbs, one light, one loose end.
2. **Pivots are joints, in model space.** Hip for a leg, shoulder for an arm, root for an antenna,
   base for `breathe` (so it grows up, not into the floor). A pivot off the part makes it orbit.
3. **One limb, one tag.** A leg and its foot share pivot, axis, speed, amp and phase exactly
   (build the tag once and reuse the object). Anything else pulls the limb apart.
4. **Phases.** Two legs: 0 and 0.5. Many legs: alternate neighbours and opposite pairs (tripod).
   An arm carries the phase of the leg on its own side; `armSwing` already swings it the other way.
   Spread phases on repeated parts (spikes, LEDs, chain links) so they never move in unison.
5. **Stay on the ground and on the model.** Feet must not sweep below y = 0, `bob` must not be
   larger than the part unless the whole model bobs together, `jitter` stays at or under 0.04.
6. **Floating models** (`tags: ['hover']` pickups, malware, bosses) bob as one rigid body: the animator
   does it (below), so spend part tags on the light (`spin`, `pulse`), not on a y `bob`.
   **Malware** needs at least one `jitter` part. **Rooms**: a few `blink` LEDs, one `spin` or `swing`.
7. Run the checks below before looking at it.

Worked example with every step: [tagged-model.ts](./examples/tagged-model.ts).

## The animator and its states

```ts
const animator = createAnimator(model, { facing: -1, onTint: createAnimMaterialTint(model), onBeat, onStateEnd });
animator.setState('walk');        // loops
animator.setState('attack');      // one-shot: anticipation -> strike -> recover, then back to walk
animator.update(dtSeconds);       // once per frame
animator.reset();                 // authored pose and uniforms, exactly
```

Loops: `idle`, `walk` (locomotion 1), `windup` (the tell before an attack), `hidden`, `petrified`
(`chmod -x`), `frozen` (`kill -STOP`), `enraged` (`kill -15` trapped). One-shots: `attack` (0.6 s),
`hit` (0.3 s), `revealed` (0.5 s), `death` (0.7 s, holds its last pose, `deathProgress` 0..1).
What each does, with values: [anim-tags.md](./references/anim-tags.md#states).

Emissive and opacity are written as `base x multiplier`; a value the stage wrote in between becomes
the new base, so stage fades and the animator compose. Colour is never touched: stone, ice and rage
call the `onTint` hook with a palette zone (`createAnimMaterialTint(model)` is the stock hook).

**Hover bob.** A part carries one tag, so a floating body cannot bob through its tags alone. For
`hover`-tagged pickup / malware / boss models the animator adds one rigid y offset to every part (0.04
units at 0.6 Hz; pickups 0.05 at 0.8 Hz), stopping with the tag clock. If half the parts or more already
share one y `bob`, that tag is the body bob and the animator only fills it in on the other parts (the
pulsing light). It goes on the parts, not `model.group`, because the stage writes the Group's y; read
`animator.hoverOffset` so sockets and FX follow. Override: `hoverBob: false` or `{ amp, speed }`.

## Events to motion

`ANIM_EVENT_MAP` (`src/procgen/anim/events.ts`) lists, for every `KernelEvent`, who reacts, with which
state, which Group tween, how much shake, which lettering and on which millisecond. `animReactionsFor(ev)`
returns the rows for a concrete event; `animStateForActor(roomActor)` maps `RoomActor` flags
(`hidden`, `petrified`, `frozen`, `alpha`) to the resting state. Full table with every command reaction:
[event-to-motion.md](./references/event-to-motion.md). The stage
(`src/renderer/comic-stage.ts` + `stage-cast.ts`) drives actors with `createAnimator(model, animActingOptions(id))`
and plays these reactions from its timed event queue; change timings in the table, not in the stage.

## The hero's vocabulary

Walk to a door and hop the gutter (`cd`), PANEL SMASH (`cd ../../..`), lantern raise (`ls -a`), the
typing nod, hurt: states, tweens and timings in [event-to-motion.md](./references/event-to-motion.md#the-heros-vocabulary).

## Verify

```bash
node .kiro/skills/procedural-animation-3d/scripts/self-test.mjs            # the animation module itself (must be all PASS)
node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all     # validateAnimTags + every state on every catalog model
node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs hero.dev  # one model
npx tsc --noEmit
```

Then look under the real shaders: `npm run dev`, `/asset-lab.html?inspect=<id>&scale=game`. The lab runs
this animator (`createModelAnimator`); `&anim=0` stops it, `&t=1.25` freezes the clock for repeatable
poses, `&state=hidden|petrified|frozen|enraged` previews state materials. Under 1 px (0.017 units) a
motion does not exist; if a blink or jitter is all you notice, it is too big. Validator codes and
fixes: [anim-tags.md](./references/anim-tags.md#validator-codes).
