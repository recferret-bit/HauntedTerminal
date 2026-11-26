# Tensor GPU hub ritual: requirements

Status: draft

Capability: a new inventory item, the Tensor GPU, is found in Level 2. When the vibecoder brings it to a Hub, Kiro flies from the vibecoder to the Old Bearded Coder (dad.tty). Kiro says, in effect, "look whom I found, a vibecoder from the prophecy, and he found a Tensor GPU". The old coder answers that open-weight models can now be loaded into Kiro. Magic plays, Kiro gains a hacking ability, more dialogs explain it, and the old coder gives the vibecoder the map and the manual. The dialogs must explain all of it.

User's words, 2026-11-27: "lets add tensor gpu item on the level 2, when user brings it to the hub > i need a new dialog and action. Like kiro must fly from vibecoder to the old guy, when close to him > a new dialog, like look whom i found, its a vibecoder from a prophesy, he found tensor gpu! old guys saying: great, we now can load open weight model into you. Then some magic happens, kiro is capable to do some hacking, more dialogs. Old guy gives the vibecoder a map and manual. Dialogs must explain that."

Everything below is *proposed, not decided*. It is drawn from the user's words and from what the code already does. Every choice the code or the author made without the user is listed under `## Open questions

- [ ] The gate must still hold after the GPU is consumed, so `has_item tensor_gpu` cannot be the `until` condition of the `kiro crack` / `hack` lock. What persistent condition should it be: a new condition (for example `ran_command`/flag set by the ritual), `core_loaded` (which only holds from `kiro load qwen`), or the item staying in the inventory? Which levels does the lock cover (2 and 3 only, or every level before the ritual)?
- [ ] `hack` is already an alias of `kiro crack`. Does "add `kiro hack`" mean keep the alias and only gate it, or make `hack` its own subcommand with a different effect?
- [ ] Is the Tensor GPU still shown in the items strip after it is consumed (dim), or removed? This decides whether `item.tensor_gpu` needs only a pickup/strip model and no `vibecoder.dev_tensor_gpu` hero model.
- [ ] Does level 3's `gpu_shader_core_01.img` stay as it is?
- [ ] An achievement for it, and a sound for the flight and the magic?

## Verification

(Proposed.) `node scripts/quality/check-specs.mjs`; `generate-chapter.mjs --verify` (0 deaths); `editor-unit-test.mjs`, `editor-smoke.mjs`, `terminal-lab-unit.mjs` (new step and item); `model-geometry-validator` `--all --strict` and `quality:fingerprint` (new model); `npm run quality`.
