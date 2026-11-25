# Terminal skins: requirements

Status: done (requirements, design, tasks approved by the user 2026-11-25: "i approve"; all tasks ticked 2026-11-25)

Capability: the play page's terminal can wear one of several popular terminal-app skins, and the player can change it (user, 2026-11-25: "lets add terminal skins, implement others with an ability to change it"). Builds on `.kiro/specs/play-edge-layout-terminal-skin/`, which shipped the iTerm2 skin.

## Findings from the code (2026-11-25)

- The iTerm2 look is plain CSS on `#terminal-bezel`, `#tty-bar`, `#tty-tabs` in `src/styles/game.css`, with markup in `pages/play.html`; xterm's colours live in `openTerm` (`src/ui/terminal.ts`) and can be changed at runtime through `term.options.theme`.
- Saved settings follow `src/ui/sound-pref.ts`: a key from `src/contracts/brand.ts` (`<slug>:sound:v1`), untrusted parsing, never throws. Keys with the project prefix migrate automatically (`legacy-keys.ts`), so a new `<slug>:terminal-skin:v1` needs no migration entry.
- The Esc menu (`src/ui/esc-menu.ts`) already holds the sound and Fullscreen controls.
- Only bundled fonts are allowed (IBM Plex Mono, Chakra Petch); system fonts were rejected by the visual audit (`font-fallback`).

## Requirements

1. THE SYSTEM SHALL offer six terminal skins on `/play`: iTerm2 (today's look), macOS Terminal.app, PuTTY, Windows Terminal, GNOME Terminal and VT100.
2. A skin SHALL change only the window chrome around the terminal body: title bar, window buttons, tab row, title text, bezel and their colours. The terminal body (background, text colour, cursor, the 16 colours, font) SHALL stay as today in every skin. For VT100 the chrome is a beige CRT bezel around today's body.
3. WHEN the player runs `skin`, THE SYSTEM SHALL list the skins with their ids, and WHEN the player runs `skin <id>`, THE SYSTEM SHALL switch to that skin at once (no reload) and print which skin is on.
4. IF `skin <id>` names no skin, THEN THE SYSTEM SHALL refuse it with exit 1, print the valid ids, and change nothing.
5. WHEN the player picks a skin in the Esc menu's "Terminal skin" picker, THE SYSTEM SHALL switch to it at once; the picker SHALL show the current skin, also after a `skin <id>` command.
6. THE SYSTEM SHALL save the choice under `<slug>:terminal-skin:v1` and use it on the next visit; IF nothing valid is saved, THEN THE SYSTEM SHALL pick the default by OS: iTerm2 on macOS, Windows Terminal on Windows, GNOME Terminal on Linux, iTerm2 otherwise.
7. WHILE the session is a preview (`?draft=1`) or a lab (`?lab=1`), THE SYSTEM SHALL switch skins but SHALL NOT save the choice.
8. THE SYSTEM SHALL keep every terminal behaviour working in every skin: typing, `MANUAL (F1)`, the split code editor, the CRT power-on and power-off animations, the hidden-until-handover state, and xterm fitting its rows with no overflow.
9. THE SYSTEM SHALL register `skin` like every command: `help`, `man skin`, the field manual entry, Tab completion of the ids, both shells, the Terminal Lab command groups and the terminal property tests.

## Out of scope

- Per-skin terminal colours or fonts (user, Q2): only the chrome changes, and only bundled fonts are used.
- Other pages (landing, editors, labs' own UI): only the terminal on `/play` and in the game iframe.
- Clickable window buttons: they are decoration and do nothing.

## Decisions

- **Q1:** Which skins? **A (user, 2026-11-25):** six: iTerm2, macOS Terminal.app, PuTTY, Windows Terminal, GNOME Terminal, and a retro VT100.
- **Q2:** Colours inside the terminal? **A (user, 2026-11-25):** only the window chrome changes; the body stays as today.
- **Q3:** How does the player change it? **A (user, 2026-11-25):** a "Terminal skin" picker in the Esc menu plus a `skin` command (`skin` lists, `skin <id>` switches).
- **Q4:** Default skin? **A (user, 2026-11-25):** by OS: iTerm2 on macOS, Windows Terminal on Windows, GNOME Terminal on Linux.
- **Q5:** Branch? **A (user, 2026-11-25):** stack on `agent/fullscreen-mode`.
- **Q6:** Does a preview or lab save the choice? **A (proposed, follows the glossary "a preview records nothing"):** no, it switches but does not save.

## Open questions

## Verification

- Req 1, 2, 8: `node scripts/harness/visual-audit.mjs --screens-file <skins screens>` with a scratch screen list that types `skin <id>` as its step for each of the six skins, at 1600x950 and 1280x820; every screenshot looked at, and the `text-overflow` detector clean. Baselines are not touched.
- Req 3, 4, 9: a property in `scripts/harness/props/terminal.mjs` (every id switches, any other word refuses with exit 1 and no request, both shells), `node scripts/harness/terminal-lab-unit.mjs`, a lab script `scripts/harness/terminal-lab/skin.lab.json` run by `node scripts/harness/terminal-lab.mjs --all`.
- Req 5, 6, 7: unit tests of the pref (read/write, junk, default by OS, preview/lab not saved) and of the Esc menu picker in `scripts/harness/props/terminal.mjs`.
- All: `npm run quality` sub-gates, `npm run build`, `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`.
