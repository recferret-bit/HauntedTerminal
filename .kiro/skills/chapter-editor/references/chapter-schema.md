# Chapter & Level Configuration Schema

Sources of truth: `src/chapters/{types,script-types,validate-pack,validate-stage}.ts` and `src/chapter-editor/{schema,schema-script,schema-stage}.ts`.

## 1. Folder Structure & Writable Files

- `chapters/<slug>/chapter.manifest.json` (`ChapterManifest`)
- `chapters/<slug>/story/dialogs.json` (`ChapterDialogs`)
- `chapters/<slug>/story/comix.spec.json` (`ComixStorySpec`)
- `chapters/<slug>/levels/level-XX-<slug>/level.spec.json` (`LevelSpec`)

Canonical writer: `stringifyChapterJson(value, relPath)` (`scripts/harness/lib/chapter-json.mjs`), also run via `node scripts/harness/generate-chapter.mjs --format`.
MCP `credits-forge`: `write_level` writes `levels/<id>/level.spec.json` (requiring `checkPack` + 0-death `solvePack`); `write_chapter_file` writes `chapter.manifest.json` or `story/*.json` (`baseEtag` 409 conflict checks + `checkPack` + catalog recompile).

## 2. `ChapterManifest` (`chapter.manifest.json`)

| Field | Type | Notes |
|---|---|---|
| `id`, `issueNumber`, `title`, `subtitle`, `badge`, `clientName`, `summary` | metadata | `id` matches chapter folder slug |
| `status` | `'playable' \| 'spec'` | Playable chapters compile into `GENERATED_LEVELS_BY_CHAPTER` |
| `estimatedMinutes`, `mechanicsSummary` | runtime metadata | Summary strings |
| `allyNpc` | `{ id, name, role, model, paletteFamily }` | Model checked against `ModelCatalog` |
| `boss` | `{ id, name, processName, pid, model, cameoModel?, cameoLabel?, cameoTransform? }` | Models checked against `ModelCatalog`; `cameoTransform`: `SceneTransform & { x?, y?, label? }` |
| `comix?` | `{ specPath, dialogsPath, pageCount }` | Story comic & dialogs paths relative to chapter root |
| `grants?` | `ChapterGrant[]` | Cumulative when start level `index > afterLevel`: `{ afterLevel, ram?, ssd?, core?, items?: ItemId[] }` (`last core` wins) |
| `startItems?` | `ItemId[]` | Default `['tube_transistor', 'terminal']` |
| `onFirstPickup?` | `Array<{ pickup: PickupType, steps: ScriptStep[] }>` | Fires once per session on first pickup of type |
| `outro?` | `{ finale?: ScriptStep[], caption: string, actors?: Array<{ id, model, label, x, y?, zOrder?, scale?, rotation? }> }` | Tokens `{rank}`, `{commands}`, `{scrap}`, `{scrapTotal}` in `finale` |
| `dossier?` | `Array<{ id, name, model, role: 'ALLY'|'MALWARE'|'BOSS', hostHardware, counterplay }>` | Bestiary cards |
| `levels` | `ChapterLevelSummary[]` | `{ index, id, title, cwd, roomKind, floorTheme: 1..5, mechanic, mechanicLabel, difficulty: 1..5, teaches, enemies, classicFloor?, specPath? }` |

## 3. `LevelSpec` (`level.spec.json`)

- **Top level**: `id`, `index`, `title`, `cwd`, `roomKind` (11 `ROOM_KINDS`: `desk`, `attic`, `crypt_entrance`, `crypt_hall`, `chasm`, `cell`, `lab_hall`, `catwalk`, `furnace`, `core`, `outro`), `floorTheme` (`1..5`), `roomSeed?`, `mechanic` (7 `MECHANICS`: `hub`, `terminal`, `html-css`, `terminal-code`, `docker-image`, `docker-compose`, `boss`), `exitDir?`, `exitCommand?`, `summary`, `files: LevelFileSpec[]`, `enemies: LevelEnemySpec[]` (12 `ENEMY_TYPES`: `virus`, `worm`, `trojan`, `bug`, `exploit`, `crack`, `ransomware`, `spyware`, `rootkit`, `zombie`, `forkbomb`, `kernel`), `pickups`, `patches`, `riddles?`, `props?`, `stage?: LevelStageSpec`, `winRules: WinRule[]`, `solutionCommands: string[]` (use `{pid:<enemyId>}` tokens, never hardcoded PIDs), `script?: LevelScript`.
- **`SceneTransform`** *(shared on entities, props, stage elements, outro & comix)*: `zOrder?` (`0` = actor plane, `<0` back, `>0` front), `scale?: number | [sx, sy, sz]`, `rotation?: number | [rx, ry, rz]` (degrees; number = Z-tilt).
- **`stage?: LevelStageSpec`**: `hero?: number | ({ x, y? } & SceneTransform)`, `entryPort?: false | ({ label?, model?, x?, y?, socket?, sfx? } & SceneTransform)`, `kiro?: { x?, y?, target?, label? } & SceneTransform`, `backdrop?: '#rrggbb'`, `ambient?: { lightMode?, bats?, storm?, loops? }`, `music?`, `sfx?: { enter?, deny?, exit? }`, `subdirs?: Record<string, { hero?, entryPort?, backdrop?, ambient?, music?, sfx?, caption? }>`.

### Level Entities (`files`, `enemies`, `pickups`, `patches`, `riddles`, `props`)

| Array | Element type | Exact fields |
|---|---|---|
| `files` | `LevelFileSpec` | `path`, `kind: 'file' \| 'dir' \| 'socket'`, `mode?`, `uid?`, `questCritical?`, `content?`, `x?`, `y?`, `model?`, `socket?`, `label?`, `sfx?`, `+SceneTransform` |
| `enemies` | `LevelEnemySpec` | `id`, `type` (`EnemyType`), `path`, `pid?`, `ppid?`, `hidden?`, `port?`, `buffer?`, `helps?`, `showIn?`, `x?`, `y?`, `model?`, `label?`, `attackSfx?`, `killSfx?`, `+SceneTransform` |
| `pickups` | `LevelPickupSpec` | `id`, `type` (`PickupType`), `path`, `locked?`, `model?`, `x?`, `y?`, `label?`, `sfx?`, `+SceneTransform`, `appearWhen?: ScriptCond` |
| `patches` | `LevelPatchChip` | `file`, `label`, `find`, `replace` |
| `riddles?` | `LevelRiddleSpec` | `id`, `path`, `prompt`, `answer`, `speaker?`, `hints?`, `success?`, `opens?`, `tokens?` |
| `props?` | `LevelPropSpec` | `id`, `model` (`ModelCatalog`), `x`, `y?`, `socket?`, `kind?`, `label?`, `cwd?`, `+SceneTransform` |

### `WinRule` (All 14 Variants)

| `kind` | Required fields |
|---|---|
| `read_file` | `path`, `description` |
| `talk_ally` | `socket`, `description` |
| `riddle_solved` | `riddleId`, `description` |
| `file_absent` | `path`, `description` |
| `file_contains` | `path`, `pattern`, `description` |
| `dir_accessible` | `path`, `description` |
| `kiro_decrypted` | `path`, `description` |
| `kiro_loaded` | `core`, `description` |
| `enemy_neutralized` | `enemyId`, `description` |
| `html_css_valid` | `htmlPath`, `cssPath`, `description` |
| `cart_js_valid` | `jsPath`, `description` |
| `docker_image_running` | `imageTag`, `port`, `description` |
| `docker_compose_healthy` | `services: string[]`, `description` |
| `boss_defeated` | `bossId`, `streamPath`, `verifySocket`, `expectedToken`, `anchorPath`, `anchorPattern`, `description` |

## 4. `LevelScript`, Conditions & Steps (`src/chapters/script-types.ts`)

### `ScriptCond` (All 11 Variants)

`ran_command` (`name`), `file_absent` (`path`), `file_read` (`path`), `enemy_dead` (`enemyId`), `any_enemy_dead`, `core_loaded` (`core`), `has_item` (`item: ItemId`), `room_swept`, `tutorial_skipped`, `any` (`of: ScriptCond[]`), `all` (`of: ScriptCond[]`).

### `ScriptStep` (All Variants)

| `kind` | Fields |
|---|---|
| `print` | `text` |
| `emote` | `emote: 'shock'|'confused'|'determined'|'relief'|'panic'|'shout'`, `text?` |
| `spawn` | `entityId`, `model`, `entrance?: 'appear'|'glide'`, `x?`, `y?`, `label?`, `+SceneTransform` |
| `despawn` | `entityId` |
| `kiro_action` | `action: 'scan'|'load'|'crack_start'|'crack_step'|'crack_done'|'empower'`, `core`, `message` |
| `say` | `agent: 'clod'|'gork'|'codec'|'antigravy'|'kiro'`, `model`, `text`, `mood`, `print?` |
| `taunt` | `mood: 'laugh'|'order'|'smug'|'annoyed'`, `fallback?`, `print?` |
| `dialogue` | `obstacleId`, `speaker`, `portrait?`, `mood: 'cryptic'|'hinting'`, `anchorSocket`, `text`, `highlight: string[]`, `banner` |
| `dialog_box` | `speaker: 'vibecoder'|'dad'|ScriptAgent`, `text`, `holdSec?` |
| `tutorial_step` | `step` (1-based) |
| `carry_item` | `entityId`, `item: ItemId` |
| `give_item` | `item: ItemId`, `from?` |
| `take_item` | `item: ItemId` |
| `fly_to` | `entityId`, `target`, `hold?`, `ms?` |
| `wait` | `sec` |
| `sfx` | `cue` (`SFX_IDS`) |
| `fx` | `preset` (`FxCatalog`), `x?`, `y?`, `text?` |
| `music` | `cue?: MusicId \| null` |

### `LevelScript` Top Keys

- `arrival?`: `ScriptStep[]` (omitting fires `dialogs.levels[id].agentTaunt`)
- `openingSec?`: seconds Vibecoder + Kiro conversation holds terminal locked before Big Four taunt/battle
- `timed?`: `Array<{ afterSec, unless?: ScriptCond, steps: ScriptStep[] }>`
- `triggers?`: `Array<{ when: ScriptCond, steps: ScriptStep[] }>`
- `locks?`: `Array<{ command, until: ScriptCond, message }>`
- `allySpeaker?`, `safe?: boolean`, `holdEnemiesUntil?: ScriptCond`, `signalAliases?: Partial<Record<PosixSignal, PosixSignal>>`
- `tutorial?`: `{ label?, agent, model, steps: Array<{ prompt, command, doneText, doneWhen?: ScriptCond[] }>, hide?: { enemyId, node, model, revealWhen }, skipText? }`
- `bullying?`: `{ after, every, mood, print, lines: Array<{ agent, text }> }`
- `kiro?`: `{ stage?: 'show'|'crack_only'|'hidden', hideWhen?: Array<'intro'|'exit_open'|'before_spawn'>, label?, labelLoaded?: { cores, label }, weak?, weakUntilCore?, weakNote?, loadRefusal?, wrongCoreLine?, coreAliases?, reactions? }`
- `onBossKill?`: `ScriptStep[]` (`{boss}` token)

## 5. `ChapterDialogs` & `ComixStorySpec`

- `story/dialogs.json`: `{ chapterId, allyId?, cast: Record<id, { displayName, color }>, levels: Record<levelId, { banner, hankRungs: [string, string, string], agentTaunt?, completion? }> }`.
- `story/comix.spec.json`: `{ chapterId, issueNumber, title, subtitle, pages: Array<{ pageNumber, title, panels: Array<{ id, rect: [x,y,w,h], bgHex, backdrop?, room?, caption?, cast: Array<{ model, x, y?, zOrder?, scale?, rotation?, view? }>, props?: Array<{ id?, model, x, y?, zOrder?, scale?, rotation?, view? }>, bubbles?: Array<{ speaker, style: 'normal'|'shout'|'whisper', text, x, y }>, sfx?: { text, x, y, color, cue? } }> }> }`.
