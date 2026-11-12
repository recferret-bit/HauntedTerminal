# Structure

```
src/
  procgen/        # ASSET PCG code: kit, archetypes, textures, fx, anim, core
  shaders/        # comic material, lightning, post passes
  renderer/       # comic stage
  game/           # world, entities, terminal, VFS
  chapters/       # LEVEL GEN runtime: types, validators, session, generated/
  pages/          # chapters / comic pages
  main.ts
chapters/<chapter-slug>/     # LEVEL GEN data, one chapter for Kiroween
  chapter.manifest.json
  story/comix.spec.json, dialogs.json, out/
  levels/level-XX-<slug>/level.spec.json, LEVEL.md
public/assets/               # external sprites/meshes (ai-mesh-pipeline)
public/comix/<chapter-id>/   # rendered comic pages
scripts/harness/             # shared Node tooling
scripts/hooks/               # scripts run by .kiro/hooks (asset dry runs)
.kiro/
  steering/ skills/ specs/ hooks/ settings/
```

Not all of `src/` exists yet (see `tech.md`). Create folders only when the code that belongs there is added.

Placement: asset work goes under `src/procgen`, `src/shaders`, `public/assets`. Level work goes under `chapters/` and `src/chapters`. Do not mix them in one change when avoidable.
