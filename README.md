# Haunted Terminal

A web game drawn like a 90s comic book, where the only controller is a terminal. Lightning pulls a
developer inside his own computer; he walks its insides one comic panel per directory and survives by
typing real unix commands: `cd` to move, `ls -a` to reveal what hides in the dark, `kill -9` to fight
malware, `chmod` to petrify it.

Built for the [Kiroween 2026](https://kiroween.devpost.com/) hackathon with [Kiro](https://kiro.dev).
Started on November 9, 2026.

## Status

Work in progress. What runs today:

- **Player front door** (`/`): play the Kiroween campaign or read the comix. `/hub.html` redirects here.
- **Play** (`/play/<chapter>/<level>`): the comic stage and the terminal. `/play` opens the Kiroween chapter. Mode flags stay on the query string (`?nointro=1`).
- **Developer** (`/dev.html`): level select, direct sector jumps, and the visual QA labs.
- **Chapter editor** (`/editor`, dev server): select a chapter, edit every level, dialog and comic panel with forms, preview the real game on the unsaved draft, run the checks, save back to `chapters/`. Chapters are data; no per-chapter code (`.kiro/steering/declarative-chapters.md`).
- **Comix editor** (`/comix-editor`, dev server): select any animated 3D comix in `comix/`, inspect connected page/panel layouts, edit every stage, cast, camera, letter, beat and track with forms, scrub and freeze the live 3D preview on the draft, run the 60fps timeline verifier, and save back to `comix/`. Comixes are data; no hardcoded scenes (`.kiro/steering/declarative-comix.md`).
- **Chapter select** (`/chapters.html`), **comic reader** (`/comic.html`), **cinematics** (`/cinematic.html`).
- **Storybook** (`/storybook.html`): every procedural model, texture and effect under the real comic
  renderer (cel shading, ink outlines, halftone, pixel-art and CRT passes).
- **Asset pipeline**: procedural models, textures, animation and comic FX, each with a deterministic validator.

## Run it

Requirements: Node.js 20 or newer (developed on Node 24) and npm.

```bash
npm ci
npm start          # dev server in the background: http://localhost:5173/ and /storybook.html
npm run status     # running? which port, where is the log
npm stop           # stop it (npm restart = stop + start)
npm run dev        # the same dev server in the foreground, if you prefer Ctrl+C
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production bundle
```

`npm start` waits until the server answers, prints the URLs and returns; running it twice is harmless.
The log is in `scripts/harness/out/stack/stack.log`. Another port: `npm start -- --port 5174`
(pass the same `--port` to `npm stop`).

Useful storybook URLs:

- `http://localhost:5173/storybook.html?inspect=agent.gork` (one model, animated)
- `http://localhost:5173/storybook.html?inspect=agent.codec&scale=game` (at in-game size)
- `?tab=textures`, `?tab=fx` for the texture and effect galleries

## Checks

```bash
npm run quality                 # typecheck, root layout, file/function size, layer rules, duplicates
npm run quality:fingerprint     # hashes of every model, texture and effect
node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict
node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all
node scripts/harness/render-sheet.mjs                 # contact sheet -> scripts/harness/out/models.png
node scripts/harness/screenshot-lab.mjs --selftest    # headless WebGL screenshot of the storybook
```

## How Kiro is used

Everything Kiro uses lives in [`.kiro/`](./.kiro):

- **Steering** (`.kiro/steering/`): product, tech, structure, architecture and the skills map, always loaded.
  Architecture rules are enforced by scripts in `scripts/quality/`, not by prose.
- **Skills** (`.kiro/skills/`): 22 skills in two categories. *ASSET PCG* (art direction, models, malware,
  rooms, textures, shaders, lighting, animation, particles, validators, visual QA) and *LEVEL GEN*
  (chapter intake, comic story drawing, level compiler, chapter implementer, chapter editor, plus 3D comix intake, sequence generator, comix implementer, and comix editor). Each ships its own validator scripts and self-tests.
- **Hooks** (`.kiro/hooks/`): asset dry runs that validate a model, texture or effect as soon as it is saved.
- **Specs** (`.kiro/specs/`): feature specs (requirements, design, tasks); none committed yet.

## Layout

```
pages/      HTML entry pages (Vite root): player front door, game, dev, hub, chapters, comic, cinematic, storybook
src/        contracts, procgen, shaders, storybook, game, renderer, ui, cinematic, chapters
scripts/    harness (sheets, screenshots, comic drawing), hooks, quality gates
docs/       long-form notes
.kiro/      steering, skills, hooks, specs, settings
```

## Third-party code and originality

- **Libraries** (npm): [three.js](https://threejs.org) (MIT), [xterm.js](https://xtermjs.org) and
  `@xterm/addon-fit` (MIT), [Vite](https://vite.dev) (MIT), TypeScript (Apache-2.0), jscpd (MIT).
  No other pre-existing code is incorporated: the project was started on November 9, 2026, inside the
  Kiroween 2026 submission period.
- **Assets:** every model, texture and effect is generated procedurally by the code in `src/procgen`;
  the repository contains no third-party art, music or logos. The storybook UI loads two fonts from
  Google Fonts at runtime: Chakra Petch and IBM Plex Mono (both SIL Open Font License 1.1).
- **Parody cast:** the four AI agents of the intro and outro (Clod, Gork, Codec and Anti-Gravy) are
  original characters with their own designs: a lump of clay with crab claws, a ringed planet in shades,
  a zipped-up cloud, and a gravy boat that pours upward. They poke fun at AI coding agents in general and
  are not affiliated with or endorsed by any AI company.
- **Style reference:** the comic-book look is inspired by 90s side-scrolling comic games; no material from
  any game is used.

## License

[MIT](./LICENSE)
