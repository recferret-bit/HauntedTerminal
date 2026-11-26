# Kiro.d Unix Daemon Framing & Post-Kiroween Trademark Notice: requirements

Status: done (requirements, design, tasks approved by the user 2026-11-26; implemented and verified 2026-11-26)

Capability: Replace bare in-game "Kiro" and "Kiro Ghost" character mentions with `Kiro.d` (`KIRO.D` in all-caps comic speakers/banners, `kiro.d` in Unix process/daemon identifiers), add `kiro.d` as a shell command alias alongside `kiro`, describe `kiro.d` in-game as a local Unix background inference daemon (`.d` suffix, PID `777`), re-render the 6 chapter comic PNGs and `npc.kiro_ghost` catalog labels, and publish an explicit trademark & post-Kiroween rework notice across `README.md`, `LICENSE`, `pages/index.html`, `/chapters.html`, and `kiro disclaimer`.

## Requirements

1. WHEN any player-facing prose, HUD/UI label, achievement, Bestiary/Grimoire card, Field Manual entry, editor/lab label, chapter manifest, dialog, level spec, or static comic spec refers to the local companion character, THE SYSTEM SHALL name it `Kiro.d` in mixed-case prose, `KIRO.D` in ALL-CAPS comic headers and speaker tags (`KIRO.D`, `KIRO.D TUTORIAL`, `ADVISOR KIRO.D`), and `kiro.d` in Unix process/daemon identifiers, with zero bare `Kiro` or `Kiro Ghost` character names remaining.
2. WHEN the player invokes `kiro.d` (with any subcommand or piped stdin, e.g. `kiro.d`, `kiro.d scan`, `kiro.d load qwen`, `kiro.d crack <lock>`, `kiro.d disclaimer`, `cat <file> | kiro.d`) in either the Classic shell or the Chapter shell, THE SYSTEM SHALL dispatch it identically to `kiro` while preserving `kiro`, all existing level `solutionCommands`, and VFS filenames (`kiro_story.txt`, `kiro_override.sock`, `kiro-tiny-1b-q4.gguf`) unchanged.
3. WHEN the player views `kiro` / `kiro status`, `man kiro` / `man kiro.d`, the Interactive Field Manual (`/manual`), the Bestiary Dossier (`kiro.d`), or Level 1's awakening story (`kiro_story.txt` and arrival dialogue), THE SYSTEM SHALL explain the Unix `.d` daemon naming convention—describing `kiro.d` as an air-gapped background Unix daemon (PID `777`) running quantized open-weight `.gguf` models locally on the host machine's VRAM with zero cloud API calls.
4. WHEN `src/procgen/archetypes/npc.ts`, `src/procgen/archetypes/npc/kiro-ghost.ts`, and `chapters/chapter-01-kiroween/story/comix.spec.json` are built and rendered, THE SYSTEM SHALL update the `npc.kiro_ghost` catalog/model labels and lore to `Kiro.d` (keeping model ID `npc.kiro_ghost` intact), recompile `src/chapters/generated/`, and re-render all 6 static chapter comic PNGs in `public/comix/chapter-01-kiroween/` with `KIRO.D` lettering.
5. WHEN a reader inspects `LICENSE`, THE SYSTEM SHALL preserve the verbatim MIT License text intact at the top of the file and append a `---`-separated `Trademark & Post-Kiroween Hackathon Notice` section below it stating that "Kiro" and its associated marks are trademarks of Amazon.com, Inc. or its affiliates, Out Of Credits is not affiliated with or endorsed by Amazon/AWS or any AI company, and `Kiro.d`, `Kiroween`, and all third-party trademark/mascot references are temporary Kiroween 2026 hackathon elements that will be reworked into original IP after the event and before any Steam or commercial release.
6. WHEN a visitor or player reads `README.md`, the `/` landing page (`pages/index.html`), the `/chapters.html` Bestiary banner (`src/pages/chapters-binder.ts`), or runs `kiro disclaimer` (`kiro legal` / `kiro.d disclaimer`), THE SYSTEM SHALL display the same clear non-affiliation, AWS trademark attribution, and post-Kiroween trademark/mascot rework commitment alongside the Big Four parody notice while keeping truthful "Built with Kiro" tool attribution in `README.md`.

## Out of scope

- Replacing the 3D `npc.kiro_ghost` mesh geometry or renaming asset ID `npc.kiro_ghost` during the active Kiroween hackathon judging window (scheduled post-hackathon before Steam).
- Renaming the `.kiro/` directory or removing truthful "Built with Kiro" engineering documentation (`README.md`, `docs/KIRO_USAGE.md`).
- Modifying existing level `solutionCommands`, VFS paths (`kiro_story.txt`, `kiro_override.sock`), or adding a second chapter.

## Decisions

- **Q:** How should `Kiro.d` be cased across in-game prose, ALL-CAPS comic headers/speakers, and Unix process tables?
  **A (user, 2026-11-26):** `Kiro.d` in prose/UI, `KIRO.D` in ALL-CAPS comic headers/speakers (`KIRO.D TUTORIAL`, `ADVISOR KIRO.D`), and `kiro.d` in `ps`/daemon paths.
- **Q:** How should terminal commands (`kiro` vs `kiro.d`) and VFS filenames be handled?
  **A (user, 2026-11-26):** Add `kiro.d` as a shell command alias alongside `kiro` while keeping `kiro`, level `solutionCommands`, and VFS filenames (`kiro_story.txt`, `kiro_override.sock`) intact.
- **Q:** Where should the Unix daemon description live, and should we also re-render the 6 chapter comic PNGs + procgen model labels?
  **A (user, 2026-11-26):** Add Unix `.d` background-daemon lore in `kiro status`, `man`/Field Manual, Bestiary, and Level 1 story, AND update `npc.kiro_ghost` labels + re-render the 6 comic PNGs (with intentional fingerprint diff).
- **Q:** How should `LICENSE` carry the trademark & post-Kiroween rework notice?
  **A (user, 2026-11-26):** Keep the exact MIT license text intact at the top of `LICENSE` and append a `Trademark & Post-Kiroween Hackathon Notice` section below a `---` divider.
- **Q:** Should in-game `kiro disclaimer` (`kiro legal`) and the Bestiary banner also include the post-Kiroween trademark rework notice alongside `README.md`, `LICENSE`, and the landing page?
  **A (user, 2026-11-26):** Yes—update `README.md`, `LICENSE`, `pages/index.html`, AND in-game `kiro disclaimer` + `/chapters.html` Bestiary banner to state that Kiro marks belong to Amazon/AWS and all Kiro/third-party marks & ghost visuals will be reworked after Kiroween before Steam/commercial release.

## Open questions

(none)

## Verification

| Requirement | Gate |
|---|---|
| 1, 2, 3 | `node scripts/harness/manual-unit.mjs`, `node scripts/harness/battle-unit.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` |
| 4 | `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node scripts/harness/draw-comix.mjs` (via `verify-chapter.mjs`), `npm run quality:fingerprint` (diff & explain label-only `spec` hash change on `npc.kiro_ghost` and `vibecoder.dev_bare`) |
| 5, 6 | `node scripts/harness/hub-unit.mjs`, `node scripts/desktop/landing-smoke.mjs`, `node scripts/quality/check-brands.mjs`, `node scripts/quality/check-specs.mjs`, `npm run quality`, `npm run build` |
