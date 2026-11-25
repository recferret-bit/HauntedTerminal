# Fullscreen mode: requirements

Status: done (requirements, design, tasks approved by the user 2026-11-25: "i approve"; all tasks ticked 2026-11-25)

Capability: the player can put the web build in full screen with F11 or a toggle in the Esc menu, on every page; the Tauri desktop build always starts in full screen (user, 2026-11-25: "add full screen mode for a web build. run in a full screen by default when using tauri.").

## Findings from the code (2026-11-25)

- No fullscreen code exists. `src/ui/screen.ts` "fullscreen cinematic" is a CSS overlay, not the Fullscreen API.
- Tauri window: `renderTauriConf` in `scripts/desktop/tauri-templates.mjs` sets `fullscreen: false` (1440x900, resizable). `src-tauri/` is generated and git-ignored.
- Tauri capabilities: `renderCapabilityJson` grants only `core:default`. Toggling the window from JS needs `core:window:allow-set-fullscreen` and `core:window:allow-is-fullscreen`.
- Tauri detection exists: `isTauriDesktop()` in `src/chapters/steam-bridge.ts` (`window.__TAURI_INTERNALS__.invoke`).
- Keys in play: `src/play/input.ts` binds F1, F2, F8, F9, F10 in a capture listener; `src/play/menu.ts` uses Esc for the Esc menu. In a browser, Esc always leaves fullscreen and cannot be intercepted.
- Browsers only enter fullscreen from a user gesture (click or key), never on page load.
- Page entries: `src/hub/app.ts` (Home, Desktop, Achievements, Comix), `src/pages/chapters-page.ts`, `src/pages/manual-page.ts`, `src/play/comix-read.ts` (comic), `src/main.ts` (play).

## Requirements

1. WHEN the player presses F11 on any player page (landing tabs, chapters, comic, manual, play), THE SYSTEM SHALL toggle full screen instead of the browser's own F11.
2. WHEN the player uses the "Fullscreen" toggle in the Esc menu, THE SYSTEM SHALL toggle full screen, and the toggle SHALL show the current state (on or off).
3. WHILE the page is in full screen, THE SYSTEM SHALL keep the game running and lay out for the new size, and WHEN full screen ends by any means (F11, the toggle, browser Esc, the OS), THE SYSTEM SHALL update the toggle's state.
4. WHILE in browser full screen, THE SYSTEM SHALL accept that the first Esc leaves full screen (the browser reserves it); the next Esc opens the Esc menu as today.
5. WHILE running in the Tauri desktop build, THE SYSTEM SHALL start the main window in full screen, every launch, and F11 and the toggle SHALL switch the window itself (through the Tauri window API) in and out of full screen.
6. THE SYSTEM SHALL not save the full-screen choice in the web build, and IF the Fullscreen API is unavailable or refused, THEN THE SYSTEM SHALL do nothing visible except leave the toggle off.
7. THE SYSTEM SHALL grant the Tauri window only the two window permissions it needs (`set-fullscreen`, `is-fullscreen`) on top of `core:default`.

## Out of scope

- A HUD fullscreen button (user, Q2: Esc menu toggle plus key only).
- Remembering the choice (web or Tauri) and a "click for full screen" prompt on load (user, Q5).
- Chromium Keyboard Lock for Esc (user, Q4).
- Editors and labs (`/editor`, `/comix-editor`, `/terminal-lab`, `/laptop-lab`, `/storybook.html`, `/dev.html`): dev pages, not player pages.

## Decisions

- **Q1:** Which key toggles full screen? **A (user, 2026-11-25, "all recommended"):** F11.
- **Q2:** Where is the control? **A (user, 2026-11-25, "all recommended"):** a Fullscreen toggle in the Esc menu next to sound, plus the key; no new HUD button.
- **Q3:** Which pages? **A (user, 2026-11-25, "all recommended"):** every player page, through one shared helper.
- **Q4:** Esc in browser full screen? **A (user, 2026-11-25, "all recommended"):** accept that the first Esc exits full screen and the next opens the menu.
- **Q5:** Persist? **A (user, 2026-11-25, "all recommended"):** the web build does not remember it; Tauri always starts in full screen.

## Open questions

## Verification

- Req 1, 3, 6: `node scripts/harness/hub-unit.mjs` plus a new unit check of the helper with a fake `document` (toggle, state change event, refused request); `node scripts/desktop/landing-smoke.mjs` (F11 is intercepted and calls the helper on a landing page).
- Req 2, 4: the Esc menu toggle in headless Chrome (`node scripts/desktop/landing-smoke.mjs` or a play check), plus a person in a real browser (headless Chrome cannot enter real full screen).
- Req 5, 7: `npm run desktop:test` (`desktop-unit.mjs`: `fullscreen: true` in the window config, the two permissions in the capability JSON, the IPC call shape on a fake `__TAURI_INTERNALS__`), `npm run desktop:verify`, and a person launching the local Tauri build.
- All: `npm run quality`, `npm run build`.
