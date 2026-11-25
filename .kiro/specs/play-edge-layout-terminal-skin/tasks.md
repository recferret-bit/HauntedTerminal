# Play page edge-to-edge layout and terminal skin: tasks

Status: approved (by the user 2026-11-25)

- [x] 1. Edge-to-edge layout in `src/styles/game.css`: page padding and gap, stage frame and shadow, terminal bezel padding, border and shadow, 1 px divider, code editor split (both layouts). _Req 1, 5_. Gates: `npm run build`, screenshots at 1600x950 and 1280x820
- [x] 2. iTerm2 window chrome: `pages/play.html` title bar and tab row, their CSS in `src/styles/game.css`, `#tty-manual-btn` on the right. _Req 2, 3, 4, 5_. Gates: `node scripts/harness/manual-smoke.mjs`, `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`
- [x] 3. Visual check: `node scripts/harness/visual-audit.mjs` on the play screens at 1600x950 and 1280x820, every flag and diff explained, screenshots looked at. _Req 1 to 5_.
- [x] 4. Docs: the art bible exception (one line in `credits-art-direction` or `asset-pcg-rules.md`), `tech.md` not needed. _All_. Gates: `npm run quality` sub-gates, `node scripts/quality/check-specs.mjs`
