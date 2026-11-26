# Fullscreen mode: tasks

Status: see requirements.md

- [x] 1. `src/chapters/fullscreen.ts` (web and Tauri paths, F11 listener) and its unit tests in `scripts/harness/hub-unit.mjs` (toggle on/off, change callback, refused request leaves it off, Tauri IPC call shape, idempotent install). _Req 1, 3, 5, 6_. Gates: `node scripts/harness/hub-unit.mjs`, `npm run quality`
- [x] 2. `installFullscreenKey()` in `src/hub/app.ts`, `src/pages/chapters-page.ts`, `src/pages/manual-page.ts`, `src/play/comix-read.ts`, `src/play/menu.ts`. _Req 1_. Gates: `npm run quality`, `node scripts/desktop/landing-smoke.mjs`
- [x] 3. Esc menu "Fullscreen" toggle in `src/ui/esc-menu.ts`, wired in `src/play/menu.ts` (state refresh on change). _Req 2, 3, 4_. Gates: `npm run quality`, `node scripts/harness/terminal-lab-unit.mjs`
- [x] 4. Tauri: `fullscreen: true` and the two window permissions in `scripts/desktop/tauri-templates.mjs`; assertions in `scripts/desktop/desktop-unit.mjs`. _Req 5, 7_. Gates: `npm run desktop:test`, `npm run desktop:generate`, `npm run desktop:verify`
- [x] 5. Docs: `tech.md` (one line: F11 / Esc menu toggle, Tauri starts full screen), `docs/STEAM_RELEASE_PLAYBOOK.md` if it lists window settings. _All_. Gates: `npm run quality`, `npm run build`
