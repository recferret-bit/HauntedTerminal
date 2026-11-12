# World lexicon

What each thing in the game is inside the computer, and the one visual idea that sells it.
Model ids are `<category>.<name>`. `gameKey` is the key the game's stage and
`public/assets/manifest.json` already use, when the model replaces an existing actor.

## Hero and the hand

| id | gameKey | Brief |
|---|---|---|
| `hero.dev` | `hero` | Tired developer, 1.6 units. Orange hoodie with the hood up, jeans, pale sneakers, messy hair edge, a lantern held out at the screen-right side. The only round, soft shapes in the game. Legs and arms tagged for `legWalk` / `armSwing`. |
| `hero.hand` | `system_hand` | The System Hand: a paper-white hand holding a stylus, palm to the camera, fingers pointing down. Enters from above the panel. |

## Malware bestiary

Every enemy: a hardware body (`silicon`, `pcbDark`, `solder`, `plastic`) taken over by corruption
(`corruptMagenta`, `corruptViolet`, `toxicGreen`, `voidPurple`), exactly one focal `malwareEye` (an
eye, a core, a keyhole), and at least one part with `jitter`. Shapes are sharp and asymmetric; the
hero is the only round thing.

| id | gameKey | What it is | Silhouette idea | Behaviour hook |
|---|---|---|---|---|
| `malware.virus` |  | Self-copying code | Spiky capsid: a faceted core with injector spikes, a smaller copy budding off one side | Splits when hit |
| `malware.worm` |  | Network worm | Chain of packet segments rising out of a port in an S-curve, drill-bit head | Burrows between panels |
| `malware.trojan` | `gargoyle` | Trojan horse binary (`stone_gargoyle.bin`) | A gift-wrapped install box, split open, a horned gargoyle head and claws coming out. `chmod -x` turns it to grey stone (`heatsink` tint) | Perches, bites every 3 s |
| `malware.bug` |  | A software bug | Literal beetle made of a chip: DIP-package body, pin legs, antenna traces, one cracked eye | Scuttles, erratic |
| `malware.exploit` |  | Buffer overflow / injection | A syringe-nosed dart with a payload sac that bulges past its own frame | Lunges in a straight line |
| `malware.crack` |  | Keygen / crack | A skeleton key with teeth for a mouth and a skull bow, chiptune equaliser spine | Picks locks, opens doors for others |
| `malware.ransomware` |  | Ransomware | A padlock with a jaw: the shackle is horns, the keyhole is the eye, chains hang off it | Locks pickups until killed |
| `malware.spyware` |  | Spyware | A webcam-eye drone: lens iris, two antenna ears, a dangling data cable tail | Hovers, reveals the hero |
| `malware.rootkit` | `poltergeist` | Rootkit hiding as a dotfile (`.poltergeist.lock`) | A ghost: translucent `ghostViolet` shroud over a hint of a chip, two hollow eyes, a padlock on a chain. Invisible until `ls -a` | Holds doors shut |
| `malware.zombie` | `zombie_worker` | Zombie process | Small hunched bot, one arm, a `PID` tag on its chest, a cut cable where the parent link was | Swarms, re-forked by the boss |
| `boss.forkbomb` | `necromancer_boss` | `necromancer_forkd`, PID 666, a fork bomb daemon | Tall, many-armed, each arm ends in a fork (the `:(){ :|:& };:` joke), furnace-core chest | Forks zombies every 4 s, ignores SIGTERM |
| `malware.agent_claude` |  | Parody AI agent, intro / outro only | A clay-orange asterisk creature with one tired, half-lidded eye | "BAG OF BONES." |
| `malware.agent_grok` |  | Parody AI agent, intro / outro only | A black slab cut by a white slash, shades, magenta smirk | "MEAT-BASED PROMPT ENGINEER. LOL." |
| `malware.agent_codex` |  | Parody AI agent, intro / outro only | A slate terminal box with a `>_` face and a cable knot on top | "CONTEXT WINDOW: FULL OF YOUR NONSENSE." |
| `malware.agent_agy` |  | Parody AI swarm agent, intro / outro only | An anti-gravity blue sparkle core with two orbiting subagent satellites | "I SPAWNED TWELVE SUBAGENTS." |
| `boss.kernel` |  | `KERNEL_OVERLORD`, PID 1, kernel panic: the AI agents' core | A cracked CPU die hanging in the storm, one huge three-phase eye, heat-pipe tentacles, shield ring | Three phases |

## Pickups

All hover around `y = 0.5`, are 0.3 to 0.5 units, carry one `signal` zone and animate (`bob` plus `spin` or `pulse`).

| id | What | Idea |
|---|---|---|
| `pickup.energy` | Heals the hero ("power") | A battery cell with a lightning-bolt cut-out, `powerAmber` core, gold caps |
| `pickup.ram` | + GB of memory | A RAM stick: `pcb` board, a row of `silicon` chips, `gold` contact teeth, `dataCyan` notch light |
| `pickup.ssd` | + GB of storage | A 2.5" SSD slab: `silicon` shell, `plastic` label, `gold` SATA edge, `phosphor` activity LED |

## Doors: ports and interfaces

Every door has a metal or plastic shell, visible contacts, a status LED part named `led` and a
`lock` socket. Width 0.7 to 1.1, height 1.4 to 1.9.

| id | gameKey | What | Idea |
|---|---|---|---|
| `door.usb` |  | Ordinary directory door | A giant USB-A receptacle stood upright: `solder` shell, `plastic` tongue, four `gold` contacts |
| `door.ethernet` |  | Door to another host / floor exit | RJ45 jack as an archway: eight gold pins as a portcullis, two link LEDs |
| `door.hdmi` |  | Wide door, vista rooms | Trapezoid HDMI mouth |
| `door.serial` |  | Old, creaky door | DB9 shell with nine pin holes and two thumbscrews |
| `door.firewall` | `locked_gate` | Permission gate (`iron_gate`, mode 000) | A wrought-iron grille of vertical bars with a padlock showing `rwx`; `chmod +rx` lifts it |
| `door.loopback` | `mirror_door` | Symlink mirror door | A framed mirror of `glass` with a crack and a loop arrow of trace: it leads back to you |
| `door.devnull` | `black_hole` | `/dev/null` | A drain ring; the vortex itself is a shader (`createVortexMaterial`) |
| `door.socket` | `socket_guardian` | Talking `*.sock` | A wall socket with a speaker-grille mouth and two LED eyes, on a short conduit neck |

## Items and props

| id | gameKey | Idea |
|---|---|---|
| `prop.file` | `item_scroll` | A document: a paper card with a folded corner and three ink lines |
| `prop.tar` | `crate_bridge` | `heavy_plank.tar`: a strapped crate of stacked platters, long enough to bridge a gap |
| `prop.fuse` |  | `.spare_fuse` / `.power_on`: a glass fuse with gold caps |
| `prop.chip` |  | A DIP chip with pin legs. Set dressing |
| `prop.capacitor` |  | Electrolytic capacitor can with a stripe. Set dressing, reads as a pillar |
| `prop.heatsink` |  | Finned heatsink block. Set dressing, reads as a radiator or an organ |
| `prop.fan` |  | Case fan in a square frame, blades tagged `spin` |
| `prop.cables` |  | Ribbon-cable cobweb / hanging cable bundle |
| `prop.crt` |  | Dead CRT monitor with a `glass` screen. Floor 1 |
| `prop.tombstone` |  | A log tombstone: a chip package stood on end with `FATAL` ink lines. Floor 2 |
| `prop.kiro_ghost` |  | `kiro.d`: self-hosted Ghost companion (`localhost` `.gguf` daemon). Articulated 8-petal `paper` and `gold` polyhedral shell orbiting a `dataCyan` diamond optic |

## Rooms

`room.<kind>`, where kind is a `RoomKind` from `src/renderer/room-view.ts`:
`desk` `attic` `crypt_entrance` `crypt_hall` `chasm` `cell` `lab_hall` `catwalk` `furnace` `core` `outro`.
A room is a shallow stage: back wall, floor strip, and props pushed to the edges. The middle band
where actors stand (design x from −1.15 to 4.9, feet at y = 0) stays clear and dark.
