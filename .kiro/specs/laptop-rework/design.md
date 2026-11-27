# Laptop rework: design

Status: see requirements.md

## Pieces

```
src/laptop/ui/laptop-view.ts      Adds powerBtn: HTMLButtonElement (`button.lt-power`, type="button", aria-label="Power",
                                  containing `.lt-power-led`, `.lt-power-glyph` '⏻', and 'POWER') on the right of a new
                                  `.lt-topstrip` flex row alongside `.lt-grille` at the top of `.lt-deck`. `show(next)`
                                  syncs `powerBtn.disabled = !nextState(next, 'POWER')` and `powerBtn.dataset.power`
                                  ('ready' in 'open'; 'on' in 'diving' | 'booting' | 'desktop' | 'shutting'; 'off' else)
                                  (Req 2, 3).
src/laptop/ui/laptop.ts           Extracts `wireChassisClicks(view, machine)` (keeping `mountLaptop` under the 130-line
                                  function cap) to wire `view.powerBtn` click -> `stopPropagation()` + `machine.send('POWER')`
                                  alongside `.lt-lid` click ('closed' -> 'OPEN', 'open' -> 'POWER'). Scopes `wireInput`'s
                                  `onPointerDown` button-click SFX to `.lt-deck` (`t.closest('.lt-deck') && !t.closest('.lt-key')`)
                                  so clicking transparent empty space around the laptop plays no hardware click (Req 3, 4, 6).
src/styles/laptop.css             Styles `.lt-topstrip` (height 24px + margin-bottom 8px = 32px total, identical to the
                                  old 22px + 10px `.lt-grille` budget so `.lt-keys` and `.lt-palm` shift 0px), `.lt-grille`
                                  (`flex: 1`), and `.lt-power` / `.lt-power-led` using `--z-*` palette custom properties
                                  only: stepped cel-shaded amber pulse (`lt-power-pulse` via `steps(2, jump-none)`) when
                                  `data-power="ready"`, phosphor green LED when `data-power="on"`, and tactile 3D press on
                                  `:active:not(:disabled)`. Sets `pointer-events: none` on `.lt-shadow` so cast-shadow pixels
                                  outside `.lt-deck` count as outside clicks (Req 2, 3, 6).
src/play/laptop.ts                After `mountLaptop(panel, { start: 'closed', ... })`, calls `lt.view.frame(false)` (commits
                                  the initial 'closed' rig transform and flushes layout via `offsetWidth`) and immediately
                                  calls `lt.machine.send('OPEN')` so every `/play` open animates `'closed'` -> `'opening'` ->
                                  `'open'` smoothly (Req 1). Tracks `pointerdown` on `root` (`downInsideLaptop` via
                                  `.closest('.lt-deck, .laptop-overlay-close')`) and closes on `click` (`stopPropagation()`)
                                  when neither `pointerdown` nor `click` hit `.lt-deck` or `.laptop-overlay-close`, preventing
                                  drag-release accidental closes and blocking propagation to the stage/HUD (Req 6, 7).
src/styles/play-laptop.css        Makes `.laptop-overlay` (`background: transparent; overflow: hidden`), `.laptop-overlay-panel`
                                  (`border: 0; background: transparent; box-shadow: none; overflow: visible`), and
                                  `.laptop-overlay .lt-scene` (`background: none; overflow: visible`) completely transparent
                                  so only the 3D laptop, its `.lt-shadow`, comic SFX words, and `CLOSE [Esc]` float over `/play`,
                                  while `/laptop-lab` keeps its comic-panel frame and purple halftone `.lt-scene` intact (Req 5).
scripts/harness/play-laptop-smoke.mjs  Updates `/play` headless Chrome E2E checks (1600x950 and 1280x820) for auto-open on
                                  launch (`opening` -> `open`), `.lt-power` visibility + `data-power="ready"` + boot/shutdown
                                  clicks, `.lt-screen` click-to-boot in `'open'`, computed transparent backgrounds on
                                  `#laptop-overlay` / `.laptop-overlay-panel` / `#laptop-overlay .lt-scene`, and outside-click
                                  close + focus return (Req 1-7).
```

## Decisions

- **Layout flush before `send('OPEN')` on `/play` launch.** Calling `lt.view.frame(false)` right after `mountLaptop` snaps `.lt-rig` to its `'closed'` framing and flushes layout (`offsetWidth`) before `lt.machine.send('OPEN')` flips `data-lid="up"`. Without that flush, the browser coalesces `'closed'` and `'opening'` in one frame and skips the 1.5s creaky-hinge CSS transition; with it, `state()` is synchronously `'opening'` for deterministic tests and the hinge animates smoothly (follows Req 1).
- **Top strip preserves exact 32px vertical deck budget.** Replacing standalone `.lt-grille` (`22px` + `10px` margin) with `.lt-topstrip` (`24px` + `8px` margin) holding `.lt-grille` (`flex: 1`) + `button.lt-power` keeps `.lt-keys` and `.lt-palm` at the exact same coordinates in `470px` `.lt-deck`, keeping all `/laptop-lab` smoke hit coordinates unchanged (follows Req 2).
- **Stepped palette-only styling for `.lt-power`.** Uses `--z-powerAmber`, `--z-paper`, `--z-phosphor`, `--z-plastic`, `--z-solder`, `--z-heatsink`, and `--z-ink` with `steps(2, jump-none)` (no smooth CSS colour transitions or raw hex outside `palette.ts`), respecting `credits-art-direction` (follows Req 2).
- **Scoped `.laptop-overlay .lt-scene` transparency and `overflow: visible`.** Overriding `.lt-scene` inside `.laptop-overlay` leaves `/laptop-lab` untouched; `overflow: visible` on `.laptop-overlay-panel` and `.lt-scene` (with `overflow: hidden` on viewport-sized `.laptop-overlay`) prevents the spring-overshoot lid animation from clipping against an invisible `18px` inner box (follows Req 5).
- **Pointer-down + click guard for outside dismissal.** All physical laptop faces (`.lt-lid`, `.lt-front`, `.lt-palm`, `.lt-keys`, `.lt-topstrip`) live inside `.lt-deck` while `.lt-shadow` gets `pointer-events: none`. Requiring both `pointerdown` and `click` to land outside `.lt-deck, .laptop-overlay-close` ensures dragging an icon or selecting code past the screen bezel never closes the laptop accidentally (follows Req 6).

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Unchanged (`laptop/ui` already imports `laptop/domain`; `play/` already imports `laptop/`).
- **Pages (`vite.config.ts`), chapter/lab vocabularies, and `quality:fingerprint`:** Unchanged (DOM/CSS laptop only; `src/procgen/` untouched).
- **Size gate (`quality:size`):** `mountLaptop` in `src/laptop/ui/laptop.ts` is currently 122/130 lines; extracting `wireChassisClicks` keeps every function well below 130 lines and every file well below 600 lines.
- **Verification gates:** `node scripts/quality/check-specs.mjs`, `npm run quality:brands`, `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/laptop-lab.mjs --verify`, `node scripts/harness/laptop-lab-smoke.mjs --width 1280 --height 820`, `node scripts/harness/play-laptop-smoke.mjs` (1600x950 and `--width 1280 --height 820`), `npm run quality`, `npm run build`.
- **Docs to update with implementation:** `src/play/laptop.ts` file comment, `.kiro/specs/play-laptop-overlay/requirements.md` (`## Later changes` note pointing to `.kiro/specs/laptop-rework/`), and `.kiro/skills/laptop-lab/SKILL.md` if needed.
