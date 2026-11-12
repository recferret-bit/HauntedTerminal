# Haunted Terminal — Chapters Directory (`chapters/`)

The Kiroween campaign is the only chapter. It lives in its own folder under `chapters/` and follows the schema consumed by:
- **Dynamic Authoring & Validation Skills:** `chapter-architect-intake`, `comix-story-drawer`, `chapter-level-generator`, and `chapter-implementer`.
- **Headless Harness Tools:** `draw-comix.mjs` (renders multi-panel comic pages to PNG) and `generate-chapter.mjs` (compiles level specs & runs `<5ms` headless playthrough verification).
- **Chapter Editor:** `/editor` (needs `npm start`) edits every file below with forms, previews the real game on the unsaved draft, checks references and runs the headless solution. See `.kiro/skills/chapter-editor/SKILL.md`.
- **Live Browser Pages:** `/` (player front door), `/dev.html` (level select, direct jumps, QA labs), `/chapters.html` (chapter and level selector), `/comic.html` (comix reader), and `/play/<chapter>/<level>` (stage, terminal, and code editor).

## Chapter Catalog

| Folder | Issue | Status | Levels | Ally NPC | Boss | Mechanics Covered |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- |
| [chapter-01-kiroween](./chapter-01-kiroween/README.md) | **#01** | **PLAYABLE (Kiroween Full Campaign)** | **11** (`1` Intro/Tutorial + `6` Task Levels + `3` Hubs + `1` Boss) | `dad.tty` (`npc.greybeard_rig`) & `kiro.d` (`npc.kiro_ghost`) | Clod & the kernel boss | Tutorial (`ls`/`mv`/`cat`/`ps`/`kill`), RAM+GPU scavenging, hub open-weight reboots, HTML+CSS, JS, Dockerfile, Compose, final boss |

## Standard Chapter Folder Layout

```text
chapters/<chapter-slug>/
├── README.md                 # Narrative premise, cast, learning curve & level table
├── chapter.manifest.json     # Machine-readable ChapterManifest (metadata, cast, levels index)
├── story/
│   ├── comix.spec.json       # Multi-page comic panel layouts, 3D models, captions, bubbles & SFX
│   ├── dialogs.json          # Per-level Ally, Client & Rogue Agent dialogue script
│   └── out/                  # Rendered PNG comic pages (page-01.png .. page-NN.png, contact-sheet.png)
└── levels/
    └── level-XX-<slug>/
        ├── LEVEL.md          # (optional) human design notes; the game never reads it
        └── level.spec.json   # Declarative VFS files, enemies, pickups, win rules, canonical solution & `script`
```

## The declarative contract

The engine names no chapter and no level. A chapter is only these files, played by generic code (`.kiro/steering/declarative-chapters.md`):

| Spec | Says | Vocabulary |
| :--- | :--- | :--- |
| `chapter.manifest.json` | identity, ally, boss (+ cameo label), `grants` (hardware and Kiro core owned when a level is entered directly), `outro` (caption, closing actors, `finale` steps) | `src/chapters/types.ts` |
| `level.spec.json` | the world and how to win | `files`, `enemies`, `pickups`, `patches`, `winRules`, `solutionCommands` |
| `level.spec.json -> script` | what happens: `arrival` steps, `tutorial` cards with `doneWhen` conditions and a hidden enemy, `bullying` taunts, `kiro` stage/label/weakness/core reactions, `safe`, `holdEnemiesUntil`, `signalAliases`, `onBossKill` | `src/chapters/script-types.ts` |
| `story/dialogs.json` | banner, 3 hints, arrival taunt, completion, speaker colours | `ChapterDialogs` |
| `story/comix.spec.json` | comic pages | `ComixStorySpec` |

The exact vocabulary (every step, condition and field, with comments) is `src/chapters/script-types.ts` and `src/chapters/types.ts`; the editor's forms are `src/chapter-editor/schema.ts`. Chapter 01 is the reference: its tutorial, hubs, taunts and boss behaviour are all `script` data. Contract and rules: `.kiro/steering/declarative-chapters.md`.

## Checking a chapter

```bash
node scripts/harness/generate-chapter.mjs --validate  # fast, read-only: references, asset ids, field tables
node scripts/harness/generate-chapter.mjs --verify    # compile, validate, 0-death headless playthrough of every level
npm run quality                                      # includes the declarative gate (no chapter or level named in src/)
node scripts/harness/editor-smoke.mjs                # the editor in headless Chrome
```
