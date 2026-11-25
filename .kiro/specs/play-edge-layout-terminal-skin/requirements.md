# Play page edge-to-edge layout and terminal skin: requirements

Status: done (requirements, design, tasks approved by the user 2026-11-25: "i approve"; all tasks ticked 2026-11-25)

Capability: on the play page the gameplay area and the terminal fill the whole window with no gaps at the corners, and the terminal looks like a popular terminal app (user, 2026-11-25: "lets make gameplay area to take the whole size, no gaps between the corners, same for a terminal shell, but style the shell to the putty or iterm or some terminal popular app").

## Findings from the code (2026-11-25)

- Gaps today (`src/styles/game.css`): `#page` has `padding: 8px` and `gap: 8px`; `#stage-wrapper` has a 5 px ink border and a 6 px drop shadow; `#terminal-bezel` has `padding: 6px 10px 8px` and an orange top border; `#terminal-panel` has `padding: 4px 6px 2px`; the body shows the dotted paper behind all of it.
- Terminal chrome: `#tty-bar` (`TTY0` label, `MANUAL (F1)` button, `SHELL`) in `pages/play.html`; xterm options and the 16-colour theme in `openTerm` of `src/ui/terminal.ts` (IBM Plex Mono 13 px, block cursor, orange cursor). The colours carry meaning: speaker colours per character and red errors use them.
- The terminal height is `38vh` (min 200 px); the split code editor (`#code-editor-pane`) shares `#terminal-dock`.
- The art bible (`credits-art-direction`) asks for "5 px ink frames and paper gutters" around panels. Removing the gutter and frame on the play page is a deliberate exception, asked for by the user.
- `scripts/harness/visual/screens.json` watches `#terminal-dock`; every play-screen visual baseline will change (a person approves new baselines).

## Requirements

1. WHILE the play page is shown, THE SYSTEM SHALL draw the gameplay area and the terminal flush with the window edges and with each other: no page padding, no gutter, no frame and no drop shadow around the stage or the terminal, and one 1 px dark divider between them.
2. THE SYSTEM SHALL draw the terminal as an iTerm2 window: a dark title bar with the red, yellow and green window dots on the left, the centred title `vibecoder@motherboard: ~ (zsh)`, one tab (`zsh`) under it, and the terminal body under the tab.
3. THE SYSTEM SHALL keep the game's terminal colours (16-colour theme, speaker colours, red errors, orange cursor) and its bundled IBM Plex Mono font; only the window chrome and padding change.
4. THE SYSTEM SHALL keep the `MANUAL (F1)` button (`#tty-manual-btn`) and show it on the right of the title bar.
5. THE SYSTEM SHALL keep every terminal behaviour working as today: typing, the Manual button, the split code editor (side by side and stacked), the CRT power-on and power-off animations, and the hidden-until-handover state. The window dots are decoration and do nothing.

## Out of scope

- The terminal's colours and font (user, Q2).
- A frame or ink line around the stage (user, Q3).
- Other pages (landing, editors, labs): only `/play`.
- New baselines in `docs/qa/baselines/`: a person approves them.

## Decisions

- **Q1:** Which terminal app? **A (user, 2026-11-25):** iTerm2 (dark title bar, window dots, centred title, one tab).
- **Q2:** Colours inside the terminal? **A (user, 2026-11-25):** keep the game's colours; change only chrome, padding and font size.
- **Q3:** The gameplay area's frame? **A (user, 2026-11-25):** no frame; the canvas touches the window edges; one 1 px divider above the terminal.
- **Q4:** Where does `MANUAL (F1)` go? **A (user, 2026-11-25):** right side of the title bar.
- **Q5:** Branch base? **A (user, 2026-11-25):** stack on `agent/fullscreen-mode` and merge both together.
- **Q6:** The art bible's 5 px ink frames and paper gutters? **A (user, 2026-11-25, by the request itself):** dropped on `/play` only, as a deliberate exception; comic pages, the reader and the landing keep them.
- **Q7:** The font? **A (user delegated with Q2, 2026-11-25):** keep IBM Plex Mono, since iTerm's default fonts cannot be bundled offline (`desktop:verify` requires bundled `.woff2`).

## Open questions

## Verification

- Req 1 to 4: `node scripts/harness/visual-audit.mjs` on the play screens at 1600x950 and 1280x820 (flags and diffs explained; baselines approved by a person), and a look at the screenshots.
- Req 5: `node scripts/harness/manual-smoke.mjs` (`#tty-manual-btn`), `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`, `npm run quality` sub-gates, `npm run build`.
