# Property-based tests: design

Follows `requirements.md` (approved 2026-11-17).

## Pieces

```
scripts/harness/property-tests.mjs   runner: --seed, --runs, --only; Vite SSR load; prints each property, time, failures
scripts/harness/props/
  kit.mjs                             fc.check wrapper (seed, numRuns, examples; refuses async), failure message, fake clock, runnerSelfCheck, watchdog, fakeDom
  sessions.mjs                        chapterWorld: the compiled chapter opened like the solver, random play (commands and ticks)
  arbitraries.mjs                     shared generators: file names, modes, command lines, JSON values
  terminal.mjs                        terminal properties
  laptop.mjs                          laptop properties
  comix.mjs                           comix properties
  chapters.mjs                        chapter properties
  gameplay.mjs                        gameplay-element properties
package.json                          devDependency "fast-check": "4.10.2"; script quality:props, added to quality
```

Each suite's default export is an async function of `ctx` (`ctx.load` loads a source module through Vite SSR) that returns `[{ name, build | check, examples? }]`: `build()` returns a synchronous `fc.property`, `check()` is a synchronous guard with no generated input that throws to fail, and `examples` holds the property's regression counterexamples (Req 6).

## Properties and the code they drive

| Feature | Property | Driven through |
|---|---|---|
| Terminal | the shell never throws on any line (random strings and grammar-shaped lines: words, quotes, pipes, redirects, `&&`, globs) | a lab session: `buildLabPack` (`src/terminal-lab/lab-pack.ts`) with random files, played by `createChapterSession` with its `lab` config, so nothing attacks and no damage applies |
| | `cp a b; cat b` equals `cat a`; `mv a b` keeps content and removes `a`; `chmod m f; ls -l f` shows `m`; `rm f; ls` never lists `f` | same session, random file names, contents and octal modes |
| Laptop | any event sequence keeps the machine in `LAPTOP_STATES`, and `nextState` agrees with `TRANSITIONS` | `nextState`, `createMachine` with a fake clock (`src/laptop/domain/machine.ts`) |
| | window ids stay unique; focus is null or an open window | `reduceDesktop` with random actions |
| | `guardLoops` leaves loop-free code unchanged; guarded code still compiles | `src/laptop/runtime/loop-guard.ts`, compiled with `node:vm` `Script` (never run) |
| | `parseProgress` never throws and returns a valid `Progress` | random strings and JSON values |
| Comix | the real intro and outro with random in-range timing and camera changes simulate without throwing, and the static check never throws | `simulateComixPack` (`src/cinematic/simulate.ts`), `checkComixPack` (`src/comix-editor/check.ts`) |
| | `stringifyComixJson` round-trips every page and manifest file and random JSON | `scripts/harness/lib/comix-json.mjs` |
| | `resolveTime` gives a finite number for any cue map and `CUE+offset` | `src/cinematic/expr.ts` |
| Chapters | random command sequences (from all solution commands, generic commands and random names, up to 20) never throw on any of the 11 levels | `createChapterSession` on the compiled pack |
| | the same sequence twice gives the same output, events and snapshot | fake `Date.now` (the trick `src/game/selfcheck.ts` uses), so the time fields match |
| | `stringifyChapterJson` round-trips every spec file and random JSON | `scripts/harness/lib/chapter-json.mjs` |
| | `validatePack` never throws on a mutated pack (removed fields, swapped ids, emptied lists) | `src/chapters/validate-pack.ts` |
| Gameplay | after every step of a random sequence of commands and ticks: `0 <= hp <= maxHp` | session snapshot |
| | a killed enemy never shows up alive again | `ENEMY_KILLED` events against later snapshots |
| | a pickup is collected at most once | `PICKUP_COLLECTED` events per id |
| | the inventory holds only given items; `hold` only takes one of them | `starterInventory`, `giveItem`, `holdItem`, `inventoryCommand` (`src/game/inventory.ts`) |
| | the exit opens only when the level's win rules hold | `allWinRulesMet` (`src/chapters/session-rules.ts`) checked whenever the exit opens or a level is cleared |
| | `kiro load <core>` without that core never loads it | `cmdKiro` through the session, snapshot before and after |

## Decisions

- **One runner, five suite files.** It keeps each file under 600 lines and lets `--only` pick suites by feature name. (Req 1-2, size limit.)
- **Through the real session, not mocks.** The terminal and gameplay properties run the same `exec` and `tick` path as the game and the headless solver. A lab pack gives the terminal a clean, enemy-free room. (Req 4.)
- **Default seed `20261117`, 100 runs.** On failure it prints `--seed <n>` and fast-check's `path` so the case replays. (Req 2-3, Q10.)
- **Cost control.** Sequence properties cap length at 20 commands and reuse one compiled pack. The runner prints the total time; if the default run goes over 60 s, the work stops and asks you (fewer runs for the heavy properties, or a smaller cap). (Req 5.)
- **Bugs found.** A clear one is fixed in the owning file, with the counterexample added to `examples` and a line in `tasks.md`. An unclear one (for example, should `chmod 7777` be accepted?) stops and asks. (Req 6, Q10.)
- **Not a jscpd target.** `quality:dup` scans `src/` only; the suites still share generators through `arbitraries.mjs` instead of copying them.

## Layers and gates

- No change to `src/` beyond bug fixes the properties find. No layer rule or vocabulary change.
- New gate `quality:props` inside `npm run quality`.
- `npm run quality:fingerprint` before and after (Req 7).
- New pinned devDependency `fast-check@4.10.2`.
