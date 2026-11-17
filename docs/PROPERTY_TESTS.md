# Property-based tests: how to use them

`node scripts/harness/property-tests.mjs` checks invariants of the game on thousands of generated inputs instead of a handful of hand-written ones. It uses [fast-check](https://fast-check.dev) 4.10.2, a fixed seed and 100 runs per property, finishes in a few seconds and runs inside `npm run quality`. Spec: `.kiro/specs/property-based-tests/`.

## Run it

```bash
node scripts/harness/property-tests.mjs                        # all 32 properties, the gate
node scripts/harness/property-tests.mjs --only terminal,laptop # one or more features: terminal laptop comix chapters gameplay
node scripts/harness/property-tests.mjs --runs 2000           # look harder (the gate stays at 100)
node scripts/harness/property-tests.mjs --seed 7 --runs 500   # other random inputs
node scripts/harness/property-tests.mjs --list                # property names only
```

A line per property: `ok` or `FAIL`, the time, the name, the runs. Exit code 0 is a pass. A run that hangs (an endless loop in game code) is killed after 20 s with the property named (exit 137; `--hang-ms` changes the limit).

## What they check

| Feature | Examples of what must always hold |
|---|---|
| terminal (both shells) | the shell never throws on any line; `cp`, `mv`, `chmod`, `rm` keep their unix meaning; an unreadable file cannot be copied; `sed` with an empty pattern is refused |
| laptop | the state machine stays in known states with timers firing at any moment; one window per app and a sane focus; the loop guard leaves loop-free code alone and still compiles guarded code; saved progress never throws |
| comix | the shipped comixes simulate after random tuning; the Check tab reports eight kinds of breakage; the canonical writer reproduces every file; cue arithmetic |
| chapters | random play never throws on any of the 11 levels; the same play gives the same transcript; the Check tab reports ten kinds of breakage; the canonical writer |
| gameplay | HP stays in range; dead enemies stay dead; a pickup is collected once; the inventory; a level is left only when its win rules hold; a Kiro hub refuses the wrong core; random play still reaches kills, pickups, attacks and exits |

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

Each feature has one file in `scripts/harness/props/`; the designer agent of the feature owns it (`terminal.mjs`, `laptop.mjs`, `comix.mjs`, `chapters.mjs` / `gameplay.mjs` / `sessions.mjs`). A property is `{ name, build: () => fc.property(arbitraries..., (inputs) => { expect(ok, 'message') }), examples? }`; `{ name, check: () => void }` is for a guard with no generated input. Shared generators are in `arbitraries.mjs`, the runner helpers in `kit.mjs`, the compiled chapter as a playground in `sessions.mjs`.

Rules of thumb:

- Drive the real code (a lab or chapter session, the real checkers), not a copy of its logic.
- A property that cannot fail is worse than none. After writing one, plant the bug it should catch, see it fail, and revert the bug.
- Name regression corruptions by key path (`{ path: ['boss'], how: 'null' }`), not by index: indexes move when a spec changes.
- If the correct behaviour is unclear, do not guess in the property: ask the user.

## Bugs they have found

Mutation-style checks and the first runs found: `mv .. j` turning the file tree into a loop (crash or hang); `ls -l <file>` printing only the name in chapter levels; the comix and chapter checks crashing on a hand-edited draft; `sed 's//x/g'` inserting `x` between every character; `cp` copying a file `cat` cannot read; and a level-10 Kiro core alias that `kiro load` accepted but the exit rule did not. Details: the property spec's `tasks.md`.
