# Asset lab: URL parameters and automation

Page: `asset-lab.html` at the project root, served by `npm run dev` at
`http://localhost:5173/asset-lab.html`. Code: `src/lab/` (entry `asset-lab.ts`, parameters in
`options.ts`). Every control writes its state back into the URL, so the address bar is always a
link to what is on screen. Only values that differ from the default are written. Unknown
parameters are ignored with a `console.warn`.

Booleans accept `1/0`, `true/false`, `on/off`, `yes/no`.

| Param | Default | Values | What it does |
|---|---|---|---|
| `inspect` | (none) | a model, texture or FX id | One subject, large. Without it: the gallery. Left/right arrows step through the current list, Esc returns. |
| `tab` | `models` | `models` `textures` `fx` | Gallery tab. Inspecting a texture or FX id switches tab by itself. |
| `category` | `all` | `hero` `malware` `boss` `pickup` `door` `prop` `room` `fx` | Gallery filter for models. |
| `seed` | `1` | integer ≥ 0 | Rebuilds models, textures and FX emissions with this seed. |
| `post` | (none) | bool | Shorthand: sets both `pixel` and `crt`. `pixel=` / `crt=` after it still win. |
| `pixel` | `1` | bool | Pixel-art pass on/off. |
| `crt` | `1` | bool | CRT pass on/off. |
| `palette` | `0` | `0`-`5` or `FULL` `GAMEBOY` `AMBER` `NEON` `COMIX` `MANSION` | Pixel-art palette mode. 0 (FULL) is the game default: true colours through the quantizer. 4 is COMIX. |
| `ink` | `1` | bool | Ink shells. Off rebuilds with `inkWeight: 0`. |
| `tex` | `1` | bool | Albedo textures named by parts. |
| `anim` | `1` | bool | Off: the authored pose (with `state=normal`) or a frame 0.5 s into the selected state. |
| `t` | (running) | seconds | Freezes the clock at this time. Repeatable screenshots. For one-shot states (`attack` 0.6 s, `hit` 0.3 s, `death` 0.7 s, `revealed` 0.5 s) use a `t` inside that duration, or you see the state it returns to. |
| `state` | `normal` | `normal` `walk` `attack` `hit` `death` `hidden` `revealed` `petrified` `frozen` `enraged` | Animator state (`src/procgen/anim/states.ts`). With a running clock, one-shots replay every 1.8 s. |
| `flash` | `0` | bool | Holds the lightning uniform at 0.6 (mid-decay) so shapes under flash can be judged. The **Lightning flash** button fires a real strike (5.5, bolts, decay). |
| `lantern` | `0` | bool | Lantern-dark: the frame is multiplied down outside a cone (radius 140 / 58 units) around the lantern; light-source meshes (zone emissive ≥ 0.3) are drawn over the dark. The cone follows the pointer; its default sits 0.9 units screen-left of the subject. Stricter than the game, see camera-and-panel.md. |
| `bg` | `floor1` | `floor1`-`floor5` or `1`-`5`, `paper` | Backdrop colour: `FLOOR_THEMES[n].bg` (`src/procgen/core/palette.ts`) or paper. |
| `scale` | `fit` | `fit`, `game`, or a number (8-600) | Pixels per world unit. `game` = 58, the art bible's design scale. In the gallery it sets the shared scale of every panel (default 72). |
| `silhouette` | `0` | bool | Every material replaced by flat ink on paper. The readability test. |
| `sockets` | `0` | bool | Labelled markers at `spec.sockets`. |
| `plinth` | `1` | bool | The game's floor strip under actors (inspect only). |
| `guides` | `1` | bool | Ground line `y = 0`, dashed hero-height line at 1.6, the lantern cone outline. Overlays, not art. |
| `yaw` | `0` | −40..40 degrees | Debug only: turns the camera to check depth. A red stamp says it is not the game's view. Never judge art with it. |
| `ui` | `1` | bool | `0` hides the bar, control column, caption and tags: art and ink frame only. Error captions stay. |
| `dpr` | device, max 1.75 | number | Renderer pixel ratio. `dpr=1` is the coarsest (worst) quantizer grid. |
| `fixtures` | `0` | `1` | Registers the lab's own test model, prop and texture (`src/lab/fixtures.ts`). Not game art. |

Examples:

```
/asset-lab.html?category=malware&scale=game
/asset-lab.html?inspect=malware.trojan&scale=game&bg=floor2
/asset-lab.html?inspect=malware.trojan&silhouette=1&scale=game&ui=0
/asset-lab.html?inspect=boss.forkbomb&lantern=1&t=0.5
/asset-lab.html?inspect=malware.trojan&state=petrified&t=1
/asset-lab.html?inspect=hero.dev&post=0&palette=0
/asset-lab.html?tab=textures&pixel=0&crt=0
/asset-lab.html?tab=fx&t=0.3
/asset-lab.html?inspect=fx.sigkill&t=0.2
```

## `window.__assetLab`

| Member | Returns |
|---|---|
| `ready` | Promise: resolves once the first complete frame is on screen (all visible panels painted). |
| `list()` | `{ models, textures, fx, errors }` registered at load time, plus module load errors. |
| `inspect(id, opts?)` | Sets options, opens `id`, resolves with `stats()` after the next complete frame. `inspect(null)` returns to the gallery. |
| `setOption(key, value)` | Any key from the table (plus `post`), resolves with `stats()` after the next complete frame. Throws on an unknown key. |
| `stats()` | Mode, options, clock, animator source, load errors, camera frame check (`direction`, `screenRightX`, `game`: the `assertFrame` test), canvas size, draw calls and triangles, framing (px per unit), subject info (parts, triangles, size, minY, depth ratio, zones with front-view share, anim tags, sockets), gallery cells (painted, error, to scale). |
| `options()` | A copy of the current options. |

## Headless screenshots

`node scripts/harness/screenshot-lab.mjs --query "<params>" --name <stem> [--width 1280 --height 800 --dpr 1]`
starts Vite, opens the page in the installed Chrome (headless, real WebGL), waits for `ready`,
writes `scripts/harness/out/lab-<stem>.png`, prints the stats, and exits 1 on a page error or a
blank WebGL frame. `--eval "<js>"` runs in the page before the shot (it may `await`), for example
`--eval "await __assetLab.setOption('state','attack')"`. `--url http://localhost:5173` reuses a
running dev server. `--selftest` shoots the lab fixture and proves Chrome plus WebGL work here.
