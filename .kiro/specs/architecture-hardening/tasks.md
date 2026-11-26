# Architecture hardening: tasks

Status: see requirements.md

The refactor itself landed in commit 1905207 (one change, decision 1). The tasks below are what this spec found and finished on 2026-11-26, plus the checks that prove each area. A task is ticked only when its gates were run on 2026-11-26 and exited 0.

- [x] 1. Gates and tooling: dependency pins, ESLint, cycles, dead code, strict flags, the two hooks, the `npm run test` script. _Req 1-10, 25_. Gates: `npm run quality:deps`, `npm run quality:lint`, `npm run quality:cycles`, `npm run quality:deadcode`, `npx tsc --noEmit`.
- [x] 2. `lint` delegates to `quality:lint` (one line in `package.json`). _Req 4_. Gates: `npm run lint`, `npm run quality:lint`.
- [x] 3. Comment above the dead-code allowlist in `scripts/quality/check-deadcode.mjs` (comment only). _Req 6_. Gates: `npm run quality:deadcode`.
- [x] 4. Unit suites `classic-unit.mjs` and `architecture-unit.mjs`. _Req 11, 12_. Gates: `node scripts/harness/classic-unit.mjs` (17 tests), `node scripts/harness/architecture-unit.mjs` (14 tests), `npm run test`.
- [x] 5. State machines, `PlayLifecycle`, `PlayEventBus` and their properties. _Req 13-15_. Gates: `node scripts/harness/architecture-unit.mjs`, `node scripts/harness/property-tests.mjs` (87 properties).
- [x] 6. Shell tables, shared applets, `kiro` subcommands, `isDescendantOrSelf`, metagame data split, removed modules. _Req 16-19, 21_. Gates: `node scripts/harness/classic-unit.mjs`, `node scripts/harness/property-tests.mjs`, `node scripts/harness/generate-chapter.mjs --verify` (inside `npm run test`), `npm run quality:deadcode`.
- [x] 7. Classic `rm` refuses the root, parentless nodes, the cwd and its ancestors with `rm: refusing to remove '<path>'`, as the chapter shell does (`cmdRm` in `src/game/commands-fs.ts`), with a test in `classic-unit.mjs`. _Req 20_. Gates: `node scripts/harness/classic-unit.mjs`, `node scripts/harness/architecture-unit.mjs`, `node scripts/harness/property-tests.mjs`, `npx tsc --noEmit`.
- [x] 8. `.kiro/steering/architecture.md`: the `contracts/` row names `dom.ts` as the one exception; the patterns line says `createStateMachine` is a convention, not a gate. `docs/PROPERTY_TESTS.md`: where the properties of lead-dev code live. _Req 13, 21, 24_. Gates: `node scripts/quality/check-specs.mjs`, `npm run quality`.
- [x] 9. Ownership: `scripts/harness/{classic-unit,architecture-unit}.mjs` belong to `lead-dev` (`agents-build.mjs`, `team-rules.md`, `OWNED` in `check-agents.mjs`); `lead-dev.json` regenerated. _Req 23_. Gates: `node scripts/harness/agents-build.mjs --check`, `node scripts/harness/agents-unit.mjs` (19 tests), `node scripts/quality/check-agents.mjs`.
- [x] 10. Fingerprint against the tree before the commit: byte-identical (139 lines). _Req 22_. Gates: `npm run quality:fingerprint`, `node scripts/quality/fingerprint.mjs` on `git archive 1905207^`, `diff`.
- [x] 11. `## Later changes` lines in `release-tags-power` and `netlify-deploy-power` (`property-based-tests` already had one; `agent-team` is another session's and was not touched). _Decision 20_. Gates: `node scripts/quality/check-specs.mjs`.
- [x] 12. Whole chain. _All_. Gates: `npm run quality`, `npm run test`.

## Notes for the user (not tasks)

- `AGENTS.md` lists `npm run test` among the project-wide commands but does not say it is a manual convenience that must pass before a change under `src/` is done (decision 16). It was not edited.
- The browser smoke suites listed in `docs/reviews/2026-11-26-code-review-boost.md` were not re-run for this spec.
