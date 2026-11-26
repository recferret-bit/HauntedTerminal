# Release tags power: requirements

Status: approved (approved by the user 2026-11-26, delegated)

Capability: two project powers that connect builds to GitHub tags. `credits-tauri-local` builds a local, unversioned, non-production Tauri app. `credits-release` builds the production Tauri installers and makes the Netlify preview from the same release (GitHub Pages dropped, see Decisions).

## Requirements

### credits-tauri-local

1. WHEN the user runs the local build, THE SYSTEM SHALL build a Tauri app for this machine only, from the working tree, with no version bump, no tag and no network publish.
2. THE SYSTEM SHALL mark the output as a non-production build and write it under git-ignored `scripts/harness/out/`.
3. WHEN the build succeeds, THE SYSTEM SHALL open the built app.
4. IF the build fails, THEN THE SYSTEM SHALL print the failing step and exit non-zero.

### credits-release

5. WHEN the user runs `release <version>` without `--yes`, THE SYSTEM SHALL print the plan (commit, tag, targets) and change nothing.
6. IF the branch is not `main`, the tree is dirty, `main` differs from `origin/main`, the tag already exists, or `<version>` differs from `package.json`, THEN THE SYSTEM SHALL refuse and name the failed check.
7. WHEN the checks pass and `--yes` is given, THE SYSTEM SHALL run `npm run quality` and the 0-death chapter verify, then create and push tag `v<version>`.
8. WHEN tag `v*` is pushed, THE SYSTEM SHALL build the Tauri installers on a GitHub Release (existing `desktop-release.yml`).
9. WHEN the tag is pushed and, if `gh` is installed, its workflow run succeeded, THE SYSTEM SHALL make the Netlify preview through `credits-ship preview` and SHALL NOT promote it; production stays the user's second yes.
10. (Dropped: GitHub Pages, see Out of scope.)
11. THE SYSTEM SHALL deny `credits-release` in every team agent's shell, and keep credentials out of the repo.

## Out of scope

- A second chapter, Steam publishing and signing certificates (see `steamworks-store-release`).
- Changing the `credits-ship` preview rule.
- GitHub Pages, a Vite `base` and any change to root-absolute URLs (formerly requirement 10, dropped by the user; see Decisions).

## Decisions

**Q:** Which powers? **A (user, 2026-05-17):** Two. (1) build a local Tauri app, not versioned, not a production build. (2) build the production Tauri app and deploy to Netlify and to GitHub Pages.
**Q:** Names? **A (user, 2026-05-17):** `credits-tauri-local` and `credits-release`.

**Q:** Questions 1 to 6 (production scope, tag creation, Netlify rule, Pages mechanism, local scope, agent deny). **A (user, 2026-05-17):** All proposed defaults accepted: the six proposals as listed in the draft.

**Q:** Pages serves from a subpath and about 76 root-absolute URLs would break; root URL, refactor, or drop? **A (user, 2026-05-17):** "lets keep netlify": Pages is dropped; Netlify is the only web host.

**Q:** Requirement 9 was reworded on 2026-11-26 to match `release.mjs` (preview only, no promotion); is it confirmed, and are the requirements, design and tasks approved? **A (user, 2026-11-26, delegated: "go with your recommendations"):** requirement 9 as reworded (preview only; production stays the user's second yes) is confirmed, and the spec's requirements, design and tasks are approved.

## Open questions

(none)

## Verification

- 1-4: unit test of the local build script (dry run) and `--selftest`.
- 5-7, 11: `release --selftest` and `--dry-run`; `npm run quality:agents`.
- 8: the existing `desktop-release.yml` on a `v*` tag (first real release, task 9).

## Later changes

- **2026-11-26, commit 1905207 (see `.kiro/specs/architecture-hardening/`):** `release.mjs` reads the repository state through a pure `readStateWith` (a failed git or remote read is a refusal, exit 1), checks the Netlify login before the gates and the tag (exit 2 when missing), and passes the exit status of a failing child through; its tests are in `--selftest`.
