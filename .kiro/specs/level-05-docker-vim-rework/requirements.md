# Level 5 Docker Compose OOM & Full Vim Emulation: requirements

Status: done (2026-11-27; all 7 tasks and gates verified)

Capability: Rework Chapter 1 Level 5 (`level-05-task-ui-grid`, retaining its internal level id while renaming its player-facing title, `cwd`, and Level 4 exit link to a Docker Compose theme) by removing its `bug` enemy and replacing the HTML/CSS task with a 4-service Docker Compose (`postgres`, `java` backend, `nginx`, `frontend`) Java heap overflow (`OutOfMemoryError`) puzzle—complete with a hidden `.logs` folder discovered via `ls -la`, animated OOM flight-and-crash vs. persistent flying-object stage choreography using existing `ModelCatalog` and `FxCatalog` assets, and Vibecoder + Kiro.d dialogs—while adding a shared full modal in-terminal `vim` (`vi`) emulator and expanded generic `docker` / `docker compose` CLI commands across Chapter, Terminal Lab, and Classic shells.

User's words, 2026-11-27: "lets rework level 5, remove the bug from it. Lets make it docker based. the task: use vim to fix docker compose file that has postgres and java backend, nginx and frontend. vibecoder must read the logs using ls -la command and find .logs folder, logs must have error about crashes, let it be java heap overflow, so vibecoder task is to raise docker compose java app memory on start, when put it like floating code objects, or something, so when both launched > its flying around and gates are opens. it need docker ps, docker prune, docker build, up, same for compose, i need all basic commands for it. Also, lets have full vim emulation with commands. While bug is not fixed > user could try to run the compose, all 4 objects will fly, then some animation, and all falls to the ground killed by oom. I use existing effects, use nice vibecoder and kiro.d dialogs."

## Findings (from code, read-only, 2026-11-27)

- **`chapters/chapter-01-kiroween/levels/level-05-task-ui-grid/level.spec.json` & references:** Currently an `html-css` task (`cwd: "/srv/kiroween/ui_dashboard"`, `index.html`, `storefront.css`, `winRules` with `html_css_valid` + `ram_16gb.dimm` + `gpu_tensor_chip_02.img`) with enemy `bug_css_l5` (`type: "bug"`). Level 4 (`level-04-hub-model-one`) exits via `sector_ui_grid`, and `scripts/harness/architecture-unit.mjs`, `.kiro/skills/chapter-level-generator/scripts/self-test.mjs`, `scripts/harness/manual-unit.mjs`, `scripts/harness/audio-smoke.mjs`, and `scripts/harness/props/chapters.mjs` reference `level-05-task-ui-grid` and/or `ui_dashboard` / `sector_ui_grid`. Keeping internal `id: "level-05-task-ui-grid"` avoids breaking saves and routes while allowing Docker-themed `title`, `cwd`, and exit links. The player enters Level 5 holding `terminal`, `tube_transistor` (so `ls -la` is unlocked), `map`, and `manual`, and does not hold `laptop` yet (recovered in Level 6, where `edit` and `sed` are locked until `has_item laptop`).
- **`src/chapters/session-shell.ts` & `src/game/session-shell.ts`:** `CHAPTER_HANDLERS` currently aliases `vim: cmdEdit` alongside `edit`, `nano`, and `code`, opening the DOM textarea Split Code Mini-Editor (`src/ui/code-editor.ts`) rather than emulating Vim in the terminal (`src/ui/terminal.ts`). `CLASSIC_HANDLERS` has neither `vim` nor `docker`.
- **`src/chapters/validators.ts` & `src/chapters/session-code.ts`:** `validateDockerCompose` and `cmdDocker` / `dockerCompose` are currently hardcoded to Level 9's 3-service stack (`nginx`, `website`, `payment`, `PAYMENT_URL=http://payment:4002`), and `cmdDocker` only supports `build`, `images`, `run`, `ps`, `stop`/`rm`, and `compose [config|up|ps|down|logs]` (missing `prune`, `compose build`, `start`, `restart`, `logs` on containers, `inspect`, `stats`, `exec`, `ps -a` exited/OOM state, etc.). Under `declarative-chapters.md`, `docker compose` must work generically across both Level 5 and Level 9 (`level-09-task-compose-mesh`) without naming any chapter or level in `src/`.
- **`src/renderer/stage-event-cast.ts`, `src/renderer/stage-motion.ts`, `src/procgen/archetypes/props.ts`, & `src/procgen/fx/presets.ts`:** Existing `ModelCatalog` props (`prop.file`, etc.) and `FxCatalog` presets (`fx.touch-materialize`, `fx.matrix-cast`, `fx.matrix-fault`, `fx.sigkill`, `fx.coredump` with custom `text`, `fx.mv-dust`, `fx.gate-open`) already support spawning, smooth flight (`flyTo` / `ACTOR_FLY_TO`), red fault flashes, comic lettering, and ground drops without touching `src/procgen/` (`npm run quality:fingerprint` stays byte-identical).
- **`src/chapters/achievements.ts`:** `REQUIRED_STACK_MECHANICS` (`ACH_FULL_STACK_FIXER`) currently lists `['html-css', 'terminal-code', 'docker-image', 'docker-compose']`; moving Level 5 from `html-css` to `docker-compose` requires updating `REQUIRED_STACK_MECHANICS` so `ACH_FULL_STACK_FIXER` remains earnable across Chapter 1's active repair sectors while keeping `html_css_valid` intact for Terminal Lab (`scripts/harness/terminal-lab/task-html-css.lab.json`).

## Requirements

1. **Level 5 Docker Compose Rework, Theme & Hardware Continuity:**
   WHEN Level 5 (`id: "level-05-task-ui-grid"`, with a Docker-themed player-facing title, `cwd`, and Level 4 `exitDir` link) loads, THE SYSTEM SHALL spawn no `bug` or other malware enemies (`enemies: []`), expose a 4-service `docker-compose.yml` (`postgres`, `java` backend, `nginx`, `frontend`) starting with insufficient Java startup heap/memory (e.g. `-Xmx64m` / `mem_limit: 128m`), hide a `.logs/` directory discoverable via `ls -la` containing crash log output reporting `java.lang.OutOfMemoryError: Java heap space`, preserve the `ram` (`ram_16gb.dimm`) and `gpu` (`gpu_tensor_chip_02.img`) pickups for Hub 2 progression, lock `edit` and `sed` until `has_item laptop` (matching Level 6 so players inspect with `ls -la` / `cat` and fix `docker-compose.yml` using `vim`), require reading the `.logs` crash log + healthy 4-service compose stack + collecting both hardware pickups in `winRules`, and keep `ACH_FULL_STACK_FIXER` (`src/chapters/achievements.ts`) unlockable across Chapter 1's active repair mechanics.

2. **Unfixed OOM Flight & Crash Choreography (Existing Assets Only):**
   WHILE the Java backend startup heap/memory in `docker-compose.yml` remains below the required threshold (`< 256m`), WHEN the player runs `docker compose up` (or `docker-compose up`, with or without `-d`), THE SYSTEM SHALL launch all 4 labeled `prop.file` floating code sheets (`[postgres]`, `[java-api]`, `[nginx]`, `[frontend]`) into flight on stage, play a brief flight/strain animation using existing `FxCatalog` presets (e.g. `fx.matrix-fault` / `fx.sigkill` / `fx.coredump` with `"OOM KILLED!"` + `fx.mv-dust`), crash all 4 objects down to the ground killed by OOM (`Exit 137 (OOMKilled)`), record exited/OOMKilled container state visible in `docker ps -a` / `docker compose ps`, deal zero hero HP damage so experimentation preserves 0-death runs, and keep the OOM launch repeatable until fixed.

3. **Fixed Compose Launch, Persistent Floating Code Objects & Exit Gate:**
   WHEN the player raises the Java backend memory on start in `docker-compose.yml` to `>= 256m` (supporting `m`/`M` and `g`/`G` units across `JAVA_OPTS`, `JAVA_TOOL_OPTIONS`, `JDK_JAVA_OPTIONS`, `command`, or `mem_limit` / `deploy.resources.limits.memory`) and runs `docker compose up` (or `up -d`), THE SYSTEM SHALL auto-recreate any prior OOMKilled containers cleanly, launch all 4 labeled `prop.file` code sheets so they remain flying/hovering around on stage, mark all 4 services healthy (`docker_compose_healthy`), and open the exit gate once all `winRules` hold.

4. **Vibecoder & Kiro.d Dialogs:**
   WHEN playing Level 5, THE SYSTEM SHALL present Vibecoder and Kiro.d `dialog_box` beats (opening briefing guiding `ls -la`, reactive dialogs on reading `.logs`, on witnessing an unfixed OOM crash, and on launching all 4 flying services cleanly), Socratic `hankRungs`, and completion lines in `level.spec.json -> script` and `chapters/chapter-01-kiroween/story/dialogs.json` using approved parody names only.

5. **Shared Generic `docker` & `docker compose` (`docker-compose`) Engine:**
   THE SYSTEM SHALL provide a shared, declarative Docker and Compose engine across Chapter, Terminal Lab, and Classic shells supporting `docker` (`ps [-a]`, `images`, `build [-t]`, `run [-d] [-p] [--name]`, `up`, `start`, `stop`, `restart`, `rm [-f]`, `rmi`, `logs [--tail]`, `inspect`, `stats`, `exec`, `prune` / `system prune` / `container prune` / `image prune` / `volume prune` `[-f] [-a]`, `compose`) and `docker compose` / `docker-compose` (`up [-d] [--build] [--force-recreate]`, `down [-v] [--remove-orphans]`, `ps [-a]`, `build [--no-cache]`, `logs [-f] [--tail] [service]`, `start`, `stop`, `restart`, `rm [-f] [-s]`, `config`, `images`, `top`, `prune`), driven declaratively by `docker-compose.yml` and `Dockerfile` content with zero hardcoded chapter or level names so Level 5, Level 8, Level 9, Terminal Lab, and Classic floors run identically.

6. **Shared Full In-Terminal `vim` (`vi`) Emulation:**
   THE SYSTEM SHALL provide a shared modal in-terminal `vim` (`vi`) editor rendered inside `xterm.js` across Chapter, Terminal Lab, and Classic shells while keeping `edit`/`code` on the Split Code Mini-Editor; THE SYSTEM SHALL support Normal, Insert (`i`, `I`, `a`, `A`, `o`, `O`, `s`, `S`, `c`, `C`, `R`), Visual / Visual-Line (`v`, `V`), Command-line (`:`), and Search (`/`, `?`, `n`, `N`) modes, standard motions & counts (`h j k l`, arrow keys, `w b e`, `0 ^ $`, `gg G`, `<N>G`, `%`, `f/t`), operators & edits (`x`, `X`, `r`, `dd`, `dw`, `d$`, `D`, `yy`, `yw`, `p`, `P`, `cc`, `cw`, `J`, `>>`, `<<`, `.`, `u`, `Ctrl+R`), Ex commands (`:w`, `:w <file>`, `:q`, `:q!`, `:wq`, `:x`, `:wq!`, `:%s/pat/rep/[gi]` & line-range `:s`, `:<line>`, `:set nu`/`nonu`, `:noh`, `:e[!]`, `:help`), headless `-c <ex>` flags for deterministic `solvePack` / Terminal Lab runs, holding the 30s battle turn timer while Vim is open, counting writes (`:w` / `:wq` / `:x`) as 1 command action, and documenting `vim`, `docker`, and `docker compose` in `man` and the Field Manual (`F1`).

7. **Tooling, Property Tests & Quality Gates:**
   THE SYSTEM SHALL update Terminal Lab command metadata (`src/terminal-lab/commands.ts`), Chapter Editor schema/checks, and test assertions (including `architecture-unit.mjs`, `manual-unit.mjs`, `self-test.mjs`, and `property-tests.mjs`), pass headless 0-death chapter playthrough (`generate-chapter.mjs --verify`), preserve a byte-identical `npm run quality:fingerprint`, and pass `npm run quality` and `npm run build`.

## Out of scope

- Creating new 3D models, rooms, textures, or FX presets in `src/procgen/` (`npm run quality:fingerprint` stays byte-identical; reuses existing models and FX).
- Starting a second chapter beyond Chapter 1 (`chapter-01-kiroween`).
- Executing real host Docker containers or real JVM processes.

## Decisions

- **Q:** Should Level 5 keep its `bug` enemy?
  **A (user, 2026-11-27):** Remove the `bug` from Level 5 and rework it into a Docker Compose task.
- **Q:** What services, bug, and investigation flow should Level 5 feature?
  **A (user, 2026-11-27):** A 4-service Docker Compose stack (`postgres`, `java` backend, `nginx`, `frontend`); Vibecoder uses `ls -la` to find a hidden `.logs` folder with Java heap overflow crash errors, then uses `vim` to raise the Java app's memory on start in `docker-compose.yml`.
- **Q:** What happens visually when running `docker compose` before vs. after fixing the Java OOM bug, and should new FX be created?
  **A (user, 2026-11-27):** Reuse existing effects only: while unfixed, all 4 objects fly up, play an animation, and fall to the ground killed by OOM; once fixed and launched, the objects stay flying around and the exit gate opens, accompanied by Vibecoder and Kiro.d dialogs.
- **Q:** Which CLI tools are needed?
  **A (user, 2026-11-27):** Full `vim` emulation with commands, plus basic commands for both `docker` and `docker compose` (`ps`, `prune`, `build`, `up`, etc.).
- **Q1:** Where should full Vim emulation run, and how should it coexist with `edit` / `nano`?
  **A (user, 2026-11-27):** Full in-terminal Vim inside `xterm.js` (`Normal`/`Insert`/`Visual`/`Search`/`:ex` + `-c`), available in terminal anywhere while `edit`/`code` keep the Split Mini-Editor — authentic terminal Vim that works in Level 5 before getting the Laptop in Level 6.
- **Q2:** Which existing 3D models should represent the 4 Compose objects (`postgres`, `java` backend, `nginx`, `frontend`) during flight and OOM crash?
  **A (user, 2026-11-27):** Four labeled `prop.file` floating code sheets (`[postgres]`, `[java-api]`, `[nginx]`, `[frontend]`) — matches "floating code objects" directly using existing models and FX.
- **Q3:** What exact workflow should fix the Java heap OOM and launch the healthy stack?
  **A (user, 2026-11-27):** Raise Java heap/memory in `docker-compose.yml` (e.g. `-Xmx64m` -> `>=256m`/`512m` or `mem_limit >=256m`) and run `docker compose up` (or `up -d`) — realistic fix where `prune`/`down`/`build`/`ps` all work and auto-recreate cleanly.
- **Q4:** How should Level 5's pickups, naming, and achievements align with the rest of Chapter 1?
  **A (user, 2026-11-27):** Keep RAM + GPU pickups on Level 5 (preserving Hub 2's upgrade math), rename Level 5's title/`cwd`/links to a Docker theme (keeping stable internal `id` `level-05-task-ui-grid`), and update `ACH_FULL_STACK_FIXER` to match active mechanics — keeps campaign progression and all 15 achievements intact.
- **Q5:** Where should full Vim and the expanded `docker` / `docker compose` commands be available?
  **A (user, 2026-11-27):** Share pure Vim + generic Docker/Compose engines across Chapter, Terminal Lab, and Classic shells (with Levels 8 & 9 running on the same upgraded Docker engine) — zero duplicated shell logic and full lab/test parity.
- **Q6:** On Level 5 (before getting the Laptop in Level 6), how should editor locks and the `.logs` investigation work?
  **A (user, 2026-11-27):** Lock `edit` and `sed` on Level 5 (until `has_item laptop`, matching Level 6 so players use `vim`), and require reading the `.logs` crash file in `winRules` — ensures players discover the Java heap OOM via `ls -la` + `cat`/`vim` and fix compose with `vim`.
- **Q7:** When running unfixed `docker compose` triggers the 4-object OOM flight and crash, should the Vibecoder lose HP?
  **A (user, 2026-11-27):** Zero hero HP damage: only the 4 containers crash with `Exit 137 (OOMKilled)` + comic FX and crash dialogs, repeatable anytime while unfixed — rewards experimenting with the broken stack and preserves 0-death runs.
- **Q8:** How should in-terminal Vim interact with the battle turn timer (on combat levels) and the Field Manual?
  **A (user, 2026-11-27):** Hold the 30s battle turn timer while Vim is open (matching `edit`), count saving (`:w` / `:wq` / `:x`) as 1 command action, and document `vim` + `docker` / `docker compose` in `man` and the Field Manual (`F1`) — consistent with existing editor and manual UX.
- **Requirements approval (user, 2026-11-27):** Explicit approval of `requirements.md` ("i approve").
- **Design approval (user, 2026-11-27):** Explicit approval of `design.md` ("i approve").
- **Tasks approval (user, 2026-11-27):** Explicit approval of `tasks.md` ("i approve").

## Open questions

(none)

## Verification

- `node scripts/quality/check-specs.mjs`
- `npm run quality:brands`
- `node scripts/harness/generate-chapter.mjs --verify`
- `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
- `node scripts/harness/editor-unit-test.mjs` and `node scripts/harness/editor-smoke.mjs`
- `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, and `node scripts/harness/terminal-lab-smoke.mjs`
- `node scripts/harness/classic-unit.mjs` and `node scripts/harness/architecture-unit.mjs`
- `node scripts/harness/manual-unit.mjs`
- `node scripts/harness/property-tests.mjs --only terminal,chapters,gameplay`
- `npm run quality:fingerprint`
- `npm run quality` and `npm run build`
