---
name: tauri-local
description: "[WORKFLOW] Build the Out Of Credits desktop app (Tauri) on this machine from the working tree and open it. Local only: no version bump, no tag, no push, no upload, not a production build. Use whenever someone wants to try the desktop app, build the native app locally, or check that the Tauri shell still builds. For a tagged, published release use `credits-release` instead."
---

# tauri-local

Spec: `.kiro/specs/release-tags-power/` (requirements 1 to 4).

## Run

```
node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs            build, then open
node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs --no-open  build only
node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs --dry-run  web build, Tauri generation and offline bundle verify; no native build, no quality gates
```

It wraps `scripts/desktop/build-tauri-steam.mjs` for this machine only, without Steamworks. The output goes to `scripts/harness/out/tauri-local/local-<sha>[-dirty]/` with a `LOCAL-BUILD.txt` marker. The label is a folder name, not a version.

## Procedure

1. Run it. The first native build is slow (Cargo compiles the shell); later ones reuse the cache.
2. Exit 2 means the Rust toolchain is missing: tell the user to install it from https://rustup.rs. Exit 1 means the build failed: report the failing step from the output.
3. Report the output folder and what you ran. Never say the build was published or released.

## Never

- Never tag, push, bump `package.json` or call `credits-release` or `credits-ship` from here.
- Never describe a local build as a release or a production build.
- Never hand-edit `src-tauri/` (generated, git-ignored).
