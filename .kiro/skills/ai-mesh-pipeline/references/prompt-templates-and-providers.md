# Prompt templates and provider notes

Prompts for generating concept images (and, from them, meshes) in the Haunted Terminal look. Every
prompt is three blocks glued together: **STYLE** + **SUBJECT** + **OUTPUT**. Keep STYLE and OUTPUT
verbatim; only the subject changes. Subjects below follow
[world-lexicon.md](../../haunted-art-direction/references/world-lexicon.md); if the lexicon changes,
it wins.

The hexes are `ZONES` in `src/procgen/core/palette.ts`. If you change a colour there, change it here.

## The palette, for prompts

| Family | Zones and hexes | Use in a prompt for |
|---|---|---|
| neutral | ink `#110e1b`, paper `#f4f1ea` | Outlines; the System Hand |
| human | skin `#ffe0c2`, hoodie `#f77f00`, denim `#3a506b`, hair `#4a2c2a`, lantern `#ffd166` | The vibecoder only |
| hardware | pcb `#1f7a5c`, pcbDark `#12473b`, solder `#adb5bd`, heatsink `#7d8597`, gold `#e9b44c`, copper `#c8763a`, silicon `#2b2540`, plastic `#d9d2c5`, rubber `#3a3550` | Doors, props, pickups, rooms, malware bodies |
| signal | phosphor `#39ff88`, dataCyan `#4cc9f0`, powerAmber `#ffd166`, lockRed `#ef233c` | LEDs, pickups, port status lights |
| malware | corruptMagenta `#ef476f`, corruptViolet `#9b5de5`, toxicGreen `#8ac926`, voidPurple `#3c096c`, malwareEye `#fff07c` | Enemies only |
| glass | glass `#c8fff4`, ice `#9bdcff` | Screens, mirrors, frozen state |

Give a prompt **at most five colours plus ink**, and say which is dominant (about 60%), secondary
(30%) and accent (10%).

## STYLE block (always)

```text
1990s Sega Genesis comic-book game art in the style of Comix Zone. Heavy uniform black ink outline
(#110e1b) around every shape, flat cel colour with exactly three tones per colour (lit, mid, shadow)
and hard edges between them, Ben-Day halftone dots only inside shadow areas, no gradients, no soft
shading, no airbrush, no photorealism, no 3D render look, no texture noise. Chunky readable shapes,
nothing thinner than the outline. Limited palette: use ONLY these colours: {HEX LIST}.
```

## OUTPUT blocks (pick one)

Sprite or concept for image-to-3D (the usual one):

```text
Single subject, straight-on front orthographic view, no perspective, no tilt, whole subject in frame
with a small margin, standing on an invisible floor, centred. Flat even lighting from the upper left,
no cast shadow, no ground, no background elements, transparent background (or flat #f4f1ea if
transparency is not available). No text, no logo, no watermark, no border.
```

Flat albedo sheet (for path A, a PNG laid onto a procedural mesh; alpha is ignored there):

```text
A flat, edge-to-edge square colour sheet with no transparency and no background: the subject's surface
unwrapped as a front-facing panel that fills the whole image. Same ink lines and flat cel colours.
No perspective, no lighting, no shadow, no margin, no text.
```

Room backdrop:

```text
Wide straight-on orthographic view of a shallow stage set, 8:5, no perspective, no characters.
Everything dark and low-contrast. The lower half is almost flat and empty; detail only in the upper
third and at the far left edge. No bright colours except at most three tiny lights.
```

## SUBJECT blocks

Replace `{...}`; keep the colour roles.

### Vibecoder and the hand

```text
vibecoder: A tired software developer, about three heads tall, round soft shapes. Orange hoodie (#f77f00)
with the hood up as the dominant colour, blue-grey jeans (#3a506b), pale sneakers (#f4f1ea), a strip
of messy dark hair (#4a2c2a) under the hood, warm skin (#ffe0c2). He holds a small glowing lantern
(#ffd166) out to one side at arm's length. Arms and legs clearly separated from the body.

system hand: A giant paper-white artist's hand (#f4f1ea) with black ink outlines reaching down from
above, palm toward the viewer, fingers pointing down, holding a stylus. No sleeve, no arm.
```

### Malware (enemies)

Common rules for every enemy prompt: a body made of computer hardware in dark violet-grey silicon
(`#2b2540`) or dark PCB green (`#12473b`), taken over by corruption in hot magenta (`#ef476f`) and
violet (`#9b5de5`); **exactly one** glowing pale-yellow eye or core (`#fff07c`); sharp, asymmetric,
spiky shapes; nothing round or cute; no warm orange anywhere.

```text
virus: A spiky virus capsid made of faceted chip silicon with injector spikes all round, a smaller copy
of itself budding off one side, one glowing eye in the centre.

worm: A network worm rising out of a port in an S-curve: a chain of square data-packet segments,
a drill-bit head, one glowing eye.

trojan (gameKey gargoyle): A gift-wrapped software install box split open, a horned gargoyle head and
two claws pushing out of it, made of dark hardware, one glowing eye.

bug: A beetle that is literally a microchip: rectangular DIP-package body, metal pin legs
(#adb5bd), two antenna traces, one cracked glowing eye.

exploit: A syringe-nosed dart with a swollen payload sac that bulges out past its own frame, one glowing core.

crack: A skeleton key standing upright: its teeth are a mouth, its bow is a skull, a row of chiptune
equaliser bars down its spine, one glowing eye socket.

ransomware: A heavy padlock with a jaw: the shackle forms two horns, the keyhole is its single
glowing eye, chains hang from it.

spyware: A hovering webcam-eye drone: a big lens iris as its one glowing eye, two antenna ears,
a dangling data-cable tail.

rootkit (gameKey poltergeist): A ghost: a ragged translucent violet shroud (#9b5de5) over the faint
outline of a chip, two hollow eyes, a small padlock on a chain.

zombie process (gameKey zombie_worker): A small hunched robot with one arm missing, toxic green
(#8ac926) leaking from its joints, a tag reading PID on its chest, a cut cable hanging where it was
attached to its parent.

fork bomb boss (gameKey necromancer_boss): A tall thin daemon with many arms, every arm ending in a
two-pronged fork, a furnace glowing in its chest as its single core.

kernel boss: A cracked square CPU die hanging in the air, one huge eye in the crack, heat-pipe
tentacles hanging below it, a broken ring of shield segments around it.
```

### Doors: ports and interfaces

Common rules: a metal (`#adb5bd`, `#7d8597`) or off-white plastic (`#d9d2c5`) shell, visible gold
contacts (`#e9b44c`), dark interior (`#2b2540`), exactly one status LED: red `#ef233c` locked, amber
`#ffd166` busy, or green `#39ff88` open. Upright, taller than wide, a doorway a person could walk through.

```text
usb: A giant USB-A receptacle stood on end as a doorway: silver metal shell, an off-white plastic
tongue, four gold contacts.

ethernet: An RJ45 network jack as a gothic archway: eight gold pins hanging like a portcullis, two
small link LEDs at the top corners.

hdmi: A wide trapezoid HDMI port mouth as a low, wide doorway, a row of gold contacts inside.

serial: An old DB9 serial port shell: nine pin holes in two rows, a thumbscrew on each side, worn metal.

firewall gate (gameKey locked_gate): A wrought-iron grille of vertical bars made of heatsink metal with
a heavy padlock whose face shows the letters rwx, one red LED.

loopback mirror (gameKey mirror_door): A tall framed mirror of pale glass (#c8fff4) with one crack and
a looping arrow of PCB trace engraved round the frame.

/dev/null (gameKey black_hole): A round drain ring of dark metal set upright, empty and black inside.

talking socket (gameKey socket_guardian): A wall socket on a short conduit neck with a speaker grille
for a mouth and two small LED eyes. Friendly-neutral, not a monster: no magenta, no violet.
```

### Pickups

Common rules: small, simple, bright, one glowing signal colour, readable at 24 px. Prompt them large
and let the game scale them down.

```text
energy: A battery cell with a lightning-bolt cut-out glowing amber (#ffd166), gold end caps (#e9b44c),
dark casing (#2b2540).

ram: A stick of RAM: green circuit board (#1f7a5c), a row of dark chips (#2b2540), a row of gold
contact teeth along the bottom (#e9b44c), one notch glowing cyan (#4cc9f0).

ssd: A flat 2.5-inch solid-state drive: dark shell (#2b2540), an off-white label (#d9d2c5), a gold
connector edge (#e9b44c), one small green activity light (#39ff88).
```

### Items and props

```text
file (gameKey item_scroll): A sheet of paper (#f4f1ea) with a folded corner and three black ink lines.
tar crate (gameKey crate_bridge): A long strapped crate holding a stack of metal disk platters
(#7d8597), off-white plastic frame (#d9d2c5), rubber straps (#3a3550).
fuse: A glass fuse (#c8fff4) with gold end caps and a thin wire inside.
chip / capacitor / heatsink / fan / CRT: a single hardware part, dark (#2b2540, #3a3550) with one
metal colour (#7d8597), no lights.
```

### Room backdrops

One per floor; combine with the room OUTPUT block. Dominant colour first.

```text
floor 1, storage attic: dark violet (#2b2540, #3a3550) attic under roof rafters, drive bays, dusty
disk platters, ribbon-cable cobwebs, a dead CRT. One amber light (#ffd166).
floor 2, firewall crypt: dark circuit-board green (#12473b) crypt, pointed arches made of port shells,
grilles of metal pins, tombstones that are upright chips. Two green lights (#39ff88).
floor 3, bus maze: dark violet-blue (#2b2540) hall of mirrors, symmetrical circuit traces (#12473b),
frames within frames, RAM sticks as columns. A few cyan pixels (#4cc9f0).
floor 4, CPU furnace: dark (#3a3550, #2b2540) boiler room, copper heat pipes (#c8763a), heatsink fins
(#7d8597) like organ pipes, case fans, one glowing amber die (#ffd166), one red light (#ef233c).
floor 5, kernel core: dark violet (#2b2540) chamber, one huge cracked CPU die on the wall, gold pins
(#e9b44c), cyan lightning (#4cc9f0) in the cracks.
outro, the desk at dawn: a real bedroom-office, blue-grey wall (#3a506b), wooden desk (#4a2c2a), a
window full of warm morning light (#ffd166), a monitor with a green prompt (#39ff88).
```

For rooms the procedural sets and the `tex.backdrop.floorN` textures already exist; generate a
backdrop only as reference, or to replace a texture through
[procedural-texture-synthesis](../../procedural-texture-synthesis/SKILL.md).

## Negative prompt (when the tool has one)

```text
photorealistic, 3d render, gradient, soft shadow, ambient occlusion, glossy, metallic reflection,
bloom, lens flare, depth of field, perspective, three-quarter view, isometric, ground shadow,
background scenery, text, watermark, signature, extra limbs, thin lines, noise, grain, texture detail
```

## Checking a generated image before using it

1. Fill it black: is the silhouette still recognisable? If not, regenerate.
2. Scale it to 96 px tall: can you still tell what it is and where its eye, LED or contacts are?
3. Count colours: more than five plus ink means it will not sit on the page. Regenerate with a
   shorter hex list rather than trying to fix it.
4. For path A, save it and run `node .kiro/skills/ai-mesh-pipeline/scripts/check-manifest.mjs`: it
   reports the share of pixels near a palette colour and the share that is transparent.
5. For path B, a concept with baked shadows or a three-quarter view produces a bad mesh. Do not spend
   a 3D generation on it.

## Provider notes

This repo contains no client code, keys or configuration for any image or image-to-3D provider, and
nothing here depends on a particular one. Model names, endpoints, parameters, prices and licence terms
change often: **check the provider's current docs** before relying on any of them.

What to ask of any provider, whichever you use:

| Need | Why |
|---|---|
| Image: accepts explicit hex colours and a transparent (or flat) background | The palette is the contract |
| Image: output at least 512 px on the short side, PNG | Downscaling is fine; upscaling invents detail |
| Image-to-3D: single-image input, `.glb` export, embedded textures | The sanitizer reads self-contained `.glb` |
| Image-to-3D: PNG textures, no Draco / meshopt compression (or re-export through Blender) | The sanitizer has no codecs |
| A licence that allows use in this project | Check before generating, not after |

Blender is the fallback for every step a provider gets wrong (facing, pivot, triangle count, texture
format); the recipe is in [glb-to-comic.md](./glb-to-comic.md). If a Blender automation tool is
available in your environment you may use it for those steps, but nothing in this repo requires it.
