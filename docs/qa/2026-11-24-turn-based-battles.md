# QA 2026-11-24: turn-based battles

Branch: working tree  ·  Asked by: lead-dev  ·  Scope: `.kiro/specs/turn-based-battles/` task 12 (battles, Tactical Mode removal, HUD turn indicator, battle-start screen)

## Verdict

PASS (0 blocking findings, 3 low/info notes for the record)

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `npm start` | 0 | Vite on 5400. Stopped at the end with `npm stop`. |
| `node scripts/harness/battle-unit.mjs` | 0 | 12 checks passed (intro, player first, one action per Enter, empty line, timeout, holds, several enemies, leaving, seeded agents, tactical gone). |
| `node scripts/harness/visual-audit.mjs --screens battle-start,damage,death-respawn --sizes 1280x820,1600x950` | 1 | 6 captures, 10 flags (explained below). Exit 1 = flags to explain. |
| `npm run quality` | 0 | Includes 49 properties (seed 20261117), including the battle properties. |
| `node scripts/harness/generate-chapter.mjs --verify` | 0 | 11 levels cleared, cmds=65, deaths=0. |
| `node scripts/harness/terminal-lab-unit.mjs` | 0 | 63 checks passed. The known failure (`agent.codec frame 0 must retain visible CRT syntax bars`) did **not** reproduce: refuted in this tree. |
| `node scripts/harness/visual-audit.mjs --selftest` | 1 | Fails `0 !== 1` in `visual-selftest.mjs:66` (`pixelTests`): the known off-palette pixel test. Confirmed, not from this change. |
| `grep -rniIl tactical src pages scripts/harness --exclude-dir=out` | 0 | Only `battle-unit.mjs` and `terminal-lab-unit.mjs`, both are tests asserting that `tactical` is gone. Nothing in `src/` or `pages/`. |

Not run: `npm run build`, `playthrough.mjs --ticks 3`, `verify-chapter.mjs`, `terminal-lab.mjs --all`, `terminal-lab-smoke.mjs`, `editor-smoke.mjs` (outside the requested scope for this pass; `lead-dev` lists them in task 12). `validate_level` / `solve_level` MCP not called (no level data was touched).

## Visual audit

`visual-audit.mjs --screens battle-start,damage,death-respawn --sizes 1280x820,1600x950`: exit 1, 6 captures, 3 frame probes, 10 flags, 40 s.

| Screen @ size | Flag | Verdict | Reason |
|---|---|---|---|
| battle-start@1280x820 | no-baseline | expected | New screen; a person approves baselines. |
| battle-start@1600x950 | no-baseline | expected | Same. |
| battle-start@1600x950 | text-overflow (`#terminal-panel`, 3 px Y) | note 1 | The xterm screen is 3 px taller than its panel at 1600x950. 17 captures in the merged summary carry this same flag, so it is a general trait, not battle-specific. |
| damage@1280x820 | capture-unstable | not checked | Run flag, handed to `lead-dev` (audit owner). The still was still produced. |
| damage@1280x820 | diff (20 % changed) | expected | Baseline predates this change: its HUD shows the `TACTICAL` button, now gone (red in `damage@1280x820-diff.png`), and the HP card gains the turn indicator. Intended; needs a person's baseline approval. |
| damage@1600x950 | text-overflow | note 1 | As above. |
| damage@1600x950 | diff | expected | Same reason as damage@1280x820. |
| death-respawn@1280x820 | diff | expected | Same: Tactical button removed, turn indicator added. |
| death-respawn@1600x950 | text-overflow | note 1 | As above. |
| death-respawn@1600x950 | diff (20 %) | expected | Same. |

Motion: battle-start 0/121 long frames (worst 16.8 ms), damage 4/108 (worst 66.7 ms), death-respawn 6/101 (worst 116.8 ms). No `jump`, `frozen`, `blank-frame` or `dropped-frames` flags.

### Checklist per screen

Items 1 to 14 as in `.kiro/agents/prompts/qa.md`. `p` pass, `-` n/a. Judged from the stills and the battle-start filmstrip.

| Screen | Sizes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| battle-start | 1280x820, 1600x950 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| damage | 1280x820, 1600x950 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| death-respawn | 1280x820, 1600x950 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |

Item 2 is `p` with note 1 (3 px xterm overflow, no text is cut off visibly).

## Played by hand (Chrome DevTools MCP, 1280x800 viewport)

MCP calls used (one kind each, repeated as needed): `new_page`, `navigate_page` (url, reload), `wait_for`, `take_snapshot`, `take_screenshot`, `type_text`, `press_key`, `list_console_messages`. `click`, `resize_page` and `emulate` not used.

Level 03 (crack + worm, `level-03-task-gpu-salvage?nointro=1`):

- On load: no battle, HP card shows no indicator. HUD has no `Tactical` button (snapshot: only `? HINT`, `SOUND`, `RESTART FLOOR`).
- `ls` (first command): the terminal printed `=== BATTLE #1: 1 malware in range. You move first. ===`, then `[ANTIGRAVY] Let us see you float out of THIS one.` and `[KIRO] WORM: kill its PID, or cut it off: chmod 000 ...`. The screenshot during the intro shows the HP card reading `FIGHT!`, the Kiro ghost portrait in the right dialog box, the dust burst (`fx.fight`) around the hero. HP stayed 120/120 on the command that began the battle (`media/2026-11-24-turn-based-battles-1.png`). After the intro the card read `YOUR TURN 0:16`.
- `foo` (wrong command): `command not found`, CMD went 1 to 2. One extra empty Enter: CMD stayed 2, an empty prompt line was printed.
- Waited about 35 s with no typing: `YOUR TURN` came back at `0:29` with CMD still 2 and no command counted, so the timer ran out into an enemy turn and a fresh 30 s began. By then HP was 120; later, HP read 114/120 after `cd ..` (the worm struck during an enemy turn). I did not see the enemy action in the terminal text or on a screenshot at the moment of the timeout, so the "timeout gives an enemy attack" result rests on the timer reset, `battle-unit.mjs` and the property tests.
- `edit gpu_shader_core_01.img`: the mini-editor opened and the card read `YOUR TURN 0:30 II`; after about 6 more seconds it still read `0:30 II`: the timer is held (`media/2026-11-24-turn-based-battles-2.png`). Esc closed the editor and the timer resumed (`0:20` after a following command).
- `cd ..`: refused by the chroot jail on this level, so leaving the room could not be played here.

Level 02 (`level-02-task-ram-heist`, spyware): same banner, `[CLOD] Malware incoming...` taunt-style line, Kiro advice for spyware, `YOUR TURN 0:27`. `pwd` after `ls` counted as one action (CMD 2). `tactical` printed `bash: tactical: command not found (try 'help' or 'hank')`.

`/chapters.html`: snapshot lists chapter and level buttons and one checkbox (`Chaos Contract`); no Tactical checkbox.

Console: only the Vite websocket errors (expected under the fence). No font or network errors.

Not verified in Chrome (reason): Enter during the intro keeping the typed text (every MCP call takes longer than the 4 s intro, so I could not reach it: covered by `battle-unit.mjs`), several enemies staggered 400 ms apart (levels 03 and 02 have one enemy; level 06 not played), leaving the room ending the battle (no unlocked exit reached; covered by `battle-unit.mjs`), a level 11 boss battle, and the 1600x950 size by hand (covered by the audit stills).

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | low | HUD / layout | `lead-dev` | `#terminal-panel` text-overflow flag, 3 px in Y at 1600x950 (17 captures carry it). Not caused by this change, no visible clipping. | `visual-audit.mjs --screens battle-start --sizes 1600x950` | `scripts/harness/out/visual/battle-start@1600x950.png` |
| 2 | info | HUD | `terminal-designer` | The hero card shows `FIGHT!` for the intro, but the first command that triggers a battle leaves the level before it with no indicator (battle begins after the first command, not at load). Intended per the specs only if "begin" means the first world step; worth a person's look. | Load level 03, wait, then `ls` | `media/2026-11-24-turn-based-battles-1.png` |
| 3 | info | visual audit | `lead-dev` | `damage@1280x820` reported `capture-unstable`. | `visual-audit.mjs --screens damage --sizes 1280x820` | none |

Baselines for `battle-start`, `damage`, `death-respawn` need a person's approval; the three diffs match the removal of the Tactical button.

Media: `media/2026-11-24-turn-based-battles-1.png` (battle start, level 03), `-2.png` (editor open, timer held), `-3.png` (battle-start filmstrip).
