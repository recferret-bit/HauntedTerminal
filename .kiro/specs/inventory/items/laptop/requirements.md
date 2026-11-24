# Laptop Item & Lab: requirements

Status: done (implemented and verified against all quality gates 2026-11-17)

Capability: `item.laptop` is the developer's old clamshell laptop carried like a briefcase and held in his screen-right hand by hero model `vibecoder.dev_laptop`. In-game it is his portable coding workstation; out-of-game a dev emulator `/laptop-lab` renders the clamshell in CSS 3D inside a comic panel, animating opening, diving, booting, and running a retro desktop whose apps (JS Pad, Web Weaver) execute real JS in a Worker and HTML/CSS/JS in a sandboxed iframe with deterministic coding tasks and loop protection.

## Requirements

1. THE SYSTEM SHALL define `item.laptop` in the unified item registry with id `'laptop'`, label `'laptop'`, standalone model `'item.laptop'`, and hero model `'vibecoder.dev_laptop'`.
2. THE SYSTEM SHALL build `item.laptop` as a closed clamshell briefcase standing on `y = 0` (beige `plastic` shell, brown `hair` handle and hinge, `paper` `>_` sticker with `ink` prompt, and `powerAmber` sleep light), with sockets `grip`, `label`, `fx`, and `screen`, and WITHOUT a `light` socket.
3. THE SYSTEM SHALL register `vibecoder.dev_laptop` in `ModelCatalog` as the developer holding `item.laptop` by its handle in his screen-right hand, tagging laptop parts with arm swing and placing the handle behind the hand.
4. WHEN holding `laptop`, `vibecoder.dev_laptop` SHALL omit `sockets.lantern`; the stage lighting system SHALL treat the hero light as null (falling back to room ambient without drawing an oil-lantern halo on the hero's chest).
5. WHEN `/laptop-lab` opens, THE SYSTEM SHALL show the laptop in a comic panel with a side panel for lifecycle controls, input mirror, quests, and sound; URL options: `?state=`, `?speed=`, `?mute=1`.
6. THE SYSTEM SHALL drive the laptop by one pure state machine (`closed, opening, open, diving, booting, desktop, shutting, surfacing, closing`) with timed phases animated in CSS 3D with comic SFX.
7. WHILE the page is open, THE SYSTEM SHALL press the deck key for each real `KeyboardEvent.code` and release it on `keyup` or `blur`. The trackpad finger SHALL follow the pointer over the screen when lid is open, real mouse buttons SHALL press trackpad buttons and release on `blur`, and wheel strokes SHALL animate a drag offset with `.scrolling` in `laptop.css`.
8. THE SYSTEM SHALL boot through BIOS text, a memory count, and an OS splash with a progress bar, with optional synthesized WebAudio sounds (clicks, beep, disk chatter).
9. THE SYSTEM SHALL show a desktop run by a pure reducer, with apps `Quests`, `JS Pad`, `Web Weaver`, and `System`. WHEN an app window opens, THE SYSTEM SHALL clamp its initial position within `[0, SCREEN.w - w]` and `[0, SCREEN.h - h]` so large windows (such as `600x420` Web Weaver) never open clipped off the right or bottom edges.
10. THE SYSTEM SHALL run JS Pad code in a Worker (timeout 2.5 s) and Web Weaver pages in an iframe with `sandbox="allow-scripts"` (opaque origin), capturing console lines, formatted values, and uncaught errors safely (handling restricted getters without throwing from `fmt()`).
11. IF page code contains infinite loops, THEN THE SYSTEM SHALL stop them with a readable line-numbered error before freezing the browser tab via `guardLoops` and `guardHtmlScripts`.
12. WHEN a page run is initiated while a previous run on the same `PreviewSlot` is pending or settling, THE SYSTEM SHALL cancel the previous run's timeout and discard its completion token, so an abandoned run NEVER replaces the new page with `STOPPED_PAGE` or falsely flags `hung = true`.
13. THE SYSTEM SHALL offer seven coding tasks (3 JS Pad, 4 Web Weaver) judged by deterministic checks (`log`, `logs`, `noError`, `value`, `element`, `style`, `source`); each task's starter fails and reference solution passes; progress and drafts are saved in `localStorage` (`credits.laptop.progress`) with a reset option.

## Out of scope

- Giving the laptop to the player during the initial Kiroween chapter levels (lab only for now).
- Opening `/laptop-lab` from inside the game terminal.
- Chapter save data persistence for laptop quest progress.

## Decisions

- **Q:** Which child items belong under the Inventory entity?
  **A (user, 2026-11-17):** Three items: `lantern`, `terminal`, and `laptop` — laptop is a dedicated child entity.
- **Q:** How should stage lighting behave when holding terminal or laptop instead of lantern?
  **A (user, 2026-11-17):** Only `item.lantern` carries a `light` socket: holding `terminal` or `laptop` hides the oil-lantern halo (no chest glow bug) while keeping dim room ambient readability.
- **Q:** Which findings from the Laptop & Inventory code review should become tasks in the refactored specs?
  **A (user, 2026-11-17):** Include all review fixes (B1-B6 bugs + `hold` Tab completion, `dispose()`, scratch initial run, per-task reset, palette/ARIA cleanup) as tasks in the refactored specs.
- **Q:** How should we handle the old `.kiro/specs/laptop-inventory/` and `.kiro/specs/terminal-lab/` folders?
  **A (user, 2026-11-17):** Remove old `.kiro/specs/laptop-inventory/` and `.kiro/specs/terminal-lab/` once migrated into `.kiro/specs/inventory/` + `items/{lantern,terminal,laptop}/`, and update all steering/skill/`AGENTS.md` links.

## Open questions

## Verification

`node scripts/harness/laptop-unit.mjs` (lifecycle, desktop, checks, tasks, keyboard, boot, framing, loop guard, timeout cancellation), `node scripts/harness/laptop-lab-smoke.mjs` (both 1600x950 and 1280x820), `validate-model.mjs item.laptop vibecoder.dev_laptop --seeds 4`, and `npm run quality`.
