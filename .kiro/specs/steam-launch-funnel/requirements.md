# Steam launch funnel, local achievements & Tauri desktop builds: requirements

Status: done (requirements, design, tasks delegated by the user "/boost lets do it all", 2026-11-17)

Capability: Turn Out Of Credits into an offline-ready indie startup product with a browser-demo-to-Steam conversion funnel on `/`, a 15-trophy local achievements system (originally 13; expanded 2026-11-26 with `full_loadout` / `ACH_FULL_LOADOUT` and `hardware_hoarder` / `ACH_HARDWARE_HOARDER`) carrying 1:1 Steamworks API keys (`ACH_*`) and JSON portability, self-hosted SIL OFL runtime fonts (`public/fonts/`), deterministic Tauri v2 + `steamworks` desktop generator/verifier scripts (`scripts/desktop/`), and a dedicated GitHub Release tag workflow (`.github/workflows/desktop-release.yml`) producing downloadable macOS, Windows, Linux, and portable offline builds on `v*` tags. External Steamworks Partner registration and live store cutover questions are tracked separately in `.kiro/specs/steamworks-store-release/`.

## Requirements

1. WHEN a visitor opens the `/` front-door landing page (`pages/index.html`), THE SYSTEM SHALL present a *Comix Zone*-styled startup conversion funnel keeping the full 11-level Chapter 1 campaign immediately playable in the browser as a Primary CTA, alongside Secondary CTAs to Wishlist on Steam (Coming Soon) / join the Launch Waitlist (`<dialog>`) and download tagged desktop builds from GitHub Releases, while preserving legacy play query-parameter redirects (`?chapter=`, `?level=`, `?floor=`, `?play=`, `?dev=`).
2. WHEN a visitor views the `/` landing page, THE SYSTEM SHALL display the 3-step Demo-to-Steam funnel, a clear comparison between the Free Chapter 1 Demo (Browser, GitHub Tagged Desktop & upcoming Steam Demo) and the Full Steam Edition roadmap (Chapters 2–5, native Steam Achievements & Cloud Saves, Steam Workshop creator tools, 100% procedural zero-third-party-art engine), and the Kiro Ghost parody & non-affiliation notice (`kiro disclaimer`).
3. WHEN a visitor opens or submits the Steam Coming Soon / Launch Waitlist modal (`<dialog id="steam-waitlist-dialog">`), THE SYSTEM SHALL validate fields after interaction (`:user-invalid` + ARIA error linking), persist opt-in preferences (`email`, target OS `macos | windows | linux-deck`, timestamp) locally under `out-of-credits:waitlist:v1`, and offer direct GitHub Release Watch / `.json` export actions without claiming a live backend mail server.
4. WHEN any page or bundled desktop view loads (`pages/*.html`, `src/styles/*.css`, `src/storybook/storybook.css`), THE SYSTEM SHALL serve `Chakra Petch` (600, 700) and `IBM Plex Mono` (400, 500, 600) from local `public/fonts/*.woff2` files via `src/styles/fonts.css` with zero external runtime requests to `fonts.googleapis.com` or `fonts.gstatic.com`.
5. WHEN a player unlocks a milestone during a non-preview, non-lab session (`!preview && !lab`), THE SYSTEM SHALL record the unlock idempotently in `localStorage` (`out-of-credits:achievements:v1`) with its 1:1 `steamApiName` (`ACH_*`) and timestamp, emit an `ACHIEVEMENT_UNLOCKED` `KernelEvent`, display a non-blocking comic toast in the HUD, and forward `steamApiName` to the Tauri Steamworks IPC bridge (`steam_unlock_achievement`) when running inside the Tauri desktop shell.
6. WHILE a session runs in preview mode (`preview: true`, `/editor` draft preview, headless solver `solve.ts`, property tests) or Terminal Lab mode (`lab !== null`), THE SYSTEM SHALL NOT read, mutate, or emit `ACHIEVEMENT_UNLOCKED` events, preserving 100% deterministic transcripts across repeated runs.
7. WHEN the player runs `achievements` (or aliases `ach` / `trophies`) in the chapter shell, THE SYSTEM SHALL list unlocked and locked achievements with progress counts (masking `secret` descriptions until unlocked), support `achievements export` / `achievements sync` to print the Steamworks-ready JSON payload and trigger desktop bridge sync, and document `achievements` in `help`, `man achievements`, and `GRIMOIRE_ENTRIES`.
8. WHEN the player views `/` (`pages/index.html`) or `/chapters.html`, THE SYSTEM SHALL render live local achievement counts, badge cards with `ACH_*` keys, and JSON save/achievement Export & Import controls so browser demo progress transfers cleanly into the downloadable desktop build.
9. WHEN `node scripts/desktop/generate-tauri-steam.mjs` is executed, THE SYSTEM SHALL deterministically generate a complete Tauri v2 + optional `steamworks` (`0.11.0`) Rust desktop wrapper in `src-tauri/` (git-ignored) including `Cargo.toml` (`steam` Cargo feature), `tauri.conf.json`, `capabilities/default.json`, synthesized multi-resolution RGBA PNG/ICO/ICNS icons, `achievements_manifest.rs` synced 1:1 from `src/chapters/achievements.ts`, and `steam.rs` IPC commands (`steam_status`, `steam_unlock_achievement`, `steam_sync_achievements`, `steam_clear_achievement`).
10. WHEN `node scripts/desktop/verify-desktop-bundle.mjs` or `node scripts/desktop/desktop-unit.mjs` is executed, THE SYSTEM SHALL verify that `dist/` contains zero external font/script CDN URLs, local `.woff2` fonts are bundled, generated Tauri config/icons/Rust manifests are valid, and every `ACH_*` key matches `src/chapters/achievements.ts` 1:1.
11. WHEN a `v*` git tag is pushed to GitHub (or `workflow_dispatch` is triggered), `.github/workflows/desktop-release.yml` SHALL run `npm run quality`, `generate-chapter.mjs --verify`, `npm run build`, Tauri + Steamworks generation, and bundle verification, build native macOS, Windows, and Linux installers plus a portable offline archive with `SHA256SUMS.txt`, and attach them to the tag's GitHub Release.

## Out of scope

- Authoring Chapter 2+ content (prohibited by the Kiroween single-chapter scope rule in `.kiro/steering/product.md`).
- Paying the $100 Steam Direct fee, submitting tax/bank KYC, or hardcoding a fake live Steam App ID as if published (all external Steamworks setup questions are saved in `.kiro/specs/steamworks-store-release/`).
- Modifying any existing level's `solutionCommands` or procedural 3D asset fingerprints (`npm run quality:fingerprint`).
- Committing generated `src-tauri/` Rust build artifacts into git (`src-tauri/` and `dist-desktop/` remain git-ignored and reproducible via `scripts/desktop/generate-tauri-steam.mjs`).

## Decisions

- **Q:** How should the startup & Steam funnel work alongside the Kiroween browser build?
  **A (user, 2026-11-17):** Keep the full 11-level Chapter 1 campaign free and immediately playable in the browser as Primary CTA, update `/` into a startup-grade landing funnel with Steam Coming Soon / Wishlist + waitlist signup, downloadable GitHub tagged desktop builds, and Full Steam Edition roadmap positioning.
- **Q:** How should external Steamworks Partner registration, store setup, and live Steam cutover steps be tracked?
  **A (user, 2026-11-17):** Save all external Steam registration, legal/tax/bank verification, App IDs, store page assets, Steam Next Fest, signing, and live Steamworks cutover decisions as open questions (`.kiro/specs/steamworks-store-release/`, `Status: draft`) paired with `docs/STEAM_RELEASE_PLAYBOOK.md`.
- **Q:** How should achievements work before a live Steam App ID exists?
  **A (user, 2026-11-17):** Implement local achievements now (`out-of-credits:achievements:v1`) with 1:1 `ACH_*` Steamworks API names, HUD toast, CLI command (`achievements`), landing/binder showcase, JSON export/import, and optional Tauri `steamworks` IPC forwarding ready to flip on once a Steam App ID is registered.
- **Q:** How should Tauri + Steamworks and GitHub tagged downloadable builds be structured?
  **A (user, 2026-11-17):** Create deterministic generator/verifier/build scripts (`scripts/desktop/`) that emit `src-tauri/` with an optional `steam` Cargo feature (`steamworks = "0.11.0"`) so GitHub Release tags (`v*`) build standalone native macOS/Windows/Linux installers immediately today and compile full Steamworks SDK integration as soon as `STEAM_APP_ID` + SDK redistributables are supplied.

## Open questions

(none — external Steam registration & store cutover questions are saved in `.kiro/specs/steamworks-store-release/requirements.md`)

## Verification

| Requirement | Gate |
|---|---|
| 1, 2, 3, 8 | `npm run quality`, `npm run build`, `node scripts/harness/editor-unit-test.mjs`, headless Chrome landing verification |
| 4, 9, 10, 11 | `node scripts/desktop/desktop-unit.mjs`, `node scripts/desktop/generate-tauri-steam.mjs`, `node scripts/desktop/verify-desktop-bundle.mjs` |
| 5, 6, 7 | `node .kiro/skills/chapter-level-generator/scripts/self-test.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node scripts/harness/property-tests.mjs` |
