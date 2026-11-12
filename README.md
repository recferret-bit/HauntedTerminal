# Haunted Terminal

A web game drawn like a 90s comic book, where the only controller is a terminal. Lightning pulls a
developer inside his own computer; he walks its insides one comic panel per directory and survives by
typing real unix commands: `cd` to move, `ls -a` to reveal what hides in the dark, `kill -9` to fight
malware, `chmod` to petrify it.

Built for the [Kiroween 2026](https://kiroween.devpost.com/) hackathon with [Kiro](https://kiro.dev).

## Status

Work in progress. What runs today:

- **Storybook** (`/storybook.html`): every procedural model, texture and effect under the real comic
  renderer (cel shading, ink outlines, halftone, pixel-art and CRT passes).
- **Asset pipeline**: procedural models, textures, animation and comic FX, each with a deterministic validator.

Not wired up yet: the playable game loop (`src/game`, `src/renderer` stage, `src/ui`) and the chapter
runtime (`src/chapters`). See `.kiro/steering/tech.md`.

## Run it

Requirements: Node.js 20 or newer (developed on Node 24) and npm.

```bash
npm ci
npm run dev        # http://localhost:5173/ (game page), http://localhost:5173/storybook.html
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production bundle
```

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
- **Skills** (`.kiro/skills/`): 17 skills in two categories. *ASSET PCG* (art direction, models, malware,
  rooms, textures, shaders, lighting, animation, particles, validators, visual QA) and *LEVEL GEN*
  (chapter intake, comic drawing, level compiler, implementer). Each ships its own validator scripts and self-tests.
- **Hooks** (`.kiro/hooks/`): asset dry runs that validate a model, texture or effect as soon as it is saved.
- **Specs** (`.kiro/specs/`): feature specs (requirements, design, tasks); none committed yet.

## Layout

```
pages/      HTML entry pages (Vite root)
src/        contracts, procgen (models, textures, anim, fx, validators), shaders, storybook
scripts/    harness (sheets, screenshots, comic drawing), hooks, quality gates
docs/       long-form notes
.kiro/      steering, skills, hooks, specs, settings
```

## Third-party code, pre-existing work and trademarks

- **Libraries** (npm): [three.js](https://threejs.org) (MIT), [xterm.js](https://xtermjs.org) and
  `@xterm/addon-fit` (MIT), [Vite](https://vite.dev) (MIT), TypeScript (Apache-2.0), jscpd (MIT).
- **Pre-existing code, disclosed as the rules require:** parts of the post-processing were adapted from
  an earlier project, *TerraAgent*: the CRT pass (`src/shaders/crt-pass.ts`, from TerraAgent's CSS
  overlay), the lightning bolts (`src/shaders/lightning.ts`, from TerraAgent's `LightningStrikeSystem`), and
  the pixel-art pass defaults (`src/shaders/pixel-art.ts`).
- **Trademarks:** *Comix Zone* is a trademark of SEGA and is named only as a style reference. The
  cinematic cast parodies AI coding agents (Claude, Grok, Codex, Gemini / Antigravity, Kiro); those names
  and logos belong to their owners (Anthropic, xAI, OpenAI, Google, Amazon). This project is not affiliated
  with or endorsed by any of them. The Codex and Grok outlines were traced from the
  [LobeHub icon set](https://github.com/lobehub/lobe-icons) (MIT).

## License

[MIT](./LICENSE)
