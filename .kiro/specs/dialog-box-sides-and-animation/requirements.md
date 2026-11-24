# Dialog box sides and animated avatars: requirements

Status: done (all tasks ticked and gates run 2026-11-23)

Capability: Rules for dialog box placement and avatar/dialog animation. In the corner dialog box (`.dialog-box`), the vibecoder's avatar and dialog appear on the left side of the stage (avatar on the left), while NPCs and AI agents appear on the right side of the stage (avatar on the right). All dialog avatars render an animated head using a cached multi-frame software-rasterized 3D head pose cycle from `ModelCatalog` stepped at 8–12 fps plus comic bob in the avatar frame. Every dialog line and its avatar play a stepped comic entrance animation on appear (~220ms) and an exit animation on disappear (~180ms) before the next line or close, and a right-side dialog box stacks cleanly without overlapping top-right stage cameos (`.st-cameo`).

User's words, 2026-11-23: "lets make a rule, put it to the specs. vibecoder avatar and dialogs of left side, npc's are on the right. all avatars has to ahve animated heads. dialogs and avatars must appear and disappear with animation."

## Requirements

1. WHEN a `DIALOG_BOX` line is spoken by `vibecoder`, THE SYSTEM SHALL dock the `.dialog-box` on the left side of the stage (`side-left`) with the avatar on the left of the dialog body.
2. WHEN a `DIALOG_BOX` line is spoken by any NPC or agent (any speaker other than `vibecoder`, such as `kiro`, `antigravy`, `codec`, `gork`, or `clod`), THE SYSTEM SHALL dock the `.dialog-box` on the right side of the stage (`side-right`) with the avatar on the right of the dialog body.
3. WHILE an avatar is displayed in a dialog box, THE SYSTEM SHALL animate the avatar's head by cycling through cached software-rasterized 3D head poses from `ModelCatalog` (3–4 head turn/tilt/talk frames stepped at 8–12 fps) combined with a stepped comic bob in the avatar frame.
4. WHEN a dialog line and its avatar appear, THE SYSTEM SHALL play a stepped comic entrance animation (~220ms slide-in from its docked side edge and avatar pop).
5. WHEN a dialog line's hold duration ends (before showing the next queued line or closing the box), THE SYSTEM SHALL play a stepped comic exit animation (~180ms slide-out toward its docked side edge and avatar shrink/exit) before advancing or hiding `.dialog-box`, while `clear()` (on level change) resets immediately.
6. WHILE a right-side `.dialog-box` (`side-right`) is open, THE SYSTEM SHALL position top-right stage cameos (`.st-cameo` in `CameoDirector`) below the open right-side dialog box so the two never overlap.
7. THE SYSTEM SHALL keep `src/ui/` free of Three.js imports (passing the portrait frame generator from `src/renderer/portrait.ts` via `src/play/`) and leave `npm run quality:fingerprint` byte-identical.

## Out of scope

- Moving 3D in-room socket speech balloons (`OBSTACLE_DIALOGUE_RENDERED`) or `#tutorial-card` to a different side.
- Merging `CameoDirector` (`.st-cameo`) into `.dialog-box`.
- Changing 3D model geometry in `src/procgen/` or altering `quality:fingerprint` hashes.

## Decisions

- **Q:** Which dialog surfaces should follow the left (`vibecoder`) vs. right (NPC/agent) placement rule?
  **A (user, 2026-11-23):** Corner `DialogBox` (`.dialog-box`): Vibecoder docks top-left (avatar on left), NPCs/agents dock top-right (avatar on right), while 3D room socket bubbles stay on their in-room actors (Recommended).
- **Q:** How should the animated avatar heads be rendered?
  **A (user, 2026-11-23):** Multi-frame software-rasterized 3D head poses from `ModelCatalog` (cached 3–4 frame head turn/tilt/talk cycle stepped at 8–12 fps) plus comic bob in the avatar frame (Recommended).
- **Q:** How should the appear and disappear animations behave across queued dialog lines?
  **A (user, 2026-11-23):** Full stepped comic slide + avatar pop on every line (enter: slide in from its side edge + avatar pop ~220ms; exit: animate out toward its side edge ~180ms before the next line or close) (Recommended).
- **Q:** How should a right-side NPC dialog box coordinate with top-right stage cameos (`.st-cameo`)?
  **A (user, 2026-11-23):** Stack without overlap: right-side dialog box sits at top-right below the HUD bar, and any active stage cameo shifts below it (or waits until the dialog box closes) (Recommended).

## Open questions

## Verification

- Req 1, 2, 3, 4, 5: Unit and DOM tests of `mountDialogBox` and `drawPortraitFrames` verifying `side-left` (`vibecoder`) vs. `side-right` (NPC/agent) placement, multi-frame head animation cycling, and `entering` -> `open` -> `exiting` lifecycle transitions before the next queued line or close.
- Req 6: Stage cameo layout check verifying `.st-cameo` top offset clears an open `.dialog-box.side-right`, plus `node scripts/harness/visual-audit.mjs --screens level-01` (zero overlap detector flags).
- Req 7: `npm run quality` (`tsc --noEmit`, `quality:layers`, `quality:specs`, `quality:dup`, `quality:props`), `npm run quality:fingerprint` (byte-identical), and `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`.
