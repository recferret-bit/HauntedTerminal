---
name: comix-implementer
description: "[LEVEL GEN] Step 3 of animated 3D Comix generation. Compile `comix/<slug>/` into `src/cinematic/generated/catalog-data.ts`, run static + 60fps timeline verification, audit rendered freeze-frames in headless Chrome (`/cinematic.html?play=<slug>&t=<sec>`), wire playback into game flows (`playComix`), and pass the master `verify-comix.mjs` gate. Use whenever implementing, compiling, wiring, or QA-gating an animated 3D Comix sequence."
---

# Comix Implementer (`comix-implementer`)

**Category: LEVEL GEN** (animated 3D Comix compilation, integration & QA gate; see `.kiro/steering/skills-map.md` and `.kiro/steering/declarative-comix.md`).

---

## 1. End-to-End Implementation Loop

1. **Validate Connected Folder & Specs:**
   ```bash
   node scripts/harness/validate-comix.mjs
   ```
   Ensures every `comix/<slug>/` folder contains `README.md`, `comix.manifest.json`, and `pages/page-XX-<name>/page.spec.json` with zero stray/disconnected JSON files.

2. **Compile & Run 60fps Timeline Simulation:**
   ```bash
   node scripts/harness/generate-comix.mjs --verify
   ```
   Writes `src/cinematic/generated/catalog-data.ts`, validates every schema field, `ModelCatalog` model, `FxCatalog` preset, cue expression, and panel rect, and simulates every frame at `60fps` across panel cuts, snapshots, page turns, beats, tracks, and skip stops.

3. **Visual Freeze-Frame Inspection (`/cinematic.html`):**
   Capture deterministic freeze-frames at key timestamps (`?play=<slug>&t=<sec>&muted=1`) and inspect the rendered PNGs with `read_file` to verify camera framing, bubble tails, captions, and actor rigs:
   ```bash
   npm start
   node scripts/harness/screenshot-lab.mjs --page "/cinematic.html?play=intro&t=4.5&muted=1" --out scripts/harness/out/comix-intro-t4.5.png
   ```

4. **Runtime Integration (`playComix`):**
   Game UI triggers any sequence generically by slug:
   ```ts
   import { playComix } from '../cinematic/index.js';
   await playComix(slug, hostEl, { skippable: true, muted: false }, stats);
   ```
   Never hardcode scene choreography, actor IDs, or page numbers in `src/cinematic/` or `src/play/`.

---

## 2. Master Comix QA Gate

Run the single-command gate before finishing any Comix work:

```bash
node .kiro/skills/comix-implementer/scripts/verify-comix.mjs
```

It runs:
1. `validate-comix-specs.mjs` (connected folder layout + schema + catalog refs)
2. `generate-comix.mjs --check` & `--verify` (compiled `catalog-data.ts` sync + 60fps simulation of every sequence)
3. `scripts/quality/check-declarative.mjs` (enforces zero hardcoded comix/chapter IDs in `src/`)
4. `comix-architect-intake` & `comix-sequence-generator` skill self-tests
5. `.kiro/specs/{declarative-comix-runtime,comix-editor}/` spec completeness & `scripts/hooks/guard-chapter-files.mjs` protection checks

If `src/comix-editor/`, `src/cinematic/editor-select.ts`, `src/cinematic/preview.ts`, or `scripts/harness/lib/comix-api.mjs` was touched, also run:
```bash
node scripts/harness/comix-editor-smoke.mjs
npm run quality
```
