# Dialog box sides and animated avatars: design

## Pieces

```
artist              src/renderer/portrait.ts         drawPortrait(modelId, px, frame?): 4-frame cached software-rasterized 3D head pose cycle (PORTRAIT_FRAMES = 4) using animPoseAt + animRotateAboutPivot around the head/body pivot, cropped with frame 0's bounding box so the head turns/tilts/talks cleanly inside the 64x64 frame
                    src/renderer/stage-cameos.ts     CameoDirector.update includes any open .dialog-box.side-right in chromeBottom so top-right stage cameos stack below an open right-side dialog box without overlap
terminal-designer   src/ui/dom-lite.ts               DrawPortrait accepts optional frame?: number; PORTRAIT_FRAMES = 4
                    src/ui/dialog-box.ts             side-left (vibecoder) vs side-right (NPC/agent) classes, 10 fps stepped head frame cycling (drawPortrait(model, 64, frame) + data-frame attribute), and entering (220ms) -> open (holdMs) -> exiting (180ms) lifecycle before advancing or closing (clear() resets immediately)
lead-dev            src/styles/dialog.css            .dialog-box.side-left (left: 10px, row) vs .dialog-box.side-right (right: 10px, row-reverse, under #hud when needed), stepped @keyframes for enter/exit slide and avatar pop/bob
                    .kiro/steering/glossary.md       update "Dialog box" definition to state left (vibecoder) vs right (NPC/agent) placement, animated head portraits, and enter/exit animations
qa                  scripts/harness/                 unit/DOM tests for left/right placement, multi-frame portrait cache, enter/hold/exit lifecycle, and cameo non-overlap
```

## Decisions

- **Left vs. right docking is driven by `line.speaker === 'vibecoder'`.** `mountDialogBox` tags `.dialog-box` with `side-left` when `line.speaker === 'vibecoder'` and `side-right` for every other speaker (`kiro`, `antigravy`, `codec`, `gork`, `clod`, or any future NPC/agent). CSS uses `left: 10px; right: auto; flex-direction: row` for `side-left` (avatar on the left) and `right: 10px; left: auto; flex-direction: row-reverse` for `side-right` (avatar on the right). 3D room socket bubbles (`OBSTACLE_DIALOGUE_RENDERED`) and `#tutorial-card` remain unchanged. Follows Decision 1 in `requirements.md`.
- **Multi-frame 3D head animation is rasterized in `src/renderer/portrait.ts` with zero WebGL or procgen catalog changes.** `drawPortrait(modelId, px, frame = 0)` caches 4 frames (`0..3`) per `(modelId, size)`. Frame 0 is the rest pose and locks the square crop `{ sx, sy, side }`. Frames `1..3` clone the `ModelSpec` parts in memory, evaluate each part's `anim` tag via `animPoseAt`, and apply a 3D head yaw/pitch/roll + talk offset around the head pivot via `animRotateAboutPivot` (targeting upper head parts on tall humanoid `headCrop` models and the full character around its eye/body pivot on compact/hover models like `npc.kiro_ghost` and `agent.*`). Because `ModelCatalog` entries are untouched, `npm run quality:fingerprint` stays byte-identical, and `src/ui/` remains Three-free. Alternative rejected: CSS-only transform on a single static raster, which lacks 3D head pose frames. Follows Decision 2 in `requirements.md`.
- **Every queued line plays a full stepped entrance (`entering`, 220 ms) and exit (`exiting`, 180 ms).** `DialogBox` runs a 3-phase timer per line: `entering` (220 ms, `.dialog-box.open.entering` sliding in from its docked edge in 4 comic steps while `.dialog-avatar` pops in) -> `hold` (`line.holdMs`, cycling the 4 head frames every 100 ms / 10 fps with a stepped 1–2 px comic bob) -> `exiting` (180 ms, `.dialog-box.open.exiting` sliding out toward its docked edge in 3 comic steps while the avatar shrinks/tilts out). When `exiting` finishes, `next()` starts the next queued line or `close()` hides the box. `clear()` cancels all timers and closes immediately on level changes. Alternative rejected: keeping the box open across consecutive lines without exit/enter. Follows Decision 3 in `requirements.md`.
- **Right-side dialog boxes and top-right stage cameos stack without overlap.** A `.dialog-box.side-right` sits at the top-right below `#topbar` / `#hud`, and `CameoDirector.update` (`src/renderer/stage-cameos.ts`) includes `.dialog-box.side-right.open` in its `chromeBottom` measurement so any active `.st-cameo` automatically shifts 10 px below the open right-side dialog box. Alternative rejected: suppressing cameos while a right-side dialog box is open. Follows Decision 4 in `requirements.md`.

## Layers and gates

- No new `src/<area>/` or `pages/*.html`; `scripts/quality/check-layers.mjs` does not change (`src/renderer/portrait.ts` imports `procgen`, `src/ui/` imports no Three.js, `src/play/` injects `drawPortrait`).
- No chapter or comix vocabulary change (`DIALOG_BOX` event shape is unchanged).
- `npm run quality:fingerprint` remains byte-identical because no model, texture, or FX spec in `src/procgen/` is modified.
- Gates: `node scripts/quality/check-specs.mjs`, `npm run quality`, `npm run quality:fingerprint`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, and `node scripts/harness/editor-smoke.mjs`.
