---
name: model-geometry-validator
description: "[ASSET PCG] Validate procedural 3D models (`ModelSpec` in `src/procgen`) against the art bible, numerically and without a GPU: floating parts, hairline gaps, buried parts, z-fighting coplanar faces, grounding, size and depth, part and triangle budgets, front-view read at game scale, 60/30/10 colour, palette families and per-category contracts (malware eye and jitter, pickup hover, door LED and socket, vibecoder walk tags). Use every time you create or change a model, a greeble, a palette zone or an archetype's random variation, and whenever `npm run procgen:validate` or `procgen:check` fails."
---

# Model geometry validator

Read [haunted-art-direction](../haunted-art-direction/SKILL.md) first: this skill enforces that document.

A model in this game is plain data (`ModelSpec`: named parts, each a shape, a palette zone, a
transform and an optional anim tag). Nothing in the engine knows that a claw is meant to hang from an
arm, that a pickup must glow, or that magenta means "enemy". A part that floats, an inlay level with
its frame, an eye hidden behind the body or a door without a status LED all build and render without
an error. The validator finds them from the spec alone, in about 30 ms per model.

It checks two things the player's camera cares about. The camera is orthographic, sits on −z and
never moves, so a model is a relief: **what counts is the front view at 58 px per world unit**, and
depth is only there to catch light.

## Commands

Run from the project root. No build step, no browser.

```bash
npm run procgen:validate                     # every registered model
node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs malware.worm door.usb
node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --category pickup
node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --seeds 8 --quiet
node .kiro/skills/model-geometry-validator/scripts/self-test.mjs      # proves the checks themselves
```

| Option | Effect |
|---|---|
| `<id>...`, `--all`, `--category <c>` | Which models. Categories: vibecoder, npc, agent, malware, boss, pickup, door, prop, room, fx. |
| `--seed n` | Build with this seed (default 1). |
| `--seeds n` | Build and validate seeds 1..n. Builders take a seed and vary; a model that passes on seed 1 can break on seed 5. Always run this on an archetype that uses the rng. |
| `--strict` | Warnings fail too. |
| `--geometry-only` | Structure and 3D geometry only. Skips the 2D read and every palette / category / socket / anim rule. For work in progress. |
| `--disable A,B` | Drop issue codes or whole groups (`geometry`, `read`, `semantics`). |
| `--quiet` | Only failing models and the issues that fail them. |
| `--json` | Full reports as JSON (`reports[].issues[]`, `reports[].stats`). |

Exit code 0 clean, 1 at least one model failed, 2 usage error. An empty catalog with `--all` exits 0.

From code (`src/procgen/validate/model.ts`, exported from `src/procgen/index.ts`):

```ts
validateModelSpec(spec, { strict?, geometryOnly?, disable?, seed?, rules? }) // any ModelSpec
validateModel('door.usb', { seed: 3 })                                       // a registered model
formatModelReport(report)                                                    // terminal text
MODEL_RULES                                                                  // every threshold
```

A report is `{ id, category, ok, errors, warnings, infos, issues, stats }`; an issue is
`{ code, severity, part?, parts?, message, fix }`. `stats` carries size, triangle count, the share of
visible pixels per zone, glow share, box fill and hull gap: read them even when the model passes.

## Reading the output

```
FAIL malware.worm  21 parts, 532 tris, 1.34 x 1.50 x 0.54  1 error, 1 warning
     zones: toxicGreen 44%, solder 30%, silicon 15%, ...  |  glow 2%, box fill 31%, hull gap 52%
  ERROR   FLOATING_PART  5 parts (port, header0, ...) float free of the body; nearest part is "segment1"
          fix: Move it until it overlaps its support by ~0.01, or add a connecting part ...
```

- **error**: certainly broken. The model fails. Fix it.
- **warning**: probably wrong. The model still passes (`WARN`). Fix it, or say in your report why it is intended.
- **info**: a fact about the model that is usually fine (a plug hanging on a cable, a gap in depth).

Every issue names the part and carries a `fix:` line with numbers. Do that fix, then re-run.

## What is checked, and why

Full table with thresholds and fixes per code: [checks-and-thresholds.md](./references/checks-and-thresholds.md).

| Group | Codes | Why it exists |
|---|---|---|
| Structure | `BAD_ID` `EMPTY_MODEL` `DUPLICATE_PART_NAME` `NON_FINITE` `DEGENERATE_SHAPE` `UNKNOWN_ZONE` `UNKNOWN_TEXTURE` `PART_BUDGET` `TRI_BUDGET` `BUILD_FAILED` `BAKE_FAILED` | Animation and FX address parts by name; a NaN or zero-size shape bakes to nothing; budgets keep 30 actors on screen cheap. |
| Grounding and size | `NOT_GROUNDED` `HOVER_BAND` `SIZE_RANGE` `TOO_DEEP` | Feet are at `y = 0` or the actor floats above the floor line of the panel. Sizes are relative to the 1.6-unit vibecoder. Depth beyond 60% of the larger side is triangles the camera never sees. |
| Contacts | `FLOATING_PART` `HAIRLINE_GAP` `DEPTH_GAP` `TUBE_ONLY_SUPPORT` `BURIED_PART` `COPLANAR_ZFIGHT` | Measured between triangles, not bounding boxes. A gap reads as a broken model; two camera-facing faces in one plane flicker; a part inside another solid is paid for and never drawn. |
| Front read | `HIDDEN_PART` `THIN_FEATURE` `SILHOUETTE_BOX` `SILHOUETTE_BLOB` `TOO_MANY_ZONES` `PALETTE_FLAT` `PALETTE_PATCHWORK` `NO_ACCENT` `TOO_MUCH_GLOW` `LIGHT_NOT_VISIBLE` | Measured on a software render of the front view. The pixel-art pass eats anything under 2 px; enemies must be recognisable as a black shape; 60/30/10 keeps colour readable; light is reserved for things the player may look at. |
| Palette families | `HUMAN_ZONE_MISUSE` `MALWARE_ZONE_MISUSE` | Colour is the first gameplay read: orange is the vibecoder, magenta and violet will hurt you. One prop in the wrong family teaches the player the wrong thing. |
| Category contracts | `MALWARE_NO_CORRUPTION` `MALWARE_NO_EYE` `MALWARE_EYE_COUNT` `MALWARE_EYE_NAME` `MALWARE_NO_JITTER` `PICKUP_NOT_HOVER` `PICKUP_NO_SIGNAL` `PICKUP_NOT_ANIMATED` `DOOR_NO_LED` `VIBECODER_NO_WALK_TAGS` `VIBECODER_NO_LANTERN` `MISSING_SOCKET` `SOCKET_OUT_OF_BOUNDS` | The game finds the LED, the eye and the sockets by name to recolour them and attach speech bubbles, locks and FX. |
| Anim tags | `ANIM_INVALID` `ANIM_RANGE` `ANIM_PIVOT_OUTSIDE` | A pivot given relative to the part instead of in model space swings a leg around the wrong point. |

## Conventions the validator relies on

- **Tags** (`spec.tags`): `hover` (need not touch `y = 0`; required on pickups), `wall` (mounted on the
  back wall, grounding not checked), `detached` (see below).
- **Parts that fly free of the body** (a shield ring, an orbiting shard, a bobbing satellite) are
  allowed only when they say so: the part has an `orbit`, `bob` or `spin` anim **and** either its name
  contains `float`, `orbit` or `satellite`, or the model is tagged `detached`. Anything else that does
  not touch the body is `FLOATING_PART`.
- **Depth gaps are tolerated.** The camera cannot see a gap along z, so distances are measured with z
  scaled by 0.2: a decal 0.01 in front of a surface touches it, a part up to 0.3 in front or behind
  with its outline overlapping the body is `DEPTH_GAP` (info). A gap you can see from the front is
  `HAIRLINE_GAP` up to 0.06 (the two ink shells still merge) and `FLOATING_PART` beyond.
- **Tubes are held, they do not hold.** A part joined to the body only through a `tube` is reported as
  `TUBE_ONLY_SUPPORT` (info): fine for a plug on a cable or a padlock on a chain.
- **Role words in part names**: a door's status light contains `led`; a malware's focal light is in
  zone `malwareEye` and one such part is named with `eye`, `core` or `keyhole`.
- **Zone count**: at most 5 per model (8 for rooms), not counting `ink`, `paper` and light zones
  (emissive ≥ 0.3: the signal zones, `lantern`, `malwareEye`, `glass`).
- **Paper-white models** (the System Hand, a document) may be one flat zone: `PALETTE_FLAT` does not
  apply when the dominant zone is `ink` or `paper`.
- **`fx` models** get the structure and palette-family checks only.

## Workflow

1. Write or change the model. Run `validate-model.mjs <id> --seeds 6`.
2. Fix every error using its `fix:` line. Common ones:
   - `FLOATING_PART` / `HAIRLINE_GAP`: move the part so it overlaps its support by about 0.01. Parts
     are meant to interpenetrate; flush is fragile, overlapping is safe.
   - `COPLANAR_ZFIGHT`: push the part that should be on top 0.01 toward −z, or change its depth so
     the two front faces are not level. Two boxes of the same depth centred on the same z always
     fight.
   - `BURIED_PART` / `HIDDEN_PART`: details belong on the −z face, in front of what carries them.
   - `NOT_GROUNDED`: shift every `pos.y` by the amount in the message, or add the `hover` / `wall` tag
     if that is what the model is.
3. Read the warnings and the `zones:` line. Is the dominant zone the one you meant? Is the eye or LED
   more than a few pixels?
4. Look at it: `node scripts/harness/render-sheet.mjs <id> --views` and open the PNG. The validator
   proves the model is sound, not that it is good. Numbers first, eyes second.
5. Before finishing: `npm run procgen:validate` must exit 0.

Never silence a check to get a model through. If a rule is wrong for a real case, change the
threshold in `MODEL_RULES` (`src/procgen/validate/model/rules.ts`), mirror it in
[checks-and-thresholds.md](./references/checks-and-thresholds.md), add a case to
`scripts/self-test.mjs` and say why in your report.

## Changing the validator

Code lives in `src/procgen/validate/model.ts` (entry, report formatting) and
`src/procgen/validate/model/`: `rules.ts` (thresholds, types), `tri.ts` (triangle maths),
`geometry-checks.ts` (grounding, size, depth), `contact-checks.ts` + `contact-geometry.ts` (floating,
buried and coplanar parts), `read-checks.ts` + `read-measure.ts` (front view), `semantic-checks.ts` +
`structure-checks.ts` (palette, categories, sockets, anim, part and triangle budgets), `zone-info.ts`
(zone lookups). After any change run
`scripts/self-test.mjs`: it builds small synthetic models with known answers (clean ones must give
zero issues, each defect exactly its code) and fails if a code never fires. Add a case per new check.
