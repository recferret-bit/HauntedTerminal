# Fullscreen mode: design

Status: see requirements.md

## Pieces

```
src/chapters/fullscreen.ts        NEW. The one helper: isFullscreen(), toggleFullscreen(), onFullscreenChange(cb), installFullscreenKey().
                                   Web: document.documentElement.requestFullscreen / document.exitFullscreen / 'fullscreenchange'.
                                   Tauri: invokeTauriCommand('plugin:window|set_fullscreen', { label: 'main', value })
                                   and 'plugin:window|is_fullscreen'; re-reads the state on window 'resize'.
src/chapters/steam-bridge.ts      unchanged; fullscreen.ts reuses isTauriDesktop() and invokeTauriCommand().
src/hub/app.ts                    installFullscreenKey() once (Home, Desktop, Achievements, Comix).
src/pages/chapters-page.ts        installFullscreenKey().
src/pages/manual-page.ts          installFullscreenKey().
src/play/comix-read.ts            installFullscreenKey() (comic reader).
src/play/menu.ts                  installFullscreenKey(); passes onFullscreen / isFullscreen to the Esc menu; onFullscreenChange -> menu refresh.
src/ui/esc-menu.ts                a "Fullscreen: off|on" toggle button (aria-pressed) in the sound section; handlers onFullscreen(), isFullscreen().
src/styles/esc-menu*.css          only if the new button needs a rule (it reuses .esc-btn).
scripts/desktop/tauri-templates.mjs  window `fullscreen: true`; capability permissions
                                   ['core:default', 'core:window:allow-set-fullscreen', 'core:window:allow-is-fullscreen'].
scripts/desktop/desktop-unit.mjs  asserts the window config and the two permissions.
scripts/harness/hub-unit.mjs      unit tests of src/chapters/fullscreen.ts with a fake document and a fake __TAURI_INTERNALS__.
```

## Decisions

- **Where the helper lives.** `src/chapters/` is the one inner layer that `hub/`, `pages/`, `ui/` and `play/` may all import (`check-layers.mjs`), and it already holds the desktop bridge (`steam-bridge.ts`) the Tauri path needs. Rejected: `src/contracts/` (may import nothing, so it would copy the Tauri check) and a new `src/<area>/` (needs a layer rule for four lines of glue). No layer rule changes.
- **F11 listener.** A `keydown` listener on `window` in the capture phase, so it runs before the Esc menu's document-level swallow and before xterm. It calls `preventDefault()` so the browser's own F11 (chrome-level full screen, which the page cannot leave by script) never starts. `installFullscreenKey()` is idempotent (a module flag), so a page that calls it twice binds once. Ignores `e.repeat`.
- **Which element.** `document.documentElement`, so the whole page goes full screen (header, stage, terminal, overlays), and the existing layout code reacts to `resize` as it does today.
- **Tauri path.** Tauri's webview does not reliably turn the Fullscreen API into a window full screen on every OS, so in Tauri the helper switches the window itself through the core window plugin. The window starts full screen from `tauri.conf.json` (`fullscreen: true`), so no IPC runs at boot. On macOS this is the native full-screen space.
- **State.** Web: `document.fullscreenElement !== null`, change events from `fullscreenchange` (this also catches the browser's Esc). Tauri: a cached boolean, set from `is_fullscreen` on install and after every toggle and `resize`. `onFullscreenChange` callbacks get the new boolean.
- **Failure.** `requestFullscreen` rejected (no gesture, iframe without `allow`, unsupported) or IPC refused: the promise resolves to the current state, nothing is thrown or printed (Req 6).
- **No persistence.** Nothing is written to storage (Req 6); Tauri starts full screen from its config every launch (Req 5).
- **Esc.** No change to `src/play/menu.ts` Esc handling: in a browser the first Esc leaves full screen (the page never sees it); in Tauri, Esc opens the menu as today (Req 4).

## Layers and gates

- No new `src/<area>/`, page, route, layer rule, vocabulary or save key. No asset change, so `quality:fingerprint` is unaffected.
- Gates: `npm run quality`, `npm run build`, `node scripts/harness/hub-unit.mjs`, `npm run desktop:test`, `node scripts/desktop/landing-smoke.mjs`; `npm run desktop:verify` needs a generated `src-tauri/` (run `npm run desktop:generate` first).
- Not provable headless: real full screen (headless Chrome refuses it) and the Tauri window. A person checks both (Verification in `requirements.md`).
