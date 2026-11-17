# Lantern Item: design

## Pieces

```
src/procgen/archetypes/items/
  lantern.ts          buildLantern(seed): ModelSpec standing on y=0 with grip and light sockets
src/procgen/archetypes/
  vibecoder.ts        mounts lantern to hand, tags parts with arm swing, registers vibecoder.dev
src/renderer/
  stage-frame.ts      lightFrame tracks hero's sockets.lantern as primary comic light source
src/chapters/
  session-fs.ts       cmdLs reveals dotfiles and switches held item to lantern
```

## Decisions

- **Single light source.** Only `item.lantern` provides `sockets.light`. When held, `vibecoder.dev` gains `sockets.lantern` at the glass center.
- **`ls -a` raising.** Executing `ls -a` raises the lantern (`g.inventory = holdItem(g.inventory, 'lantern')`), triggers `LANTERN_REVEAL`, and flashes stage lighting.
- **Unchanged fingerprint.** The parts, geometry, and hashes of `vibecoder.dev` and `item.lantern` remain strictly byte-identical to previous releases.

## Layers and gates

- Gates: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs item.lantern vibecoder.dev --seeds 4`, `npm run quality:fingerprint`, `node scripts/harness/generate-chapter.mjs --verify`.
