# Shipped FX presets

All 30 live in `src/procgen/fx/presets.ts` and `src/procgen/fx/presets-agents.ts` and are registered in `FxCatalog` on import.
Columns: layers are `name:role:zone x count emission` (`p` primary, `s` secondary, `a` accent).
Regenerate the picture with `node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all --sheet` and open `scripts/harness/out/fx.png`.

| id | family | event | ms | word (style, zone) | shake/flash | layers |
|---|---|---|---|---|---|---|
| `fx.fight` | system | BATTLE_TURN (first player turn) | 760 | FIGHT! (jagged, `paper`) | 1.1 / - | blast:p:`powerAmber`x1 burst; frame:s:`ink`x8 ring; rush:a:`paper`x6 ring |
| `fx.hop` | system | ROOM_TRANSITION | 380 | HOP! (burst, `phosphor`) | | puff:p:`paper`x4 cone; grit:s:`solder`x6 cone; whoosh:a:`phosphor`x3 line |
| `fx.panel-smash` | system | ROOM_TRANSITION | 720 | PANEL SMASH x3! (jagged, `powerAmber`) | 1.5 / - | gutter:p:`paper`x8 cone; frame:s:`ink`x8 cone; punch:a:`powerAmber`x1 burst |
| `fx.permission-denied` | system | PERMISSION_DENIED_RATTLE | 420 | PERMISSION DENIED! (jagged, `lockRed`) | 0.8 / - | clash:p:`lockRed`x1 burst; spark:s:`gold`x8 burst; rattle:a:`paper`x4 ring |
| `fx.gate-open` | system | INODE_MODE_CHANGED | 520 | CLANK! (burst, `phosphor`) | | clang:p:`paper`x7 cone; rust:s:`solder`x8 rain; open:a:`phosphor`x3 ring |
| `fx.reveal` | vibecoder | LANTERN_REVEAL | 640 | REVEAL! (burst, `lantern`) | | glint:p:`lantern`x6 ring; mote:s:`paper`x9 burst; sweep:a:`dataCyan`x1 burst |
| `fx.rm-ash` | system | COMMAND | 760 | | | ash:p:`ink`x13 burst; flame:s:`lockRed`x4 line; ember:a:`powerAmber`x7 cone |
| `fx.touch-materialize` | system | COMMAND | 560 | | | plus:p:`phosphor`x6 implode; bit:p:`phosphor`x5 implode; bracket:s:`dataCyan`x5 implode; snap:a:`paper`x1 burst |
| `fx.mv-dust` | system | OBJECT_MOVED | 440 | | | dust:p:`paper`x4 cone; grit:s:`solder`x6 cone; streak:a:`powerAmber`x3 line |
| `fx.sigkill` | system | PROC_SIGNALED | 640 | SIGKILL! (jagged, `paper`) | 1.6 / 2.5 | blast:p:`powerAmber`x1 burst; pixel:s:`lockRed`x14 burst; core:a:`paper`x1 burst; bit:a:`paper`x6 burst |
| `fx.sigstop-ice` | system | PROC_SIGNALED | 560 | FROZEN! (burst, `dataCyan`) | | crystal:p:`ice`x8 ring; chip:s:`paper`x8 burst; glint:a:`phosphor`x4 ring |
| `fx.sigterm-rage` | malware | PROC_SIGNALED | 600 | SIGTERM IGNORED! (jagged, `malwareEye`) | 1.3 / - | rage:p:`corruptMagenta`x1 burst; spike:s:`corruptViolet`x9 ring; ember:a:`malwareEye`x8 burst |
| `fx.fork-spawn` | system | SYSTEM_HAND_SPAWN | 620 | FORK()! (glitch, `paper`) | | blot:p:`ink`x1 burst; drop:p:`ink`x8 burst; fleck:s:`paper`x9 burst; stroke:a:`dataCyan`x4 ring |
| `fx.pickup-energy` | system | GAME_TICK | 520 | +25HP (burst, `powerAmber`) | | flash:p:`powerAmber`x1 burst; plus:p:`powerAmber`x3 line; arc:s:`copper`x7 burst; glint:a:`paper`x4 ring |
| `fx.pickup-ram` | system | GAME_TICK | 520 | +16GB (burst, `dataCyan`) | | ring:p:`dataCyan`x1 burst; one:p:`dataCyan`x3 line; zero:p:`dataCyan`x2 line; board:s:`pcb`x6 burst; pin:a:`gold`x4 ring |
| `fx.pickup-ssd` | system | GAME_TICK | 520 | +256GB (burst, `phosphor`) | | slab:p:`phosphor`x1 burst; hash:p:`phosphor`x4 line; shell:s:`solder`x8 burst; led:a:`paper`x4 ring |
| `fx.hit-vibecoder` | vibecoder | PLAYER_DAMAGED | 360 | -10HP (jagged, `lockRed`) | 1.1 / - | impact:p:`paper`x1 burst; thread:s:`hoodie`x6 burst; pain:a:`lockRed`x5 ring |
| `fx.malware-hit` | malware | GAME_TICK | 330 | | | impact:p:`corruptMagenta`x1 burst; slip:s:`corruptViolet`x7 line; bile:a:`toxicGreen`x5 burst |
| `fx.malware-death` | malware | GAME_TICK | 820 | SEGFAULT! (glitch, `toxicGreen`) | 0.8 / - | block:p:`corruptViolet`x13 burst; code:s:`corruptMagenta`x8 line; eye:a:`malwareEye`x1 burst; bile:a:`toxicGreen`x4 burst |
| `fx.devnull-suck` | system | OBJECT_MOVED | 640 | | | streak:p:`paper`x12 implode; byte:s:`dataCyan`x10 implode; rim:a:`glass`x2 burst |
| `fx.lightning-strike` | system | INTRO | 460 | KRAKOOM! (jagged, `paper`) | 1.6 / 5.5, full panel | bolt:p:`dataCyan`x1 burst; core:s:`paper`x1 burst; strike:s:`paper`x1 burst; spark:a:`powerAmber`x10 cone |
| `fx.flood-splash` | system | ROOM_TRANSITION | 620 | SPLASH! (burst, `dataCyan`) | | drop:p:`dataCyan`x9 cone; foam:s:`glass`x4 line; fleck:a:`paper`x7 cone |
| `fx.door-unlock` | system | PUZZLE_DOOR_RESOLVED | 560 | UNLOCKED! (burst, `phosphor`) | | ok:p:`phosphor`x1 burst; echo:p:`phosphor`x1 burst; contact:s:`gold`x7 burst; glint:a:`paper`x3 ring |
| `fx.coredump` | system | GAME_TICK | 1100 | COREDUMP! (glitch, `lockRed`) | 2 / 3, full panel | page-left:p:`paper`x3 line; page-right:p:`paper`x3 line; tear:s:`ink`x1 burst; glitch:a:`lockRed`x10 line |
| `fx.matrix-cast` | system | VIBECODER_ACTION | 680 | | | stream:p:`matrixBright`x12 orbit; trail:s:`matrixDark`x12 orbit; head:a:`matrixGlow`x3 orbit |
| `fx.matrix-fault` | system | VIBECODER_ACTION (`matrix-fault`: a command exits non-zero) | 680 | | 0.45 / - | stream:p:`faultBright`x12 orbit; trail:s:`faultDark`x12 orbit; head:a:`faultGlow`x3 orbit; glitch:a:`faultGlow`x3 line |
| `fx.agent-clod` | malware | AGENT_TAUNT | 560 | CLACK! (burst, `clayOrange`) | | splat:p:`clayOrange`x2 burst; kiln:s:`gravyBrown`x6 cone; fissure:a:`malwareEye`x4 ring |
| `fx.agent-coffee` | malware | AGENT_TAUNT | 720 | HISS! (whisper, `paper`) | | steam:p:`paper`x5 line; roast:s:`gravyBrown`x7 cone; crema:a:`malwareEye`x4 ring |
| `fx.agent-gork` | malware | AGENT_TAUNT | 620 | WARP! (jagged, `corruptMagenta`) | | vortex:p:`corruptMagenta`x2 burst; debris:s:`solder`x7 ring; corona:a:`paper`x5 implode |
| `fx.agent-codec` | malware | AGENT_TAUNT | 580 | PARSE! (glitch, `toxicGreen`) | | syntax:p:`codecSteel`x7 burst; macroblock:s:`corruptViolet`x6 line; cursor:a:`toxicGreen`x4 cone |

Moment words required by the game design and enforced by
`FX_MOMENT_WORDS`: HOP!, PANEL SMASH x3!, PERMISSION DENIED!, CLANK!, REVEAL!, SIGKILL!,
SIGTERM IGNORED!, KRAKOOM!. The others (FROZEN!, FORK()!, SEGFAULT!, SPLASH!, UNLOCKED!, COREDUMP!
and the amounts) are this catalog's own and may be changed.

## The idea behind each

| id | The picture | Notes |
|---|---|---|
| `fx.fight` | An amber starburst pops oversized, ink frame shards fly out in a ring, paper speed lines rush outward; FIGHT! above | The battle-begins beat (`.kiro/specs/turn-based-battles/`), on the panel center, once per battle after the intro |
| `fx.hop` | Dust puffs kicked sideways at the feet, grit, three green speed lines going up | Origin at the take-off point. Small on purpose: it plays on every `cd` |
| `fx.panel-smash` | Amber punch star, then white gutter shards and black frame shards thrown up and out | Origin at the fist. Ink shards carry a paper keyline |
| `fx.permission-denied` | Red clash star on the padlock, gold sparks, four white rattle marks | Origin on the door's `lock` socket |
| `fx.gate-open` | White impact lines fanning from the top stop, grey rust flakes falling, green glints below | Origin at the gate centre; the clang is 0.75 above it |
| `fx.reveal` | Lantern-yellow four-point glints twinkling in a ring, paper motes, one cyan sweep ring | Origin on the revealed dotfile. The only effect in the vibecoder's warm light |
| `fx.rm-ash` | Red flame tongues for two frames, then ink flakes drifting up with amber embers | Origin at the centre of the removed object |
| `fx.touch-materialize` | Green `+` and `1`, cyan brackets spiralling inward, a white snap where the file appears | The pose is at the end: the snap lands on the frame the file becomes visible |
| `fx.mv-dust` | Dust and grit thrown behind a shoved object, three amber drag streaks | Authored for motion toward screen-right; set `emitter.group.scale.x = -1` for the other way |
| `fx.sigkill` | Big amber blast, a ring of red pixels flying out, white core and bits | With `flash` 2.5 and `shake` 1.6: the loudest non-lightning hit |
| `fx.sigstop-ice` | Eight ice crystals snap on in a rosette and hold, white chips, green glints | Crystals do not move: frozen means still. Follow with the existing blue tint |
| `fx.sigterm-rage` | Magenta rage star pulsing twice, violet spikes, yellow embers | The only `malware` hit answering a player command: the boss is the one acting |
| `fx.fork-spawn` | An ink blot and drops with paper keylines, paper flecks, four cyan stroke marks | Origin where the stylus touches. Glitch word because the OS itself is drawing |
| `fx.pickup-energy` | Amber flash, copper arcs, three `+` rising | Each pickup has its own first shape so they differ at a glance |
| `fx.pickup-ram` | Cyan ring, pcb chips, `1` and `0` rising, gold pin glints | |
| `fx.pickup-ssd` | Green slab pop, solder shell pixels, `#` rising | |
| `fx.hit-vibecoder` | White impact star, orange hoodie threads, red pain ticks | Orange only appears here and on the vibecoder: the player reads "that was me" |
| `fx.malware-hit` | Magenta star, violet blocks slipping sideways, toxic-green ticks | No word: it plays often |
| `fx.malware-death` | Yellow eye flash, violet blocks shattering outward and shrinking in four steps, magenta slashes dissolving upward at half opacity | The one use of stepped alpha |
| `fx.devnull-suck` | White speed lines and cyan bytes spiralling into the drain, two rings closing | No malware purple: `/dev/null` is a system door. The vortex shader supplies the purple |
| `fx.lightning-strike` | A 4-unit cyan bolt with a white core held for 3 frames, ground star, amber sparks | See [comic-lighting-and-lightning](../../comic-lighting-and-lightning/SKILL.md) |
| `fx.flood-splash` | Cyan drops arcing up and falling, pale foam on the water line, white flecks | Origin on the water line |
| `fx.coredump` | A black tear with a paper keyline down the panel, six torn page strips sliding apart, red glitch bars | Full panel; the last effect the player sees before a restart |
| `fx.matrix-cast` | 3 intertwined 3D Matrix Katakana streams (`matrixGlow` heads, `matrixBright` neon green bodies, `matrixDark` emerald trails) orbiting behind & in front of the vibecoder with 3D yaw and stepped glyph flicker | Random swirl direction, tilt, phase, and glyphs on every command; wraps actor in 3D, no word or shake |
| `fx.matrix-fault` | The `fx.matrix-cast` swirl recoloured to the red fault zones (`faultGlow` heads, `faultBright` bodies, `faultDark` trails) plus 3 `faultGlow` glitch blocks tearing off | Plays instead of `fx.matrix-cast` when the command fails; light envelope stutters, shake 0.45, no word |
| `fx.agent-clod` | Terracotta `clayOrange` splats, dark kiln-baked clay shards arching out, and `malwareEye` fissure sparks | Fired on Clod taunts, Boss-room ambient ticks, and Intro/Outro beats |
| `fx.agent-coffee` | Rising `paper` comic steam puffs over hot `gravyBrown` dark-roast droplets and `malwareEye` crema sparkles | Anchored at top of `agent.antigravy`'s mug lip; stepped 12 fps upward drift |
| `fx.agent-gork` | `corruptMagenta` quasar starburst, outward `solder` asteroid shards, and inward-pulling `paper` accretion speed-lines | Fired on Gork taunts and Intro/Outro vortex beats |
| `fx.agent-codec` | Swapping `codecSteel` `[` and `>` glyphs fanning out over `corruptViolet` CRT macroblocks and `toxicGreen` cursor ticks | Fired on Codec taunts and Intro/Outro syntax beats |
