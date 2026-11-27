# Laptop rework: requirements

Status: requirements-approved (requirements approved by the user 2026-11-27)

Capability: reworks the developer's CSS 3D clamshell laptop (`src/laptop/`) and its in-game `/play` overlay (`src/play/laptop.ts`) so running the laptop in-game is immediately obvious (auto-opening the lid on launch and adding a prominent physical Power button top-right of the deck beside the speaker grille) and removes all rectangular backgrounds behind the floating 3D laptop on `/play` while keeping `/laptop-lab`'s comic-panel stage intact.

## Findings from the code (existing behaviour, not decisions)

- **Why running the laptop in `/play` is currently non-obvious**:
  - `src/play/laptop.ts` (`openLaptop`) calls `mountLaptop(panel, { start: 'closed', ... })` without `/laptop-lab`'s yellow hint caption (`CAPTION` in `src/laptop/lab/lab-page.ts`) or sidebar lifecycle buttons.
  - The player first sees a shut clamshell (`closed`) with no prompt, must guess to click `.lt-lid` (`src/laptop/ui/laptop.ts`) to reach `'open'`, and then faces a dark `#1a211e` screen with no physical Power button anywhere on `.lt-deck` (`src/laptop/ui/laptop-view.ts`) — they have to guess to click the dark LCD screen itself to send `'POWER'`.
  - In `src/laptop/domain/geometry.ts`, both `far` (`tilt = 36°`) and `near` (`tilt = 15°`) camera framings keep the entire `.lt-deck` unobstructed when the lid is open (`lidOpenDeg = 105°`).
- **Why a background currently appears (and why it can be removed completely)**:
  - Three stacked CSS layers paint rectangles behind the 3D laptop:
    1. `.laptop-overlay` (`background: rgba(20, 15, 18, 0.82)` in `src/styles/play-laptop.css`)
    2. `.laptop-overlay-panel` (`background: var(--paper)`, `border: 5px solid var(--ink)`, `box-shadow: 6px 6px 0 var(--ink)` in `src/styles/play-laptop.css`)
    3. `.lt-scene` (`background-color: #211a36` and radial halftone dots in `src/styles/laptop.css`)
  - The 3D laptop itself (`.lt-rig` -> `.lt-shadow`, `.lt-deck`, `.lt-front`, `.lt-lid` in `src/laptop/ui/laptop-view.ts`) is built from standalone CSS 3D planes, so making those container layers transparent allows the clamshell to float directly over the live comic stage and terminal with zero background box.

## Requirements

1. WHEN the player opens the laptop overlay on `/play` (via `.item-slot.item-laptop`, `F4`, or `window.__laptopOverlay.open()`), THE SYSTEM SHALL mount the laptop in `'closed'` and automatically send `'OPEN'` so the lid swings open (`'closed'` -> `'opening'` -> `'open'`) right away, immediately revealing the keyboard deck, physical Power button, and screen.
2. THE SYSTEM SHALL add a physical Power button on the top-right of the laptop deck beside the speaker grille (`.lt-grille`), styled as a comic clamshell hardware control with a power glyph and LED; WHILE the laptop is in `'open'`, the Power button SHALL display an amber off-state highlight so pressing it to boot is immediately obvious, and WHILE in `'diving'`, `'booting'`, `'desktop'`, or `'shutting'`, it SHALL reflect the powered-on state.
3. WHEN the player clicks the physical Power button while in `'open'`, THE SYSTEM SHALL send `'POWER'` to start booting (`'diving'` -> `'booting'` -> `'desktop'`); WHEN the player clicks the physical Power button while in `'booting'` or `'desktop'`, THE SYSTEM SHALL send `'POWER'` to shut down (`'shutting'` -> `'surfacing'` -> `'open'`).
4. WHEN the player clicks the dark `.lt-screen` (or lid while `'open'`) while in `'open'`, THE SYSTEM SHALL continue to send `'POWER'` to boot, preserving existing screen-click muscle memory alongside the physical Power button.
5. WHILE the laptop overlay is open on `/play`, THE SYSTEM SHALL render `.laptop-overlay`, `.laptop-overlay-panel`, and the mounted `.lt-scene` with fully transparent backgrounds and zero panel border or box-shadow, so only the floating 3D laptop (and its `.lt-shadow`), comic SFX words, and the `CLOSE [Esc]` button appear over the live game stage and terminal; WHILE `/laptop-lab` displays the laptop, THE SYSTEM SHALL retain its comic-panel frame and purple halftone `.lt-scene` background unchanged.
6. WHILE the laptop overlay is open on `/play`, WHEN the player clicks empty space outside the 3D laptop body (and outside the `CLOSE [Esc]` button), THE SYSTEM SHALL close the laptop overlay, dispose it, and restore focus to the terminal without propagating the click to the stage or HUD underneath; WHEN the player clicks `CLOSE [Esc]`, presses `Escape`, or presses `F4`, THE SYSTEM SHALL continue to close the overlay without opening the Esc menu.
7. WHILE the laptop overlay is open on `/play`, THE SYSTEM SHALL preserve all existing overlay invariants from `.kiro/specs/play-laptop-overlay/`: requiring `'laptop'` in `snapshot.inventory.items`, routing keyboard/pointer input to the laptop instead of the terminal, keeping the battle turn timer running (no `holdTurnTimer`), forwarding actions through `laptopHear`, and persisting task progress under `out-of-credits:laptop-progress:v1` (or in memory only during `preview` / `terminalLab`).

## Out of scope

- Removing the purple halftone background or comic-panel frame in `/laptop-lab`.
- Auto-booting straight into `'desktop'` on launch (skipping the `'open'` state and Power button interaction).
- Everything in `.kiro/specs/laptop-web-studio/` (virtual disk, `Files`, `Browser`, live `/room` mount, `laptop` shell command).
- Modifying `item.laptop` or `vibecoder.dev_laptop` Three.js models (`src/procgen/`) or adding new coding apps or tasks.

## Decisions

- **Q:** When opening the laptop in-game (`/play` via `F4` or the HUD slot), how should it start so running it is immediately obvious?
  **A (user, 2026-11-27):** Auto-open the lid on launch (`closed` -> `opening` -> `open`) — swings the lid open right away so the keyboard deck and Power button are immediately visible.
- **Q:** Where should the physical Power button sit on the laptop?
  **A (user, 2026-11-27):** Top-right of the deck beside the speaker grille (`.lt-grille`) — classic 90s clamshell placement with a power glyph + LED and an amber highlight while off.
- **Q:** How should pressing the Power button (and clicking the dark screen) behave?
  **A (user, 2026-11-27):** Power button toggles power (boots in `'open'`, shuts down in `'booting'`/`'desktop'`), and clicking the dark screen in `'open'` still boots too — obvious hardware button without breaking screen-click muscle memory.
- **Q:** Where should the background behind the 3D laptop be removed?
  **A (user, 2026-11-27):** Transparent in `/play` only (keep the comic-panel stage in `/laptop-lab`) — removes the dark backdrop, paper frame, and purple halftone scene fill in-game so only the 3D laptop floats over the live stage and terminal.
- **Q:** With the background removed in `/play`, what should clicking empty space outside the 3D laptop body do?
  **A (user, 2026-11-27):** Close the laptop overlay (while keeping the floating `CLOSE [Esc]` button too) — natural dismissal when the live game is visible around the laptop.

## Open questions

## Verification

- Spec & brand gates: `node scripts/quality/check-specs.mjs`, `npm run quality:brands`
- Unit & lab verification: `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/laptop-lab.mjs --verify`
- Headless Chrome E2E: `node scripts/harness/laptop-lab-smoke.mjs --width 1280 --height 820`, `node scripts/harness/play-laptop-smoke.mjs` (both 1600x950 and `--width 1280 --height 820`: auto-open on `/play` launch, physical Power button visible and boots/shuts down, transparent background in `/play`, outside click closes overlay)
- Project gates: `npm run quality`, `npm run build`
