# Events to motion

The data is `ANIM_EVENT_MAP` in `src/procgen/anim/events.ts`; this file explains it and adds the
reactions to terminal commands that have no `KernelEvent` yet. When the two disagree,
the code wins: fix this file.

```ts
for (const r of animReactionsFor(ev)) {
  // r.role       who: hero | subject | children | door | revealed | spawned | hand | source | page
  // r.state      animator state to set on that actor (optional)
  // r.hold       true: stays until another event; false: one-shot, returns by itself
  // r.delayMs    wait before setState / the tween
  // r.durationMs length of the Group tween described in r.tween (0 = none)
  // r.shake      triggerShake multiplier, fired at r.beatMs
  // r.onomatopoeia, r.color   lettering, fired at r.beatMs ({n} = a number from the event)
}
```

`T` below is the stage's `config.transitionMs` (420 ms by default, `ANIM_TRANSITION_MS`). Roles are
resolved by the stage: `subject` is the inode or process the event names, `source` is the attacker.
Times are from the moment the event arrives.

## KernelEvents

| Event (command) | Variant: condition | Who | State | Group tween | Shake | Lettering @ beat |
|---|---|---|---|---|---|---|
| `ROOM_TRANSITION` (`cd <dir>`, `cd ..`) | `hop`: fewer than 3 levels up, no loop | hero | `walk`, then `idle` on landing | x to the door, linear, T; y + sin(t·π)·0.45 over the gutter | 0 | `HOP!` green @ 210 ms |
| | | page | | Camera slides to the new panel, easeOutBack, T; title and dressing swap on landing | | |
| `ROOM_TRANSITION` (`cd ../../..`) | `panel_smash`: `upwardPanelsSmashed >= 3` | hero | `attack` | y + sin(t·π)·1.1 through three frames, 504 ms | 1.5 | `PANEL SMASH x{n}!!` yellow @ 250 ms |
| | | page | | Camera pulls back; frame shards at 250, 330, 410 ms | | |
| `ROOM_TRANSITION` (symlink loop) | `eloop`: `viaSymlinkLoop` | hero | `hit` | none (he does not move) | 1.2 | `ELOOP! MIRROR TRAP!` cyan @ 0 |
| | | door (`door.loopback`) | `enraged` for 600 ms, then `idle` | Flood rises 18% | | |
| `LANTERN_REVEAL` (`ls -a`, `ls -la`) | `reveal` | hero | | Lantern raise: `lantern` zone emissive 0.35 → 1.6 over T, light cone opens | 0 | `LS -LA // REVEAL!` yellow @ 80 ms |
| | | revealed (each `revealedInodes`) | `revealed` @ 80 ms | | | |
| `PERMISSION_DENIED_RATTLE` (`cd` / `rm` on mode 000) | `rattle` | subject (the gate or file) | `hit` | x + sin(t·π·10)·0.06 for 320 ms; sparks at the `lock` socket | 0.8 | `PERMISSION DENIED!` red @ 0 |
| `INODE_MODE_CHANGED` (`chmod -x <monster.bin>`) | `petrify`: `(newMode & 0o111) === 0` | subject | `petrified`, held | none | 0 | `CHMOD -X // PETRIFIED!` grey @ 0 |
| `INODE_MODE_CHANGED` (`chmod +rx`, `chmod 755`) | `open`: any execute bit set | subject (the gate) | | y + 0.7·easeOutBack(t) over T; opacity → 0.35; `led` red → green | 0.5 | `CHMOD 755 // OPEN!` green @ 300 ms |
| `OBJECT_MOVED` (`mv heavy_plank.tar chasm/`) | `bridge`: `formedBridge` | subject (the crate) | | x slide to the gap, easeOutBack, T; lands as the bridge | 0.6 | `MV -> BRIDGE FORMED!` yellow @ 340 ms |
| `OBJECT_MOVED` (`... > /dev/null`) | `null`: `suckedIntoNull` | door (`door.devnull`) | | scale 1 + sin(t·π)·0.45, 650 ms | 0 | `/DEV/NULL VORTEX!` magenta @ 0 |
| | | subject | `death` | Spirals into the drain during the collapse, 650 ms | | |
| `OBJECT_MOVED` (`mv`, `cp` elsewhere) | `moved` | subject | `revealed` | Pops in at its new place | 0 | |
| `SYSTEM_HAND_SPAWN` (boss forks) | `boss_fork` | source (`boss.forkbomb`) | `attack` | Fork arms up on `strike` | 0 | |
| | | hand (`hero.hand`) | | From 250 ms, 620 ms long: 0-45% drops in from y 3.1 (easeOutBack), 45-75% scribbles (x + sin(t·40)·0.08), 75-100% withdraws | 0 | `FORK() // DRAWN!` paper @ 530 ms |
| | | spawned (the zombie) | `revealed` @ 530 ms | | | |
| `SYSTEM_HAND_SPAWN` (cron restores a file) | `cron_restore` | hand | | Same three beats, 620 ms | 0 | `CRON RESTORE!` paper @ 280 ms |
| | | spawned | `revealed` @ 280 ms | | | |
| `PROC_SIGNALED` (`kill -STOP <pid>`) | `frozen`: outcome `FROZEN` | subject | `frozen`, held | none | 0 | `SIGSTOP // FROZEN!` cyan @ 0 |
| `PROC_SIGNALED` (`kill -15 <pid>`, trapped) | `enraged`: outcome `TRAPPED_ENRAGED` | subject | `enraged`, held | none; a grid-overload arc at the boss (lightning layer) | 1.3 | `SIGTERM TRAPPED!` red @ 0 |
| `PROC_SIGNALED` (`kill -9 <pid>`) | `killed`: outcome `KILLED` | subject | `death`, held | none: the death pose collapses the parts itself | 1.6 | `KILL -9 // REAPED!` yellow @ 120 ms |
| | | children (its zombies) | `death` @ 120 ms | | | |
| `HUD_OVERLAY_TOGGLED` (`ps`, `top`) | `xray` / `xray_off` | page | | PID plates pop over each process, parent-child links pulse. Actors keep their state | 0 | |
| `OBSTACLE_DIALOGUE_RENDERED` (`cat x.sock`) | `speak` | subject (`door.socket`) | | Bubble pops with easeOutBack, 160 ms. Its LED eyes keep blinking | 0 | |
| `PUZZLE_DOOR_RESOLVED` (right answer `> x.sock`) | `solved` | subject (`door.socket`) | `revealed` (the flash and pop reads as "accepted") | | 0 | `SOCKET UNLOCKED ({n})!` green @ 0 |
| | | door (the unlocked one) | | Plays `INODE_MODE_CHANGED` / `open` after 200 ms | | |
| `PLAYER_DAMAGED` | `damaged` | source (the attacker) | `attack` | Its own lunge is in the attack pose | 0 | |
| | | hero | `hit` @ 250 ms (the attacker's `strike`) | | 1.1 | `-{n} HP` red @ 250 ms |
| `FLOOR_CLEARED` | `cleared` | page | | Page turn to the next floor card, 900 ms | 0 | `FLOOR CLEARED!` green @ 0 |
| | | hero | `idle` | One hop in place (y + 0.3, 300 ms) | | |

## The hero's vocabulary

The hero (`hero.dev`) has no attacks of his own: every move is a reaction to a command.


| Move | Trigger | How |
|---|---|---|
| Walk to a door | `cd <dir>` | `setState('walk')`, stage tweens `group.position.x` linearly, `setState('idle')` on arrival |
| Hop the gutter | `cd`, same event | Stage adds `y + sin(t·π)·0.45` to the same tween; `HOP!` at the top |
| PANEL SMASH | `cd ../../..` (3+ levels) | `setState('attack')` with a `y + sin(t·π)·1.1` tween; shake 1.5 and shards on `strike` |
| Lantern raise | `ls -a` | Stage tweens the `lantern` zone emissive 0.35 → 1.6; hidden actors play `revealed` 80 ms later |
| Type | every command | No state: a two-pose nod of the Group (y −0.02 for 80 ms). Keep it tiny, it happens constantly |
| Hurt | `PLAYER_DAMAGED` | `setState('hit')` on the attacker's `strike` beat (250 ms after the event), shake 1.1 |

## RoomActor flags to resting state

`animStateForActor(actor)` (`ANIM_ACTOR_FLAG_STATES`), highest priority first. Call it when a room is
synced (`syncRoom`); one-shots return to whatever looping state this set.

| Flag | State | Note |
|---|---|---|
| `petrified` | `petrified` | `chmod -x`. Wins over everything |
| `frozen` | `frozen` | `SIGSTOP`. `SIGCONT` clears the flag: set `idle` and the tags resume from the held pose |
| `hidden` | `hidden` | Not listed by plain `ls`. The stage hides the Group as well |
| `alpha < 0.5` | `hidden` | A lurking dotfile (alpha 0.04): drawn, barely, no jitter. `ls -a` plays `revealed` |
| none | `idle` (or the fallback you pass) | |

## Section 4.2 reactions without an event yet

These are in the design but the kernel does not emit a dedicated event for them today. When one is added,
give it a row in `ANIM_EVENT_MAP` with these values instead of inventing new ones.

| Reaction (command) | Who | State | Tween / timing | Lettering |
|---|---|---|---|---|
| `touch <file>` materialises a scroll or fuse | the new prop | `revealed` (500 ms) | Drawn in by the System Hand if it was restored by cron; otherwise pops in place | `TOUCH!` yellow on the `pop` beat (80 ms) |
| `rm <file>` burns an obstacle to ink ash | the removed actor | `death` (700 ms) | No Group tween. FX: ink-ash particles from the `fx` socket, emitted from the `collapse` beat (250 ms) to `gone` (700 ms), rate following `deathProgress` | `RM!` red on `impact` |
| Floor transition (enter the floor exit) | page, hero | hero `walk` into the door, then page turn | Run T, page turn 900 ms, floor card held 1200 ms, hero `revealed` in the new room | `ENTERING FLOOR n: <path>` |
| Wrong answer `> x.sock` | `door.socket` | `hit` (300 ms) | Bubble shakes x ±0.05 for 200 ms; next hint page | bubble text, no lettering |
| `kill -CONT <pid>` thaws a frozen process | subject | `idle` (or `enraged` if it was enraged before) | none | `SIGCONT!` cyan |
| `chmod +x` on a petrified enemy | subject | `revealed`, then `idle` | none | `CHMOD +X // AWAKE!` magenta |
| Boss projectile swallowed by `/dev/null` | the projectile (fx) | | Stepped travel toward the drain in 4 jumps over 400 ms, scale → 0 on the last | none |

## Shake and lettering scale

`triggerShake(mul)` in the stage: amplitude `shakeIntensity × 0.006 × mul`, 280 ms, linear decay.

| Shake | Use |
|---|---|
| 0.4 to 0.6 | A thing lands or opens (gate lift, bridge, clamp) |
| 0.8 | A refusal (`PERMISSION DENIED`) |
| 1.1 to 1.3 | The hero is hurt, an enemy enrages, a mirror trap |
| 1.5 to 1.6 | PANEL SMASH, `kill -9`, lightning |

One shake per event, on the strike beat. Two actors reacting to the same event share one shake.
Lettering colours follow the palette's meaning: green = allowed, red = refused or hurt, cyan = frozen or
looped, yellow = the hero did something big, magenta = malware.
