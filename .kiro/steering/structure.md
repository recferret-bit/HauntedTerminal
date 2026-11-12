# Structure

## Repository root: keep it clean

Only these may sit at the root; `npm run quality:root` (`scripts/quality/check-root.mjs`) fails on anything else.

| Entry | What belongs there |
|---|---|
| `pages/` | Every HTML entry page. It is the Vite root, so `pages/storybook.html` is served at `/storybook.html`. |
| `src/` | TypeScript source (pages load it as `<script type="module" src="/src/...">`; `vite.config.ts` maps `/src/` to it). |
| `scripts/` | Node tooling: `harness/`, `hooks/`, `quality/`. |
| `public/` | Static assets served as-is. |
| `chapters/` | LEVEL GEN data, one folder per chapter. |
| `docs/` | Long-form docs and notes. |
| `.kiro/` | Steering, skills, specs, hooks, settings. |
| files | Only tool configs that must live at the root (`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`) plus `AGENTS.md`, `README.md` and `LICENSE` (the open source licence the Kiroween rules require; GitHub detects it at the root). |

Rules:
- A new page is a new `pages/<name>.html` plus an entry in `build.rollupOptions.input` of `vite.config.ts`. Never put HTML at the root.
- A new doc goes in `docs/`, never at the root. Generated output (`dist/`, `scripts/harness/out/`) stays git-ignored.
- Harness scripts start the page server with `startPageServer()` from `scripts/harness/lib/load.mjs`, which uses `vite.config.ts`. Do not pass `root:` to Vite yourself.
- Changing the allowed root entries means changing `check-root.mjs` and this table in the same commit.

## Source tree

```
src/
  contracts/      # pure shared types
  procgen/        # ASSET PCG: core, geometry, kit, textures, archetypes, fx, anim, validate, runtime
  shaders/        # comic material, lightning, post passes
  storybook/      # storybook page (domain, subjects, stage, ui, app)
  assets/         # optional PNG albedo maps
  game/           # world, VFS, shell, session (three-free)
  chapters/       # LEVEL GEN runtime; generated/ is compiled from chapters/
  renderer/       # comic stage
  cinematic/      # intro and outro
  ui/             # terminal, HUD, editor
  sandbox/        # dev inspector
  pages/          # chapter select and comic reader
  chapter-editor/ # /editor: schema-driven chapter forms, game preview, checks (schema.ts is the field table)
  hub/            # issue hub entry
  play/           # play page composition (bootstrap). main.ts only starts it
  styles/         # game.css, hub.css
  main.ts         # play page (/)
chapters/<chapter-slug>/     # LEVEL GEN data, one chapter for Kiroween
  chapter.manifest.json
  story/comix.spec.json, dialogs.json, out/
  levels/level-XX-<slug>/level.spec.json, LEVEL.md
pages/                       # HTML entry pages: index.html (player front door), play.html (game at /play/...), hub.html (redirect to /), chapter-editor.html (/editor, /editor/<chapter>/<level>), dev.html (level select, jumps, QA labs), chapters.html, comic.html, cinematic.html, storybook.html, chapter-editor.html (/editor)
public/assets/               # external sprites/meshes (ai-mesh-pipeline)
public/comix/<chapter-id>/   # rendered comic pages
scripts/harness/             # shared Node tooling
scripts/hooks/               # scripts run by .kiro/hooks (asset dry runs)
scripts/quality/             # root, size, layer, duplicate and fingerprint gates
docs/                        # long-form docs and notes
.kiro/
  steering/ skills/ specs/ hooks/ settings/
```

Not all of `src/` exists yet (see `tech.md`). Create folders only when the code that belongs there is added.

Placement: asset work goes under `src/procgen`, `src/shaders`, `public/assets`. Level work goes under `chapters/` and `src/chapters`. Do not mix them in one change when avoidable.
