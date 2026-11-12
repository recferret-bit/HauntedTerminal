---
inclusion: fileMatch
fileMatchPattern: "src/{procgen,shaders,renderer}/**"
---

# Asset PCG rules

You are editing procedural asset code. Before changing anything:

1. Activate `haunted-art-direction`, then the skill for the area (see `skills-map.md`).
2. Stay inside the single palette and the fixed light direction. No smooth gradients, extra Three.js lights, shadow maps or bloom.
3. Only `hero.dev` and `hero.hand` use human palette zones.
4. After the change run the area's validator and a visual QA pass (`comic-panel-viewport-auditor`). Say which checks you ran and which you could not run.
5. Do not edit level specs or chapter data from here; that is the LEVEL GEN category.
