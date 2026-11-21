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
| `comix/` | Declarative animated 3D comix sequences, one connected folder per sequence (`comix.manifest.json` + `pages/page-XX-<slug>/page.spec.json`). |
| `docs/` | Long-form docs and notes; `docs/qa/` holds the `qa` agent's reports. |
| `.github/` | GitHub Actions workflows (tagged desktop release builds on `v*`). |
| `.kiro/` | Steering, skills, specs, hooks, settings, agents, powers. |
| files | Only tool configs that must live at the root (`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`) plus `AGENTS.md`, `CLAUDE.md`, `README.md` and `LICENSE` (the open source licence the Kiroween rules require; GitHub detects it at the root). |

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
  cinematic/      # generic 3D comix player & viewport selector; generated/ is compiled from comix/
  editor-core/    # shared workstation UI primitives: dom, schema, form/form-state, schema-check, http, file-tracker, dock-state/layout, workspace, view-resizer, viewport-stage, play-frame, game-preview, console-dock, chrome
  comix-editor/   # /comix-editor: schema forms, bidirectional element selection, layout map, preview & 60fps verifier
  ui/             # terminal, HUD, editor
  sandbox/        # dev inspector
  pages/          # chapter select and comic reader
  chapter-editor/ # /editor: workstation studio, schema-driven chapter forms, centered game preview, checks (schema.ts is the field table)
  terminal-lab/   # /terminal-lab: test bench for the terminal (lab model, palette, runner, Node and browser drivers, panels); reuses editor-core and the chapter editor's field tables
  laptop/         # /laptop-lab: the developer's laptop emulator. domain (state machine, window reducer, tasks, checks) <- runtime (sandboxed runner, loop guard, sound) <- ui (CSS 3D laptop, desktop, apps) <- lab
  hub/            # the landing: app.ts (the one entry) + router.ts (in-page tab switching), hub.ts (Home) and page-{desktop,achievements,comix}.ts (each exports `mount()`), nav.ts + tabs.ts (shared header), waitlist-dialog.ts, boot.ts, comix-tiles.ts, roadmap.ts, trophy-rack.ts, portable-saves.ts, waitlist.ts
  play/           # play page composition (bootstrap). main.ts only starts it
  styles/         # game.css, hub.css, editor-workstation.css, chapter-editor.css, comix-editor.css, terminal-lab.css, laptop.css, laptop-lab.css
  main.ts         # play page (/)
comix/<slug>/                # animated 3D comix data (intro, outro, ...):
  comix.manifest.json        #   stage, cast, shared cues, skip policy, page index
  pages/page-XX-<slug>/page.spec.json  # connected self-contained page & panel specs
chapters/<chapter-slug>/     # LEVEL GEN data, one chapter for Kiroween
  chapter.manifest.json
  story/comix.spec.json, dialogs.json, out/
  levels/level-XX-<slug>/level.spec.json, LEVEL.md
pages/                       # HTML entry pages: index.html (player front door: Home), desktop.html, achievements.html and comix.html (the landing's tab pages), play.html (game at /play/...), hub.html (redirect to /), chapter-editor.html (/editor, /editor/<chapter>/<level>), comix-editor.html (/comix-editor, /comix-editor/<slug>/<target>), terminal-lab.html (/terminal-lab, /terminal-lab/<lab-id>), laptop-lab.html (/laptop-lab), dev.html (level select, jumps, QA labs), chapters.html, comic.html, cinematic.html, storybook.html
public/assets/               # external sprites/meshes (ai-mesh-pipeline)
public/comix/<chapter-id>/   # rendered comic pages
public/fonts/                # self-hosted SIL OFL 1.1 Chakra Petch & IBM Plex Mono .woff2 runtime fonts
scripts/desktop/             # Tauri v2 + Steamworks desktop generator, icon synthesizer, offline verifier & unit tests
scripts/harness/             # shared Node tooling
  terminal-lab/              # committed Terminal Lab scripts (`<id>.lab.json`): one per enemy type and pickup, riddles, tasks, NPCs, inject, no-damage soak
scripts/mcp/haunted-forge/   # the level MCP server of the agent team (tools.mjs pure, server.mjs stdio)
scripts/hooks/               # scripts run by .kiro/hooks (asset dry runs, the generated/vocabulary guard, the spec-first guard and reminder)
scripts/quality/             # root, size, layer, declarative, spec, duplicate and fingerprint gates
docs/                        # long-form docs and notes
.kiro/
  steering/ skills/ specs/ hooks/ settings/
  powers/haunted-ship/       # project Kiro power: plugin.json, mcp.json (Netlify MCP), skills/ship (gated deploy script)
  powers/haunted-release/    # project Kiro power: plugin.json, skills/release (tag, push, GitHub Release and Pages, Netlify preview)
  powers/haunted-tauri-local/ # project Kiro power: plugin.json, skills/tauri-local (local unversioned Tauri build)
  agents/                    # team agents (<name>.json, generated by scripts/harness/agents-build.mjs) + prompts/<name>.md, team-rules.md
```

Not all of `src/` exists yet (see `tech.md`). Create folders only when the code that belongs there is added.

Placement: asset work goes under `src/procgen`, `src/shaders`, `public/assets`. Level work goes under `chapters/` and `src/chapters`. Do not mix them in one change when avoidable.
