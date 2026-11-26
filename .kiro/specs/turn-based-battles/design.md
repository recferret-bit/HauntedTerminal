# Turn based battles: design

Status: see `requirements.md`.

## State machine

One `Battle` value per session, owned by `src/game/battle.ts`. Pure functions over plain data; no timers, no DOM, no three. Time reaches it only through `clockSecond()` (one call per real second, from `session.tick()`).

```
              threats appear (after a world step)
   idle ───────────────────────────────────────────▶ intro (10 s, Enter skips)
    ▲                                                    │ intro ends / skipped / exec() in intro
    │ no threat left, hero left the room,                ▼
    │ hero respawned, level changed            ┌───▶ player (timer 30 s) ──────────┐
    │                                          │         │ non-empty line (action) │ timer runs out
    └──────────────────── any state ◀──────────┤         ▼                         ▼
                                               └──── enemy (one world step, then observe threats)
```

- `idle`: no battle. Each player command is followed by one world step, with hurting enemies holding fire (there are none in the hero's room by definition, Req 4).
- `intro`: the battle has begun; nobody acts. Lasts `INTRO_SEC = 10` clock seconds or until skipped (Req 9, 12).
- `player`: the player's turn. `secondsLeft` starts at `TURN_SEC = 30` (Req 16) and counts down on `clockSecond()` unless a hold is on (Req 17).
- `enemy`: transient. The session runs one world step (the existing `World.tick`: tell or strike on each enemy's cadence, Req 18), then calls `observe()`, which returns to `player` with a fresh timer or ends the battle (Req 5).

The session owns the world; the orchestrator only decides. Its API:

```ts
type BattlePhase = 'idle' | 'intro' | 'player' | 'enemy';
interface BattleState { phase; battle: number; secondsLeft: number | null; introLeft: number; enemyIds: string[]; holds: Set<string> }
observe(b, threats: Enemy[], ctx): BattleTransition   // after every world step and on arrival: start, keep or end a battle
playerActed(b): 'enemy-turn' | 'free-step'             // a non-empty line was run
clockSecond(b): 'timeout' | 'intro-done' | null        // one real second passed
skipIntro(b): boolean
setHold(b, reason, on)                                 // 'editor', 'laptop'; pause and the intro are implicit
```

Every transition pushes one KernelEvent (below), so the play page, the lab and the tests see the same sequence.

## Pieces

```
src/contracts/events.ts            + BATTLE_STARTED { battle, agent, model, taunt, advice, enemyIds }
                                   + BATTLE_TURN { battle, actor: 'player'|'enemy', first, reason: 'start'|'action'|'timeout'|'forced' }
                                   + ENEMY_ACTING { entityId }   (marks where one enemy's events start inside an enemy turn)
                                   + BATTLE_ENDED { battle, reason: 'cleared'|'left'|'respawn'|'level' }
src/game/types.ts                  GameSnapshot.battle: { phase, battle, secondsLeft, enemyIds } | null; tacticalMode removed
src/game/battle.ts          (new)  the orchestrator above; TURN_SEC, INTRO_SEC; the seeded agent pick (hash of level id + battle number, Req 10)
src/game/agents.ts                 BATTLE_TAUNTS (a pool per big-four agent) and battleAdvice(types): Kiro's line from BESTIARY[type].weakness, the boss first (Req 11)
src/game/entities-combat.ts        threats(world): live, active, here, damage > 0, no truce (Req 4); tick() pushes ENEMY_ACTING before each acting enemy
src/game/session.ts                classic floors: tick() stops calling World.tick; exec() runs one world step per command; no battle (Req 8)
src/chapters/session-battle.ts (new)  adapter: runs the world step for an enemy turn, feeds threats to observe(), turns transitions into events, answers labTick/forceEnemyTurn
src/chapters/session-flow.ts       exec(): command, then battle step (enemy turn, or free step); tick(): clockSecond() + runTimed() only, no World.tick (Req 1, 21, 22);
                                   internalTick split into worldStep() and the clock; tactical code removed
src/chapters/session-state.ts      ChapterState.battle; ChapterSession gains skipBattleIntro(), holdTurnTimer(reason, on); isTacticalMode/setTacticalMode and the option removed
src/chapters/chapter-session.ts    the methods above; tacticalMode removed
src/chapters/session-shell.ts      `tactical` command and its help line removed (Req 2)
src/chapters/session-meta.ts       status line: TACTICAL removed, BATTLE phase shown when a battle runs
src/chapters/session-snapshot.ts   battle in the snapshot; TACTICAL shortcut removed
src/chapters/session-lab.ts        labTick() = force the enemy turn while a battle runs, else one world step (Req 7)
src/chapters/solve.ts              per command: N clock seconds (script.timed), N-1 forced timeouts, then exec(); exec() in intro skips it (Req 23)
src/chapters/catalog.ts            `tactical` play option removed
src/game/manual.ts                 `tactical` entry removed
src/ui/hud.ts                      #hud-tactical removed; turn indicator on the hero card: YOUR TURN 0:27 / ENEMY TURN (Req 20)
src/ui/terminal.ts, terminal-types.ts  the submit path may keep the line on the prompt (Req 12)
src/terminal-lab/commands.ts       `tactical` removed from the palette, examples and help
src/play/input.ts                  onToggleTactical removed; Enter in `intro` calls skipBattleIntro() and keeps the line; editor open/close calls holdTurnTimer('editor')
src/play/boot.ts, route.ts         ?tactical=1 removed
src/play/loop.ts                   BATTLE_STARTED to the dialog box (agent taunt, then Kiro advice); an enemy turn's batch split at ENEMY_ACTING and fed to the stage 400 ms apart, the snapshot painted at the end (Req 19)
src/pages/chapters-level-grid.ts,
src/pages/chapters-page*.ts        "Launch in Tactical Mode" checkbox and launchTactical removed
src/styles/game.css, hub.css       tactical styles removed; turn indicator style
src/procgen/fx/presets*.ts         new fx.fight ("FIGHT!") preset (artist, particle-effect-validator)
src/renderer/event-fx.ts           BATTLE_TURN { first: true } plays fx.fight on the hero
src/renderer/stage-motion.ts       a tell (windup) holds until its strike or the next BATTLE_TURN / BATTLE_ENDED, not 1.6 s
scripts/harness/playthrough.mjs    classic campaign run: its idle steps call labTick() (tick() no longer steps the world)
scripts/harness/props/gameplay.mjs battle properties (phase always valid, enemy damage only in an enemy turn, player first)
scripts/harness/battle-unit.mjs (new)  orchestrator and session battle unit suite
scripts/harness/terminal-lab/*.lab.json  fixtures that used `tactical` or relied on real-time ticks updated
scripts/harness/visual/screens.json  a battle-start screen (baseline approved by a person)
scripts/harness/agents-build.mjs   src/game/battle.ts added to chapters-designer's owned paths; agents regenerated
```

## Decisions

- **The orchestrator is pure and lives in `src/game/`.** Both the chapter session and the classic session can import it (Req 3); keeping it free of timers makes headless runs, the lab and properties deterministic. Rejected: a class with its own `setInterval` in `src/play/` (headless runs would need a fake clock, and the lab could not step it).
- **The session runs the world, the orchestrator decides.** The enemy turn is the existing `World.tick` (Req 18), so cadence, tells, grace, truce, `holdEnemiesUntil`, `safe` and the lab's absorbed damage stay exactly as they are. Rejected: moving enemy AI into the orchestrator (a rewrite with no gain).
- **A command that starts a battle is a free step.** When `cd` takes the hero into a room with threats, the world step after it runs with hurting enemies holding fire (the existing truce path: clock 0, no tell), then `observe()` starts the intro. That is how the player always acts first (Req 13).
- **The intro is timed by the session, played by the UI.** `INTRO_SEC` counts on `clockSecond()`, so it ends the same way in play and in a headless run; the dialog box and the stage only play the events (`BATTLE_STARTED`, then `BATTLE_TURN { first }` for the banner). Rejected: the UI calling back when its animation ends (a lost callback would freeze the battle).
- **`exec()` during `intro` skips the intro and runs the line.** That is the headless path (solver, lab driver, properties call `exec` directly). The play page enforces Req 12 by catching Enter in `intro` before `exec`: it calls `skipBattleIntro()` and keeps the typed line on the prompt.
- **Two clocks, one of them real.** `tick()` (one real second, from the play loop) does only `clockSecond()` and `runTimed()` (Req 22). The world steps only on a command or an enemy turn (Req 21). This drops `internalTick`'s real-time branch and the whole tactical branch.
- **Timer holds are named reasons.** Pause already stops `tick()`. The intro implicitly holds the timer. `holdTurnTimer('editor' | 'laptop', on)` covers the mini-editor now and the laptop once the chapter gives it (today the laptop is lab-only, so only the hook exists). Dialog boxes are not a hold (Req 17).
- **Stagger is a play-layer concern.** The game resolves the whole enemy turn at once (Req 19); `ENEMY_ACTING` markers let `src/play/loop.ts` cut the batch per enemy and feed the stage 400 ms apart. HP and the snapshot paint after the last slice, so the HUD never shows damage before its strike. Rejected: delays in the game (headless runs would wait).
- **Tells hold until the next turn.** With turns, a told attack can wait up to 30 s; the stage keeps the windup pose until the strike or until the turn or battle changes, instead of relaxing after 1.6 s.
- **Seeded agent, data-table text.** The agent is `BIG_FOUR[hash(levelId, battle) % 4]`; the taunt is picked from that agent's pool with the same hash. Advice comes from `BESTIARY[type].weakness` of the strongest threat (boss first), so new enemies get advice for free (Req 10, 11).
- **Solver pressure stays comparable.** Today each command waits `--ticks N` real-time ticks. Now each command is followed by one enemy turn, plus `N - 1` forced timeouts, plus `N` clock seconds so `script.timed` still fires (Req 23). If a level stops clearing with 0 deaths, its `solutionCommands` are fixed in the chapter spec, not the pressure.
- **Classic floors lose real-time damage only.** `src/game/session.ts` keeps its own agents and quests, steps its world once per command, and gets no intro (Req 8, user decision).
- **Tactical Mode is deleted, not hidden.** No flag stays behind for dev use (Req 2).

## Layers and gates

- No new layer, page or route; `src/game/battle.ts` sits in `game/` and imports only `contracts/` and `game/` files. `check-layers.mjs` is unchanged.
- Contract change: four new `KernelEvent` variants and `GameSnapshot.battle` (exhaustive switches over `KernelEvent` will flag every consumer at `tsc`).
- No chapter, comix or Terminal Lab vocabulary change; `quality:declarative` must stay green (the engine names no level; the agent pick hashes the level id, it does not branch on it).
- Fingerprint: the new `fx.fight` preset adds entries to `quality:fingerprint`; every other model, texture and FX hash must stay byte-identical. The diff is explained in the final report.
- New file ownership: `src/game/battle.ts` and `scripts/harness/battle-unit.mjs` need an owner in `agents-build.mjs` (`chapters-designer`), then `node scripts/harness/agents-build.mjs` and `npm run quality:agents`.
- Gates: `npm run quality`, `node scripts/harness/battle-unit.mjs`, `node scripts/harness/property-tests.mjs --only gameplay,chapters,terminal`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/editor-smoke.mjs`, `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs`, `npm run quality:fingerprint`, `node scripts/harness/visual-audit.mjs --screens <battle-start>`, `npm run build`.
