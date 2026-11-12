---
inclusion: fileMatch
fileMatchPattern: "{chapters,src/chapters}/**"
---

# Level generation rules

You are editing chapter or level data. Before changing anything:

1. Activate the right step skill (`chapter-architect-intake` -> `comix-story-drawer` -> `chapter-level-generator` -> `chapter-implementer`); see `skills-map.md`.
2. Kiroween scope is one chapter of about 11 levels. Do not add a second chapter.
3. Reference existing asset IDs and `RoomKind`s only. If one is missing, switch to the ASSET PCG skill that owns it.
4. Every level has `solutionCommands` and must clear headlessly with 0 deaths. Required files carry `"questCritical": true`.
5. Edit specs, then regenerate (`generate-chapter.mjs`); never hand-edit `src/chapters/generated/`.
6. Behaviour is data (`level.spec.json -> script`, manifest, dialogs) played by `src/chapters/script.ts`; no chapter or level is named in `src/`. Contract, vocabulary and the four-place rule for new capabilities: `declarative-chapters.md`.
7. Humans tune chapters in the Chapter Editor (`/editor`, skill `chapter-editor`). Read a spec from disk before editing it and change only what the task names.
8. Finish with `node scripts/harness/generate-chapter.mjs --verify` and, for the chapter, `verify-chapter.mjs`. Report what you actually ran.
