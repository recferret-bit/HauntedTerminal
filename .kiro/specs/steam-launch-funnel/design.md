# Steam launch funnel, local achievements & Tauri desktop builds: design

## Pieces

```
public/fonts/
  chakra-petch-600-latin.woff2          local SIL OFL display font (semi-bold)
  chakra-petch-600-latin-ext.woff2
  chakra-petch-700-latin.woff2          local SIL OFL display font (bold)
  chakra-petch-700-latin-ext.woff2
  ibm-plex-mono-400-latin.woff2         local SIL OFL terminal/body font (regular)
  ibm-plex-mono-400-latin-ext.woff2
  ibm-plex-mono-400-symbols2.woff2      box-drawing & terminal glyphs (U+2500-259F)
  ibm-plex-mono-500-latin.woff2         medium weight
  ibm-plex-mono-500-latin-ext.woff2
  ibm-plex-mono-500-symbols2.woff2
  ibm-plex-mono-600-latin.woff2         semi-bold weight
  ibm-plex-mono-600-latin-ext.woff2
  ibm-plex-mono-600-symbols2.woff2
  OFL.txt                               SIL Open Font License 1.1 notice
src/styles/
  fonts.css                             local @font-face declarations (zero external CDN requests)
  landing.css                           Comix Zone startup funnel, roadmap, desktop cards, trophy rack & <dialog> styles
  hub.css / game.css / editor-workstation.css / ../storybook/storybook.css
                                        switched from Google Fonts @import to local ./fonts.css
src/contracts/
  events.ts                             + ACHIEVEMENT_UNLOCKED variant on KernelEvent
src/chapters/
  achievements.ts                       12 declarative AchievementSpecs (1:1 ACH_* Steamworks keys), localStorage store,
                                        event/clear/workshop evaluators, portable save bundle export & validated import
  steam-bridge.ts                       optional Tauri v2 IPC bridge (`steam_unlock_achievement`, `steam_sync_achievements`,
                                        `steam_status`, `desktop_read_save_bundle`, `desktop_write_save_bundle`,
                                        `desktop_export_json_file`, `desktop_open_external_url`,
                                        `steam_show_floating_keyboard`) + store/release URLs
  portable-save.ts                      monotonic JSON save bundle export/import + automatic Tauri `out-of-credits-save.json` sync
  catalog.ts                            + `achievements` Grimoire entry (the entry now lives in `metagame-data.ts`, 2026-11-26); `resetInMemoryStoresForTest` also resets achievements;
                                        `purchaseOrTogglePerk` notifies `achievements.ts` on perk unlock
  session-state.ts                      + `achievements`, `ach`, `trophies` in CHAPTER_COMMANDS
  session-shell.ts                      routes `achievements` / `ach` / `trophies` + updates `help`
  session-meta.ts                       `cmdAchievements` (`list`, category filter, `export` / `sync`)
  session-flow.ts / session-fs.ts / session-code.ts
                                        evaluates achievement unlocks on non-preview, non-lab commands, level clears & run end
src/game/
  manual.ts                             + `achievements` (`ach`, `trophies`) in COMMANDS & MAN
src/ui/
  hud.ts                                non-blocking comic achievement toast queue + End-of-Demo Victory Card Wishlist & Save Export CTAs
src/play/
  loop.ts                               handles ACHIEVEMENT_UNLOCKED -> HUD toast + Tauri Steamworks bridge forward
src/hub/
  hub.ts                                wires `/` startup funnel: live campaign/achievement stats, filterable trophy rack,
                                        portable JSON Export/Import, and accessible <dialog> waitlist form (`h()`, no innerHTML)
pages/
  index.html                            startup conversion funnel (Play Free Demo, Steam Coming Soon/Waitlist, GitHub Desktop
                                        Builds, Free vs Full Steam Edition roadmap, Trophy Rack, Parody Notice)
  chapters.html                         + 3rd binder tab (`Achievements (Steam-Ready)`)
  cinematic.html                        removes external Google Fonts <link>s
src/pages/
  chapters-page-model.ts / chapters-page.ts / chapters-binder.ts / chapters-workshop.ts
                                        renders the Achievements tab in `/chapters.html`
scripts/desktop/
  desktop-config.mjs                    shared version, identifier, Steam App ID, and 1:1 achievement manifest loader
  icon-gen.mjs                          deterministic zero-dependency RGBA PNG, ICO, and ICNS icon synthesizer
  tauri-templates.mjs                   canonical Tauri v2 crate, config, manifest & entrypoint template emitters
  steam-bridge-rs-template.mjs          canonical Rust `DesktopBridge` (`src-tauri/src/steam.rs`) template emitter
  generate-tauri-steam.mjs              generates `src-tauri/` (Tauri v2 + optional `steamworks = "0.11.0"` Cargo feature)
  verify-desktop-bundle.mjs             verifies offline `dist/` (0 CDN URLs, bundled woff2) + valid `src-tauri/` & ACH_* sync
  build-tauri-steam.mjs                 orchestrates gates -> web build -> Tauri gen -> bundle verify -> native or portable build
  desktop-unit.mjs                      self-test for icon binaries, Tauri v2 config, Rust Steamworks manifest & CDN gate
  landing-smoke.mjs                     headless Chrome smoke test for `/`, `<dialog>` validation, Tauri IPC, mobile & `/chapters.html`
.github/workflows/
  desktop-release.yml                   tag-driven (`v*`) & manual multi-OS Tauri desktop build + GitHub Release publisher
docs/
  STEAM_RELEASE_PLAYBOOK.md             step-by-step Steamworks registration, store page, Next Fest & live cutover guide
```

## Decisions

- **Declarative, chapter-agnostic achievements (`src/chapters/achievements.ts`).** None of the 12 achievements name a chapter, level id, or hardcoded level index (`npm run quality:declarative`): they evaluate generic `KernelEvent`s, `LevelSpec['mechanic']`, `openingSector` (`g.levels[0]?.id === spec.id`), `RankGrade`, `chaosMode`, loaded `.gguf` cores, and Workshop perk unlocks.
- **Strict preview & lab isolation.** `unlockAchievement` and `evaluateSessionAchievements` short-circuit whenever `g.preview || g.lab !== null`. Headless solvers (`solve.ts`), editor previews (`?draft=1`), Terminal Lab runs, and `property-tests.mjs` determinism checks stay 100% stateless and reproducible.
- **Optional `steam` Cargo feature in generated `src-tauri/Cargo.toml`.** Valve's `steam_api` redistributable binary cannot be committed to an open-source MIT repo without a Steamworks Partner account. Making `steam = ["dep:steamworks"]` an explicit Cargo feature allows `.github/workflows/desktop-release.yml` to compile and publish real native macOS/Windows/Linux desktop builds on every `v*` tag immediately today, while `build-tauri-steam.mjs --steam --app-id <ID>` compiles full `steamworks-rs` (`0.11.0`) achievement/stat/callback integration as soon as partner credentials exist.
- **Self-hosted SIL OFL `.woff2` fonts (`public/fonts/`).** Desktop apps on Steam/Steam Deck must boot and render identically with Wi-Fi off. Local `@font-face` declarations eliminate the Google Fonts network waterfall on web and guarantee 100% offline desktop typography.
- **DOM safety on `/`.** Interactive elements rendered by `src/hub/hub.ts` build DOM nodes exclusively with text-safe `el()` helpers (`textContent`, never `innerHTML`), and the Steam Launch Waitlist uses a native `<dialog closedby="any">` with `:is(:user-invalid, .user-invalid-fallback)` and polite ARIA error announcements.

## Layers and gates

- `scripts/quality/check-layers.mjs` & `.kiro/steering/architecture.md`: `hub/` updates from `may: []` to `may: ['contracts/', 'chapters/']` (still `three: false`) so the front door reads live chapter progress, achievements, and portable save bundles.
- `scripts/quality/check-root.mjs` & `.kiro/steering/structure.md`: allow `.github` at root for GitHub Actions release workflows; `.gitignore` ignores generated `src-tauri` and `dist-desktop`.
- `scripts/quality/check-agents.mjs`: classify `.github/` and `public/fonts/` under `INFRA` so agent ownership stays 1:1 across all tracked source files.
- Zero changes to `src/procgen/**` or `src/shaders/**`: `npm run quality:fingerprint` remains byte-identical.
