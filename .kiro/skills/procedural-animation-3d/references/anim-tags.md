# AnimTag reference

Source of truth: `src/procgen/anim/tags.ts` (`animPoseAt`, `ANIM_TAG_DEFAULTS`). A tag is data on a
`PartSpec`:

```ts
anim: { type: 'swing', axis: 'z', speed: 0.6, amp: 0.25, phase: 0.5, pivot: [0.1, 0.9, 0] }
```

| Field | Meaning | Default |
|---|---|---|
| `type` | One of the ten types below | required |
| `axis` | `'x' \| 'y' \| 'z'`, model space | per type |
| `speed` | Cycles per second (`jitter`: steps per second) | per type |
| `amp` | Units for translation, radians for rotation, scale delta for `pulse` / `breathe`, shut share for `blink` | per type |
| `phase` | 0..1 offset in the cycle | 0 |
| `pivot` | Model-space point the motion is about | the part's own `pos` |

## Shared math

```
ts     = floor(t * 12) / 12                      stepped time (animStepTime); fps 0 = smooth
cycles = ts * speed + phase
hold(c) = sign(s) * (1 - (1 - |s|)^2),  s = sin(2π c)     animHoldWave: lingers at ±1, snaps through 0
beat(c) = p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85)^2,  p = frac(c)     animBeat: attack, decay
```

Rotation about a pivot is translate, rotate, translate back (`animRotateAboutPivot`):

```
pos' = pivot + R(axis, angle) * (pos - pivot)
rot' = R(axis, angle) * rot          (quaternions; rot is Euler XYZ in and out)
```

so the part both moves round the pivot and turns with it, and its distance to the pivot never changes.
A negative `amp` mirrors a rotation (use it for the second jaw of a pair). `animPoseAt(tag, base, t, ctx)`
is pure: it returns `{ pos, rot, scale, emissiveMul }` and never mutates `base`.

`ctx`: `fps` (12; 0 = smooth), `locomotion` (0..1), `ampMul`, `jitterMul`, `name` (seed of the jitter hash).

## The types

### spin
`angle = 2π * cycles` about `axis` through `pivot`. Default axis y, 0.5 Hz. `amp` is unused; a negative
`speed` turns the other way. Max 4 Hz.
- Good: fan blades and drill bits (axis z or x, 1.5 to 3 Hz), a pickup turning like a coin (axis y, 0.5 Hz), a shield ring.
- Bad: anything faster than 4 Hz (at 12 poses a second it strobes or appears to stand still); spinning a part with
  no rotational detail (a plain cylinder about its own axis shows nothing); limbs.

### bob
`pos += axis * amp * hold(cycles)`. Default axis y, 0.8 Hz, 0.05 units (3 px).
- Good: a chattering jaw (4 to 5 Hz, 0.02), a worm segment swaying on x with a phase that grows down the
  chain, a dangling part riding up and down on a floating body.
- Bad: axis z (invisible); one part of a grounded model bobbing more than its own size (it detaches);
  a grounded model bobbing as a whole (it reads as hovering; use `breathe`).
- A floating body does not need it: `hover`-tagged pickup / malware / boss models get a rigid hover bob
  from the animator (`hoverBob` option, `animator.hoverOffset`). If half the parts or more share one y
  `bob`, the animator treats it as the body bob and applies it to the remaining parts too, so a pickup's
  pulsing light rides along. A stray y `bob` on one part (a jaw) rides on top of the hover.

### pulse
`s = 1 + amp * beat(cycles)`; scale and position are scaled about `pivot`; `emissiveMul = 1 + 0.5 * beat`.
Default 1 Hz, +8%.
- Good: a core, an eye, a payload sac, a pickup's light. The heartbeat shape reads as "charged" or "alive".
- Bad: large structural parts (the silhouette throbs); more than two or three per model.

### swing
`angle = amp * hold(cycles)` about `axis` through `pivot`. Default axis z, 0.6 Hz, 0.25 rad.
- Good: antennae, hanging cables and chains (0.2 to 0.5 Hz, 0.07 to 0.15 rad), mandibles (2 Hz), a head nod,
  spikes rippling round a body (same pivot at the centre, phases spread 0..1, small amp).
- Bad: a pivot that is not on the part or its limb (`gap * amp` is how far the "joint" travels); axis y on a flat part.

### jitter
The malware signature. Each step (`floor(ts * speed)`) hashes (part name, step) into:
rest on the base pose (40% of steps), or an offset in ±`amp` on x and y, or (12% of steps) a glitch frame
at 3x `amp` with `emissiveMul` 1.6. Default 10 steps/s, 0.02 units. `axis: 'x'` or `'y'` restricts it to
a scanline tear; the default moves in the page plane. Always stepped, also with `fps: 0`.
- Good: one to five corrupted parts per enemy: a spike, a loose shard, a frayed cable, the lid of a box.
  Different part names never glitch together, which is what makes it look like corruption instead of a shake.
- Bad: the whole body (it reads as camera shake); `amp` over 0.04 (glitch frames throw the part 7 px);
  anything that is not hostile. Never use `Math.random`: the hash is what keeps screenshots repeatable.

### blink
`emissiveMul = frac(cycles) >= 1 - amp ? 0.12 : 1`. `amp` is the share of the cycle the light is shut
(default 0.12), `speed` default 0.4 Hz. Use `amp: 0.5` for a cursor, 0.1 for an eye.
- Good: status LEDs with random phases, the vibecoder-facing eye of an enemy, a cursor.
- Bad: non-emissive zones (the animator lends the part 0.6 emissive while lit, but it is dark when nothing
  animates it; prefer a `signal` zone or `malwareEye`); many LEDs sharing one phase.
- The animator gives every `blink` / `pulse` / `jitter` part its own `uEmissive` (a material clone that shares all
  other uniforms with its zone), so one LED can blink alone. `splitEmissive: false` turns that off.

### breathe
`w = amp * sin(2π cycles)`; scale `1 + w` on `axis`, `1 - w / 2` on the other two, about `pivot`.
Default axis y, 0.25 Hz, 3%. Slow enough that stepping alone gives the held look.
- Good: one torso or shell per living thing, pivot at its base.
- Bad: no pivot on a grounded part (it grows into the floor as much as upward); more than 0.06 (it pumps).

### legWalk
`angle = amp * locomotion * hold(cycles)` about `axis` through `pivot`. Default axis x, 2 Hz, 0.45 rad.
At locomotion 0 the leg is exactly at rest.
- Axis x: front-on figures (`vibecoder.dev`). The foot lifts and the leg foreshortens. Axis z: profile creatures
  (`malware.bug`): the leg scissors in the page plane.
- Two legs: phases 0 and 0.5. More: alternate neighbours and opposite pairs.
- A leg whose foot is not under its hip dips below the floor when it swings toward vertical. Keep the foot
  under the pivot or reduce `amp` (the validator sweeps the real vertices).

### armSwing
`legWalk` with the sign flipped. Give an arm the phase of the leg on its own side and it swings against it.
A small `amp` (0.08) on the arm that carries something (the vibecoder's lantern) keeps it alive without waving it.

### orbit
The part circles `pivot` in the XY plane at its authored distance, keeping its orientation. Without a pivot
it circles its own position with radius `amp` (default 0.06). Default 0.4 Hz.
- Disk orbit: set `squash` (minor/major, 0..1], `tilt` (roll of the major axis, radians) and `sway` (z units,
  at most 0.5) and the path becomes a disk seen at an angle, started from the part's authored position; the far
  (upper) half is pushed back by `sway` so the part can slip behind the body and come round in front. Without
  these fields the circle path is unchanged. Example: the debris round `agent.grok`. Bad values: `ANIM_DISK_FIELDS`.
- Good: motes, a satellite shard, a loading-ring dot.
- Bad: anything that should face its direction of travel (use `spin` with a pivot: it turns the part too).

## States

Data: `ANIM_STATES` (`src/procgen/anim/states.ts`). `ampMul` scales every amplitude except jitter;
`jitterMul` scales jitter; `timeScale` scales the clock the tags read (0 stops them at the current pose).
The pose grid is on wall time, so an enraged actor still shows 12 poses a second, just further apart.
Per-model changes go through `createAnimator(model, { states })` (see `ANIM_MALWARE_ACTING`).

| State | Kind | What it does to any model |
|---|---|---|
| `idle` | loop | Tags run. `setLocomotion(w)` scales `legWalk` / `armSwing` and a body bounce |
| `walk` | loop | `idle` with locomotion forced to 1 |
| `windup` | loop | The tell before an attack: tags 1.3x faster and wider, jitter x2, emissive x1.4 |
| `attack` | 0.6 s | Pull back 0.12 (0-250 ms), strike +0.38 (250 ms), recover (370-600 ms) |
| `hit` | 0.3 s | Snap back 0.14 with a white flash (emissive +0.9), hold, ease home |
| `death` | 0.7 s, holds | Flash, hit-stop, collapse to the floor, parts scatter, fade to 0. `deathProgress` 0..1 |
| `hidden` | loop | Opacity x0.06, jitter off, amplitudes x0.4 (a dotfile before `ls -a`) |
| `revealed` | 0.5 s | Pops in over three poses with a flash, then `idle` |
| `petrified` | loop | `chmod -x`: tag clock stopped at the current pose, emissive x0.1, stone tint |
| `frozen` | loop | `kill -STOP`: tag clock stopped, ice tint, a stepped glint on emissive only |
| `enraged` | loop | `kill -15` trapped: 1.6x speed, jitter x2.5, emissive x1.7, red tint |

One-shots return to the looping state that was active before them (never to `windup`), so a frozen
enemy that gets hit goes back to frozen. Whole-body keys (`forward`, `up`, `lean`, `scaleX` / `scaleY`
about the feet, or the centre for `hover` models, `emissiveAdd`, `opacity`, `scatter`) are applied to the
parts in model space; `setFacing(±1)` says which way `forward` is. Keys snap and hold unless marked
`ease: 'ease'`. Beats named on keys (`anticipation`, `strike`, `recover`, `impact`, `hold`, `collapse`,
`gone`) are reported through `onBeat` after the pose is applied.

## Validator codes

`validateAnimTags(spec)` (`src/procgen/anim/validate.ts`) returns `{ severity, code, part, message }[]`.

| Code | Severity | Means | Fix |
|---|---|---|---|
| `ANIM_SPEED_RANGE` | error | Speed 0, negative (only `spin` / `orbit` may be), or above the type's `maxSpeed` | Slow down: 6 Hz is all a 12 fps pose clock can show |
| `ANIM_AMP_RANGE` | error | \|amp\| above the type's `maxAmp` | Smaller amp |
| `ANIM_PHASE_RANGE` | error | Phase outside 0..1 | Wrap it |
| `ANIM_DISK_FIELDS` | error | `squash` / `tilt` / `sway` on a non-orbit tag, or squash outside (0, 1], \|sway\| > 0.5 | Only `orbit` takes them; keep the disk flatter than a circle |
| `ANIM_PIVOT_OUTSIDE` | error | Pivot outside the model's bounds | The pivot is model space, not part space |
| `ANIM_PIVOT_DETACHED` | warn / error | The limb's nearest point travels more than 0.04 / 0.12 units | Put the pivot on the joint |
| `ANIM_DETACH` | warn / error | A lone `bob` larger than the part, or `jitter` amp over 0.04 | Smaller amp, or bob the neighbours too |
| `ANIM_BELOW_GROUND` | warn / error | The motion pushes real vertices below y = −0.035 / −0.08 | Smaller amp, foot under the pivot |
| `ANIM_LIMB_SPLIT` | error | Two `legWalk` (or `armSwing`) parts share a pivot but not the tag | Reuse one tag object |
| `ANIM_NO_COUNTER_PHASE` | error | A leg with no partner half a cycle away | Phases 0 and 0.5 |
| `ANIM_SIDE_PHASE` | error / warn | Both legs of a biped in step; neighbouring or opposite legs of a many-legged model in step | Alternate |
| `ANIM_ARM_PHASE` | warn | An arm not carrying its own side's leg phase | Copy the leg's phase |
| `ANIM_INVISIBLE_AXIS` | warn | `bob` along z | Use x or y |
| `ANIM_BLINK_NOT_EMISSIVE` | warn | `blink` on a zone without emissive | Use an emissive zone |
| `ANIM_MALWARE_NO_JITTER` | warn | A `malware` / `boss` model without `jitter` | Tag one corrupted part |
| `ANIM_PICKUP_STILL` | warn | A pickup with no `bob` / `spin` / `pulse` / `orbit` | Add `bob` plus one of the others |
