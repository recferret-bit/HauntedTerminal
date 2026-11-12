# Product: Haunted Terminal

A web game. Visuals and storytelling follow Sega's *Comix Zone*: comic pages, ink-framed panels, paper gutters, caption boxes, onomatopoeia. The only input is a terminal: the player types unix commands and code to move, open doors, fight malware and fix broken systems.

Premise: lightning pulls a developer inside his own computer. He is human, everything else is the machine. Art rules live in the `haunted-art-direction` skill.

## Scope for the Kiroween hackathon

- Ship **one chapter of about 11 levels** (default shape: 1 tutorial, 6 task levels, 3 hubs, 1 boss).
- Do not start a second chapter. Anything beyond the Kiroween chapter is post-hackathon work.
- Every level must be solvable headlessly with 0 deaths before it counts as done.

## Two content categories

All content work falls into exactly one of these. Read `skills-map.md` for the skills in each.

1. **Asset PCG**: procedural content generation of game assets (models, textures, shaders, animation, particles, rooms, lighting).
2. **Level generation**: levels and the chapter they form (specs, comic story, compiled level packs, solver, QA gate).

Level generation uses assets but never creates them. If a level needs a missing asset, make the asset first.
