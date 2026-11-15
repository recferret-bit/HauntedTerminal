# Terminal Lab: requirements

Capability: a developer builds any test scene at `/terminal-lab` (files, enemies, pickups, props, NPC lines, riddles, tasks), plays it in the real terminal on the real comic stage, and replays it as a script, in the browser or headless. The player never takes damage. The lab writes nothing to `chapters/` or `comix/` and adds no chapter or comix vocabulary. Rules: `terminal-lab-rules.md`.

## Requirements

1. WHEN `/terminal-lab[/<lab-id>]` opens, THE SYSTEM SHALL show the shared workstation layout (`src/editor-core/`): Scene dock (left), the real game in an iframe (centre, swapping sessions in-page without reloading the iframe on edits), Inspector (right), Script & Console (bottom); docks hide, float and swap, and the layout persists under `ht-terminal-lab-ui`. A lab only in the repo SHALL open from its URL, `?from=<chapter>/<level>[&draft=1]` (and the Scene dock's `Open level` picker / `/editor`'s `⚗ Open in Lab` button) SHALL import a chapter level into a new lab read-only toward `chapters/`, and `?tab=` SHALL pick the Inspector tab.
2. THE SYSTEM SHALL offer every placeable game object from the existing catalogs, never from hand-typed lists, by click or drag-and-drop onto the viewport stage or Scene list: the `EnemyType`s (`BESTIARY`), the `PickupType`s (`PICKUP_INFO`), every `ModelCatalog` id as a visual prop, files, dirs and sockets (mode, uid, content), every `RoomKind`, floor themes 1-5, the `ScriptAgent` NPCs and the Kiro cores, across both `driver: "chapter"` (`ChapterSession`) and `driver: "classic"` (`createSession`).
3. THE SYSTEM SHALL let the user define **riddles** (a socket with a prompt, an answer as exact text or a `re:` pattern, hints, an optional door to open), **tasks** (any `WinRule`, including the HTML/CSS, JS, Dockerfile and Compose validators) and **checks** (on the command line, output, exit code, events, files and riddles), and SHALL show each one's live done state as a goal.
4. THE SYSTEM SHALL list every command the shell completes, grouped, with its `man` text, Insert and Run, and mark the ones the shell does not implement. WHEN an object is selected, THE SYSTEM SHALL suggest the commands that act on it.
5. THE SYSTEM SHALL make everything scriptable: a lab is one JSON document (`setup` and `steps`), every UI action edits it, and replaying it reproduces the same transcript.
6. THE SYSTEM SHALL run a lab step by step, to a step, or to the end, with breakpoints and Record, in the browser; a Node harness SHALL run the same lab on the same session code and exit non-zero on a failed `expect` or `check`.
7. WHILE a lab runs, THE SYSTEM SHALL never reduce HP and never trigger death, SSD restore or level reboot. Enemies still attack; the lab shows the damage it absorbed per source. **Enemy fire: hold** stops attacks.
8. THE SYSTEM SHALL offer a `live` clock (one tick per second) and a `manual` clock (ticks only on `tick` steps or the Tick button).
9. THE SYSTEM SHALL show, per step, the line, stdout, stderr, exit code, events and where it left the world, and live: the file tree with modes, and every enemy and pickup with HP, state, pid and ticks to its next attack.
10. WHEN a lab runs, THE SYSTEM SHALL write no progress, scrap, perks or telemetry.
11. THE SYSTEM SHALL autosave labs in the browser, import and export `.lab.json`, and, through a dev-only API, save them to `scripts/harness/terminal-lab/` (or the configured `TERMINAL_LAB_DIR`, reported accurately in the status line) with the hardening of `/api/chapters` (local host, same origin, JSON only, lowercase `<id>.lab.json` names only, atomic write, etag 409, no delete). IF the repo file changed after the lab opened it, THEN THE SYSTEM SHALL refuse the save and offer "Reload from repo".
12. THE SYSTEM SHALL expose `window.__terminalLab` (`state`, `load`, `select`, `step`, `runTo`, `reset`, `runAll`, `transcript`, `goals`, `inspect`, `issues`, `saveToRepo`, `openFromRepo`, `openChapterLevel`, `setTab`, `setDriver`, `setClock`, `setEnemyFire`) and be operable by keyboard; tabs, status and the event log SHALL be exposed to assistive technology.

## Out of scope

- Writing chapter or comix specs.
- New models, textures or effects (ASSET PCG).

## Verification

`node scripts/harness/terminal-lab-unit.mjs` (session option, patterns, compiler, palette, checks, store, runner, riddles, goals, inject, countdown, commands, fixtures), `node scripts/harness/terminal-lab-api-test.mjs` (Req 11), `node scripts/harness/terminal-lab.mjs --all` (every committed lab plus a 30-tick soak; Req 3, 5-8) and `node scripts/harness/terminal-lab-smoke.mjs` at 1600x950 and with `--width 1280 --height 820` (Req 1-12, and browser-vs-Node transcripts for every lab). `npm run quality` covers typecheck, layers, size, declarative gate and 0 duplicates.
