# Tensor GPU hub ritual: requirements

Status: done

Capability: a new inventory item, the Tensor GPU, drops in Level 2. When the vibecoder brings it to Hub 1, Kiro flies from the vibecoder to the Old Bearded Coder (dad.tty). Kiro says, in effect, "look whom I found, a vibecoder from the prophecy, and he found a Tensor GPU". The old coder answers that open-weight models can now be loaded into Kiro. Magic plays, and the dialogs explain that every open-weight model gives Kiro a skill (`qwen` heals, `deepseek` gives riddle hints), that each skill has one charge per level, and that hidden VRAM modules add charges. The old coder then gives the vibecoder the map and the manual. The dialogs must explain all of it.

User's words, 2026-11-27: "lets add tensor gpu item on the level 2, when user brings it to the hub > i need a new dialog and action. Like kiro must fly from vibecoder to the old guy, when close to him > a new dialog, like look whom i found, its a vibecoder from a prophesy, he found tensor gpu! old guys saying: great, we now can load open weight model into you. Then some magic happens, kiro is capable to do some hacking, more dialogs. Old guy gives the vibecoder a map and manual. Dialogs must explain that."

The requirements are proposed until the user approves them. The decisions below are the user's. Anything not yet answered is listed under Open questions.

## Findings (from code, read-only, 2026-11-27)

- **Levels.** `chapters/chapter-01-kiroween/levels/` holds levels 1 to 11. Level 2 is `level-02-task-ram-heist` (Cache Vault, the Tube Transistor drop). Level 3 is `level-03-task-gpu-salvage` (a task level). Hubs are level 4 (`level-04-hub-model-one`, wins on `kiro load qwen`), level 7 (`deepseek`) and level 10 (`llama`; `mistral` is only an optional core there). There is no level 0.
- **The old guy.** `chapter.manifest.json -> allyNpc`: id `dad.tty`, model `npc.greybeard_rig`, the hub socket `/home/dev/dad.tty.sock`, dialog speaker `dad`.
- **Map and manual today.** `level-04-hub-model-one/level.spec.json -> script.timed[afterSec 18]` runs `give_item map`, `give_item manual` and a `dad` dialog box. `manifest.grants` with `afterLevel: 4` gives both to a player who enters later levels directly.
- **Items.** `src/contracts/inventory.ts` has `ITEM_IDS` (`tube_transistor, terminal, laptop, manual, map`), read also by `src/ui/items-strip.ts`, `src/chapters/achievements.ts`, `src/chapter-editor/schema.ts` and `src/chapters/validate-pack.ts`. Pickups use `PickupType` and `PICKUP_INFO` (`src/game/bestiary.ts`). Hero hold models are `vibecoder.dev_<id>`. No `item.tensor_gpu` or `item.vram_module` exists. `pickup.gpu` and `prop.gpu_card` are visual starting points. Level 3's `gpu_shader_core_01.img` is an `ssd` pickup with GPU wording.
- **Lantern.** The glossary's lantern is stored as `tube_transistor` (`src/chapters/session-shell.ts:141`). `ls` flags (`-a`, `-l`, ...) are refused until it is held, so in Level 1 `ls -a` is refused.
- **Kiro.** `src/game/kiro.ts` holds the cores (`KIRO_CORES`: qwen, mistral, deepseek, llama). `src/game/kiro-commands.ts:74` treats `crack`, `decrypt` and `hack` as one subcommand. Levels 2 and 3 refuse `kiro load`.
- **Flight.** `carry_item` and `give_item` fly Kiro only to the hero or home (`src/renderer/stage-carry.ts`, `stage-motion.ts: flyTo`). No step flies an actor to an NPC.
- **Script vocabulary.** Steps: `print, emote, spawn, kiro_action, say, taunt, dialogue, dialog_box, tutorial_step, carry_item, give_item`. Conditions include `has_item`, `core_loaded`, `kiro_loaded`, `ran_command`, `file_read`, `enemy_dead`. `script.triggers` fires once per level load when its condition holds. Speakers: `vibecoder, dad, kiro, clod, gork, codec, antigravy`.
- **Four-place rule** for any new step or field: types (`script-types.ts`), interpreter (`script.ts`, with `OPENING_KEEP` and `SKIP_KEEP`), editor schema (`src/chapter-editor/schema.ts`), pack checks (`src/chapters/validate-pack.ts`). A new step also needs a stage handler, a `KernelEvent` (`src/contracts/events.ts`), a sound mapping (`src/audio/sfx-kernel.ts`) and Terminal Lab coverage.
- **New models.** Items need an ASSET PCG model (`procedural-kitbash-3d`, `model-geometry-validator`), and `quality:fingerprint` changes for intended asset additions.

## Requirements

1. WHEN the gargoyle in Level 2 is petrified, THE SYSTEM SHALL drop the Tensor GPU beside the Tube Transistor, and WHEN the vibecoder takes it with `mv`, THE SYSTEM SHALL add `tensor_gpu` to his inventory, show it in the items strip, and say in a dialog what it is.
2. WHEN the vibecoder is in Hub 1 (level 4) carrying `tensor_gpu`, THE SYSTEM SHALL start the ritual once, through a `script.triggers` entry on `has_item tensor_gpu`.
3. WHEN the ritual starts, THE SYSTEM SHALL fly Kiro from the vibecoder to the old coder (`dad.tty`) along a smooth path with a new generic `fly_to` script step (actor, target entity, wait for arrival), and hold him next to the old coder.
4. WHEN Kiro reaches the old coder, THE SYSTEM SHALL play, in order: Kiro says he found a vibecoder from the prophecy who has found a Tensor GPU; the old coder says open-weight models can now be loaded into Kiro.
5. WHEN those dialogs end, THE SYSTEM SHALL play a magic effect on Kiro with existing FX presets, remove `tensor_gpu` from the inventory (the strip slot goes dim), and play one sound for the flight and one for the magic.
6. WHEN the magic ends, THE SYSTEM SHALL play further dialogs (about 10-12 lines for the whole ritual, in the old coder's gruff tone) that explain: open-weight models give Kiro a skill; `kiro load <core>` loads one; `qwen` gives `kiro heal`, `deepseek` gives `kiro hint`; each skill has one charge per level; VRAM modules hidden in the machine add charges; the `VRAM x N` chip shows them.
7. WHEN the explanation ends, THE SYSTEM SHALL have the old coder give the vibecoder the map and the manual with the existing `give_item` flights and explain `map` / `F3` and `manual` / `F1`. The 18 s timed beat that gives them today moves into the ritual, and `manifest.grants` (`afterLevel: 4`) keeps giving both to a player who enters later levels directly.
8. IF the player clicks Skip Dialog during the ritual, THEN THE SYSTEM SHALL still fly Kiro, consume the GPU and grant the map and the manual (`OPENING_KEEP`, `SKIP_KEEP`). To make Skip Dialog available, Hub 1's `openingSec` covers the whole ritual (about 100 s).
9. WHEN the vibecoder has `qwen` as Kiro's active core and sends `kiro heal`, THE SYSTEM SHALL spend one charge and restore half of his max HP (`floor(max HP / 2)`, capped at max). In a battle it counts as one player action followed by one enemy turn; outside a battle it takes no turn. At full HP it is refused and spends nothing.
10. WHEN the vibecoder has `deepseek` as Kiro's active core and sends `kiro hint` in a room with an unsolved riddle, THE SYSTEM SHALL spend one charge and print the next line of that riddle's existing `hints` list, or one generic line when there is no riddle or no line left. Outside a battle it takes no turn.
11. WHEN a skill command is sent with no charge, or with its core not loaded, THE SYSTEM SHALL refuse it with one line, spend nothing and take no turn.
12. THE SYSTEM SHALL give each skill one charge at the start of every level once its core is loaded, and each VRAM module taken SHALL add one extra charge to one shared pool that either skill spends once its own charge is gone, kept until used and across levels.
13. THE SYSTEM SHALL place one VRAM module in Level 1 and one in Level 6, each inside a folder tree of 100 or more subfolders with hidden files, built by a new generator field in the level spec (count and seed). The module SHALL be reachable by every normal means (`ls` along a visible clue trail, `tree`, `find`, `grep -r`, and `ls -a` wherever the lantern lock allows it), so the player may search freely.
14. WHEN the vibecoder takes a VRAM module with `mv`, THE SYSTEM SHALL remove the file, add one extra charge and raise the `vram_module` slot count in the items strip.
15. THE SYSTEM SHALL show a `VRAM x N` chip with a memory-chip glyph in the hero card, and a `vram_module` slot in the items strip.
16. THE SYSTEM SHALL no longer treat `hack` as an alias of `kiro crack`, and `kiro crack` SHALL stay as it is.
17. THE SYSTEM SHALL add the new vocabulary (`fly_to`, `wait`, `take_item`, `kiro_action: empower`, the tree generator field) through the four-place rule, with Terminal Lab coverage, and the engine SHALL name no chapter or level. Every dialog line and riddle hint SHALL live in `level.spec.json` or `dialogs.json`.
18. THE SYSTEM SHALL provide `item.tensor_gpu` and `item.vram_module` (with their pickup models and icon) as procedural models under the art bible, validated, before any level spec names them. No hero hold model is needed.
19. IF the vibecoder enters Hub 1 without `tensor_gpu`, THEN THE SYSTEM SHALL give the map and the manual in a short fallback beat (a few `dad` lines, the same `give_item` flights) without the ritual, once.
20. WHEN the player deploys with the chapter map to a level already reached this session, THE SYSTEM SHALL keep his run state (inventory, Kiro's core, RAM, SSD, HP, VRAM pool and taken pickups) instead of resetting it, so he can return to Level 1 and search it with `ls -a`. THE SYSTEM SHALL NOT lift the `ls` flag lock before the Tube Transistor is held, and a pickup already taken SHALL NOT reappear on a return. A deploy beyond the highest level reached, and a direct entry, keep today's behaviour (grants).
21. THE SYSTEM SHALL keep every level solvable headlessly with 0 deaths; the skills are optional and the solutions do not depend on them.
22. WHILE the player is in a hub, THE SYSTEM SHALL let him load any open-weight core with `kiro load <core>`, not only the core of the hub's win rule; the hub's own win rule still needs its core, and the old coder's wrong-core line stays as a hint.

## Out of scope

- A second chapter, an achievement for this feature, a change to level 3's `gpu_shader_core_01.img`, skills for `llama` and `mistral`, new music. (decided)
- A ritual flag (`set_flag` / `flag`): dropped in Q17.

## Decisions

- **Q1: Where is the Tensor GPU in Level 2?** **A (user, 2026-11-27):** B. It drops when the gargoyle is petrified, next to the transistor, taken with `mv`.
- **Q2: Which hub, what starts it?** **A (user, 2026-11-27):** A. Hub 1 (level 4), automatic on arrival with `has_item tensor_gpu`. `kiro load qwen` stays the win rule.
- **Q3: How does Kiro fly?** **A (user, 2026-11-27):** A. A new generic `fly_to` step.
- **Q4: The old gate on `kiro crack` / `hack`.** **A (user, 2026-11-27):** A, later superseded by Q8, Q11 and Q17.
- **Q5: Map, manual and dialogs.** **A (user, 2026-11-27):** A. The map and manual beat moves to the end of the ritual, about 10-12 gruff dialog lines, the GPU is consumed, `manifest.grants` still covers players who skip ahead.
- **Q6: What keeps the unlock after the GPU is consumed?** **A (user, 2026-11-27):** A, superseded by Q17 (no flag).
- **Q7: Which levels does the lock cover?** **A (user, 2026-11-27):** A (levels 1-3), superseded by Q17.
- **Q8: What does `hack` do?** **A (user, 2026-11-27):** B, a separate subcommand, superseded by Q11 (skills per core).
- **Q9: The GPU in the items strip once consumed.** **A (user, 2026-11-27):** A. The slot stays dim; no hero hold model.
- **Q10: Level 3's chip, an achievement, sounds.** **A (user, 2026-11-27):** A. Level 3 unchanged, no achievement, one sound for the flight and one for the magic.
- **Q11: What does the new Kiro ability do?** **A (user, 2026-11-27):** Own answer. Every open-weight model gives one special skill during a battle or a riddle (heal the vibecoder, riddle advice). Two models for now.
- **Q12: What limits a skill?** **A (user, 2026-11-27):** Own answer. Single use. Secret VRAM module items give extra uses, hidden in a folder with 100+ subfolders and hidden files, one on "level 0" (corrected to Level 1) and one on Level 6, with a new icon and HUD status.
- **Q13: `kiro crack` and the `hack` alias.** **A (user, 2026-11-27):** A. The alias is dropped; `kiro crack` stays ungated as today.
- **Q14: Shape of the ritual flag.** **A (user, 2026-11-27):** A, superseded by Q17.
- **Q15: Players who skip ahead get the flag.** **A (user, 2026-11-27):** A, superseded by Q17 (they still get the map and manual).
- **Q16: Which cores get a skill?** **A (user, 2026-11-27):** A. `qwen` heals, a second core hints, the rest none. (Corrected by Q22.)
- **Q17: When is a skill usable?** **A (user, 2026-11-27):** A. From `kiro load <core>` onward; no ritual flag, no `set_flag` / `flag`.
- **Q18: Commands and cost.** **A (user, 2026-11-27):** A. `kiro heal` and `kiro hint`; one player action in battle; a hint outside a battle costs no turn but uses a charge.
- **Q19: Single use and VRAM modules.** **A (user, 2026-11-27):** A. One charge per core skill per level; each module adds one extra charge kept until used.
- **Q20: Where are the modules?** **A (user, 2026-11-27):** A. Level 1 and Level 6, 100+ subfolders and hidden files, built by a generator field in the level spec.
- **Q21: HUD status and icon.** **A (user, 2026-11-27):** A. A `VRAM x N` chip in the hero card, plus a `vram_module` strip slot.
- **Q22: Which core gives the riddle hint?** **A (user, 2026-11-27):** A. `deepseek` (Hub 2).
- **Q23: How does the player find hidden files?** **A (user, 2026-11-27):** Own answer. Make every way work (`ls` trail, `tree`, `find`, `grep -r`, `ls -a`), to give the player freedom.
- **Q24: How does the player take a module?** **A (user, 2026-11-27):** A. `mv vram.mod ~`; it is consumed into a charge and the strip slot counts them.
- **Q25: Charges.** **A (user, 2026-11-27):** A. Each loaded core starts every level with 1 charge; module charges are kept; with none, a refusal line and no turn.
- **Q26: Heal and hint.** **A (user, 2026-11-27):** A. `heal` restores half max HP; `hint` prints the riddle's `hint` line or a generic line.
- **Q27: What if the GPU is not taken in level 2?** **A (user, 2026-11-27):** A. A short fallback beat at Hub 1 gives the map and manual without the ritual.
- **Q28: Is `ls -a` allowed in level 1?** **A (user, 2026-11-27):** Own answer. The lock stays: `ls -a` / `-l` / `-la` work only once the player holds the Tube Transistor. The player may go back to level 1 with the map and search there.
- **Q29: Extra charges.** **A (user, 2026-11-27):** A. One shared pool, spent by either skill.
- **Q30: Req 20, going back to level 1 (design round 1 Q1).** **A (user, 2026-11-27):** A. A revisit rule: a map deploy to an already reached level keeps run state. Req 20 reworded.
- **Q31: Skip Dialog (design Q2).** **A (user, 2026-11-27):** A. Raise Hub 1's `openingSec` to about 100 s so the whole ritual is skippable; the fallback beat is locked until the player skips.
- **Q32: One active core (design Q3).** **A (user, 2026-11-27):** A, plus: make it possible to load any model in a hub. Hubs no longer refuse a wrong core (Req 22). Only one skill works at a time, the one of the active core.
- **Q33: Riddle hint (design Q4).** **A (user, 2026-11-27):** A. `kiro hint` reads the existing `hints[]`; no new `hint` field (Req 10 and 17 reworded).
- **Q34: Heal rules (design Q5).** **A (user, 2026-11-27):** A. `floor(max HP / 2)`, works in or out of a battle, refused at full HP without spending a charge (Req 9 reworded).
- **Design choices adopted without objection (2026-11-27):** `wait`, `take_item`, `kiro_action: empower`, the `ACTOR_FLY_TO` event, `Inventory.vram` and `Inventory.taken`, optional `ItemDef.heroModel`; the two new items excluded from the achievements loops; free actions (a refused skill, a hint outside a battle) take no turn; the classic shell gets the commands but no modules or riddles; all pickup types recorded as taken; VRAM state lives in the session with an optional `ChapterGrant.vram`; level 2's solution takes the GPU.
- **Approval (user, 2026-11-27):** "i approve" for the 21 requirements, including the requirement 20 caveat (the map deploy back to level 1 is to be confirmed in the design).

## Open questions

(none)

## Verification

(Proposed.) `node scripts/quality/check-specs.mjs`; `generate-chapter.mjs --verify` (0 deaths); `editor-unit-test.mjs`, `editor-smoke.mjs`, `terminal-lab-unit.mjs` (new steps, fields and items); `battle-unit.mjs` and `property-tests.mjs --only gameplay` (heal in battle); `model-geometry-validator` `--all --strict` and `quality:fingerprint` (new models); `npm run quality`.
