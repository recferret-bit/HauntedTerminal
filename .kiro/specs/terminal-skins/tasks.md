# Terminal skins: tasks

Status: see requirements.md

- [x] 1. Skin table `src/contracts/terminal-skins.ts`, key in `brand.ts`, pref and apply in `src/ui/terminal-skin.ts`. _Req 1, 6, 7_. Gates: `npm run quality` sub-gates
- [x] 2. The `skin` command: `runSkin` in `commands-proc.ts`, both shells and their consume methods, `manual.ts` (COMMANDS, help, completion), `manual-cmds-meta.ts` (`man skin`, field manual), `selfcheck.ts` (note 2026-11-26: removed in commit 1905207, now `scripts/harness/classic-unit.mjs`), `src/terminal-lab/commands.ts`. _Req 3, 4, 9_. Gates: `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/property-tests.mjs --only terminal`
- [x] 3. Six skins: `src/styles/terminal-skins.css`, `.tty-winbtns` in `pages/play.html`, import in `src/main.ts`. _Req 1, 2, 8_. Gates: `npm run build`
- [x] 4. Wiring: saved or OS default at mount, Esc menu picker, command request applied in `src/play/input.ts`, no save in preview or lab. _Req 5, 6, 7_. Gates: `npm run quality` sub-gates, `node scripts/harness/terminal-lab-smoke.mjs`
- [x] 5. Tests: terminal properties (command in both shells, pref, menu picker), `scripts/harness/terminal-lab/skin.lab.json`. _Req 3 to 7, 9_. Gates: `node scripts/harness/property-tests.mjs --only terminal`, `node scripts/harness/terminal-lab.mjs --all`
- [x] 6. Visual run of all six skins at 1600x950 and 1280x820 (scratch screen list typing `skin <id>`), screenshots looked at, `text-overflow` clean. _Req 1, 2, 8_.
- [x] 7. Docs: `tech.md` one line, glossary entry **Terminal skin**. _All_. Gates: `npm run quality` sub-gates, `npm run build`, `node scripts/harness/editor-smoke.mjs`
