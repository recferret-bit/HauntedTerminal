---
name: comix-sequence-generator
description: "[LEVEL GEN] Step 2 of animated 3D Comix generation. Author or refine `pages/page-XX-<slug>/page.spec.json` inside `comix/<slug>/`: orthographic camera shots, landscape/portrait panel grids, comic lettering (`caption`, `banner`, `sfx`, `sfx_seq`, `bubble`, `label_tag`, `prompt_list`, `glitch_text`, `tier_stack`, `panel_flash`, `invert`, `stats_card`), discrete beats (`lightning`, `fx`, `arc`, `look`, `state`, `audio`, `key_clicks`), and deterministic continuous tracks (`actor_visibility`, `actor_motion`, `actor_rig`, `part_visibility`, `material_tint`, `fixture`, `stage_light`, `camera_shake`, `pixelate`). Use whenever writing or editing Comix page specs, timings, camera pans, or visual choreography."
---

# Comix Sequence Generator (`comix-sequence-generator`)

**Category: LEVEL GEN** (animated 3D Comix choreography; see `.kiro/steering/declarative-comix.md`).

Every animated Comix page lives in `comix/<slug>/pages/page-XX-<name>/page.spec.json` and is played by the pure generic runtime in `src/cinematic/` (`compileTimeline` -> `poseComix` + `stepBeats` + `drawLetterNodes`). **Never add scene-specific code to `src/cinematic/`.**

---

## 1. Time Expressions & Cue Discipline

Every `TimeExpr` string in `page.spec.json` resolves via `resolveTime(expr, mergedCues, baseTime)`:
- **Absolute seconds:** `"0"`, `"7.5"`, `"31.9"`.
- **Relative to owner (`+offset` / `-offset`):** `"+0.2"` inside a panel starting at `7.5s` resolves to `7.7s`; inside a page starting at `16.5s` resolves to `16.7s`.
- **Named cue +/- offset:** `"STRIKE"`, `"STRIKE+0.35"`, `"WHITE-0.1"`.
- **Cue scoping:** `comix.manifest.json -> cues` holds cross-page milestones (`STRIKE`, `BURST`, `CARD`, `END`), while `page.spec.json -> cues` holds page-local landmarks. Never redefine a manifest cue to a different timestamp on a page (`checkComixPack` flags conflicts).

---

## 2. Self-Contained Panel Structure (`ComixPanelSpec`)

Each item in `page.panels[]` bundles **all** visual and audio behaviour for that panel:

1. **Identity & Window:**
   - `id`: unique across the entire comix (`desk_typing`, `tower_strike`, `final_splash`).
   - `from`, `until`: panel cut-in and cut-out `TimeExpr` (`until > from`, monotonic across panels).
   - `snapshotAt` *(optional)*: freezes the panel's rendered 3D + lettering canvas into a static halftone snapshot early while keeping the panel active until the next cut.
2. **Page Rects (`layout.landscape` & `layout.portrait`):**
   - `[x, y, w, h]` fractions in `0..1` (`x + w <= 1`, `y + h <= 1`, `w > 0`, `h > 0`).
   - Always author **both** `landscape` (widescreen multi-column comic grids) and `portrait` (mobile vertical stacks).
3. **Orthographic World Camera (`camera`):**
   - `from`: `{ x, y, w, h }` world box centred on `(x, y)`.
   - Optional pan/zoom: `to: { x, y, w, h }`, `span: [startExpr, endExpr]`, `ease: "linear" | "in" | "out" | "outBack"`.
   - Optional `portrait`: `{ x, y, w, h }` override when the panel renders taller than wide (`h > w`).
4. **Panel Lettering (`letters[]`):**
   - `caption` (narrative yellow/paper typewriter box), `banner` (bold top/bottom meme bar), `sfx` / `sfx_seq` (tilted Ben-Day impact words anchored by panel fraction or 3D `PointRef`), `bubble` (`speech`, `shout`, `thought` with live `tailActor` or `tailPoint`), `label_tag`, `prompt_list`, `glitch_text`, `tier_stack`, `panel_flash`, `invert`, `stats_card`.
   - Set `"activePanelOnly": true` on `sfx`, `bubble`, `label_tag`, or `panel_flash` when the element must hide or freeze cleanly on panel cut.
5. **Discrete Beats (`beats[]`):**
   - Fired once as `t` crosses `at` (and replayed deterministically during `?t=<sec>` freeze-frame fast-forward): `lightning`, `fx`, `fx_repeat`, `arc`, `look`, `state`, `audio`, `key_clicks`.
   - `preset` on `fx` / `fx_repeat` must exist in `FxCatalog` (`fx.hop`, `fx.malware-hit`, `fx.malware-death`, ...).
6. **Continuous Tracks (`tracks[]` on Page or Panel):**
   - Pure functions of `t` evaluated every frame by `poseComix(world, t)` after resetting actors, mesh parts, palette zones, fixtures, and stage lights to their manifest baselines:
   - `actor_visibility`, `actor_motion` (`arc`, `steps`, `stretchFrom`/`stretchTo`, `deform: "stretch_to_target" | "squash_land"`, `hideWhenDead`), `actor_rig` (`typing`, `restRightArm`, `hideParts`), `part_visibility`, `material_tint` (`zone`, `color`, optional `glitchColors` + `glitchHz`), `fixture` (`rain`, `bolt` flicker, `vortex` grow), `stage_light`, `camera_shake`, `pixelate`.
   - **Baseline rule:** Because `poseComix` resets actor parts to visible each frame before applying active tracks, any rig override (such as `hideParts: ["lantern"]` on `vibecoder.dev` in an office scene) must span the entire window where that actor is on camera. Put cross-panel tracks in `page.tracks[]`!

---

## 3. Verification Commands

```bash
node .kiro/skills/comix-sequence-generator/scripts/self-test.mjs
node scripts/harness/generate-comix.mjs --verify
```
