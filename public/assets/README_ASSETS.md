# Haunted Terminal: PNG asset specification (Comix Zone style)

Put transparent `.png` files in `public/assets/sprites/` and list them in `public/assets/manifest.json`. The scene is made of procedural 3D meshes and shaders (Three.js). When a PNG exists, it is laid on the mesh with the same key as its albedo map. See the `ai-mesh-pipeline` skill.

| Manifest key | File | Size | Anchor | Style |
|---|---|---|---|---|
| `hero` | `/assets/sprites/hero.png` | 128x192 | `[0.5, 0.9]` | Developer in a hoodie with a lantern, 4 px ink outline |
| `system_hand` | `/assets/sprites/system_hand.png` | 256x256 | `[0.15, 0.85]` | Artist's hand with a stylus drawing from the top of the page |
| `necromancer_boss` | `/assets/sprites/necromancer_boss.png` | 256x256 | `[0.5, 0.85]` | Many-armed boiler-room demon, PID 666 |
| `zombie_worker` | `/assets/sprites/zombie_worker.png` | 128x128 | `[0.5, 0.85]` | Small zombie process with a PID tag |
| `locked_gate` | `/assets/sprites/locked_gate.png` | 160x220 | `[0.5, 0.9]` | Wrought-iron gothic gate with an `rwx` padlock |
| `poltergeist` | `/assets/sprites/poltergeist.png` | 128x128 | `[0.5, 0.5]` | Translucent ghost, the dotfile `.poltergeist.lock` |
| `gargoyle` | `/assets/sprites/gargoyle.png` | 192x192 | `[0.5, 0.9]` | Winged stone gargoyle, mode `0555` |
| `crate_bridge` | `/assets/sprites/crate_bridge.png` | 160x96 | `[0.5, 0.8]` | Wooden archive crate `heavy_plank.tar` |
| `mirror_door` | `/assets/sprites/mirror_door.png` | 160x220 | `[0.5, 0.9]` | Cracked symlink mirror |
| `black_hole` | `/assets/sprites/black_hole.png` | 192x192 | `[0.5, 0.5]` | Gravity vortex, `/dev/null` |
| `socket_guardian` | `/assets/sprites/socket_guardian.png` | 160x192 | `[0.5, 0.85]` | Talking stone skull for `*.sock` |
| `item_scroll` | `/assets/sprites/item_scroll.png` | 96x96 | `[0.5, 0.8]` | Scroll or log file, `readme.txt` |
