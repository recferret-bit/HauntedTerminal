# Dialog box sides and animated avatars: design

Approved by the user 2026-11-24.

## Pieces

```
artist              src/renderer/portrait.ts         export HeroFaceTier, heroFaceTierForHp, applyHeroFaceTier (cloned ModelSpec for 5 HP tiers 0..4 + 'ouch'), applyPixelArtFilter (macro-pixel downsampling, 4x4 Bayer dither, 16-level quantization, edge contours, grid), IDLE_POSES, strict HEAD_PART_RX neck-pivot selection on headCrop models, vertical y-bob suppression
                    src/renderer/comic-stage.ts      remove CameoDirector field, warm(), debugState().cameos; add heroOuchUntil for 3D stage hurt face timing
                    src/renderer/stage-cast.ts       setHeroFaceTier() to hot-swap 3D vibecoder mesh/animator cleanly across HP tiers & 'ouch'
                    src/renderer/stage-sync.ts       syncHeroFace() in applyActor (clearing heroOuchUntil on heal)
                    src/renderer/stage-event-combat.ts onPlayerDamaged triggers ~600ms 3D stage 'ouch' face and recovers to HP tier
                    src/renderer/stage-avoid.ts      remove 'shader-dock' from CHROME_IDS
                    src/renderer/stage-cameos.ts     deleted (merged into .dialog-box + DialogOrchestrator)
                    src/renderer/stage-overlay.ts    remove cameoLayer; collectObstacles avoids open .dialog-box.open
                    src/renderer/stage-overlay.css   remove .st-cameo styles
                    src/renderer/stage-event-cast.ts remove AGENT_TAUNT handling and TUTORIAL_STEP cameo enqueue (keep hero hop on done)
                    src/renderer/stage-frame.ts      remove stage.cameos.update(dt)
                    src/renderer/stage-layout.ts     remove stage.cameos.clear(); reset heroOuchUntil in buildStageScene
                    src/renderer/stage-selfcheck.ts  remove cameos checks
terminal-designer   src/ui/dom-lite.ts               HeroFaceTier, heroFaceTierForHp, DrawPortrait (with optional faceTier)
                    src/ui/dialog-box.ts             DialogPriority, DialogMood, DialogBoxOptions (onOpen, onClose, canStartLine), left-side #hero-hud drawer delegation (dynamic query), right-side .dialog-box queue, activeLine/activeSide/shortenHold/dismissSide/wake, calm HEAD_FRAME_MS = 180
                    src/ui/dialog-orchestrator.ts  DialogOrchestrator: single ordered conversation queue uniting DIALOG_BOX and AGENT_TAUNT, priority preemption, duplicate suppression, chatter cap, .hint-note mutual exclusion, socket dialogue yield, TUTORIAL_STEP pass-through
                    src/ui/hud.ts                    remove #hud-hp-cell from HUD_HTML; mount #hero-hud into #titleblock (fallback: stageWrap) with animated #hero-avatar + HP bar + #hero-dialog-drawer; track faceTier and transient ~600ms 'ouch' on damage(); hideHint() and onHintShow callback
                    src/ui/visual-lab-panel.ts       only mount #shader-strip when #shader-dock exists (removed in play.html); preserve F8/F9/F10 shortcuts and #pixel-dlg
lead-dev            pages/play.html                  remove <header id="masthead"> and <div id="shader-dock"></div>
                    src/chapters/script.ts           emit VIBECODER speaker name for vibecoder dialog_box lines
                    src/chapters/session-flow.ts     debugDamage(g, amount) for F2 dev panel HP testing
                    src/chapters/chapter-session.ts  expose debugDamage(amount)
                    src/game/session.ts              debugDamage(amount) on Session interface and implementation
                    src/sandbox/dev-inspector.ts     add +10 DMG button (#btn-damage) next to Heal HP in F2 panel
                    src/game/view-layouts.ts         SceneFacts.hp and maxHp
                    src/game/view.ts                 include hp/maxHp on vibecoder RoomActor
                    src/game/runtime.ts              pass hp and maxHp in facts(g)
                    src/chapters/session-snapshot.ts pass hp and maxHp in chapter snapshot facts
                    src/play/state.ts                Play.dialogs: DialogOrchestrator | null
                    src/play/input.ts                mountDialogOrchestrator wired with tutorial and hud.hideHint(); mountHud wired with onHintShow; mountPlayDev wired with onDamage
                    src/play/loop.ts                 route DIALOG_BOX, AGENT_TAUNT, TUTORIAL_STEP, OBSTACLE_DIALOGUE_RENDERED, PUZZLE_DOOR_RESOLVED, ROOM_TRANSITION, FLOOR_ENTERED through play.dialogs
                    src/editor-core/play-frame.ts    include DIALOG_BOX in talk-event highlighting
                    src/styles/dialog.css            remove canvas frame translate/rotate/scale transforms; add mood accent border rules; stepped horizontal drawer transitions; align mobile avatar/HP bar width (56px)
                    src/styles/game.css              remove dead #masthead/#shader-dock rules; style #hero-hud, .hero-status-col, matching 68px .hero-avatar & .hud-hp width, top-left .hero-dialog-inner alignment, face-tier accents, #hero-dialog-drawer
                    .kiro/steering/glossary.md       update "Dialog box" definition
qa                  scripts/harness/visual/screens.json  replace #masthead and #shader-dock with #hero-hud in play selectors
                    scripts/harness/terminal-lab-unit.mjs  unit/DOM tests for calm idle portraits, pixel filter macro-pixels, heroFaceTierForHp & HP tiers, DialogBox + #hero-hud drawer lifecycle, and DialogOrchestrator invariants
```

## Decisions

- **Retire `CameoDirector` (`.st-cameo`) and unify all character/agent corner dialogs in `DialogBox`.** `AGENT_TAUNT` events are converted by `DialogOrchestrator` into `DialogLine` items (with `AGENTS[ev.agent].name`, `AGENT_MODELS[ev.agent]`, stripped speaker prefix, and mood class) and played in `.dialog-box`. Follows Decision 4 in `requirements.md`.
- **Calm idle-only 3D head portraits.** `src/renderer/portrait.ts` eliminates `roll`, vertical `dy`, and `talkScaleY` from `HEAD_POSES` (now `IDLE_POSES` with subtle `yaw`, `pitch`, and horizontal `lookX` gaze shift), suppresses vertical `y`-axis `bob` `AnimTag`s on main bodies/heads while keeping `breathe`/`blink`/`orbit`/`pulse` and damped `jitter`, and locks `headCrop` target selection strictly to `HEAD_PART_RX` parts (e.g., `hood`, `face`, `hair`, `eye.*`) so `vibecoder`'s torso/arms/held item never shift. `src/styles/dialog.css` deletes all `.dialog-avatar[data-frame] canvas` CSS transforms. Follows Decision 5 in `requirements.md`.
- **Single ordered queue and strict right-side exclusivity in `DialogOrchestrator`.** `src/ui/dialog-orchestrator.ts` guarantees `maxConcurrent <= 1` and `maxRightConcurrent <= 1` across `DIALOG_BOX` (`priority: 'script'`) and `AGENT_TAUNT` (`'prompt'` for `kiro` or `mood === 'order'`, `'chatter'` otherwise). New `'script'` or `'prompt'` lines strip queued `'chatter'` and shorten active `'chatter'` (`shortenHold(320)`). `TUTORIAL_STEP` only updates `#tutorial-card` at bottom-right. Opening a right-side `.dialog-box` calls `hud.hideHint()`, and clicking `? Hint` calls `dialogs.onHintOpened()` which dismisses right-side dialogs. While `OBSTACLE_DIALOGUE_RENDERED` is open, `'chatter'` waits in the queue until `PUZZLE_DOOR_RESOLVED`, `ROOM_TRANSITION`, or `FLOOR_ENTERED`. Follows Decisions 6, 7, and 8 in `requirements.md`.
- **Software pixel-art filter in `portrait.ts`.** `applyPixelArtFilter` samples macro-pixel blocks (`blockPx = px >= 48 ? 2 : 1`) on `PixelBuffer`, computes neighbor-alpha/luminance contour edges, boosts saturation and contrast, applies 4×4 Bayer dithering and 16-level quantization (`DEFAULT_PIXEL_PARAMS` alignment), and overlays faint pixel-grid lines so portraits match the pixelated 3D stage while keeping animated frames distinct. Follows Decision 9 in `requirements.md`.
- **Top-left `#hero-hud` & horizontal dialog expansion.** `pages/play.html` removes `#masthead` and `#shader-dock`; `visual-lab-panel.ts` mounts `#shader-strip` only when `#shader-dock` exists while preserving `F8`/`F9`/`F10` keyboard shortcuts. `hud.ts` renders `#hero-hud` (animated Vibecoder avatar + moved `#hud-hp-cell` + collapsible `#hero-dialog-drawer`) inside `#titleblock` (or `stageWrap` when `#titleblock` is absent). `dialog-box.ts` queries `#hero-hud` dynamically at display time (since `mountDialogOrchestrator` mounts right before `mountHud`) and drives `.talking.open` / `.entering` / `.exiting` for `side === 'left'` lines, falling back to `v.root` if `#hero-hud` is absent. Follows Decisions 10 and 11 in `requirements.md`.
- **Doom/Quake HP-reactive face tiers without altering `src/procgen/`.** `HeroFaceTier` (`0 | 1 | 2 | 3 | 4 | 'ouch'`) is defined identically in `src/ui/dom-lite.ts` and `src/renderer/portrait.ts` (respecting layer isolation). `applyHeroFaceTier` clones the `ModelSpec` parts for `vibecoder.*` and adjusts eyes, brows, grimace, bruises/bandages, and KO states in CPU rasterization; `PortraitMeta` remains locked to `tier = 0, frame = 0` so crops never drift, and `npm run quality:fingerprint` stays byte-identical. Follows Decision 12 in `requirements.md`.

## Layers and gates

- No new `src/<area>/` or `pages/*.html`; `scripts/quality/check-layers.mjs` requires no changes (`src/ui/` stays Three-free; `src/play/` injects `drawPortrait`).
- No chapter or comix vocabulary change.
- `npm run quality:fingerprint` remains byte-identical because `src/procgen/` specs are unchanged.
- Gates: `node scripts/quality/check-specs.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`, `npm run quality:fingerprint`, quality gates (`tsc --noEmit`, `quality:root`, `quality:size`, `quality:layers`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:legacy-name`, `quality:brands`, `quality:props`), and `npm run build`.
