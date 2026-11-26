# Kiro.d Unix Daemon Framing & Post-Kiroween Trademark Notice: design

Status: see requirements.md

## Pieces

```
src/procgen/archetypes/
  npc.ts                    npc.kiro_ghost catalog label -> 'Kiro.d' & Unix .d daemon lore
  npc/kiro-ghost.ts         buildKiroGhost ModelSpec label -> 'Kiro.d (local .gguf Unix daemon)'
  vibecoder.ts              vibecoder.dev_bare lore -> 'Kiro.d'
src/game/
  kiro.ts                   formatStatus() Unix .d daemon header/lore, formatDisclaimer() AWS/post-Kiroween trademark notice, startCrack() DEFEND KIRO.D
  agents.ts                 first-boot [KIRO.D] daemon greeting
  session-shell.ts          CLASSIC_HANDLERS['kiro.d'] -> cmdKiro
  manual.ts                 COMMANDS += 'kiro.d', MAN['kiro'] Unix .d daemon copy + MAN['kiro.d'] alias
  manual-catalog.ts         section 06 title -> 'Code, Docker & Kiro.d'
  manual-cmds-meta.ts       kiro entry aliases: ['kiro.d'], Unix .d daemon realWorld/inGame/summary & Kiro.d wording
src/chapters/
  session-shell.ts          CHAPTER_HANDLERS['kiro.d'] -> cmdKiro, complete() subcommand completion for kiro.d, lockMessage() normalization ('kiro.d' -> 'kiro'), dispatchHelp() Kiro.d copy
  session-hints.ts          kiro_loaded hint label -> 'Kiro.d'
  session-state.ts          speakerOf() supports KIRO.D & ADVISOR KIRO.D prefixes
  achievements.ts           ACH_OPEN_WEIGHTS_INIT description -> 'Kiro.d'
  metagame-data.ts          GRIMOIRE_ENTRIES ('kiro' / 'kiro.d') & BESTIARY_DOSSIER ('kiro.d' Unix .d daemon card)
src/ui/
  dialog-orchestrator.ts    STRIP_LEADING_SPEAKER_RX supports ADVISOR KIRO.D / KIRO.D; fallback speaker name 'KIRO.D'
  manual-book-render.ts     cover intro -> 'Kiro.d daemon verb'
  manual-book-search.ts     filter chip -> 'Kiro.d & Game'
src/pages/
  chapters-binder.ts        Bestiary notice -> KIRO.D PARODY, TRADEMARK & POST-KIROWEEN NOTICE
src/editor-core/ & src/chapter-editor/ & src/terminal-lab/
  console-dock.ts           sample KIRO_ACTION message -> 'Kiro.d scans the room.'
  schema.ts, catalog.ts, context.ts   editor/lab field & preset labels -> 'Kiro.d' / 'KIRO.D'
chapters/chapter-01-kiroween/
  chapter.manifest.json     Kiro.d prose across subtitle, clientName, summary, mechanicsSummary, level titles/labels, dossier
  README.md                 Chapter 1 doc updated to Kiro.d
  story/dialogs.json        speakers['kiro.d'].displayName -> 'KIRO.D'; all hints/banners/taunts/completions -> Kiro.d / KIRO.D / Advisor Kiro.d
  story/comix.spec.json     all captions & speakers -> KIRO.D / ADVISOR KIRO.D
  levels/*/level.spec.json  Levels 01–08, 10–11 prose, speakers, tutorial label ('KIRO.D TUTORIAL'), Level 1 Unix .d daemon lore; solutionCommands & VFS filenames untouched
  levels/level-01-tutorial-awakening/LEVEL.md   Level 01 doc updated to Kiro.d
public/comix/chapter-01-kiroween/
  page-01.png .. page-06.png   re-rendered 6-page static comic issue via draw-comix.mjs
pages/
  index.html                hero/door/alt copy -> Kiro.d; expanded footer Trademark & Post-Kiroween Hackathon Rework Notice
  dev.html                  level jump labels -> Kiro.d / Advisor Kiro.d
README.md                   explicit AWS/Kiro trademark attribution & post-Kiroween rework section
LICENSE                     intact MIT License text + '---' + Trademark & Post-Kiroween Hackathon Notice
```

## Decisions

- **Alias `kiro.d` at the shell dispatch boundary without altering `solutionCommands` or VFS paths.** Adding `'kiro.d'` to `CLASSIC_HANDLERS` (`src/game/session-shell.ts`), `CHAPTER_HANDLERS` (`src/chapters/session-shell.ts`), `COMMANDS` + `MAN['kiro.d']` (`src/game/manual.ts`), and `aliases: ['kiro.d']` (`src/game/manual-cmds-meta.ts`) lets players type `kiro.d ...` or `cat file | kiro.d` anywhere while preserving every existing `kiro ...` level solution. Normalizing `argv[0] === 'kiro.d' ? 'kiro' : argv[0]` before `lockMessage()` in `src/chapters/session-shell.ts` ensures `script.locks` entries for `"kiro"` (such as Level 3's dark-room lock before picking up `lantern`) apply identically to `kiro.d` with zero chapter-vocabulary changes. Rejected renaming the primary command or VFS files (`kiro_story.txt`, `kiro_override.sock`), which would churn level solutions and tests unnecessarily. Follows Decision 2 in `requirements.md`.
- **Three-tier casing (`Kiro.d` / `KIRO.D` / `kiro.d`) with Unix `.d` daemon framing.** Prose and UI labels use `Kiro.d`, ALL-CAPS comic lettering/speakers/banners use `KIRO.D` (`KIRO.D TUTORIAL`, `ADVISOR KIRO.D`), and process/daemon contexts (`ps`, `PID 777`) use `kiro.d`. `formatStatus()`, `MAN.kiro`, `manual-cmds-meta.ts`, `BESTIARY_DOSSIER`, and Level 1's `kiro_story.txt` + arrival dialogue explain the classic Unix `d` / `.d` daemon convention (an air-gapped background service running `.gguf` weights on local VRAM with zero cloud API calls). Follows Decisions 1 & 3 in `requirements.md`.
- **Keep `npc.kiro_ghost` asset ID stable; update display labels and re-render Chapter 1 comic PNGs.** Preserving the internal `ModelCatalog` ID `npc.kiro_ghost` avoids breaking any chapter/comix/lab spec references, while updating its human-readable `label` and `lore` in `src/procgen/archetypes/{npc.ts,npc/kiro-ghost.ts}` and re-running `generate-chapter.mjs` + `verify-chapter.mjs` updates Storybook/UI labels and regenerates `public/comix/chapter-01-kiroween/page-01..06.png` with `KIRO.D` captions and speech-balloon headers. Follows Decision 3 in `requirements.md`.
- **Append `---`-separated trademark notice below verbatim MIT text in `LICENSE`, mirrored in `README.md`, `pages/index.html`, `/chapters.html`, and `kiro disclaimer`.** Keeping lines 1–21 of `LICENSE` byte-for-byte identical to the standard MIT text preserves clean open-source license terms while placing the AWS trademark ownership, non-affiliation, and post-Kiroween rework commitment directly inside `LICENSE`, `README.md`, the `/` landing footer (`#parody-notice-heading`), the `/chapters.html` Bestiary banner (`src/pages/chapters-binder.ts`), and `KiroCompanion.formatDisclaimer()` (`kiro disclaimer` / `kiro legal` / `kiro.d disclaimer`). Note: `scripts/desktop/landing-smoke.mjs` asserts `document.body.textContent.includes('Anti-Gravy') && document.body.textContent.includes('kiro disclaimer')` on `/`, which remains satisfied. Follows Decisions 4 & 5 in `requirements.md`.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Unchanged (no new `src/<area>/` directories and no new cross-layer imports).
- **Pages (`vite.config.ts`) & Root (`scripts/quality/check-root.mjs`):** Unchanged (edits existing `pages/index.html`, `pages/dev.html`, `README.md`, and `LICENSE`).
- **Vocabulary (`src/chapters/{types,script-types}.ts`, `src/cinematic/spec-types.ts`):** Unchanged. Canonical JSON formatting via `stringifyChapterJson` (`scripts/harness/lib/chapter-json.mjs`) on all edited `chapters/chapter-01-kiroween/**/*.json` files.
- **Asset fingerprints (`npm run quality:fingerprint`):** Geometry, raster, mesh, tags, and pose hashes stay byte-identical; only the `spec` metadata hash of `npc.kiro_ghost` (and `lore` in `npc.ts` / `vibecoder.ts` if hashed) changes due to `ModelSpec.label` changing from `'Kiro Ghost (local .gguf companion)'` to `'Kiro.d (local .gguf Unix daemon)'`. Diff and report explicitly.
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs`
  - `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`
  - `node scripts/harness/manual-unit.mjs`
  - `node scripts/harness/battle-unit.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs` & `node scripts/harness/terminal-lab.mjs --all`
  - `node scripts/harness/generate-chapter.mjs --verify` & `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `node scripts/harness/hub-unit.mjs` & `node scripts/desktop/landing-smoke.mjs`
  - `npm run quality:fingerprint`
  - `npm run quality` & `npm run build`
