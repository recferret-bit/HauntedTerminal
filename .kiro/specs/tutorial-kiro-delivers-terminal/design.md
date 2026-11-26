# Tutorial: Kiro Ghost delivers the terminal: design

Follows `requirements.md`. Approval: delegated by the user on 2026-11-25 ("do your best"), see the requirements' Decisions.

## Data (chapter, `chapters-designer`)

- `chapter.manifest.json`: `startItems` is `["manual", "map"]`; `grants` becomes progressive: `afterLevel: 1` `["terminal"]`, `afterLevel: 3` `["lantern"]`, `afterLevel: 6` `["laptop"]` (req 10).
- `level-01-tutorial-awakening/level.spec.json -> script.timed` (patched in place, canonical writer), after the "I'm cooked!" line at 15 s:
  - 17 s: `emote { emote: "shout", text: "HELLOOOO??" }` + `dialog_box vibecoder "HELLOOOO?? Is anybody out there?!"`.
  - 19 s: `spawn kiro glide`, `kiro_action scan`, Kiro's first line.
  - 22 s: `carry_item { entityId: "kiro", item: "terminal" }` + Kiro line ("You dropped your cyberdeck terminal in the dark. Catch!").
  - 25 s: `give_item { item: "terminal", from: "kiro" }` + vibecoder line ("My terminal! Okay... the screen glow barely reaches my boots, so I can run `ls` at least!") + `tutorial_step 1` (`ls`, unless `ran_command ls`).
  - 28 s and 31 s: two `ls` guidance lines (unless `ran_command ls`).
  - Arrival `print` notes pitch black darkness and empty hands (`manual`, `map` in pocket).
- `solutionCommands` starts with `ls` (req 11, 6 commands total).

## Vocabulary (four places, `chapters-designer`; event types in `src/contracts`, `lead-dev`)

| Place | Change |
|---|---|
| `src/chapters/script-types.ts` | `ScriptStep` gains `{ kind: 'carry_item'; entityId: string; item: ItemId }` and `{ kind: 'give_item'; item: ItemId; from?: string }`; `emote` gains `'shout'`. |
| `src/chapters/script.ts` | `carry_item` emits `ITEM_CARRIED`; `give_item` calls `giveItem` and, when `held` is `null`, `holdItem`, then emits `ITEM_GIVEN`; `shout` passes through as `VIBECODER_EMOTE`. |
| `src/chapter-editor/schema.ts` | Forms for both steps (`item` is a select of `ITEM_IDS`), `shout` in `EMOTES`. |
| `src/chapters/validate-pack.ts` | `item` must be an `ItemId`; `carry_item.entityId` and `give_item.from` must be spawned earlier in the level script or be `kiro`. |

`src/contracts/events.ts`: `VIBECODER_EMOTE.emote` gains `'shout'`; new events `ITEM_CARRIED { entityId, item, model }` and `ITEM_GIVEN { item, model, from?, held }` (`model` is `ITEMS[item].model`).

## Empty hands

- `Inventory.held: ItemId | null`. `starterInventory` holds the lantern, else the terminal, else nothing (the manual is a book in the pocket). `holdItem` and `hold <item>` unchanged. `heroModel(null)` is `vibecoder.dev_bare`. The `GameSnapshot.inventory.held`, `SceneFacts.held`, items strip and HUD types follow (`null` = no slot highlighted).
- Owners: `src/game/inventory.ts` (`chapters-designer`), `src/contracts/inventory.ts` (`heroModel` table stays, bare id added as a constant), `src/game/{types,view-layouts,session,runtime}.ts` (`lead-dev`), `src/chapters/session-snapshot.ts` (`chapters-designer`), `src/ui/{items-strip,hud}.ts` (`terminal-designer`). Edits in the dirty files touch only the `held` lines.

## Terminal UI gate (`terminal-designer` + `lead-dev`)

- `src/ui/` terminal gets one generic switch, `setAvailable(on: boolean)`: off hides the terminal panel and ignores keys; on shows it with a short pop-in and focuses it.
- `src/play/` calls it from each snapshot with `snapshot.inventory.items.includes('terminal')` (req 2). Classic floors and labs always carry the terminal, so they never hide.

## Stage (`artist`)

- **Bare hero:** `vibecoder.dev_bare` in `src/procgen/archetypes/vibecoder.ts`: the same body standing still with empty hands and both arms hanging relaxed at his sides (no raised holding arm) until an item is given, validated like the other hero variants.
- **Light:** in `stage-frame.ts` / `stage-light.ts`, the dark glow strength drops (about 30% lower), and while the hero model is `vibecoder.dev_bare` it drops again (about half of that). Only the lines that set the glow change in the dirty `stage-light.ts`.
- **Flight:** one helper `flyTo(stage, actor, to, ms)` in `stage-motion.ts`: a quadratic Bezier arc (control point above the midpoint), ease-in-out, sampled through `stepped(t, frames)` at 8 fps; the body mirrors (`scale.x` sign) to face the travel direction, and turns to face the hero on arrival. The `glide` entrance uses it (req 5).
- **Carry:** `ITEM_CARRIED` attaches the item model (from `ModelCatalog`) at the actor's `fx` socket with a pop (`fx.touch-materialize` or the existing pickup pop), then `flyTo` next to the hero, where the actor hovers.
- **Give:** `ITEM_GIVEN` tweens the carried item into the hero's `hand` socket (about 300 ms), pops it (existing pickup burst), removes it, and `flyTo` returns `from` to its slot. The hero model swap comes from the snapshot as today.
- **Shout:** `heroEmote('shout')` plays big lettering with an existing onomatopoeia FX preset (text override, like `fx.fight`), `triggerShake`, and an existing SFX cue.

## Gates

`npm run quality`, `npm run build`, `generate-chapter.mjs --verify`, `verify-chapter.mjs`, `editor-unit-test.mjs`, `editor-smoke.mjs`, `terminal-lab-unit.mjs` (known failing at main, H1/H3), `property-tests.mjs --only chapters,gameplay,terminal`, `validate-model --all --strict`, `check-tags --all`, `screenshot-lab --selftest`, `quality:fingerprint` (diff: the new `vibecoder.dev_bare` only), `qa` real Chrome pass.
