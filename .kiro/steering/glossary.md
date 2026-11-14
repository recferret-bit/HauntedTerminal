# Glossary

Use these words exactly; do not invent synonyms.

- **Chapter**: one folder `chapters/<slug>/`: manifest, levels, story. Kiroween ships one.
- **Comix**: one connected folder `comix/<slug>/` (`comix.manifest.json` + `pages/page-XX-<slug>/page.spec.json`), compiled to `src/cinematic/generated/` and played by `src/cinematic/`. Intro and outro are comixes, and any additional 3D comic sequence uses the same structure.
- **Level**: one `level.spec.json`: files, enemies, pickups, patches, win rules, solution, `script`.
- **Spec**: any of the chapter JSON files. Specs are the single source of truth; `src/chapters/generated/` is compiled output.
- **Pack** (`ChapterPack`): manifest + levels + dialogs + comic, as the game consumes them. The compiled pack is `getChapterPack`; a **draft** is an unsaved pack from the editor.
- **Script** (`level.spec.json -> script`): the declarative behaviour of a level. Made of **steps** (`print`, `say`, `dialogue`, `taunt`, `emote`, `spawn`, `kiro_action`, `tutorial_step`) and **conditions** (`ran_command`, `file_absent`, `file_read`, `enemy_dead`, `any`, `all`, ...).
- **Vocabulary**: the set of step, condition and field kinds the engine understands (`script-types.ts`, `types.ts`).
- **Interpreter**: `src/chapters/script.ts`, the only code that acts on a script.
- **Win rule**: a condition on the world that must hold for the exit gate to open. Not a script condition.
- **Grant**: hardware or a Kiro core a player already owns when entering a late level directly (`manifest.grants`).
- **Dossier**: codex cards a chapter adds (`manifest.dossier`).
- **Preview**: the real game in an iframe on a draft (`?draft=1`); it records nothing.
- **Field table**: an entry in `src/chapter-editor/schema.ts`; it drives the form and the schema check.
- **Gate**: a script that fails the build (`npm run quality`, `--verify`, `editor-smoke`).
- **Categories**: ASSET PCG makes assets; LEVEL GEN makes chapters; see `skills-map.md`.
