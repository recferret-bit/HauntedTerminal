# Property-based tests: how to use them

`node scripts/harness/property-tests.mjs` checks invariants of the game on thousands of generated inputs instead of a handful of hand-written ones. It uses [fast-check](https://fast-check.dev) 4.10.2, a fixed seed and 100 runs per property, finishes in a few seconds and runs inside `npm run quality`. Spec: `.kiro/specs/property-based-tests/`.

## Run it

```bash
node scripts/harness/property-tests.mjs                        # all 86 properties, the gate
node scripts/harness/property-tests.mjs --only terminal,laptop # one or more features: terminal laptop comix chapters gameplay
node scripts/harness/property-tests.mjs --runs 2000           # look harder (the gate stays at 100)
node scripts/harness/property-tests.mjs --seed 7 --runs 500   # other random inputs
node scripts/harness/property-tests.mjs --list                # property names only
```

A line per property: `ok` or `FAIL`, the time, the name, the runs. Exit code 0 is a pass; an `--only` that selects no feature exits 2. `kit.mjs`, `sessions.mjs` and `arbitraries.mjs` are helpers, not `--only` suites. The runner refuses async properties and async `check()`s (fast-check would return a Promise that reads as a pass) and proves that on every start. A run that hangs (an endless loop in game code) is killed after 20 s with the property named (exit 137; `--hang-ms` changes the limit).

## What they check

| Feature | Examples of what must always hold |
|---|---|
| terminal (both shells) | the shell never throws on any line; `cp`, `mv`, `chmod`, `rm` keep their unix meaning; `chmod` previews match POSIX for every mode 000..777; every command has a manual entry; an unreadable file cannot be copied; `sed` with an empty pattern is refused; `restart-level` arms on a bare run and restarts only on the very next line or `--yes` within 20 ticks; the Esc menu traps keys, never touches the turn timer and keeps a pending restart unchanged; `skin <id>` and the sound and skin prefs; manual search; `map <query>` resolves any query to a chapter level and `map <n>` to level n; classic and chapter shells agree on the unix applets (`wc`, `grep -c`, `head`, `tail`, `cut`, `sed`, `rev`, `chmod`); `reverseLines` is an involution; `applyChmodMode` clauses change only the bits they target; the UI state-machine tables (dialog box, chapter map, Esc menu, native modal, manual book, dialog socket, visual lab, search drawer) reach only valid states; the dialog orchestrator shows at most one box, queues at most 3 chatter lines and holds chatter while a socket is open |
| laptop | the state machine stays in known states with timers firing at any moment; one window per app and a sane focus; the loop guard leaves loop-free code alone, still compiles guarded code and names each loop's own line; saved progress never throws |
| comix | the shipped comixes simulate after random tuning; the Check tab reports eight kinds of breakage; the canonical writer reproduces every file; cue arithmetic |
| chapters | random play never throws on any of the 11 levels; the same play gives the same transcript; the Check tab reports ten kinds of breakage; the canonical writer; preview sessions never leak `ACH_*` unlocks; portable save import rejects prototype keys and merges monotonically; random PIDs (in range, not reserved, listed by `ps`, re-rolled on `restart-level`, kept by labs); `script.locks`; timed `dialog_box`; a 0-death solve for any PID seed |
| gameplay | HP stays in range; dead enemies stay dead; a pickup is collected once; the inventory; a level is left only when its win rules hold; a Kiro hub loads any known core but only its own satisfies the win rule, and an unknown core is refused; Kiro skill charges (one per skill per level, then the VRAM pool, never negative, a refusal is free); every exit door is a `door.ethernet`, locked exactly when the win rules fail; battles (player acts first, damage only in an enemy turn); the 30 s turn timer (runout is one `timeout` enemy turn, holds freeze it); every command emits `VIBECODER_ACTION`; room floors; jump grants; the play lifecycle, Kiro companion and agent director state machines follow their transition tables; the battle follows `BATTLE_TRANSITIONS` (turn timer, holds); `AppBus` keeps publish order, caps `recent()` at 200 entries and honours unsubscribe; `PlayEventBus` delivers events in order and drops unsubscribed listeners; random play still reaches kills, pickups, attacks and exits |

## Reading a failure

```
FAIL  0.03s  `cp a b` then `cat b` prints what `cat a` prints (both shells) (3 runs)
      counterexample: ["classic",["a.conf","b"],"0"]
      shrunk 4 time(s) after 3 run(s)
      cause: classic: cat a.conf printed "0\nx\n", cat a printed "0\n"
      replay: node scripts/harness/property-tests.mjs --seed 20261117 --only terminal
```

The counterexample is the smallest input that fails (fast-check shrinks it). Replay it alone with the printed command, fix the cause in the game, then keep the counterexample as a regression case by adding it to that property's `examples` (the array holds one entry per argument of the property, in order).

## Add or change a property

Each feature has one file in `scripts/harness/props/`; the designer agent of the feature owns it: `terminal.mjs` terminal-designer, `laptop.mjs` laptop-designer, `comix.mjs` comix-designer, `chapters.mjs` / `gameplay.mjs` / `sessions.mjs` and the Tensor GPU ritual suites `script-beats.mjs` (`wait`, Skip Dialog flush), `tree-search.mjs` (decoy trees, `tree`, `grep -r`, the VRAM hunts), `revisit.mjs` (the revisit rule, taken pickups), `ritual.mjs` (the Hub 1 ritual) and `kiro-skills.mjs` (skill charges) chapters-designer; the runner, `kit.mjs` and `arbitraries.mjs` are lead-dev's (`scripts/harness/agents-build.mjs`). A property is `{ name, build: () => fc.property(arbitraries..., (inputs) => { expect(ok, 'message') }), examples? }`; `{ name, check: () => void }` is for a guard with no generated input. Shared generators are in `arbitraries.mjs`, the runner helpers in `kit.mjs`, the compiled chapter as a playground in `sessions.mjs`. Properties of lead-dev-owned code stay in these suites (`PlayLifecycle`, `AppBus`, `PlayEventBus` and `BATTLE_TRANSITIONS` in `gameplay-fsm.mjs`; the UI transition tables in `terminal-ui.mjs`), and the suite's owner updates them when lead-dev reports a behaviour change.

Rules of thumb:

- Drive the real code (a lab or chapter session, the real checkers), not a copy of its logic.
- A property that cannot fail is worse than none. After writing one, plant the bug it should catch, see it fail, and revert the bug.
- Name regression corruptions by key path (`{ path: ['boss'], how: 'null' }`), not by index: indexes move when a spec changes.
- If the correct behaviour is unclear, do not guess in the property: ask the user.

## Bugs they have found

Mutation-style checks and property runs found seven real bugs: `mv .. j` turning the file tree into a loop (crash or hang); `ls -l <file>` printing only the name in chapter levels; the comix and chapter checks crashing on a hand-edited draft; `sed 's//x/g'` inserting `x` between every character; `cp` copying a file `cat` cannot read; a level-10 Kiro core alias that `kiro load` accepted but the exit rule did not; and portable save import reading `Object.prototype.toString` on `progress: { toString: ... }`. Details: `.kiro/specs/property-based-tests/tasks.md` and `scripts/harness/props/chapters.mjs`.
