# Inventory and Laptop Lab: requirements

Status: approved

Written after the code (see `.kiro/steering/spec-first.md`, "Code that was written before its spec"). The open questions are decided (see Decisions). Requirements approved by the user.

Capability: the developer carries an inventory (lantern, laptop) and holds one item; the item is a model of its own and picks the hero model. A dev page `/laptop-lab` emulates the laptop: it opens, the camera dives into the screen, it boots, shows a desktop whose apps run real HTML, CSS and JS, mirrors the user's real keyboard and pointer on its keys and trackpad, and offers coding tasks.

## User request (verbatim intent)

Refactor out the vibecoder; give him an inventory with a lantern (the current `ls -a` flash) and a laptop (given later, used for coding tasks); add them to the models storybook; a dedicated page on /dev with a laptop emulator like the terminal one; old-fashioned opening and dive-in animations; keys that click when real keys are pressed; a loading animation; a desktop with clickable apps; a trackpad that reflects real mouse input; code-editing apps that run code and show results (HTML, CSS, JS); simple tasks (JS hello world, some pages). Follow patterns, DRY, KISS, state machines, clean architecture.

## Requirements

1. THE SYSTEM SHALL register inventory items as models of a new category `item` (`item.lantern`, `item.laptop`), each standing on y = 0 with a `grip` socket, validated by the model validator and shown in the storybook under ITEM.
2. THE SYSTEM SHALL build the developer from his body plus the held item: `vibecoder.dev` holds the lantern (output identical in parts and look to before), `vibecoder.dev_laptop` holds the laptop. An item with a `light` socket gives the holder its `lantern` socket.
3. THE SYSTEM SHALL keep an `Inventory` (`items`, `held`) in both the classic and the chapter session, starting with the lantern held; `inventory` / `inv` list it and `hold <item>` takes an owned item in hand; `ls -a` puts the lantern back in hand; the scene's hero model follows the held item.
4. WHEN `/laptop-lab` opens, THE SYSTEM SHALL show the laptop in a comic panel with a side panel for the lifecycle machine, the input mirror, the quests and sound; it is linked from `/dev`. URL: `?state=`, `?speed=`, `?mute=1`.
5. THE SYSTEM SHALL drive the laptop by one state machine (`closed, opening, open, diving, booting, desktop, shutting, surfacing, closing`) with timed phases; each state has a look (camera far/near, lid shut/up, screen off/boot/desktop/bye) animated in CSS 3D with comic onomatopoeia.
6. WHILE the page is open, THE SYSTEM SHALL press the deck key for each real `KeyboardEvent.code` and release it on keyup; a mouse press on a deck key works too. The trackpad finger SHALL follow the real pointer over the screen; real mouse buttons press its buttons; the wheel drags the finger.
7. THE SYSTEM SHALL boot through a BIOS text, a memory count and an OS splash with a progress bar, with optional synthesized sounds (key clicks, beep, disk chatter).
8. THE SYSTEM SHALL show a desktop (icons, windows with move, minimise and close, a taskbar, a start menu) run by a pure reducer, with the apps Quests, JS Pad, Web Weaver and System.
9. THE SYSTEM SHALL run JS Pad code in a Worker (stopped after 2.5 s) and Web Weaver pages in an iframe with `sandbox="allow-scripts"` (opaque origin), capturing console lines and uncaught errors.
   IF page code loops without end, THEN THE SYSTEM SHALL stop that loop with a readable error naming the line (loop protection added to every `for`, `while` and `do` loop before the page runs), keep the lab responsive, and show it in the console; IF a page still has not reported after the timeout, THEN THE SYSTEM SHALL replace the preview with a "stopped" page.
10. THE SYSTEM SHALL offer seven tasks (3 JS, 4 page) judged by deterministic checks (`log`, `logs`, `noError`, `value`, `element`, `style`, `source`); each task's starter fails and its reference solution passes. Progress and drafts are saved in `localStorage` (`haunted.laptop.progress`).

## Out of scope

- Giving the laptop to the player in the chapter (no chapter spec or vocabulary change).
- Opening the laptop from the game's terminal.
- Laptop progress in chapter progress, scrap or rank.

## Open questions


## Decisions

- Q2 (user): the laptop is lab-only for now; no `give_item` step, no manifest grant.
- Q3 (user): the game does not open the emulator yet; it stays a dev lab.
- Q4 (user): one registered model per held item (`vibecoder.dev_<item>`).
- Q5 (user): items may use `human` zones and skip the glow-share and accent checks.
- Q6 (user): its own page at `/laptop-lab`.
- Q1 (user): one spec for the inventory and the laptop lab.
- Q7 (user): "the best user experience". Read as: page code gets loop protection (as CodePen does) so an endless loop ends in an error instead of a frozen tab, plus a watchdog that resets the preview. Added to Req 9.
- Q8 (user): tasks stay typed data in `src/laptop/domain/tasks.ts`.
- Q9 (user): the emulator is DOM and CSS 3D; `item.laptop` is the in-world model.
- Q10 (user): progress stays in `localStorage` only.

## Verification

`node scripts/harness/laptop-unit.mjs` (Req 3, 5, 7, 8, 10), `node scripts/harness/laptop-lab-smoke.mjs` at 1600x950 and `--width 1280 --height 820` (Req 4-10, real CDP key and mouse input), the model validator with `--seeds 4` and the storybook screenshot (Req 1-2), the game self-checks and `generate-chapter.mjs --verify` (Req 3), `npm run quality`, and `npm run quality:fingerprint` (only the three new models are added).
