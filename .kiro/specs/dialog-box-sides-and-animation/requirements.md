# Dialog box sides and animated avatars: requirements

Status: done (all tasks ticked and gates run 2026-11-24)

Capability: Unified corner dialog system (`.dialog-box`), permanent top-left Vibecoder status/dialog card (`#hero-hud`), calm idle-only 3D head portrait animation with pixel-art post-filtering and Doom/Quake HP-reactive face tiers, clean gameplay chrome without shader toolbar or `OUT OF CREDITS` masthead, and a `DialogOrchestrator`. In the top-left corner, `#hero-hud` replaces the removed `#masthead` block and permanently displays the animated Vibecoder avatar over the single gameplay HP bar (`#hud-hp-cell`); when `vibecoder` talks, `#hero-hud` extends horizontally to the right (`#hero-dialog-drawer`) with stepped comic animations instead of floating a separate card. NPCs and AI agents (`kiro`, `antigravy`, `codec`, `gork`, `clod`) dock in `.dialog-box.side-right` on the right (retiring `.st-cameo` / `CameoDirector`). All character portrait frames pass through a software pixel-art filter matching the stage shader and animate calmly across 4 stepped idle head poses, while `vibecoder.*` adds 5 HP-based face tiers plus a transient `'ouch'` damage expression on a cloned spec (`quality:fingerprint` stays byte-identical). The on-screen CRT/PIXEL/INK/STORM toolbar (`#shader-dock` / `#shader-strip`) is removed from gameplay UI while preserving `F8`/`F9`/`F10` keyboard shortcuts. A single `DialogOrchestrator` (`src/ui/dialog-orchestrator.ts`) schedules one ordered conversation queue across both sides (`maxConcurrent === 1`, `maxRightConcurrent === 1`).

User's words, 2026-11-23: "lets make a rule, put it to the specs. vibecoder avatar and dialogs of left side, npc's are on the right. all avatars has to ahve animated heads. dialogs and avatars must appear and disappear with animation."
User's words, 2026-11-24: "i dont like current in game avatars and dialogs. first, animation in the avatar is bad. vibecoder shaking or jumping, same for kiro. i just want to see its head animated, like their idle animation; also, there is 2 type of kiro ghost animated dialogs, has to be one. make it a system, only one dialog on the right side could be active at a time. add some dialog manager or orchestrator and refactor all current dialogs properly;"
User's words, 2026-11-24: "looks like pixel filter is not applied to the dialogs. also, lets remove crt/pixel/ink/storm buttons from the gameplay, remove OUR OF CREDITS top left block from the gameplay UI; Put the vibecoder avatar on it, add HP bar below the avatar. when videboder is talking > extend his avatar block to show the text dialog. Also, lets add a new feature like in old quake/doom that changes the face visuals based on HP left."

## Requirements

1. WHEN a dialog line is spoken by `vibecoder`, THE SYSTEM SHALL dock `.dialog-box` on the left side of the stage (`side-left`) with the avatar on the left of the dialog body.
2. WHEN a dialog line is spoken by any NPC or agent (any speaker other than `vibecoder`, such as `kiro`, `antigravy`, `codec`, `gork`, or `clod`), THE SYSTEM SHALL dock `.dialog-box` on the right side of the stage (`side-right`) with the avatar on the right of the dialog body.
3. WHEN either `DIALOG_BOX` or `AGENT_TAUNT` is dispatched during play, THE SYSTEM SHALL render it through the single unified `.dialog-box` component (removing `.st-cameo` / `CameoDirector`), so Kiro Ghost and all AI agents have one unified animated dialog presentation.
4. WHILE an avatar is displayed in `.dialog-box`, THE SYSTEM SHALL animate only a calm 4-pose idle head cycle in `drawPortrait` (sampling the model's authored idle `AnimTag`s with vertical body/head `bob` suppressed, plus subtle head-only yaw/pitch and horizontal eye gaze `lookX` around the head/center pivot, with zero roll, zero vertical `dy`, zero vertical stretch `talkScaleY`, and zero CSS canvas transforms).
5. WHEN a dialog line and its avatar appear or finish holding, THE SYSTEM SHALL play a stepped comic entrance animation (~220 ms) on appear and a stepped comic exit animation (~180 ms) before advancing or hiding `.dialog-box`, while `clear()` resets immediately.
6. THE SYSTEM SHALL orchestrate all corner dialogs via `DialogOrchestrator` (`src/ui/dialog-orchestrator.ts`) using a single ordered conversation queue across `side-left` and `side-right` (`maxConcurrent === 1`, `maxRightConcurrent === 1`) with priority tiers (`'script'`, `'prompt'`, `'chatter'`), consecutive duplicate suppression, a chatter queue cap, and preemption of stale `'chatter'` when `'script'` or `'prompt'` lines arrive.
7. WHILE a right-side `.dialog-box.side-right` is open, THE SYSTEM SHALL keep `#tutorial-card` as a silent bottom-right command objective badge (no top-right cameo on `TUTORIAL_STEP`), SHALL automatically close `.hint-note` (`hud.hideHint()`) when a right-side dialog opens, and SHALL dismiss any active/queued right-side dialog when the player opens `.hint-note` (`? Hint`).
8. WHILE a 3D in-room socket speech balloon (`.st-balloon` from `OBSTACLE_DIALOGUE_RENDERED`) is open, THE SYSTEM SHALL hold queued `'chatter'` lines and shorten active `'chatter'` in `DialogOrchestrator`, resuming once the socket puzzle resolves or the room transitions.
9. THE SYSTEM SHALL keep `src/ui/` free of Three.js imports (passing `drawPortrait` from `src/renderer/portrait.ts` via `src/play/`) and leave `npm run quality:fingerprint` byte-identical.
10. WHILE any character or item portrait canvas is rendered in `drawPortrait`, THE SYSTEM SHALL apply a software pixel-art post-filter matching the stage pixel shader (macro-pixel block downsampling, ordered 4×4 Bayer dithering, color-level quantization, neighbor edge contour darkening, saturation/contrast boost, and subtle pixel grid lines) so portraits share the stage's pixelated look while preserving distinct animated idle frames.
11. THE SYSTEM SHALL remove the on-screen `CRT` / `PIXEL` / `INK` / `STORM` toolbar (`#shader-dock` / `#shader-strip`) from gameplay UI (`pages/play.html`, `src/ui/visual-lab-panel.ts`, `src/renderer/stage-avoid.ts`) while keeping `F8` / `F9` / `F10` keyboard shortcuts functional.
12. THE SYSTEM SHALL remove `<header id="masthead">` (`OUT OF CREDITS`) from `pages/play.html`, replace it in `#titleblock` with a permanent `#hero-hud` block displaying the animated Vibecoder avatar above a matching-width HP bar (`#hud-hp-cell`, removed from top-right `#hud`), and WHILE `vibecoder` speaks (`side === 'left'`), extend `#hero-hud` horizontally to the right (`#hero-dialog-drawer`) with `VIBECODER` anchored in its top-left corner and stepped comic entrance/exit animations to display his dialog text.
13. WHILE the player's HP changes or `PLAYER_DAMAGED` occurs during play, THE SYSTEM SHALL switch both `vibecoder.*` portraits and the live 3D stage `vibecoder` actor model across 5 HP-based Doom/Quake face tiers (`0`: 80–100%, `1`: 60–79%, `2`: 40–59%, `3`: 20–39%, `4`: <20% or 0 HP) plus a transient ~600 ms `'ouch'` expression on damage, modifying only a cloned `ModelSpec` via `applyHeroFaceTier` in `src/renderer/portrait.ts`.

## Out of scope

- Moving 3D in-room socket speech balloons (`.st-balloon` on `OBSTACLE_DIALOGUE_RENDERED`) or `#tutorial-card` into the corner `.dialog-box` queue.
- Changing 3D model geometry in `src/procgen/` or altering `quality:fingerprint` hashes.
- Modifying `<dialog>` waitlist UI on the landing pages.

## Decisions

- **Q:** Which dialog surfaces should follow the left (`vibecoder`) vs. right (NPC/agent) placement rule?
  **A (user, 2026-11-23):** Corner `DialogBox` (`.dialog-box`): Vibecoder docks top-left (avatar on left), NPCs/agents dock top-right (avatar on right), while 3D room socket bubbles stay on their in-room actors (Recommended).
- **Q:** How should the animated avatar heads be rendered?
  **A (user, 2026-11-23):** Multi-frame software-rasterized 3D head poses from `ModelCatalog` (cached 3–4 frame cycle) (Recommended).
- **Q:** How should the appear and disappear animations behave across queued dialog lines?
  **A (user, 2026-11-23):** Full stepped comic slide + avatar pop on every line (enter: slide in from its side edge + avatar pop ~220ms; exit: animate out toward its side edge ~180ms before the next line or close) (Recommended).
- **Q:** How should we unify the two animated Kiro/agent dialog types (`.dialog-box` vs `.st-cameo`)?
  **A (user, 2026-11-24):** Merge `CameoDirector` (`.st-cameo`) into `DialogBox` (`.dialog-box`) so `DIALOG_BOX` and `AGENT_TAUNT` both use the same corner comic dialog box and head portrait; removes duplicate Kiro dialog styles (Recommended).
- **Q:** How should the avatar head idle animation work in `portrait.ts` and `dialog.css`?
  **A (user, 2026-11-24):** Remove all CSS canvas transforms and vertical jump/squash; sample the model's authored idle `AnimTag`s plus a subtle head-only idle yaw/nod around the neck pivot in a fixed crop; lively head without shaking (Recommended).
- **Q:** How should the Dialog Orchestrator enforce "only one dialog on the right side active at a time" across character dialogs, `#tutorial-card`, and `.hint-note`?
  **A (user, 2026-11-24):** Route all character/agent lines (`DIALOG_BOX`, `AGENT_TAUNT`) through one right-side dialog slot, keep `#tutorial-card` as a silent bottom-right command objective badge (no top-right cameo), and auto-close `.hint-note` when a right dialog opens; keeps command goal visible with one right dialog (Recommended).
- **Q:** How should the Dialog Orchestrator schedule left-side (`vibecoder`) vs. right-side (`kiro`/NPC/agent) dialogs?
  **A (user, 2026-11-24):** Single ordered conversation queue across both sides (only one dialog box active at a time, docking left for vibecoder and right for NPCs/agents, with priority preemption for new prompts over stale chatter); clean turn-taking conversation (Recommended).
- **Q:** How should the Dialog Orchestrator handle in-room socket speech balloons (`OBSTACLE_DIALOGUE_RENDERED` / `cat *.sock`)?
  **A (user, 2026-11-24):** Keep 3D room socket speech balloons (`.st-balloon` on intercom/hub sockets) anchored to their room props, coordinated by the orchestrator so right-side agent chatter yields while a socket balloon is open; preserves in-room socket riddles (Recommended).
- **Q:** How should the pixel filter be applied to dialog avatars and the permanent Vibecoder portrait?
  **A (user, 2026-11-24):** Apply a software pixel-art post-filter inside `portrait.ts` matching `DEFAULT_PIXEL_PARAMS` (macro-pixel blocks, 4×4 Bayer dithering, quantization, edge contour darkening, subtle grid) directly to portrait pixel buffers (Recommended).
- **Q:** Should `F8`/`F9`/`F10` shader shortcuts remain after removing the `CRT`/`PIXEL`/`INK`/`STORM` buttons from gameplay?
  **A (user, 2026-11-24):** Remove `#shader-dock` / `#shader-strip` toolbar buttons from gameplay UI while preserving `F8`/`F9`/`F10` keyboard shortcuts (Recommended).
- **Q:** How should `#hero-hud`, the relocated HP bar, and Vibecoder's talking state behave?
  **A (user, 2026-11-24):** Replace `#masthead` with `#hero-hud` (avatar over `#hud-hp-cell`, removed from top-right `#hud`), and extend `#hero-hud` horizontally rightwards (`#hero-dialog-drawer`) with stepped comic animations whenever `vibecoder` talks (Recommended).
- **Q:** How should Doom/Quake HP-reactive face visuals work for Vibecoder?
  **A (user, 2026-11-24):** Modify a cloned `ModelSpec` in `portrait.ts` across 5 HP percentage tiers (`0..4`: 80–100%, 60–79%, 40–59%, 20–39%, <20%/0 HP) plus a ~600 ms `'ouch'` hurt state on `PLAYER_DAMAGED`, keeping `src/procgen/` untouched and `quality:fingerprint` byte-identical (Recommended).

## Open questions

## Verification

- Req 1–8: Unit/DOM tests in `scripts/harness/terminal-lab-unit.mjs` verifying `rasterPortraitFrame` idle head poses (animated head pixels, zero vertical jump/crop drift, static items), `mountDialogBox` enter/hold/exit lifecycle, and `mountDialogOrchestrator` (unified `DIALOG_BOX` + `AGENT_TAUNT` routing, `maxConcurrent === 1`, `maxRightConcurrent === 1`, consecutive duplicate suppression, priority preemption, `TUTORIAL_STEP` non-cameo routing, `.hint-note` mutual exclusion, and `OBSTACLE_DIALOGUE_RENDERED` chatter yielding).
- Req 10–13: Unit/DOM tests in `scripts/harness/terminal-lab-unit.mjs` verifying `heroFaceTierForHp`, distinct pixel-filtered portrait buffers across tiers `0..4` and `'ouch'` with macro-pixel block coherence, `#hero-hud` horizontal drawer expansion on left-side `vibecoder` lines with `#hud-hp-cell` nested in `#hero-hud`, and absence of `#masthead` / `#shader-dock` in `pages/play.html` gameplay HUD.
- Req 9: `npm run quality` subset (`tsc --noEmit`, `quality:root`, `quality:size`, `quality:layers`, `quality:declarative`, `quality:specs`, `quality:dup`, `quality:agents`, `quality:legacy-name`, `quality:brands`, `quality:props`), `npm run quality:fingerprint` (byte-identical), `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`, and `npm run build`.
