# Release tags power: design

## Pieces

```
.kiro/powers/credits-tauri-local/
  plugin.json                          manifest and activation keywords
  skills/tauri-local/SKILL.md          the procedure: build, open, what it never does
  skills/tauri-local/scripts/tauri-local.mjs
.kiro/powers/credits-release/
  plugin.json
  skills/release/SKILL.md              plan, ask, run with --yes; what never to do
  skills/release/scripts/release.mjs   checks, gates, tag, push, watch, promote Netlify, selftest
.github/workflows/desktop-release.yml  unchanged (already builds installers and the Release on v*)
scripts/quality/check-agents.mjs       + deny probes for both powers
docs and steering                      tech.md, structure.md, AGENTS.md, CLAUDE.md, README
```

No `src/` change, no page, no route, no vocabulary or fingerprint change.

## credits-tauri-local flow

```
tauri-local.mjs
  require this OS = macOS/Linux/Windows host and `cargo` on PATH, else print the install hint, exit 2
  reuse scripts/desktop: runGenerateTauri, then the Tauri build for the host target only (no matrix, no --steam)
  version label: `0.0.0-local+<short sha>[.dirty]`, written only to the git-ignored src-tauri/ (package.json untouched)
  copy bundle to scripts/harness/out/tauri-local/<label>/ and print the path
  open the app (`open` on macOS, `xdg-open` on Linux, `start` on Windows); `--no-open` skips it
```

It never runs git write commands, never reads credentials, never calls the network except what Cargo and npm do.

## credits-release flow

```
release.mjs release <version>            prints the plan only
release.mjs release <version> --yes
  checks: branch main, clean tree, main == origin/main (after fetch), tag v<version> absent
          locally and on origin, <version> == package.json version   -> fail: exit 1, name the check
  npm run quality; generate-chapter.mjs --verify                      -> fail: exit 1, no tag
  git tag -a v<version>; git push origin v<version>
  watch the desktop-release workflow with `gh run watch`; print their URLs
  on success: ship.mjs preview, then ship.mjs prod only if the user confirms again (see decisions)
```

`--dry-run` runs the checks and gates and stops before the tag. `--selftest` checks the pure parts (version and tag parsing, refusal table, plan text) with no git or network.

## Decisions

- **Two scripts, no shared runtime.** They share only the existing `scripts/desktop` helpers. The release script does not import the local one, which keeps each power installable alone.
- **The tag is the trigger; CI does the work.** Installers build on GitHub runners, so the user's machine only tags. This is Req 8.
- **Netlify keeps its own rule.** `release.mjs` calls `ship.mjs` and does not duplicate it. Production still needs the played-preview stamp and a second explicit yes (Req 9). The tag `--yes` does not imply the Netlify yes.
- **`gh` CLI for watching.** It is the user's installed tool, not a dependency; if absent, the script prints the Actions URL and exits 0 after the push.
- **No GitHub Pages.** Dropped by the user: a subpath breaks about 76 root-absolute URLs, and Netlify already serves the web build.
- **Local version label is not a version.** Nothing in `package.json`, tags or the Release changes (Req 1, 2).
- **Agents cannot run either power.** Both script paths sit under `.kiro/powers/`, outside every allow-list; `check-agents.mjs` probes them as `deny` (Req 11). Credentials: `gh` and `netlify login` keep their own; the scripts never read or print tokens.

## Layers and gates

`quality`, `quality:agents`, `desktop:verify` and `desktop:test` stay green. Each script has `--selftest`, run by `check-agents.mjs` or the task list.
