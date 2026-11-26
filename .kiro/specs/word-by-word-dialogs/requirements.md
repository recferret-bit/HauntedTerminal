# Word-by-word in-game dialogs: requirements

Status: draft

Capability: Reveal dialog text word by word across all spoken gameplay dialogs — left-side Vibecoder drawer (`#hero-dialog-drawer`), right-side NPC/AI-agent/Kiro/battle-intro corner dialog boxes (`.dialog-box`), and 3D in-room socket speech balloons (`.st-balloon`) — using a pre-sized non-reflowing box at ~60 ms per word (~16 words/s), preserving full reading hold time after the final word appears, leaving terminal input non-blocked, keeping existing audio cues unchanged (visual only), and rendering complete text immediately under `prefers-reduced-motion` ("lets make all the dialogs text to appear word by word, make it true for all in game dialogs", 2026-11-26).

## What exists today (read from the code, 2026-11-26)

- **Corner character & agent dialogs (`src/ui/dialog-box.ts`, `src/ui/dialog-orchestrator.ts`, `#hero-dialog-drawer` in `src/ui/hud.ts`):** All `DIALOG_BOX`, `AGENT_TAUNT`, and `BATTLE_STARTED` lines (taunt + Kiro advice) render via `mountDialogBox`. Both `showInHeroDrawer` (`#hero-dialog-text`) and `showInCornerBox` (`.dialog-box` `.dialog-text`) set `textContent = line.text` all at once on open, and `v.holdDeadline = Date.now() + holdMs` starts counting immediately.
- **In-room 3D socket speech balloons (`src/renderer/stage-overlay.ts`, `src/renderer/stage-event-cast.ts`):** `OBSTACLE_DIALOGUE_RENDERED` (`onDialogue`) calls `stage.overlay.balloon(...)`, which constructs `.st-balloon` with the full text string immediately at `t = 0` and sizes it via `fitBalloonText` (`src/renderer/stage-fit.ts`).
- **Adjacent surfaces kept unchanged per scope decisions:** `#tutorial-card` (`src/ui/tutorial.ts`) prompts, `#hint-dialog` (`src/ui/hint-dialog.ts`) checklists, `.st-word` / `.st-say` stage FX lettering (`src/renderer/stage-overlay.ts`), and 3D Comix cutscene narration/bubbles (`src/cinematic/page.ts`).

## Requirements

1. **Unified word-by-word reveal across spoken gameplay dialogs:**
   WHEN a spoken gameplay dialog line opens in `#hero-dialog-drawer`, `.dialog-box` (`DIALOG_BOX`, `AGENT_TAUNT`, or `BATTLE_STARTED` battle-intro taunt/advice), or `.st-balloon` (`OBSTACLE_DIALOGUE_RENDERED`), THE SYSTEM SHALL reveal its body text progressively word by word (preserving original whitespace and line breaks) rather than showing the full spoken string at `t = 0`, while keeping speaker header/name labels immediate.

2. **Pre-sized layout stability and ~60 ms/word pacing:**
   WHILE words are being revealed in `#hero-dialog-drawer`, `.dialog-box`, or `.st-balloon`, THE SYSTEM SHALL pre-size the dialog container using hidden ghost words so box width, height, `fitBalloonText`, and tail positioning never reflow or jump as words appear, advancing at ~60 ms per word (~16 words/s).

3. **Full reading hold after reveal completes:**
   WHEN word-by-word reveal starts on a timed dialog (`mountDialogBox` or `.st-balloon`), THE SYSTEM SHALL ensure the dialog's reading hold window runs for the line's full hold duration after the final word appears (bounded safely for battle-intro/chatter pacing so short lines stay readable and long lines are never truncated mid-reveal).

4. **Preemption, dismiss, and clear hygiene:**
   WHEN a dialog or socket balloon is shortened (`shortenHold`), preempted (`dismissBattleIntro`), dismissed (`dismissSide`), dropped (`drop()`), or cleared (`clear()`), THE SYSTEM SHALL cancel any active word-reveal timer/update cleanly without leaving stray DOM updates, stale ghost/shown state, or leaked timers.

5. **Existing skip controls and non-blocking terminal input:**
   WHILE a dialog is revealing word by word, THE SYSTEM SHALL keep terminal keyboard input non-blocked (never stealing keystrokes or adding click-to-skip handlers), and existing `#skip-dialog-btn`, battle-intro `Enter`, and `clear()` flows SHALL dismiss or advance immediately as before.

6. **`prefers-reduced-motion` instant display:**
   WHILE `prefers-reduced-motion: reduce` (or `stage.reducedMotion.on`) is active, THE SYSTEM SHALL display the complete spoken dialog text immediately on open with zero word-by-word delay.

7. **Visual-only reveal (unchanged audio mix):**
   WHILE words reveal in `#hero-dialog-drawer`, `.dialog-box`, or `.st-balloon`, THE SYSTEM SHALL add zero per-word typing or speech SFX blips and SHALL preserve the existing single speaker SFX triggered on dialog open.

8. **Queue invariants and clean architecture:**
   THE SYSTEM SHALL preserve `maxConcurrent === 1`, `maxRightConcurrent === 1`, chatter preemption, `.hint-note` mutual exclusion, `src/ui/` freedom from Three.js imports, pure shared word-reveal segmentation helpers with `0` `jscpd` clones, and `quality:fingerprint` byte-identity.

## Out of scope

- `#tutorial-card` prompt text (`src/ui/tutorial.ts`) and `#hint-dialog` modal checklist (`src/ui/hint-dialog.ts`).
- 3D Comix cutscene speech bubbles and captions (`src/cinematic/page.ts`).
- Stage FX onomatopoeia / status lettering (`.st-word`, `.st-say` in `src/renderer/stage-overlay.ts`).
- New key captures or click-to-fast-forward interactions on open dialogs.
- Per-word typing/speech SFX blips or ElevenLabs audio changes.

## Decisions

- **Q1:** Which dialog surfaces should reveal text word by word?
  **A (user, 2026-11-26):** All spoken gameplay dialogs: Vibecoder drawer (`#hero-dialog-drawer`), right-side NPC/agent/battle-intro dialogs (`.dialog-box`), and 3D room socket balloons (`.st-balloon`) — covers every character speech line in play while keeping UI checklists instant (`Recommended`).
- **Q2:** How should word-by-word pacing, box sizing, and reading hold time work?
  **A (user, 2026-11-26):** Pre-sized box (hidden ghost words prevent height/width jumps) at ~60 ms/word (~16 words/s), ensuring full reading hold time after the last word lands — snappy comic cadence with zero layout reflow (`Recommended`).
- **Q3:** How should skipping / fast-forwarding and `prefers-reduced-motion` behave during word-by-word reveal?
  **A (user, 2026-11-26):** Non-blocking terminal: existing Skip Dialog / battle-intro Enter / `clear()` work as today, and `prefers-reduced-motion` shows full text immediately — never steals keys from xterm (`Recommended`).
- **Q4:** Should word-by-word reveal add per-word audio blips or stay visual?
  **A (user, 2026-11-26):** Visual only (keep the existing single speaker SFX when a dialog opens) — clean audio mix with zero repetitive blip fatigue or new audio cues (`Recommended`).

## Open questions

## Verification

- Spec gate: `node scripts/quality/check-specs.mjs`
- Quality & layer gates: `npm run quality`
- Unit & DOM tests: `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/architecture-unit.mjs`
- Browser & visual QA: `node scripts/harness/screenshot-lab.mjs --selftest`, headless Chrome `/play` captures verifying progressive word-by-word reveal (with hidden pre-sized ghost span) in `#hero-dialog-drawer`, `.dialog-box.side-right`, and `.st-balloon`, plus `prefers-reduced-motion` immediate text display.
