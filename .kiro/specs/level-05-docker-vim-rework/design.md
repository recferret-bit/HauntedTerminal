# Level 5 Docker Compose OOM & Full Vim Emulation: design

Status: see requirements.md

## Pieces

```text
src/contracts/
  events.ts             add COMPOSE_OOM_CRASH (`actors: Array<{ entityId: string; model: string; label: string; x: number; hoverY: number }>`) to KernelEvent

src/game/
  vim-types.ts          (new) VimMode, VimState, VimOpenPayload, VimSaveResult, VimIo types and createStateMachine transition table (normal, insert, replace, visual, visual-line, command, search)
  vim-buffer.ts         (new) pure cursor, motion, count, edit/operator, visual selection, undo/redo, `.` repeat, and `/` `?` `n` `N` search helpers
  vim-ex.ts             (new) pure Ex parser/executor (:w, :w <file>, :w!, :q, :q!, :wq, :wq!, :x, :%s/pat/rep/[gi], ranged :s, :<line>, :$, :set nu/nonu, :noh, :e[!], :d, :help)
  vim.ts                (new) createVimState, stepVimKey, and runVimCli(args, io) supporting +<line>, -R, -n, and deterministic headless -c <ex> execution
  docker-compose-eval.ts (new) generic indentation-aware docker-compose.yml parser (services, image, build, ports, environment, command, mem_limit, deploy.resources.limits.memory, depends_on, volumes) + static validation split from runtime Java OOM memory evaluation (< 256m vs >= 256m across JAVA_OPTS, JAVA_TOOL_OPTIONS, JDK_JAVA_OPTIONS, command, mem_limit, deploy.resources.limits.memory)
  docker.ts             (new) shared DockerState (builtImages, containers with running/exited/oom states, exit codes 0/137, per-container logs, composeHealthyServices, volumes) and generic CLI handlers for docker (ps [-a], images, build, run, up, start, stop, restart, rm [-f], rmi, logs [--tail], inspect, stats, exec, prune / system|container|image|volume prune, compose) and docker compose / docker-compose (up [-d] [--build] [--force-recreate], down [-v] [--remove-orphans], ps [-a], build [--no-cache], logs [-f] [--tail], start, stop, restart, rm [-f] [-s], config, images, top, prune)
  play.ts               add DockerState / pendingVim state fields on Run / Classic Play
  session.ts            expose readEditableFile, saveEditableFile, consumeVimRequest on Session & Classic Game
  session-shell.ts      register vim, vi, docker, docker-compose in CLASSIC_HANDLERS
  manual.ts             add vim, vi, docker, docker-compose entries to COMMANDS and MAN; remove vim alias from edit
  manual-cmds-meta.ts   add vim Field Manual page, update edit aliases to ['nano', 'code'], expand docker manual page with Compose + prune/ps/logs/exec/stats subcommands
  manual-guides.ts      update code/docker/editor guide references to mention vim + expanded docker / docker compose commands

src/chapters/
  types.ts              add optional `floating?: boolean` on `docker_compose_healthy` WinRule
  validate-pack.ts      validate `docker_compose_healthy.floating` boolean field (four-place vocabulary rule)
  validators.ts         delegate `validateDockerCompose` to shared `src/game/docker-compose-eval.ts` while preserving existing exports
  session-state.ts      integrate shared DockerState and pendingVim: VimOpenPayload on LevelRuntime / ChapterState; add vim and vi to CHAPTER_COMMANDS
  session-level.ts      initialize fresh DockerState (`createDockerState()`) on loadLevel
  session-code.ts       route `vim` / `vi` to shared `vim.ts` (recording `filesRead` on open and committing writes via `saveEditableFile` on `:w`/`:wq`/`:x`); delegate `cmdDocker` to shared `docker.ts`, emitting floating `ENTITY_SPAWNED` or `COMPOSE_OOM_CRASH` events and latching `compose_oom_crashed` / `compose_healthy` runtime flags
  session-shell.ts      register `vim` and `vi` in CHAPTER_HANDLERS (keeping `edit`, `nano`, `code` on Split Code Mini-Editor)
  session-snapshot.ts   render healthy compose services as elevated floating `prop.file` sheets when active `docker_compose_healthy` winRule sets `floating: true`, preserving ground `prop.tar` crates for stacks without `floating`
  chapter-session.ts    wire `consumeVimRequest()` on ChapterSession
  achievements.ts       update REQUIRED_STACK_MECHANICS to `['terminal-code', 'docker-image', 'docker-compose']` and update ACH_FULL_STACK_FIXER description (preserving `id` and `steamApiName`)

src/chapter-editor/
  schema.ts             add boolean `floating` field to `docker_compose_healthy` in RULE_VARIANTS (inherited by Terminal Lab)

src/terminal-lab/
  commands.ts           classify `vim`, `vi`, `code`, `docker`, and `docker-compose` under the `Code` group with runnable examples and usage lines

src/renderer/
  stage-compose.ts      (new) handle COMPOSE_OOM_CRASH choreography (spawn/lift 4 `prop.file` actors via flyTo, rattle + red flash + fx.matrix-fault, fx.coredump "OOM KILLED!" / fx.sigkill, stepped drop to floor + fx.mv-dust, fade out) and gentle continuous hover bobbing for healthy floating compose `prop.file` actors
  stage-event-cast.ts   dispatch COMPOSE_OOM_CRASH to `stage-compose.ts`
  stage-sync.ts         trigger gentle hover animation on elevated floating compose actors without disturbing grounded props

src/ui/
  terminal-vim.ts       (new) in-terminal Vim modal overlay inside xterm.js alternate screen (`\x1b[?1049h` / `\x1b[?1049l`), rendering buffer, line numbers, gutter `~`, statusline mode/dirty indicator, and command/search prompt
  terminal-types.ts     add `openVim?` / vim active hooks on Shell / ShellHooks
  terminal-keys.ts      preserve raw bare `\x1b` vs CSI escape sequences when Vim mode is active
  terminal.ts           wire `openVim` on Shell API to transition cleanly in/out of xterm.js alternate screen

src/play/
  input.ts              consume `session.consumeVimRequest?.()`, hold 30s battle turn timer (`holdTurnTimer('editor', true)`) while Vim is open, commit saves via `saveEditableFile` (1 action), and release timer + restore prompt focus on `:q`/`:wq`/`:x`
  menu.ts               prevent `Escape` inside active terminal Vim from opening the game Esc menu
  state.ts              include open terminal Vim check in `anyModalOpen`

chapters/chapter-01-kiroween/
  chapter.manifest.json update Level 5 title, cwd (`/srv/kiroween/compose_cluster`), mechanic (`"docker-compose"`), mechanicLabel, teaches (`ls -la`, `cat`, `vim`, `docker ps`, `docker compose up -d`, `docker prune`, `mv`), enemies (`[]`), and mechanicsSummary
  levels/level-04-hub-model-one/level.spec.json
                        rename exitDir `/home/dev/sector_ui_grid` -> `/home/dev/sector_compose_cluster` and update `server_rack.conf` + `solutionCommands`
  levels/level-05-task-ui-grid/level.spec.json
                        rework into Compose Cluster (`enemies: []`): 4-service `docker-compose.yml` (`postgres`, `java-api` with `JAVA_OPTS=-Xmx64m`, `frontend`, `nginx`), valid `Dockerfile`, hidden `.logs/java-api.log` + `.logs/cluster.log` with `OutOfMemoryError: Java heap space`, preserved `ram_16gb.dimm` + `gpu_tensor_chip_02.img`, `script.locks` blocking `edit`/`nano`/`code`/`sed` until `has_item laptop` (`freeAction: true`), `winRules` (`read_file` `.logs/java-api.log`, `docker_compose_healthy` with `floating: true`, both `file_absent` pickups), Vibecoder + Kiro.d opening & reactive trigger dialogs (`.logs` read, `compose_oom_crashed`, `compose_healthy`), and `solutionCommands` using `ls -la`, `cat .logs/java-api.log`, `vim -c '%s/-Xmx64m/-Xmx512m/' -c 'wq' docker-compose.yml`, `docker compose up -d`, `mv`, `cd`
  story/dialogs.json    update Level 4 rung 3 (`cd sector_compose_cluster`) and Level 5 banner, hankRungs, agentTaunt, and completion
  src/chapters/generated/catalog-data.ts
                        regenerated via `node scripts/harness/generate-chapter.mjs`

scripts/harness/ & .kiro/skills/
  agents-build.mjs + .kiro/agents/*.json
                        add `vim-types`, `vim-buffer`, `vim-ex`, `vim`, `docker-compose-eval`, `docker` to `terminal-designer.writes` and regenerate `.kiro/agents/*.json` so `quality:agents` passes
  architecture-unit.mjs, manual-unit.mjs, terminal-lab-unit.mjs, props/{terminal,chapters,gameplay}.mjs, .kiro/skills/chapter-level-generator/scripts/self-test.mjs
                        update `sector_ui_grid` / `ui_dashboard` tokens to `sector_compose_cluster` / `compose_cluster`; add unit and property tests covering modal Vim (motions, insert, visual, undo/redo, `:s`, `:wq`, `-c`), generic Docker/Compose CLI (`ps -a`, `prune`, `build`, `up` OOM vs healthy), and Level 5 OOM/healthy playthrough
```

## Decisions

- **In-terminal Vim via `xterm.js` alternate screen + shared pure engine (Q1, Q5, Q8).**
  - Splitting pure buffer/motion/Ex logic across `src/game/vim-{types,buffer,ex}.ts` and `vim.ts` keeps every file well under the 600-line / 130-line limits, lets Chapter, Terminal Lab, and Classic shells invoke one shared implementation, and preserves pure Three-free testing in Node.
  - Interactive `vim <file>` on `/play` emits `pendingVim`, enters `xterm.js` alternate screen (`\x1b[?1049h` / `\x1b[?1049l`) in `src/ui/terminal-vim.ts`, holds the 30s battle turn timer (`holdTurnTimer('editor', true)`), blocks the game Esc menu while active, and executes `:w`/`:wq`/`:x` via `saveEditableFile` (1 action) while `:q`/`:q!` leaves file contents untouched. Headless `-c <ex>` flags (used by `solvePack`, Terminal Lab scripts, and property tests) apply Ex commands immediately and return exit `0` without blocking on UI, while `edit`, `nano`, and `code` keep the Split Code Mini-Editor (`src/ui/code-editor.ts`).

- **Generic declarative Docker/Compose engine with static vs. runtime OOM evaluation (Q3, Q5).**
  - `src/game/docker-compose-eval.ts` parses arbitrary `docker-compose.yml` stacks cleanly instead of hardcoding Level 9's 3 services. When a compose file defines `java` / `java-api` (or `JAVA_OPTS` / `JAVA_TOOL_OPTIONS` / `JDK_JAVA_OPTIONS` / `-Xmx`), static validation (`docker compose config`) verifies valid YAML, images, ports, and internal DNS wiring (`localhost` vs service hostname), while runtime evaluation checks effective Java memory (`< 256` MB triggers runtime OOM; `>= 256` MB passes).
  - Keeping static validation green for `-Xmx64m` while failing at runtime on `docker compose up` ensures `docker compose config` passes, the player can still test `docker compose up`, the 4 objects visibly fly up and crash with `Exit 137 (OOMKilled)` (zero hero HP damage, Q7), `docker ps -a` / `docker compose ps` shows exited containers, `docker prune` / `down` works, and re-running `docker compose up` after raising memory cleanly auto-recreates the stack.

- **Existing `ModelCatalog` + `FxCatalog` choreography & four-place `floating` rule (Q2, A4).**
  - Adding optional `floating?: boolean` on `docker_compose_healthy` in `src/chapters/types.ts`, `src/chapters/session-snapshot.ts`, `src/chapters/validate-pack.ts`, and `src/chapter-editor/schema.ts` lets Level 5 display 4 elevated, gently hovering labeled `prop.file` code sheets (`[postgres]`, `[java-api]`, `[nginx]`, `[frontend]`) while preserving Level 9's grounded `prop.tar` container crates with zero level-id hardcoding.
  - Implementing `COMPOSE_OOM_CRASH` inside a dedicated `src/renderer/stage-compose.ts` (leaving 555-line `stage-motion.ts` untouched) lifts 4 temporary labeled `prop.file` sheets via `flyTo`, triggers `fx.matrix-fault`, `fx.coredump` (`"OOM KILLED!"`), and `fx.sigkill` using existing `FxCatalog` presets, drops them to `feetY` with `fx.mv-dust`, and clears them cleanly—keeping `npm run quality:fingerprint` 100% byte-identical.

- **Level 5 rework continuity, locks, flags & achievements (Q4, Q6).**
  - Keeping stable `id: "level-05-task-ui-grid"` while renaming Level 5's `title`, `cwd` (`/srv/kiroween/compose_cluster`), and Level 4's exit directory (`/home/dev/sector_compose_cluster`) preserves saved progress URLs and tests while delivering a coherent Docker sector.
  - `session-code.ts` sets per-level script flags (`compose_oom_crashed`, `compose_healthy`) on `g.rt.flags` when OOM crashes or healthy launch occur so Level 5's `script.triggers` can fire Vibecoder & Kiro.d `dialog_box` reactions declaratively without touching 575-line `script.ts`.
  - `script.locks` locks `edit`, `nano`, `code`, and `sed` until `has_item laptop` (`freeAction: true`), guiding players cleanly into `ls -la`, `cat .logs/java-api.log`, and `vim docker-compose.yml`, while `ACH_FULL_STACK_FIXER` tracks Chapter 1's active repair mechanics (`terminal-code`, `docker-image`, `docker-compose`) and `html_css_valid` remains supported for Terminal Lab.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Zero changes required (`game/` imports `contracts/` + `procgen/core/`/`anim/` only; `chapters/` imports `contracts/` + `game/`; `renderer/` imports `contracts/`, `procgen/`, `shaders/`, `assets/`; `ui/` imports `contracts/`, `game/`, `chapters/`, `shaders/`, `renderer/`; `play/` wires everything).
- **Four-place chapter vocabulary rule:** Coordinated across `src/chapters/types.ts`, `src/chapters/session-snapshot.ts` / `session-rules.ts`, `src/chapter-editor/schema.ts` (inherited by `src/terminal-lab/`), and `src/chapters/validate-pack.ts`.
- **Agent ownership (`scripts/harness/agents-build.mjs` + `npm run quality:agents`):** Updated alongside new `src/game/{vim*,docker*}.ts` files so every source file has one owner.
- **Asset fingerprint (`npm run quality:fingerprint`):** Must remain 100% byte-identical (no `src/procgen/` model, texture, shader, or FX preset definitions change).
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs`
  - `npm run quality:brands`
  - `node scripts/harness/generate-chapter.mjs --verify`
  - `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `node scripts/harness/editor-unit-test.mjs` and `node scripts/harness/editor-smoke.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, and `node scripts/harness/terminal-lab-smoke.mjs`
  - `node scripts/harness/classic-unit.mjs`, `node scripts/harness/architecture-unit.mjs`, and `node scripts/harness/manual-unit.mjs`
  - `node scripts/harness/property-tests.mjs --only terminal,chapters,gameplay`
  - `npm run quality:fingerprint`
  - `npm run quality` and `npm run build`
