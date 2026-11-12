# FX checks and thresholds

Implemented in `validateFxPreset` and `validateFxCatalog` (`src/procgen/fx/validate.ts`).
Numbers come from `FX_LIMITS` in the same file. Game scale is 58 px per world unit.
Every check below has a failing case in `scripts/self-test.mjs`.

## Structure

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_ID` | error | `id` matches `fx.kebab-name` | Catalog keys and filmstrip captions | Rename |
| `FX_LAYERS` | error | 2 to 6 layers, unique names | One layer is a texture, not a hit; more than 6 is noise | Merge or split layers |
| `FX_ROLES` | error | At least one `primary` and one `accent` | Without a mass there is nothing to read; without an accent nothing sparkles | Assign roles |
| `FX_EMIT` | error | `cone` has `angle` and `speed`; `ring` has `spawn.radius`; `implode` has `spawn.radius[0] > 0`; `line` has `spawn.width` or `height`; `rain` has `spawn.width` and `speed` or `gravity`; `count` is a positive integer; `lifeMs` is `[min, max]`, `0 < min <= max` | These combinations otherwise produce a pile of particles on one point | Add the missing field |
| `FX_KEYS` | error | `scale` and `alpha` keys: 1 to 5 keys, first at `t = 0`, strictly increasing `t` in `[0, 1)`, scale 0..4, alpha 0..1 | More than 5 steps reads as a tween; a track not starting at 0 hides the particle at birth | Use the shared tracks in `presets.ts` |

## Composition

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_ROLE_BALANCE` | error | Share of emitted area: primary 40..85%, secondary 8..45% (when present), accent 2..25%. Area = count x camera-facing silhouette x (peak scale x mean size)² | The 60/30/10 rule of the art bible, with tolerance | Resize chunks before changing counts |
| `FX_NO_BIG_SHAPE` | warning | At least one chunk is 14 px or more across at its peak | Specks alone look like a generic particle system | Add a starburst, ring, bolt or blot |
| `FX_BUDGET` | error | At most 120 particles and 2500 triangles (ink shells not counted) | "A few big shapes"; and the emitter is a mesh pool, one draw call per chunk plus its shell | Halve counts, double sizes; avoid `sphere` and high-`sides` shapes |
| `FX_POP` | warning | A layer's first scale key is at least 55% of its peak | Effects pop on, they do not grow in | Start at or above 1, step down |
| `FX_NO_POP` | error | Something is visible at `t = 0` | The hit lands the frame the event fires, or it feels laggy | Give the main layer no delay |

## Colour

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_ZONE` | error | Every layer zone and the word zone exist in `ZONES` | One palette, no hex | Use a `ZoneId` |
| `FX_FAMILY` | error | `system`: neutral, signal, hardware, glass. `malware`: neutral, hardware, malware, and at least one malware zone. `hero`: neutral, human, signal | Colour tells the player who did it | Change the zone or the `family` |
| `FX_COLOR_SEPARATION` | error / warning | CIE76 ΔE between the primary and each secondary zone is at least 15 (error). Accent vs primary under 15 is a warning | Close colours merge in motion at this resolution | Change lightness, not just hue |
| `FX_BG_CONTRAST` | warning | Primary zone is at least ΔE 25 from every `FLOOR_THEMES` backdrop. `ink` is exempt (paper keyline) | Ink outlines vanish on dark rooms; the fill must carry the shape | Use a lighter or emissive zone |

Known close pairs: `ice`/`dataCyan` 14.9, `powerAmber`/`gold` 10.5, `paper`/`plastic` 11.4,
`lantern`/`powerAmber` 0 (same hex, different family).

## Readability and space

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_SIZE` | error | The smallest chunk is at least 3 px at its peak (largest face dimension x peak scale x min size x 58) | The pixel-art pass removes anything smaller | Enlarge or delete the layer |
| `FX_EXTENT` | error / warning | Simulated bounds (every step, seeds 1 and 2) fit 3.4 x 2.8 units, or 7 x 5.6 with `fullPanel`. Error when nothing is ever visible. Under 0.3 units is a warning | A hit belongs to its target; only a few effects may own the panel | Lower `speed`, raise `drag`, or set `fullPanel` on purpose |
| `FX_IN_PLANE` | error / warning | `zSpread` at most 0.25 (error). Chunk depth at most 60% of its face (warning) | The camera is orthographic and frontal: depth is invisible and only causes clipping into actors. Motion is in-plane by construction; the schema has no z velocity | Flatten the chunk, remove the spread |

## Time

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_DURATION` | error | One-shot: 150..1500 ms. `loop`: 400..6000 ms | Shorter is invisible; longer blocks the next command's feedback | Trim lifetimes |
| `FX_STEPPED` | error | `stepFps` 6..15 (default 12) | Animate on twos; smooth motion breaks the drawn look | Use 12; 8 for heavy, 15 for snappy |
| `FX_LINGER` | error | `delayMs[1] + lifeMs[1] <= durationMs` for every layer, and the simulator is empty at the first step at or after `durationMs` | The emitter is disposed at the end; anything alive would be cut mid-pose | Shorten life or raise `durationMs` |

## Onomatopoeia

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_WORD_REQUIRED` | error | If `FX_MOMENT_WORDS[moment]` names a word, the preset has it verbatim | The design doc fixes these: HOP!, PANEL SMASH x3!, PERMISSION DENIED!, CLANK!, REVEAL!, SIGKILL!, SIGTERM IGNORED!, KRAKOOM! | Use the doc's word |
| `FX_WORD_TEXT` | error | 1..18 characters, upper-case (a lower-case `x` before a digit is allowed), all in the lettering font | Comics shout; anything longer is dialogue | Shorten; move sentences to a speech bubble |
| `FX_WORD_HOLD` | error | `holdMs` 300..1400 | Under 300 ms cannot be read; over 1400 covers the next action | Usually match `durationMs`, at least 400 |
| `FX_WORD_SIZE` | error / warning | Cap height at least 10 px (error); laid-out width at most 3.6 units (warning) | Each font pixel must be 2 px or more to survive the pixel-art pass | Raise `size` or shorten the text |

## Impact and catalog

| Code | Level | Rule | Why | Fix |
|---|---|---|---|---|
| `FX_IMPACT` | error | `shake` 0..2, `flash` 0..6 | `triggerShake` multipliers in the game run 0.8 to 1.6; lightning is flash 5.5 | Stay at or below lightning |
| `FX_MOMENT_MISSING` | error | Every `FxMoment` has a preset (`--all` only) | A game moment with no feedback | Add the preset |
| `FX_MOMENT_DUPLICATE` | error | No moment has two presets (`--all` only) | `FxCatalog.forMoment` must be unambiguous | Remove or re-key one |

## What is not checked

- How the effect looks under the pixel-art and CRT passes, on a real room, with camera shake.
- Whether the word overlaps the big shape or leaves the panel: look at the filmstrip.
- Overdraw and draw-call cost on a real GPU (the budget bounds it).
- Ink shell thickness changes with a chunk's scale keys (the shell is a child mesh); keep scale
  between about 0.5 and 1.4 so the line stays near 0.028 units.
