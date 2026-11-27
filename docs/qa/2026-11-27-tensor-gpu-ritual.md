# QA report: Tensor GPU ritual, Kiro skills and VRAM modules

Date: 2026-11-27. Spec: `.kiro/specs/tensor-gpu-hub-ritual/`. Tree: `main` plus the closing commit.
Run by the lead-dev session (not by the `qa` agent), in real headless Chrome and with the gates below. Verdict: **PASS**.

## Checks run

| Check | Result |
|---|---|
| `npm run quality` (tsc, deps, lint, root, size, layers, cycles, dead code, declarative, specs, dup, agents, brands, mcp, props) | exit 0 |
| `npm run test` | exit 0 |
| `npm run build` | exit 0 |
| `node scripts/harness/generate-chapter.mjs --verify` | 11 levels cleared, 0 deaths |
| `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` | exit 0 |
| `node scripts/harness/property-tests.mjs` | 100 of 100 properties |
| `battle-unit.mjs`, `classic-unit.mjs`, `manual-unit.mjs`, `architecture-unit.mjs`, `terminal-lab-unit.mjs`, `editor-unit-test.mjs`, `laptop-unit.mjs` | exit 0 |
| `manual-smoke.mjs` (1600x950 and 1280x820), `editor-smoke.mjs`, `play-laptop-smoke.mjs`, `terminal-lab-smoke.mjs` (both sizes), `audio-smoke.mjs` | exit 0 |
| `audio-gen.mjs --check`, `audio-unit.mjs` | exit 0 (28 checks) |

## Played in real Chrome (headless, 1600x950; HUD also at 1280x820)

- **Level 1:** `cd .old_archive`, follow the two notes, `cd .cold_storage`, `mv vram.mod ~`. The hero card shows `VRAM x 1`, the strip slot counts `x1`, and the first-VRAM dialog plays. `tree -L 1`, `find / -name vram.mod` and `grep -r vram .` reach the same file. `ls -a` and `tree -a` stay locked until the Tube Transistor.
- **Level 2:** `chmod -x gravy_sentry.bin` drops the Tensor GPU next to the Tube Transistor; `mv tensor_gpu ~` lights the strip slot and plays the two dialogs.
- **Level 4 (ritual, with a temporary GPU grant that was reverted):** Kiro hovers beside the old coder at about 20 s, the green matrix magic and `WEIGHTS ONLINE` play at about 37 s, the card leaves the inventory, the map and manual arrive at about 75 s, and Kiro flies home. The run ends with `map` and `manual` held and no console errors.
- **Level 6:** `grep -r STASH .spare_parts` names the shelf, `cd .spare_parts/crate_a/crate_b/.safe`, `mv vram.mod ~` gives `vram: 1`.

## Findings (all fixed before this report)

| Finding | Owner | Fix |
|---|---|---|
| The ritual magic first drew the lantern ring on the hero, not on Kiro (`light.ping`) | chapters-designer | removed the ping; the effect is now on Kiro |
| `gate-open` lettered `CLANK!` over the magic | chapters-designer | blank lettering |
| `manual-smoke` clicked a TOC chip when the search drawer grew, and hard-coded spread numbers and slot counts | terminal-designer | click point and spread checks made relative; 7-slot strip |
| `terminal-lab-smoke` waited for an attack countdown of 2 (stale since the turn countdown) | terminal-designer | wait for 1, tick check wrap-aware |
| Two item registrations and the HUD pickup type were missing from earlier commits | lead-dev | fix commit `e070207` |

## Not covered

Levels 3 and 5 to 11 were played only by the headless solver (0 deaths), not by hand. Music beds are unchanged.
