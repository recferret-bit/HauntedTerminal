# Play laptop overlay: requirements

Status: done

Capability: the developer's laptop opens during the game on `/play`. It reuses the Laptop Lab laptop as is (`mountLaptop` from `src/laptop/ui/laptop.ts`: the CSS 3D clamshell model, lifecycle machine, desktop, JS Pad, Web Weaver, tasks, sandboxed runner, sounds) and shows it full window (over the stage and the terminal) when the player carries `laptop`. No new laptop features; the `laptop-web-studio` draft (virtual disk, Files, Browser, `/room` mount) stays a separate spec.

## Requirements

1. WHEN the player on `/play` clicks the `.item-slot.item-laptop` HUD slot or presses `F4`, IF `'laptop'` is in `snapshot.inventory.items`, THE SYSTEM SHALL open the laptop overlay full window, covering the stage and the terminal, mounting the same `mountLaptop` the Laptop Lab mounts, starting in the `closed` state so the player clicks the lid to open and boot it.
2. IF `'laptop'` is not carried, THE SYSTEM SHALL not open the overlay on a slot click or `F4` (the slot stays dim and not clickable, as the map and manual slots do).
3. WHILE the overlay is open, THE SYSTEM SHALL route the page's keyboard to the laptop and not to the terminal, and SHALL keep the battle turn timer running (no `holdTurnTimer` call), as the map and manual do.
4. WHEN the player presses the overlay's Close button or `Escape`, THE SYSTEM SHALL close the overlay, dispose the laptop's listeners and windows, and give focus back to the terminal; that `Escape` SHALL NOT also open the Esc menu.
5. WHEN `F4` is pressed while the overlay is open, THE SYSTEM SHALL close it (toggle).
6. WHEN the laptop emits actions (`open`, `key`, `fan-on`, ...), THE SYSTEM SHALL turn them into app events on the play session's bus the same way the Laptop Lab does, so the existing laptop sounds play.
7. THE SYSTEM SHALL save in-game laptop task progress under its own `localStorage` key `out-of-credits:laptop-progress:v1`, separate from the Laptop Lab's `credits.laptop.progress`; WHILE `/play` runs a preview (`?draft=1`) or a lab (`?lab=1`), it SHALL keep progress in memory only.

## Out of scope

- Everything in `.kiro/specs/laptop-web-studio/` (virtual disk, Files, Browser, live `/room` mount, diagnostics).
- Changing the laptop model, its apps or its tasks.

## Decisions

- **Q:** What should the in-game laptop be? **A (user, 2026-11-27):** Reuse the Laptop Lab laptop, its model and all its internals, and open it during the game; no new laptop features.
- **Q:** Which inputs open it? **A (user, 2026-11-27):** Clicking the laptop slot or pressing `F4` (no `laptop` shell command).
- **Q:** Where does it start on each open? **A (user, 2026-11-27):** The closed lid every time; the player clicks to open and boot it, as in the lab.
- **Q:** How does it close? **A (user, 2026-11-27):** The Close button or `Escape`; that `Escape` does not open the Esc menu.
- **Q:** Where is task progress saved? **A (user, 2026-11-27):** A separate in-game key, apart from `/laptop-lab`.
- **Q:** Does it hold the battle turn timer? **A (user, 2026-11-27):** No, it keeps running like the map and manual. The glossary line "pauses ... while the `edit` mini-editor or the laptop is open" is updated to drop the laptop.

- **Q:** How big is the overlay? **A (user, 2026-11-27):** Full sized: it covers the terminal space too, not only the stage.

## Open questions

## Verification

- `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/manual-smoke.mjs` (slot click and `F4` open and close the overlay only when carried; Escape closes it without the Esc menu), `npm run quality` (layers: `play/` may import `laptop/ui/`), `node scripts/harness/generate-chapter.mjs --verify --ticks 3`.

## Later changes

- **2026-11-27 (`.kiro/specs/laptop-rework/`)**: `/play` overlay now floats with a completely transparent background (removing `.laptop-overlay`, `.laptop-overlay-panel`, and `.laptop-overlay .lt-scene` backgrounds/borders while keeping `/laptop-lab`'s comic-panel stage intact), auto-opens the lid on launch (`closed` -> `opening` -> `open`), adds a physical `POWER` button (`.lt-power`) top-right beside `.lt-grille` on `.lt-deck`, and closes on clicks outside `.lt-deck`.
