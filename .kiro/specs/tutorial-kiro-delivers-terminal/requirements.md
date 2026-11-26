# Tutorial: Kiro Ghost delivers the terminal: requirements

Status: approved (delegated approval by the user, 2026-11-25: "do your best")

Capability: in the tutorial level (level 1) the vibecoder wakes with empty hands and no terminal, lit even less than today. After his monologue he roars "HELLOOOO??". Kiro Ghost then flies in, facing where he flies, on a curved stepped tween path; the dialog starts; Kiro takes the terminal and floats to the vibecoder with it and pops it into his hand. Only then does the terminal panel appear and accept input. Amends `.kiro/specs/tutorial-rework/` (req 1, 3) and `.kiro/specs/inventory/items/terminal/`.

User's words, 2026-11-25: "tweak how kiro ghost is floating to the player in the tutorial scene, make it look at correct direction, now it flyes by back. Also, make its trajectory to be tweens based and looks cool; Next, lets remove the terminal from a vibdecoder at this moment, give even less light to the vibecoder; Lets make kiro ghost to bring the terminal to the vibecoder. Male it like this: videcoder finished his dialog, then he roars HELLOOOO?? After this kiro appers, dialog starts, kiro takes the terminal, and floates to the vibecoder with it;"

## Requirements

1. WHEN a chapter run starts without `terminal` in `startItems`, THE SYSTEM SHALL start the vibecoder with empty hands (`inventory.held` is `null`) and show him as the bare-hands hero model `vibecoder.dev_bare`.
2. WHILE the vibecoder does not carry `terminal` in a chapter session on the play page, THE SYSTEM SHALL hide the terminal panel and accept no typed input; WHEN `terminal` is given, THE SYSTEM SHALL show the panel and accept input again.
3. WHILE the stage is dark and the hero carries no terminal, THE SYSTEM SHALL light him with a fainter glow than the dark-with-terminal glow of today, which itself SHALL be lower than today.
4. WHEN a script runs an `emote` step with `emote: "shout"`, THE SYSTEM SHALL show its `text` as big comic lettering over the stage with a camera shake and a sound, reusing an existing FX preset.
5. WHEN a `spawn` with `entrance: "glide"` plays, THE SYSTEM SHALL move the actor on an eased, curved tween stepped at 8 fps, and the actor SHALL face its direction of travel (mirrored as needed), then face the hero on arrival.
6. WHEN a script runs a `carry_item` step (`entityId`, `item`), THE SYSTEM SHALL pop the item model into that actor's hands and fly the actor (same tween style as req 5, facing its travel) next to the hero, where it hovers.
7. WHEN a script runs a `give_item` step (`item`, optional `from`), THE SYSTEM SHALL add the item to the inventory, put it in his hand if his hands are empty, pop the item from `from`'s hands into the hero's hand on the stage, and return `from` to its slot.
8. THE SYSTEM SHALL add `carry_item`, `give_item` and the `shout` emote through the four-place rule (types, interpreter, editor schema, pack checks); the engine SHALL name no level.
9. WHEN level 1 plays, THE SYSTEM SHALL run: the vibecoder monologue and the big four lines, the vibecoder's `HELLOOOO??` shout and line, Kiro's glide entrance and intro lines, `carry_item` of the terminal, `give_item` of the terminal, then `ls` guidance and tutorial step 1 (`ls`) without locking `ls` on level 1.
10. THE SYSTEM SHALL start levels 2+ with the terminal (`manifest.grants` `afterLevel: 1`), grant the lantern after level 3 (`afterLevel: 3`, picked up in level 3 to unlock `ls`/`find`/`kiro`), and grant the laptop after level 6 (`afterLevel: 6`, picked up in level 6 to unlock `edit`/`sed`).
11. THE SYSTEM SHALL keep level 1 solvable headlessly with 0 deaths in 6 commands (`ls`, `mv starter_ram_8gb.dimm ~`, `cat kiro_story.txt`, `ps`, `kill -9 1011`, `cd hub_uplink`).

## Out of scope

- Any change to hub/boss structure beyond the progressive `afterLevel: 1/3/6` item grants and timed narrative bridging beats.
- Dropping or losing the terminal after it is given.
- Classic floors and Terminal Lab behaviour (they keep their start items).

## Decisions

All answers below: **A (user, delegated: 'do your best', 2026-11-25).** The user wrote: "too much questions, i gave you enough answers. do your best, merge all to main and continue from main", and delegated every decision of this feature, including the approval of requirements, design and tasks. This is recorded as the user's explicit delegated approval of all three gates.

- **Q:** Terminal panel before the handover? **A:** Hidden until the handover; it appears when `terminal` is given.
- **Q:** What is in his hands at the start? **A:** Nothing: a bare-hands hero model (artist), then his terminal model after the handover.
- **Q:** How does "HELLOOOO??" look? **A:** Big comic lettering over the stage with a camera shake and a sound plus the hero's dialog line, reusing existing FX and lettering.
- **Q:** How is the terminal handed over? **A:** Kiro carries it to the hero and it pops into his hand.
- **Q:** Input during the cutscene? **A:** Disabled while he has no terminal (terminal-designer).
- **Q:** New vocabulary? **A:** Only generic steps no existing kind covers (`carry_item`, `give_item`, emote `shout`), through the four-place rule.
- **Q:** Kiro's flight? **A:** Facing his direction of travel (mirror the model), on a stepped 8 fps eased curved tween, carrying the terminal.
- **Q:** Light? **A:** Even less light on the hero in the dark start (lower glow while he has no terminal).
- **Q:** Spec? **A:** A new spec `tutorial-kiro-delivers-terminal` that amends `tutorial-rework` and `inventory/items/terminal`.
- **Q:** Does the session refuse commands without a terminal? **A (lead-dev under the delegation):** No. The gate is on the play page's terminal UI only, so headless solves, the Terminal Lab and the classic floors keep working; the player cannot type before the handover because there is no terminal panel.

## Open questions

## Verification

- Req 1, 7, 10, 11: `node scripts/harness/generate-chapter.mjs --verify`, `verify-chapter.mjs`, `property-tests.mjs --only chapters,gameplay`.
- Req 2: `qa` in real Chrome (panel hidden, then shown after the handover), `npm run quality`.
- Req 3-6: artist validators (`validate-model --all --strict`, `check-tags --all`, `screenshot-lab --selftest`), `quality:fingerprint` diff explained, `qa` Chrome pass.
- Req 8: `editor-unit-test.mjs`, `editor-smoke.mjs`, `terminal-lab-unit.mjs`, `quality:declarative`.
- Req 9: a headless run of level 1 checks the event order; `qa` watches it in Chrome.
