# Terminal Lab Configuration Schema (`*.lab.json`)

Sources of truth: `src/terminal-lab/lab-types.ts`, `src/chapters/session-lab-types.ts`, `src/terminal-lab/{schema,store,lab-check,lab-pack}.ts`, and `scripts/harness/lib/terminal-lab-api.mjs`.

## 1. Document Root (`LabScript`)

File path: `scripts/harness/terminal-lab/<id>.lab.json`, where `<id>` matches `LAB_ID_RE` (`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`) and `script.id === id`. Canonical writer: `stringifyLabJson` (2-space JSON + trailing `\n`).

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Lowercase lab id matching file stem |
| `title` | string | Display title |
| `driver` | `'chapter' \| 'classic'` | Optional (default `'chapter'`) |
| `room` | `LabRoom` | `{ roomKind, floorTheme: 1..5, mechanic, cwd, title, summary }` |
| `player` | `LabPlayer` | `{ ram: number, ssd: number, core: string }` |
| `clock` | `'manual' \| 'live'` | `'manual'` advances only on commands & `tick`; `'live'` ticks every 1s |
| `enemyFire` | `'live' \| 'hold'` | `'hold'` freezes enemies; `'live'` fires (player absorbs without dying) |
| `setup` | `LabSetupOp[]` | Scene elements built before step 1 |
| `steps` | `LabStep[]` | Scripted actions + assertions; headless adds `30` soak ticks afterwards |

## 2. `setup[]` Operations (`LabSetupOp`, 13 Variants)

| `op` | Fields |
|---|---|
| `file` | `path`, `mode?`, `uid?`, `questCritical?`, `content?` |
| `dir` | `path`, `mode?`, `uid?` |
| `socket` | `path`, `content?`, `mode?`, `uid?` |
| `enemy` | `LevelEnemySpec` (`id`, `type`, `path`, `pid?`, `ppid?`, `hidden?`, `port?`, `buffer?`, `helps?`, `showIn?`) |
| `pickup` | `LevelPickupSpec` (`id`, `type`, `path`, `locked?`, `model?`, `appearWhen?`) |
| `patch` | `LevelPatchChip` (`file`, `label`, `find`, `replace`) |
| `prop` | `id`, `model` (`ModelCatalog`), `x`, `y?`, `label?` |
| `npc` | `agent` (`clod\|gork\|codec\|antigravy\|kiro`), `mood` (`laugh\|order\|smug\|annoyed`), `text`, `print?` |
| `taunt` | `mood`, `text`, `print?` |
| `dialogue` | `obstacleId`, `speaker`, `portrait?`, `mood` (`cryptic\|hinting`), `anchorSocket`, `text`, `highlight`, `banner` |
| `riddle` | `id`, `path`, `speaker?`, `prompt`, `answer` (`LabPattern`), `hints?`, `success?`, `opens?`, `tokens?` |
| `task` | `id`, `rule: WinRule` (any chapter `WinRule`) |
| `check` | `id`, `description`, `when: LabCond` |

### `LabCond` (`check.when`) & `LabPattern`

`LabPattern`: plain text substring (exact for `riddle.answer`), or `re:<regex>` / `re:/<regex>/<flags>`.

| `when.kind` | Fields | Behavior |
|---|---|---|
| `ran` | `pattern: LabPattern` | Latches once a command matches |
| `output` | `pattern: LabPattern` | Latches once terminal output matches |
| `code` | `code: number`, `line?: LabPattern` | Latches once exit code (and optional command line) matches |
| `event` | `type: string` | Latches once `KernelEvent['type']` emits |
| `file` | `path: string`, `contains?: LabPattern`, `absent?: boolean` | Evaluates current VFS file state |
| `riddle` | `riddleId: string` | True once riddle is solved |

## 3. `steps[]` Actions (`LabStepAction`, 10 Variants)

Every step accepts an optional `note?: string`.

| `op` | Fields | Meaning |
|---|---|---|
| `run` | `line: string`, `expect?: LabExpect` | Executes command as Enter; `{pid:<enemyId>}` expands automatically |
| `tick` | `n?: number`, `expect?: LabExpect` | Advances `n` ticks (default 1) |
| `emit` | `event: KernelEvent` | Emits a kernel event directly |
| `inject` | `enemy?: LevelEnemySpec`, `pickup?: LevelPickupSpec` | Injects enemy/pickup mid-run |
| `say` | `agent`, `mood`, `text` | Displays agent cameo line |
| `taunt` | `mood`, `text` | Displays level taunt |
| `dialogue` | `LabDialogue` fields | Opens dialogue bubble anchored on socket |
| `check` | `id: string`, `is?: 'pass' \| 'fail'` | Asserts `task`, `check`, or `riddle` state |
| `wait` | `ms: number` | Live clock wait in browser (skipped headlessly) |
| `expect` | `expect: LabExpect` | Asserts state against current snapshot + last step |

### `LabExpect` Fields

- `code?: number`
- `stdout?: LabPattern`
- `stderr?: LabPattern`
- `events?: string[]` (event types required in this step)
- `noEvents?: string[]` (event types forbidden in this step)
- `cwd?: string`
- `enemiesLeft?: number`
- `absorbed?: { min?: number; max?: number }` (absorbed damage in invulnerable lab session)
- `file?: { path: string; contains?: LabPattern; absent?: boolean }`
