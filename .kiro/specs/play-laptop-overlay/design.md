# Play laptop overlay: design

Status: see requirements.md

## Pieces

```
src/laptop/app-bus.ts          NEW. laptopHear(bus: AppBus): (action: string) => void. The mapping the Laptop Lab has
                               today (fan-on/off -> lap_fan loop, key-* -> key events, the rest -> { kind: 'laptop', action }),
                               moved out of lab-page.ts so the lab and /play share one copy (Req 6).
src/laptop/lab/lab-page.ts     uses laptopHear(page.bus) instead of its own copy. No behaviour change.
src/play/laptop.ts             NEW. The overlay: openLaptop(play), closeLaptop(play), isLaptopOpen(play).
                               open: refuses unless phase 'play', lifecycle.canOpenManualOrMap() and 'laptop' carried (Req 1, 2);
                               closeOtherModals(play, 'laptop'); builds div.laptop-overlay > div.laptop-overlay-panel + Close
                               button appended to document.body (fixed, full window: covers stage and terminal); mountLaptop(panel, { start: 'closed', speed: 1,
                               muted: snapshot.muted, storageKey, hear: laptopHear(bus) }); blurs the terminal (Req 3).
                               storageKey = 'out-of-credits:laptop-progress:v1', or null when play.preview or play.terminalLab (Req 7).
                               close: lt.dispose(), removes the overlay, handleNonPausingModalClose-style focus return (Req 4).
                               No holdTurnTimer call (Req 3).
src/play/events.ts             PlayModalKind gains 'laptop'; PlayModalTarget gains openLaptop / closeLaptop / isLaptopOpen,
                               routed by routeModalAction like the map (toggle = Req 5).
src/play/state.ts              Play.laptop handle; OverlayId gains 'laptop' (anyModalOpen keeps focus timers off the terminal,
                               closeOtherModals closes it when another modal opens).
src/play/input.ts              F4 -> { kind: 'modal', modal: 'laptop', action: 'toggle' } (preventDefault, no repeat);
                               HUD onLaptop -> same event; modalTarget wires the three functions.
src/play/menu.ts               Escape: if the laptop is open, close it and return before the Esc menu logic (Req 4).
src/play/loop.ts               window.__laptopOverlay = { open, close, isOpen } automation hook, like __map.
src/ui/items-strip.ts          'laptop' joins 'map' and 'manual' as a clickable slot when carried; title "(Click or F4)".
src/ui/hud.ts                  handler onLaptop?(); the item click routes 'laptop' to it.
src/styles/play-laptop.css     NEW. Overlay: fixed full window (z-index 300, above the Esc menu layer), dark ink backdrop,
                               comic-panel frame, Close button top-right. Imported by src/play/laptop.ts. Laptop look itself comes
                               from the existing src/styles/laptop.css (all .lt-* rules, nothing global).
scripts/quality/check-layers.mjs  play/ may import laptop/ (the area that holds app-bus.ts, ui/, domain/ via ui).
.kiro/steering/architecture.md    play/ line names laptop/.
```

## Flow

1. Click on `.item-slot.item-laptop` (carried) or `F4` emits the `laptop` modal toggle on the PlayEventBus.
2. `routeModalAction` calls `openLaptop` or `closeLaptop`.
3. The laptop owns keys and pointer through its own `wireInput` listeners while mounted; the terminal has no focus, so typing goes only to the laptop. Enemy turns, the battle turn timer and dialog boxes keep running.
4. Close button, `Escape` (menu.ts) or `F4` again: `dispose()` removes every laptop listener and desktop window; the overlay node is removed; focus goes back to the terminal when no other modal is open.

## Trade-offs

- A fresh `mountLaptop` per open, disposed on close: matches "closed lid every time" (decision) and leaves no listeners while the game runs. Cost: the desktop state (open windows) is not kept between opens; task progress is kept through the storage key.
- `laptopHear` moves to `src/laptop/app-bus.ts` (area `laptop/`, which may import `contracts/`) because `laptop/ui/` may not import contracts. Avoids a duplicated block (jscpd).
- Escape handled in `menu.ts`, the existing Escape owner, instead of a second capture listener, so the order of listeners cannot open the Esc menu behind the laptop.

## Docs to update with the code

- `.kiro/steering/glossary.md` Turn timer: drop "or the laptop" from the pause list.
- `.kiro/steering/tech.md` Laptop Lab line: the laptop also opens on `/play` (slot click or `F4`).
- `AGENTS.md`: Laptop Lab gates line mentions the play overlay smoke.
