# Chapter editor: requirements

Capability: a human reviews and tunes any chapter at `/editor` without writing code, on the real game. Contract: `declarative-chapters.md`, rules: `chapter-editor-rules.md`.

## Requirements

1. WHEN `/editor[/<chapter>[/<level>]]` opens, THE SYSTEM SHALL list every chapter and its levels read from `chapters/` on disk, and open the requested level and `?tab=`.
2. THE SYSTEM SHALL edit every field of the manifest, levels, dialogs and comic through forms generated from `schema.ts`, and expose the raw JSON of each file.
3. WHEN a value changes, THE SYSTEM SHALL mark the file unsaved by comparing it with the text last loaded or saved, show the mark in the sidebar, and re-run the static checks without losing focus.
4. THE SYSTEM SHALL preview the selected level in the real game on the unsaved draft, offer restart, next command, run solution, free commands, raw events and a play button per script step, and log the events.
5. WHEN the preview runs, THE SYSTEM SHALL write no progress, scrap, perks or telemetry.
6. WHEN the Check tab runs, THE SYSTEM SHALL report reference, asset-id and field-table issues and solve the level or chapter headlessly on the draft.
7. WHEN Save runs, THE SYSTEM SHALL write only changed files in the canonical JSON format, refresh the manifest level summaries, and recompile the catalog; saving unedited files SHALL change zero bytes.
8. IF a file changed on disk after the editor loaded it, THEN THE SYSTEM SHALL refuse the save (HTTP 409), keep the disk file, and offer "Reload from disk"; WHEN the window gains focus or every 5 s, it SHALL detect such changes.
9. THE API SHALL accept only local same-origin requests with `Content-Type: application/json`, only existing whitelisted spec files, object bodies, and write atomically.
10. WHERE the dev API is absent, THE SYSTEM SHALL open read-only from the compiled catalog.
11. THE SYSTEM SHALL be operable by keyboard and expose tabs, status and the event log to assistive technology.

## Verification

`node scripts/harness/editor-smoke.mjs` covers 1-9 and part of 11 in headless Chrome; `npm run quality` covers layers, size, duplicates.
