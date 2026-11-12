---
name: haunted-art-direction
description: "[ASSET PCG] The art bible and shared contract for every visual in Haunted Terminal: the world (a developer pulled inside his own computer), who is who (malware enemies, hardware rooms, port doors, energy / RAM / SSD pickups), the Comix Zone look (ink outlines, cel bands, halftone, paper gutters), the 3D-drawn-as-2D projection rules, the single palette, and the procgen code layout and harness commands. Read this FIRST before creating or changing any procedural asset (model, texture, shader, animation, particle effect, room, lighting) and before using any other skill. Also the visual reference that level-generation skills must obey when choosing actors, rooms and palette."
---

# Haunted Terminal art direction

**Category: ASSET PCG** (see `.kiro/steering/skills-map.md`). This is the root of the procedural content generation skills: models, textures, shaders, animation, particles, rooms, lighting, external meshes. The LEVEL GEN skills (`chapter-*`, `comix-story-drawer`) read it only to pick existing assets; they never change it.

## The premise

Lightning hits a developer's machine at night and pulls him inside it. He is a **human**; everything
else is **the computer**. He walks its insides the way you would walk a haunted mansion, one comic
panel per directory, and the only way to act is to type: shell commands move him, open doors and
attack.

Three references, each with one job:

| Reference | What we take from it |
|---|---|
| **Comix Zone** | The page. Panels with 5 px ink frames and paper gutters, heavy ink outlines, flat cel colour, halftone shadows, yellow caption boxes, onomatopoeia, the artist's hand drawing enemies in. |
| **Haunted mansion** | The mood and the layout. Dark rooms lit by one lantern, hidden things, locked doors, something watching. Gothic shapes (arches, grilles, spires) built out of hardware. |
| **The Matrix / inside a computer** | The material. Every surface is a PCB, a chip, a heatsink, a cable, a port. Light is phosphor green, data cyan, power amber. |

When they pull apart: the **computer** decides what a thing is made of, the **mansion** decides its
shape and mood, the **comic** decides how it is drawn.

## Who is who

The game's VFS names stay as they are (`stone_gargoyle.bin`, `.poltergeist.lock`); the art shows
what that thing *is inside a computer*.

| Game role | What it is in the machine | Reads as |
|---|---|---|
| Vibecoder (`dev`) | The only human. Hoodie, jeans, sneakers, a lantern. | Warm, soft, round. The one orange thing on a cold page. |
| System Hand | The artist / the OS itself, reaching in from outside the panel. | Paper-white hand with a stylus. |
| Enemies | **Malware.** Virus, worm, trojan, software bug, exploit, crack, ransomware, spyware, rootkit, zombie process, fork-bomb daemon, kernel panic. | Corrupted hardware: magenta, violet, toxic green, one glowing eye or core, glitch jitter. |
| Pickups | **Energy** cell (heals), **RAM** stick (+GB memory), **SSD** drive (+GB storage). | Small, bright, emissive, always bobbing or spinning. |
| Doors | **Ports and interfaces.** USB, Ethernet, HDMI, serial, a TCP port gate, a firewall grille, a loopback mirror, `/dev/null`. | Metal shell, gold contacts, one status LED: red locked, amber busy, green open. |
| Talking sockets (`*.sock`) | A literal socket with a speaker grille for a face. | Hardware with two LED eyes. Neutral, not malware. |
| Files and items | Data: a document card, a floppy, a `.tar` crate of platters, a fuse. | Paper and plastic, small. |
| Rooms | Regions of the machine, one per floor (table below). | Wide, dark, low-contrast so actors pop. |

Floors (palette in `FLOOR_THEMES`, `src/procgen/core/palette.ts`):

| Floor | Path | Region of the machine | Mansion feeling |
|---|---|---|---|
| 1 | `/home/dev/nightmare_workspace` | Storage attic: drive bays, dusty platters, ribbon-cable cobwebs, a dead CRT | Attic |
| 2 | `/var/dungeon` | Firewall crypt: port grilles, log tombstones, a gap in the bus | Crypt |
| 3 | `/usr/local/labyrinth` | Bus maze: mirrored traces, loopback ports, RAM-slot corridors | Hall of mirrors |
| 4 | `/proc_mansion/boiler_room` | CPU cooling furnace: heatsink fins, heat pipes, fans, glowing die | Boiler room |
| 5 | `/sys/kernel/panic_chamber` | The kernel core: a cracked CPU die in a storm | The thing in the cellar |

Full bestiary, door and pickup briefs: [world-lexicon.md](./references/world-lexicon.md).

## The look: 3D drawn as 2D

The scene is real 3D (Three.js), shot by an **orthographic camera on −z looking at +z, level with
the page**, then pushed through a pixel-art quantizer and a CRT pass. Nothing ever rotates to show
its back. So every model is a **relief**: a drawing with thickness.

1. **Silhouette first.** A model must be recognisable as a solid black shape at 96 px tall. Design the
   outline on the XY plane, then give it depth. `extrude` (a 2D outline with thickness) is the main tool.
2. **Face the camera.** Models face −z. Everything that explains the model (eyes, pins, LEDs, labels,
   teeth) sits on the −z side. World **+x is screen-left**.
3. **Shallow depth.** Depth (z) is at most ~60% of the wider of width and height. Depth exists to give
   the cel bands and the lightning flash something to catch, not to be looked at.
4. **Ink.** Every solid part carries an ink shell (`#110e1b`, 0.028 world units, constant weight).
   Tiny emissive dots and decals turn it off (`outline: false`).
5. **Three cel bands, no gradients.** Lit, mid (×0.68), shadow (×0.4), from one fixed light
   (upper screen-right, toward the camera: `uLightDir` has x = −0.35 and world +x is screen-left). Shadow bands may carry Ben-Day dots (`halftone`).
6. **Flat colour by role: 60 / 30 / 10.** About 60% of the visible area in one dominant zone, 30% in a
   second, 10% in accents and light. At most 5 zones plus ink per model.
7. **Detail is geometry or ink, never noise.** A chip shows pins, a heatsink shows fins, a port shows
   contacts. Textures are flat, hard-edged, palette-locked comic art, never photo or PBR.
8. **Light means something.** Emissive is reserved for: the lantern, system signal (LEDs, pickups,
   ports) and malware eyes/cores. If it glows, the player may look at it.
9. **Readable small.** Nothing important is thinner than ~2 px at game scale (58 px per world unit).
   The pixel-art pass will eat it.

Sizes: the vibecoder is 1.6 units tall. Feet at `y = 0`. Minions 0.6 to 1.1, standard enemies 1.0 to 1.6,
bosses 1.8 to 2.6, pickups 0.3 to 0.5 (hovering at ~0.5), doors 1.4 to 1.9. Budgets: 6 to 40 parts and
under 3500 triangles per actor; rooms up to 80 parts and 8000 triangles.

Every part touches the body. The exception is a part that is meant to fly free (a shield ring, an
orbiting satellite): give it an `orbit`, `bob` or `spin` tag and either put `float`, `orbit` or
`satellite` in its name or tag the model `detached`. Model tags: `hover`, `wall`, `flat`, `detached`.

## The palette

One palette, defined once in [`src/procgen/core/palette.ts`](../../../src/procgen/core/palette.ts)
(`ZONES`). Models name **zones**, never hex colours. Families carry meaning and are enforced:

| Family | Zones | Who may use it |
|---|---|---|
| `human` | `skin` `hoodie` `denim` `hair` `lantern` | The vibecoder and the System Hand only |
| `hardware` | `pcb` `pcbDark` `solder` `heatsink` `gold` `copper` `silicon` `plastic` `rubber` | The world: rooms, doors, props, pickups, and the bodies of malware |
| `signal` | `phosphor` `dataCyan` `powerAmber` `lockRed` (all emissive) | System light: LEDs, pickups, ports |
| `malware` | `corruptMagenta` `corruptViolet` `toxicGreen` `voidPurple` `malwareEye` `ghostViolet` | Hostile things only, and every hostile thing must use it |
| `glass` | `glass` `ice` | Screens, mirrors, frozen (`SIGSTOP`) state |
| `neutral` | `ink` `paper` | Anyone |

Colour is the first gameplay read: **orange = you, green/grey = the machine, glowing = take or use,
magenta/violet = it will hurt you.** A new zone is a palette change: add it to `ZONES` with a family
and say why in the PR; never inline a hex.

### Post passes keep the hue

The pixel-art pass (`src/shaders/pixel-art.ts`) and CRT (`src/shaders/crt-pass.ts`) both run after `OutputPass`, so they work in display colour; pixel defaults are size 3.5,
16 levels, dither 0.85, edge 0.65, palette mode 0 (full RGB, true hue); the CRT is scanlines every 3 css px,
roll band, grain, flicker and vignette, with no barrel warp. Hue therefore survives. The retro palettes
(`paletteMode` 1 to 5) remain as options; modes 4 and 5 keep only 22% of the hue, so do not judge colour
families under them.
Still check every new visual in the storybook with post on, not only in the software sheet.

### Size and seeding notes from the shipped set

- **Zone count:** at most 5 zones plus ink. `ink`, `paper` and lights (emissive ≥ 0.3) do not count.
  Rooms may use 8.
- **Dark zones:** `silicon`, `pcbDark` and `voidPurple` are close to the backdrop colours. Never make one
  of them the dominant zone of an actor without a pale frame or trim around it.
- **Hover:** models tagged `hover` get a rigid whole-body bob from the animator. Don't add it per part.
- **Seeds:** `makeRng(seed)` gives near-identical first draws for small seeds. Seed with
  `makeRng(hashSeed(id, seed))` so different models don't all make the same choice at seed 1.
- **Pickups are small** (0.3 to 0.5 units, about 20 to 30 px in game). Give them one bright emissive
  part and a bold outline, or they turn into a smudge under the pixel-art pass.

## Where the code lives

```
src/procgen/
  core/        palette, types (ModelSpec / PartSpec / ShapeSpec / AnimTag / PixelBuffer), catalogs,
               geometry baking, buildModel() -> THREE.Group, rasterizeModel() software preview
  kit/         greebles: reusable part groups (pins, fins, port shells, LEDs, cables)
  archetypes/  vibecoder, npc, agents, malware, pickups, doors, props, rooms: each registers in ModelCatalog
  textures/    palette-locked comic textures as PixelBuffers: each registers in TextureCatalog
  anim/        AnimTag evaluators and state poses
  fx/          comic particle / onomatopoeia presets
  validate/    model and texture validators
src/shaders/   comic-material (cel + ink rim + halftone), pixel-art pass, crt pass, lightning
src/renderer/  comic-stage (the page, panels, camera), procedural-cast (the game's current actors)
```

A model is **plain data** (`ModelSpec`): a list of named parts, each a shape, a zone, a transform and
an optional `AnimTag`. That is what makes it checkable and drawable without a GPU:

```ts
ModelCatalog.register({
  id: 'pickup.ram', category: 'pickup', label: 'RAM stick',
  lore: 'A stick of memory. Picking it up adds gigabytes.',
  build: (seed) => ({ id: 'pickup.ram', category: 'pickup', label: 'RAM stick', tags: ['hover'], parts: [ /* PartSpec[] */ ] }),
});
```

## The harness

Run from the project root. Every script loads the TypeScript directly (Vite SSR), no build step.

| Command | What it does |
|---|---|
| `npm run procgen:sheet` | Renders every model to `scripts/harness/out/models.png` as the game camera sees it, with an in-game-scale thumbnail in each cell. **Open the PNG and look at it.** `node scripts/harness/render-sheet.mjs <id>... [--views] [--category c] [--bg paper]` for a subset. |
| `npm run procgen:validate` | Model validator: geometry, grounding, palette families, 60/30/10, front readability. |
| `npm run procgen:textures` | Texture validator and texture contact sheet. |
| `npm run procgen:fx` | FX preset validator; `--sheet` writes a filmstrip to `scripts/harness/out/fx.png`. |
| `npm run procgen:anim` | Checks every model's AnimTags and steps every animator state (no NaN, no limb through the floor). |
| `npm run procgen:selftest` | Proves the validators and the animator do what they claim, plus the harness smoke test. |
| `npm run procgen:check` | tsc, self-tests, model / texture / FX validation and the sheet. Must be green before work is called done. |
| `npm run dev` then `/storybook.html` | The real thing: models, textures (`?tab=textures`) and effects (`?tab=fx`) under the game's shaders, pixel-art and CRT passes. URL parameters: [storybook-url-params.md](../comic-panel-viewport-auditor/references/storybook-url-params.md). |
| `node scripts/harness/screenshot-lab.mjs --query "inspect=<id>&scale=game" --name <n>` | Headless-Chrome screenshot of the storybook (real WebGL) to `scripts/harness/out/lab-<n>.png`. Read the PNG. `--page / --query nointro --eval "<js>"` shoots the game itself (drive it with `window.__term.submit(line)`). |
| `/cinematic.html?play=intro\|outro&t=<s>` | Preview the intro / outro cinematics (`src/cinematic`), frozen at a moment with `t`. |
| `node scripts/harness/playthrough.mjs --ticks 3` | Plays the whole campaign through the game logic (`playthrough.script.json`), idle ticks between commands. Must pass with 0 deaths. |
| `node scripts/harness/play-browser.mjs` | The same script typed through the real terminal in headless Chrome; fails on any console, page or stage error. Screenshots per floor to `out/play-*.png`. |
| `node scripts/harness/asset-usage.mjs` | Lists models, textures and FX presets the game never references. Must report all used. |
| `node .kiro/skills/comic-panel-viewport-auditor/scripts/lab-qa.mjs <id>` | The full visual QA checklist for one model: 18 lab screenshots. |
| `node .kiro/skills/ai-mesh-pipeline/scripts/check-manifest.mjs` | Checks `public/assets/manifest.json` and its PNGs. |
| `node .kiro/skills/shader-texture-tuning/scripts/check-examples.mjs` | Checks the shader recipes against the real shaders and the raster parity constants. |

The loop for any visual change: **write the spec, validate, render the sheet, look, fix, then check
it in the storybook.** Numbers first, eyes second, never eyes only and never numbers only.

## Which skill for what

| Task | Skill |
|---|---|
| Hardware props, the vibecoder, doors, pickups, greebles | [procedural-kitbash-3d](../procedural-kitbash-3d/SKILL.md) |
| Enemies | [procedural-malware-3d](../procedural-malware-3d/SKILL.md) |
| Rooms and backdrops | [procedural-rooms-3d](../procedural-rooms-3d/SKILL.md) |
| Textures | [procedural-texture-synthesis](../procedural-texture-synthesis/SKILL.md) |
| Materials and post passes | [shader-texture-tuning](../shader-texture-tuning/SKILL.md) |
| Motion | [procedural-animation-3d](../procedural-animation-3d/SKILL.md), [procedural-malware-animation](../procedural-malware-animation/SKILL.md) |
| Particles, onomatopoeia | [procedural-particles-3d](../procedural-particles-3d/SKILL.md), [particle-effect-validator](../particle-effect-validator/SKILL.md) |
| Lighting, lantern, lightning | [comic-lighting-and-lightning](../comic-lighting-and-lightning/SKILL.md) |
| Checking a model | [model-geometry-validator](../model-geometry-validator/SKILL.md) |
| Camera, panel framing, visual QA | [comic-panel-viewport-auditor](../comic-panel-viewport-auditor/SKILL.md) |
| External PNG / GLB assets | [ai-mesh-pipeline](../ai-mesh-pipeline/SKILL.md) |
