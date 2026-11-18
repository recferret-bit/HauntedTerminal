---
name: release
description: "[WORKFLOW] Release Haunted Terminal from a git tag. Checks a clean main, runs the gates, pushes tag v<version> so GitHub builds the Tauri installers (Release), then makes the Netlify preview; Netlify production only after the user's second yes. Use whenever someone wants to tag, push a tag, cut a release, publish a version or ship the desktop and web builds. For a local unversioned desktop build use `haunted-tauri-local`."
---

# release

Spec: `.kiro/specs/release-tags-power/` (requirements 5 to 11).

## Procedure

1. Ask the user for the version (`MAJOR.MINOR.PATCH`) and confirm it matches `package.json`. The tag is made from `main` only.
2. Show the plan; it changes nothing:
   `node .kiro/powers/haunted-release/skills/release/scripts/release.mjs release <version>`
3. Report any refusal verbatim (branch, dirty tree, differs from `origin/main`, tag exists, version mismatch) and stop. Never work around one.
4. Ask for the explicit yes to push the tag; it starts the multi-platform build. Then run it with `--yes`. `--dry-run` runs the checks and gates only.
5. The script pushes `v<version>`, follows the GitHub runs with `gh`, then makes the Netlify preview through `haunted-ship` (`--no-netlify` skips it).
6. Report the Actions URL, the Release and the Netlify preview URL. Netlify production is a separate question: only on the user's second yes, run `node .kiro/powers/haunted-ship/skills/ship/scripts/ship.mjs prod`.

## One-time setup the user owns

- `gh auth login` and `netlify login`. Tokens never go in the repo, in a prompt or in output.

## Never

- Never push a tag by hand or with `git push --tags`; only this script.
- Never tag from a branch other than `main`, a dirty tree or an unpushed `main`.
- Never promote Netlify production on the tag's `--yes`.
- Never re-tag or delete a pushed tag without the user asking for it.
