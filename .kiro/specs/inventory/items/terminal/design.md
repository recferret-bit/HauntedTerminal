# Terminal Item & Lab: design

## Pieces

```
src/procgen/archetypes/items/
  terminal.ts         buildTerminal(seed): Handheld field cyberdeck slate model standing on y=0
src/procgen/archetypes/
  vibecoder.ts        mounts terminal to hand, registers vibecoder.dev_terminal (no sockets.lantern)
src/terminal-lab/
  lab-types.ts, lab-model.ts, lab-pack.ts, runner.ts, ... /terminal-lab test bench workbench
src/game/
  lab-support.ts, session.ts   shared classic session lab support and absorbed damage
src/chapters/
  session-lab.ts, session-lab-types.ts   chapter session lab support and inspect()
```

## Decisions

- **Cyberdeck visual design.** Dark `silicon` shell (width ~0.46, height ~0.34, depth ~0.08), brown leather `hair` grip handle on top (`TOP + 0.08`), recessed `pcbDark` bezel with a glowing `phosphor` screen (`>_` prompt in ink/phosphor), solder keypad grid with arrow keys. Stands at `y = 0` on its foot. Sockets: `grip` at handle top, `screen` at display center, `fx` at center. No `light` socket.
- **Hero model.** `vibecoder.dev_terminal` holds the cyberdeck by its top grip handle in the screen-right hand.
- **No light emission.** When held, no `sockets.lantern` is defined. `ComicStage.lightFrame` treats the hero light as null, keeping the room in readable ambient flat shading without the flickering oil-lantern halo.
- **Terminal Lab ownership.** The terminal child spec incorporates and owns the declarative test bench at `/terminal-lab` (previously defined in `.kiro/specs/terminal-lab/`, removed; merged here into `.kiro/specs/inventory/items/terminal/`).

## Layers and gates

- Gates: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs item.terminal vibecoder.dev_terminal --seeds 4`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-smoke.mjs`, `npm run quality:fingerprint`, `npm run quality`.
