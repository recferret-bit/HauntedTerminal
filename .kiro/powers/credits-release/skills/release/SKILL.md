---
name: release
description: "[WORKFLOW] Release Out Of Credits from a git tag. Checks a clean main, runs the gates, pushes tag v<version> so GitHub builds the Tauri installers (Release), then makes the Netlify preview; Netlify production only after the user's second yes. Use whenever someone wants to tag, push a tag, cut a release, publish a version or ship the desktop and web builds. For a local unversioned desktop build use `credits-tauri-local`."
---

# release

Spec: `.kiro/specs/release-tags-power/` (requirements 5 to 11).

## Procedure

1. Ask the user for the version (`MAJOR.MINOR.PATCH`) and confirm it matches `package.json`. The tag is made from `main` only.
   To bump it: change `version` in `package.json` (and `package-lock.json`, for example `npm version <version> --no-git-tag-version`) on a branch, merge that branch to `main`, push `main`, then show the plan. The script never bumps the version itself.
2. Show the plan; it changes nothing:
   `node .kiro/powers/credits-release/skills/release/scripts/release.mjs release <version>`
3. Report any refusal verbatim (branch, dirty tree, differs from `origin/main`, tag exists, version mismatch, or git could not fetch `origin`, find `origin/main` or list its tags) and stop. Never work around one.
4. Ask for the explicit yes to push the tag; it starts the multi-platform build. Then run it with `--yes`. Unless `--no-netlify` is given, `--yes` first checks the Netlify login (`npx netlify-cli@27.20.0 status`, the check `ship.mjs` uses) and refuses with exit 2 before any gate or tag when it is missing: ask the user to run `npx netlify-cli@27.20.0 login` (or set `NETLIFY_AUTH_TOKEN`), or to release with `--no-netlify`. `--dry-run` runs the checks and gates only. Tell the user it is slow: `--yes` runs the gates (`npm run quality` and the chapter verify) before the tag, and the Netlify preview step (`ship.mjs preview`) runs them again before its upload.
5. The script pushes `v<version>`, follows the GitHub runs with `gh`, then makes the Netlify preview through `credits-ship` (`--no-netlify` skips it). A failing step's exit status is passed through (exit 2 from the preview step still means the Netlify login is missing, for example a token that expired during the build).
6. Report the Actions URL, the Release and the Netlify preview URL. Netlify production is a separate question: only on the user's second yes, run `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod`.

## One-time setup the user owns

- `gh auth login` and `netlify login`. Tokens never go in the repo, in a prompt or in output.

## Never

- Never push a tag by hand or with `git push --tags`; only this script.
- Never tag from a branch other than `main`, a dirty tree or an unpushed `main`.
- Never promote Netlify production on the tag's `--yes`.
- Never re-tag or delete a pushed tag without the user asking for it.
