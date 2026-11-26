# Laptop Item & Lab: design

## Pieces

```
src/procgen/archetypes/items/
  laptop.ts           buildLaptop(seed): Clamshell briefcase model with grip socket
src/procgen/archetypes/
  vibecoder.ts        mounts laptop to hand, registers vibecoder.dev_laptop (no sockets.lantern)
src/laptop/
  domain/             pure machine, desktop reducer, checks, tasks, keyboard, boot, geometry, progress
  runtime/            runner (Worker + sandboxed iframe), loop-guard (AST-free lexer), bridge, sound
  ui/                 laptop-view (CSS 3D), keyboard-view, trackpad-view, boot-view, desktop-view, apps/
  lab/                startLaptopLab(): /laptop-lab test bench
pages/laptop-lab.html HTML entry for the laptop test bench
src/styles/           laptop.css, laptop-lab.css
```

## Decisions

- **Inward layering.** `domain/` (0 imports) $\leftarrow$ `runtime/` $\leftarrow$ `ui/` $\leftarrow$ `lab/`. Player code never runs in the host page's realm.
- **Run cancellation & timeout safety (B1 fix).** `renderPage` tracks an active cancellation controller or token per `PreviewSlot`. Initiating a new run immediately cancels any in-flight timeout from a prior run, preventing false timeouts, spurious `STOPPED_PAGE` displays, and lingering `hung = true` states.
- **Stage light omission (B2 fix).** `vibecoder.dev_laptop` defines no `sockets.lantern`. Stage lighting treats hero light as null when held.
- **Window placement clamping (B4 fix).** `open` action in `reduceDesktop` clamps initial window coordinates within `[0, SCREEN.w - w]` and `[0, SCREEN.h - h]` to prevent wide apps like Web Weaver from overflowing screen borders.
- **Trackpad styling & input release (B5 fix).** `laptop.css` includes `.lt-trackpad.scrolling .lt-finger` to display scroll offset. Trackpad button states release on window blur or pointer cancel.
- **Safe object formatting (B6 fix).** `fmt()` in `bridge.ts` wraps property reads in `try/catch` to safely format objects with restricted cross-origin properties (such as `window` or `document`).

- **Chapter acquisition (`PickupType` `'laptop'`).** Chapter 1 places `pickup_l6_laptop` in Level 6 (`level-06-task-logic-purge`) alongside `script.locks` for `edit` and `sed` until `has_item laptop`; `collectPickupNode` (`session-fs.ts`) gives and holds `'laptop'`, `manifest.grants` (`afterLevel: 6`) carries it into Levels 7+, and `session-level.ts` applies cumulative grants on level transitions.

## Layers and gates

- Gates: `node scripts/harness/laptop-unit.mjs`, `node scripts/harness/laptop-lab-smoke.mjs`, `validate-model.mjs item.laptop vibecoder.dev_laptop --seeds 4`, `npm run quality:fingerprint`, `npm run quality`, `node scripts/harness/generate-chapter.mjs --verify --ticks 3`.
