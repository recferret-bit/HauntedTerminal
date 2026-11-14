# Haunted Terminal — Animated Comix Directory (`comix/`)

Every animated 3D comic sequence (cinematic cutscenes, openings, endings, interludes, or standalone comic reels) lives in its own connected directory under `comix/` and follows the declarative schema consumed by:
- **Dynamic Authoring & Validation Skills:** `comix-architect-intake`, `comix-sequence-generator`, `comix-implementer`, and `comix-editor`.
- **Headless Harness Tools:** `generate-comix.mjs` (compiles `comix/<slug>/` into `src/cinematic/generated/catalog-data.ts`, validates schema + asset/cue/timeline invariants, and runs a 60fps headless simulation of every page, panel cut, track, beat, and lettering cue) and `validate-comix.mjs`.
- **Comix Editor:** `/comix-editor` (needs `npm start`) edits every manifest and page spec with schema-driven forms, previews live drafts with timestamp scrubbing and panel/cue jump buttons, runs static + 60fps timeline checks, and writes back cleanly to disk. See `.kiro/skills/comix-editor/SKILL.md`.
- **Live Browser Pages:** `/cinematic.html` (standalone comix studio & freeze-frame inspector `?play=<slug>&t=<sec>`) and `/play` (in-game cinematic overlay).

> **Note:** Static rendered chapter-issue comic PNGs live inside `chapters/<chapter-slug>/story/comix.spec.json` (`comix-story-drawer` / `draw-comix.mjs`). `comix/` is for real-time animated 3D comic sequences played by `src/cinematic/`.

## Comix Catalog

| Folder | Status | Duration | Pages / Panels | Room & Cast | Sequence Summary |
| :--- | :---: | :---: | :---: | :--- | :--- |
| [intro](./intro/README.md) | **PLAYABLE** (`opening`) | **39.9s** | **3 pages / 7 panels** | `room.intro` (`vibecoder.dev` + `agent.clod`, `agent.antigravy`, `agent.gork`, `agent.codec`) | Late-night prompt queue, lightning strikes the PC tower, the four AI agents awaken inside the monitor, shatter out, and upload the developer into Floor 01 |
| [outro](./outro/README.md) | **PLAYABLE** (`ending`) | **9.8s** (+ held splash) | **2 pages / 3 panels** | `room.outro` (`vibecoder.dev`, `prop.office_chair` + `agent.*`) | Reverse lightning hurls the developer back into his office chair at dawn (dungeon lantern still in hand), shatters the pursuing agents, and opens the final run rank & stats splash |

## Standard Comix Folder Layout

Every comix is organized vertically around **connected, self-contained pages** (mirroring `chapters/<slug>/levels/level-XX-<slug>/level.spec.json`), never split horizontally across disconnected per-feature files:

```text
comix/<comix-slug>/
├── README.md                        # Premise, cast, stage landmarks & page/panel timing breakdown
├── comix.manifest.json              # ComixManifest: metadata, playback/skip rules, 3D stage, cast, shared cues & page index
└── pages/
    └── page-XX-<slug>/
        └── page.spec.json           # ComixPageSpec: page time window, local cues, page-turn, overlays, tracks & panels[]
```

Inside `page.spec.json`, each entry in `panels[]` bundles **everything that happens in that panel** in one readable place:
- `id`, `title`, `from`, `until`, optional `snapshotAt`
- `layout` (`landscape` and `portrait` `[x, y, w, h]` page fractions)
- `camera` (`from` -> optional `to` orthographic world shot over `span` with `ease`, plus optional `portrait` shot)
- `letters` (panel-scoped `caption`, `banner`, `sfx`, `sfx_seq`, `bubble`, `label_tag`, `prompt_list`, `glitch_text`, `tier_stack`, `panel_flash`, `invert`, `stats_card`)
- `beats` (discrete events: `lightning`, `fx`, `fx_repeat`, `arc`, `look`, `state`, `audio`, `key_clicks`)
- `tracks` (continuous functions of `t`: `actor_visibility`, `actor_motion`, `actor_rig`, `part_visibility`, `material_tint`, `fixture`, `stage_light`, `camera_shake`, `pixelate`)

## The Declarative Contract

The runtime in `src/cinematic/` names no comix, no page, and no scene. A comix sequence is purely JSON data in `comix/<slug>/`, compiled to `src/cinematic/generated/catalog-data.ts` and played by generic primitives (`.kiro/steering/declarative-comix.md`):

| Spec | Says | Vocabulary |
| :--- | :--- | :--- |
| `comix.manifest.json` | identity, optional `role` (`opening` / `ending` / `interlude` / `standalone`), `durationSec`, `holdAtEnd`, `acceptsKeyFrom`, `skip` policy, shared boundary `cues`, `stage` (`room`, `background`, `points`, `props`, `fixtures`), `cast`, and ordered `pages[]` summary index (`specPath`) | `ComixManifest` in `src/cinematic/spec-types.ts` |
| `pages/page-XX-<slug>/page.spec.json` | self-contained page `from`/`until`, page-local `cues`, `turn` transition, full-page `overlays` (`title_card`), page-scoped `tracks`, and `panels[]` (tracks stay within `[page.from, page.until]` so every page is readable on its own) | `ComixPageSpec` in `src/cinematic/spec-types.ts` |
| `page.spec.json -> panels[]` | panel timing (`from`..`until`), `layout`, `camera`, `letters`, `beats`, and `tracks` | `ComixPanelSpec`, `PanelLetter`, `PanelBeat`, `SceneTrack` |

Time expressions (`TimeExpr`) accept absolute seconds (`"12.5"`), panel/page-relative offsets (`"+0.3"`), or named cues (`"STRIKE"`, `"STRIKE+0.35"`, `"WHITE-0.1"`). Adding a new capability is one change in four places: `src/cinematic/spec-types.ts`, the interpreter in `src/cinematic/`, `src/comix-editor/schema.ts`, and `src/comix-editor/check.ts`.

## Checking & Compiling Comix Sequences

```bash
node scripts/harness/generate-comix.mjs              # compile comix/* -> src/cinematic/generated/catalog-data.ts
node scripts/harness/generate-comix.mjs --validate   # fast, read-only: schema, cues, timeline windows, ModelCatalog & FxCatalog IDs
node scripts/harness/generate-comix.mjs --verify     # compile, validate, and run 60fps headless timeline simulation on every comix
node scripts/harness/validate-comix.mjs              # standalone validator + catalog sync check
node .kiro/skills/comix-implementer/scripts/verify-comix.mjs  # full comix QA gate + skill self-tests
node scripts/harness/comix-editor-smoke.mjs          # drives /comix-editor in headless Chrome
npm run quality                                      # typecheck, size, layer, declarative & duplicate gates
```
