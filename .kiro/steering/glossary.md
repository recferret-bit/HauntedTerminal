# Glossary

Use these words exactly; do not invent synonyms.

- **Chapter**: one folder `chapters/<slug>/`: manifest, levels, story. Kiroween ships one.
- **Comix**: one connected folder `comix/<slug>/` (`comix.manifest.json` + `pages/page-XX-<slug>/page.spec.json`), compiled to `src/cinematic/generated/` and played by `src/cinematic/`. Intro and outro are comixes, and any additional 3D comic sequence uses the same structure.
- **Level**: one `level.spec.json`: files, enemies, pickups, patches, win rules, solution, `script`.
- **Spec**: any of the chapter JSON files. Specs are the single source of truth; `src/chapters/generated/` is compiled output.
- **Pack** (`ChapterPack`): manifest + levels + dialogs + comic, as the game consumes them. The compiled pack is `getChapterPack`; a **draft** is an unsaved pack from the editor.
- **Script** (`level.spec.json -> script`): the declarative behaviour of a level. Made of **steps** (`print`, `say`, `dialogue`, `dialog_box`, `taunt`, `emote`, `spawn`, `kiro_action`, `tutorial_step`) and **conditions** (`ran_command`, `file_absent`, `file_read`, `enemy_dead`, `has_item`, `any`, `all`, ...).
- **Vocabulary**: the set of step, condition and field kinds the engine understands (`script-types.ts`, `types.ts`).
- **Dialog box**: the comic box on the play screen (`src/ui/dialog-box.ts`) with an animated 3D-head avatar (`drawPortrait` in `src/renderer/portrait.ts`, 4 stepped poses), speaker name, and one line, animating in on appear and out on disappear. `vibecoder` lines dock on the left (`side-left`, avatar on left); NPC and AI-agent lines dock on the right (`side-right`, avatar on right, stacked above any stage cameo). A level script raises it with the `dialog_box` step; it is not the `dialogue` step (a speech bubble on an obstacle) and not the `<dialog>` of the Steam waitlist.
- **Timed entry** (`script.timed`): `{ afterSec, steps }`, run when the level's tick counter reaches `afterSec` (game ticks, one a second, paused with the game). Headless solves tick the same way.
- **Lock** (`script.locks`): `{ command, until, message }`; the command is refused with `message` until the condition `until` holds. Level 1 locks `ls` until `has_item lantern`.
- **Items strip**: the HUD row with one slot per inventory item (`src/ui/items-strip.ts`): dim = not carried, highlighted = held. `GameSnapshot.inventory` feeds it.
- **Dark** (`RoomView.dark`): true while the developer does not carry the lantern; the stage then lights him only with his terminal's glow.
- **Interpreter**: `src/chapters/script.ts`, the only code that acts on a script.
- **Win rule**: a condition on the world that must hold for the exit gate to open. Not a script condition.
- **Grant**: hardware or a Kiro core a player already owns when entering a late level directly (`manifest.grants`).
- **Dossier**: codex cards a chapter adds (`manifest.dossier`).
- **Preview**: the real game in an iframe on a draft (`?draft=1`); it records nothing.
- **Field table**: an entry in `src/chapter-editor/schema.ts`; it drives the form and the schema check.
- **Gate**: a script that fails the build (`npm run quality`, `--verify`, `editor-smoke`).
- **Categories**: ASSET PCG makes assets; LEVEL GEN makes chapters; see `skills-map.md`.
- **Terminal Lab**: the dev page `/terminal-lab`, a test bench for the terminal. Not a content category; it writes no chapter and no comix.
- **Item**: something the developer carries in his **inventory** (`src/game/inventory.ts`): the lantern, the terminal, the laptop. One model per item (`item.<name>`, category `item`) and one hero model per held item (`vibecoder.dev` holds the lantern, `vibecoder.dev_<item>` the rest). `inventory` / `inv` list them; `hold <item>` takes one in hand. Spec: `.kiro/specs/inventory/` and its child specs.
- **Laptop Lab**: the dev page `/laptop-lab`, the emulator of the developer's laptop and its coding **tasks** (`src/laptop/domain/tasks.ts`). Not a content category; it writes no chapter and no comix.
- **Lab script**: one `scripts/harness/terminal-lab/<id>.lab.json`: a `setup` list (the scene: `file`, `dir`, `socket`, `enemy`, `pickup`, `patch`, `prop`, `npc`, `taunt`, `dialogue`, `riddle`, `task`, `check`) and a `steps` list (`run`, `tick`, `emit`, `inject`, `say`, `taunt`, `dialogue`, `check`, `wait`, `expect`). It compiles to a throwaway one-level pack plus a `LabConfig`, never to `src/chapters/generated/`.
- **Riddle**: a lab socket that speaks a prompt on `cat` and checks the answer written to it.
- **Goal** (lab): a thing to do in a lab level, shown with a done mark: a **task** (a game win rule placed in a lab), a **check** (a lab-only condition: `ran`, `output`, `code`, `event`, `file`, `riddle`), or a riddle.
- **Pattern** (lab): plain text matches as a substring (a riddle answer: the exact text); `re:<regex>` or `re:/<regex>/<flags>` is a regular expression. The prefix keeps a path such as `/dev/null` plain text.
- **Absorbed damage**: damage a lab session counts per source and never applies.
- **Kiro spec**: one folder `.kiro/specs/<name>/` (`requirements.md` or `bugfix.md`, `design.md`, `tasks.md`) for a feature or a big refactor. Not a chapter spec. Its `Status:` is `draft`, `requirements-approved`, `design-approved`, `approved` or `done`; code is written only from `approved` on (`spec-first.md`).
- **Agent** (team): one Kiro custom agent in `.kiro/agents/<name>.json`: `lead-dev`, `terminal-designer`, `laptop-designer`, `comix-designer`, `chapters-designer`, `artist`, `qa`. Its **owned paths** are the only files it writes; every source file has exactly one owner. Not an AI-agent character of the story (Clod, Gork, Codec, Anti-Gravy); `kiro disclaimer` (`kiro legal`) prints the in-game parody notice and `npm run quality:brands` (`scripts/quality/check-brands.mjs`) enforces that no real AI agent brand names appear in the repo.
- **QA report**: one `docs/qa/<YYYY-MM-DD>-<scope>.md` written by `qa`: the checks run with exit codes, the findings with owners, a `PASS` / `FAIL` verdict.
- **Property** (test): an invariant checked on many generated inputs by `scripts/harness/property-tests.mjs` (fast-check). A failure gives a shrunk **counterexample** and a seed.
- **Grill**: the rounds of questions the agent asks before a Kiro spec leaves `draft`. Answers are recorded under `## Decisions`; unanswered ones stay under `## Open questions`.
- **Achievement**: one of the 12 declarative local trophies in `src/chapters/achievements.ts` (`haunted-terminal:achievements:v1`), paired 1:1 with a Steamworks `ACH_*` API key, surfaced via `achievements` (`ach`, `trophies`), the HUD toast, `/` and `/chapters.html`, and never recorded in `preview` or `lab` sessions.
