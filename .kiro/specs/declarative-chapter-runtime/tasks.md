# Declarative chapter runtime: tasks

- [x] 1. Type the vocabulary (`script-types.ts`, `types.ts`: `ChapterPack`, `DossierEntry`, `grants`, `outro`). _Req 1-9_
- [x] 2. Write the interpreter `script.ts` with pure `stepOutput`. _Req 1-7_
- [x] 3. Thread `pack` and `preview` through `ChapterState`; replace catalog lookups. _Req 9, 10_
- [x] 4. Move the Kiroween tutorial, hubs, taunts, Kiro and boss text into `level.spec.json -> script` and the manifest; transcripts of ~700 commands/events/snapshots identical before and after. _Req 1-9_
- [x] 5. `grants` replaces the level-index loadout; chapter codex cards move to `manifest.dossier`; chaos seed from the manifest id. _Req 8, 9_
- [x] 6. Gate: `check-declarative.mjs` in `npm run quality`. _Req 11_
- [x] 7. Exhaustive variant tables typed by the spec unions; list-completeness types in `validate-pack.ts`. _Req 12_
- [x] 8. Static checks shared by editor and CLI (`checkPack`); `generate-chapter.mjs --validate/--check/--verify`. _Req 13, 14_
- [x] 9. Skill self-tests follow the current content and assert `dossierOf`. _Req 9_
- [ ] 10. Move the remaining shared-but-narrative strings (`help` text mentioning `hank.tty`, grimoire wording) behind manifest fields if a second chapter needs them.
- [x] 11. Make the intro/outro cinematics (`src/cinematic/`) data-driven; completed via connected `comix/<slug>/` specs and generic engine (`.kiro/specs/declarative-comix-runtime/`).
