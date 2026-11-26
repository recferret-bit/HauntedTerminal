# Word-by-word in-game dialogs: design

Status: see requirements.md

Follows [requirements.md](./requirements.md) (`Status: requirements-approved`). Covers requirements 1–8 without modifying chapter/comix/lab schemas, Three.js models (`quality:fingerprint`), audio catalogs, or out-of-scope UI surfaces.

## Overview & Flow

1. **Shared layer-safe primitive (`src/contracts/word-reveal.ts`):**
   - `WORD_REVEAL_STEP_MS = 60` (~16.7 words/s) and `MIN_POST_REVEAL_HOLD_MS = 900`.
   - `wordRevealEnds(text: string): number[]` scans `/\S+/g` end offsets so slicing `text.slice(0, cut)` and `text.slice(cut)` preserves exact spaces, punctuation, and `\n` line breaks.
   - `mountWordReveal(host: HTMLElement, text: string)` sets `host.textContent = text`, then replaces children with `<span class="word-reveal-shown">` and `<span class="word-reveal-ghost" aria-hidden="true">` (`ghost.style.visibility = 'hidden'`). In real browsers, the hidden ghost span reserves the exact wrapped box width and height from frame 0 (preventing height jumps and balloon tail shift) while keeping `host.textContent === text` for `aria-live="polite"` screen readers; in `withFakeDom` harnesses, `host.textContent` stays equal to `text` while `.word-reveal-shown` and `.word-reveal-ghost` expose exact progressive word slices. Returns `{ wordCount, showWords(n), atMs(ms, stepMs), showAll() }`.
   - `planWordReveal(wordCount, holdMs, opts?: { instant?: boolean; maxHoldMs?: number })` computes `{ stepMs, holdMs, revealMs }`:
     - When `instant` is true (`prefers-reduced-motion` / `stage.reducedMotion.on`) or `wordCount <= 1`: `stepMs = 0`, `revealMs = 0`, `holdMs` unchanged (full text shown immediately on frame 0).
     - Word 1 is visible immediately at `t = 0` (`revealMs = (wordCount - 1) * stepMs`).
     - For standard gameplay durations (`holdMs >= 1000`): uses `stepMs = 60` and `holdMs = Math.max(holdMs, revealMs + MIN_POST_REVEAL_HOLD_MS)`, clamped to `maxHoldMs` when provided (such as `BATTLE_LINE_MS = 4800` for battle-intro lines so the two-line intro stays inside `INTRO_SEC = 10 s`, tightening `stepMs` only if needed to fit inside `maxHoldMs`). Normal chapter/taunt lines (`4800..11780 ms`) preserve their exact authored timing without drifting past scripted `afterSec` beats, while long lines with shorter holds gain a full post-reveal reading window.
     - For sub-second synthetic durations (`0 < holdMs < 1000`, e.g. fast unit tests): preserves `holdMs` and compresses `stepMs` (`Math.min(60, Math.max(10, Math.floor((holdMs * 0.6) / (wordCount - 1))))`) so every word reveals progressively before exit without slowing fast test suites.
   - `isReducedMotionPreferred(): boolean` safely reads `window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false`.

2. **Corner & Hero-Drawer Dialogs (`src/ui/dialog-box.ts`, `src/ui/dialog-orchestrator.ts`, `src/play/input.ts`):**
   - Extend `DialogLine` with optional `maxHoldMs?: number` (set to `BATTLE_LINE_MS` for `BATTLE_STARTED` taunt + advice lines in `src/ui/dialog-orchestrator.ts`).
   - Extend `DialogBoxOptions` and `DialogOrchestratorOptions` with optional `reducedMotion?: () => boolean` (wired in `src/play/input.ts` as `() => play.stage.reducedMotion.on`, defaulting to `isReducedMotionPreferred()`).
   - Add `wordTimer: number` to `DialogView` (`src/ui/dialog-box.ts`), cleared inside `stopTimers(v)` so `clear()`, `dismissSide()`, `beginExit()`, and `advanceQueue()` never leak timers or mutate a closed/replaced dialog.
   - Inside `advanceQueue(v)`, both `showInHeroDrawer` (`#hero-dialog-text`) and `showInCornerBox` (`.dialog-text`) mount `mountWordReveal` with `planWordReveal(...)`: when `instant`, call `showAll()`; otherwise step word count `shown = 1 -> 2 -> ... -> wordCount` via `setInterval` at `stepMs` (clearing `wordTimer` once all words are shown), and schedule `v.holdTimer` for the planned `holdMs`. Speaker headers (`hero.name`, `v.name`) and avatars remain immediate.

3. **In-Room 3D Socket Speech Balloons (`src/renderer/stage-overlay.ts`, `src/renderer/stage-event-cast.ts`):**
   - Extend `StageOverlay.balloon(speaker, text, style, at, life, opts?: { instant?: boolean })` (`src/renderer/stage-overlay.ts`):
     - Render the speaker badge (`<b>speaker</b>`) immediately and mount the body string into `<span class="st-balloon-text">` via `mountWordReveal`.
     - Compute `{ stepMs, holdMs }` via `planWordReveal(reveal.wordCount, life, { instant: opts?.instant ?? isReducedMotionPreferred() })`, passing `holdMs` as the overlay item lifetime `life`.
     - If `instant` (or `wordCount <= 1`), call `reveal.showAll()`; otherwise drive `reveal.atMs(ms, stepMs)` from `render: (_t, ms) => ...` on the stage clock (zero separate intervals, completely deterministic under `__stage.advance(ms)`). Because `.word-reveal-ghost` is mounted before `add()`, `fitBalloonText` and tail offset measure final wrapped geometry once with zero resize/reflow.
   - Pass `{ instant: stage.reducedMotion.on }` from `onDialogue` in `src/renderer/stage-event-cast.ts`.

## Pieces

| File | Responsibility | Size impact | Owner |
|---|---|---|---|
| `src/contracts/word-reveal.ts` (new) | Pure word-boundary slicing, ghost-span DOM helper, pacing/hold planner, media-query helper | ~90 lines (`<= 600`) | `lead-dev` |
| `src/ui/dialog-box.ts` | Mount word reveal in `#hero-dialog-text` & `.dialog-text`, `wordTimer` lifecycle + teardown, reduced motion | 336 -> ~375 lines (`<= 600`) | `terminal-designer` |
| `src/ui/dialog-orchestrator.ts` | Forward `reducedMotion` option, set `maxHoldMs: BATTLE_LINE_MS` on `BATTLE_STARTED` lines | 240 -> ~250 lines (`<= 600`) | `terminal-designer` |
| `src/play/input.ts` | Wire `reducedMotion: () => play.stage.reducedMotion.on` into `mountDialogOrchestrator` | ~385 -> ~387 lines (`<= 600`) | `lead-dev` |
| `src/renderer/stage-overlay.ts` | Drive `.st-balloon-text` word-by-word from stage clock in `balloon()`, pre-sized via ghost span | 536 -> ~550 lines (`<= 600`) | `artist` |
| `src/renderer/stage-event-cast.ts` | Pass `{ instant: stage.reducedMotion.on }` on `OBSTACLE_DIALOGUE_RENDERED` | 199 -> ~202 lines (`<= 600`) | `artist` |
| `scripts/harness/architecture-unit.mjs` | Unit tests for `wordRevealEnds`, `planWordReveal`, and `mountWordReveal` ghost/shown slicing | +35 lines | `lead-dev` |
| `scripts/harness/terminal-lab-unit.mjs` | DOM tests for `#hero-dialog-text` & `.dialog-box` progressive word reveal, instant reduced motion, timer cleanup on `clear()` | ~1753 -> ~1805 lines | `terminal-designer` |

## Decisions

- **Layer-safe shared primitive in `src/contracts/word-reveal.ts` (covers Req 1, 2, 3, 6, 8):** Follows `.kiro/steering/architecture.md` where `src/contracts/dom.ts` already provides layer-safe DOM helpers shared by `ui/` and `renderer/` (since `renderer/` cannot import `ui/` and `jscpd` forbids duplicate helpers). Putting `word-reveal.ts` in `contracts/` gives zero clones and zero new layer edges (`check-layers.mjs` stays unchanged). *Rejected:* duplicating word split/ghost DOM code separately inside `src/ui/dialog-box.ts` and `src/renderer/stage-overlay.ts` (would trip `quality:dup` / `jscpd`).
- **Pre-sized box via inline hidden `.word-reveal-ghost` span (covers Req 2, 5, 8):** Mirrors `.htc-caption`'s proven ghost-text pattern (`src/cinematic/page.ts`): `<span class="word-reveal-shown">` + `<span class="word-reveal-ghost" aria-hidden="true" style="visibility: hidden">` keeps `offsetWidth`, `offsetHeight`, line wrapping, `fitBalloonText`, and balloon tails fixed from frame 0 while leaving full `textContent` intact for screen readers (`aria-live="polite"`). Inline `style.visibility = 'hidden'` on `.word-reveal-ghost` also avoids CSS coupling across `dialog.css` and `stage-overlay.css` (`check-deadcode` CSS checks stay clean). *Rejected:* mutating plain `textContent` directly (causes box height jumps, multiline line-wrap reflow, and `.st-balloon` tail jitter).
- **Stage-clock `atMs(ms)` for `.st-balloon` vs interval timers for `mountDialogBox` (covers Req 1, 3, 4, 6):** `.st-balloon` lives inside `StageOverlay.update(dtMs)`, so driving `reveal.atMs(ms, stepMs)` from `render` keeps balloon word timing synchronized with `stage.clockMs` and deterministic under `__stage.advance(ms)`. Meanwhile `mountDialogBox` already runs wall-clock `setTimeout`/`setInterval` (`ENTER_MS`, `HEAD_FRAME_MS`, `EXIT_MS`), so a managed `wordTimer` cleared in `stopTimers()` matches its existing lifecycle and works standalone in DOM unit tests. *Rejected:* driving `mountDialogBox` from Three.js stage frames (couples `src/ui/` to the WebGL stage).
- **Audio, input, and out-of-scope boundaries preserved (covers Req 5, 7, 8):** `src/audio/sfx-kernel.ts` already plays a single speaker cue on `DIALOG_BOX` / `AGENT_TAUNT`, so zero audio edits are needed. `mountDialogBox` retains `pointer-events: none` and attaches zero key/click blockers, and `src/ui/tutorial.ts`, `src/ui/hint-dialog.ts`, `.st-word`/`.st-say`, and `src/cinematic/page.ts` stay untouched per Q1. Note `stage-selfcheck.ts` sits at 588/600 lines, so automated tests go in `architecture-unit.mjs` and `terminal-lab-unit.mjs` while headless Chrome QA verifies real `.st-balloon`, `.dialog-box`, and `#hero-dialog-drawer` rendering.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Unchanged (`ui/` and `renderer/` and `play/` already import `contracts/`; `src/ui/` imports zero Three.js).
- **Schemas, specs, and assets:** Zero changes to chapter/comix/Terminal Lab schemas, `vite.config.ts`, `public/sfx/`, or `src/procgen/` (`npm run quality:fingerprint` stays byte-identical).
- **Gates:** `node scripts/quality/check-specs.mjs`, `npm run quality`, `npm run test`, `npm run build`, `npm run quality:fingerprint`, `node scripts/harness/screenshot-lab.mjs --selftest`, and headless Chrome `/play` checks.
