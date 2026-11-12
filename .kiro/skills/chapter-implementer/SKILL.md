---
name: chapter-implementer
description: "[LEVEL GEN] Final step of level generation (pipeline and QA gate). Take chapter specs produced by `chapter-architect-intake` and run the whole pipeline: draw the Comix issue, compile levels, wire validators and UI (`src/chapters/`, `/chapters.html`) and run the complete verification suite (`verify-chapter.mjs`) so the single Kiroween chapter of about 11 levels is playable. Use whenever implementing, building, updating or shipping a chapter from specs."
---

# Chapter Implementer (`chapter-implementer`)

**Category: LEVEL GEN** (see `.kiro/steering/skills-map.md`). This skill runs the pipeline for the **single Kiroween chapter (about 11 levels)**. It consumes existing assets only; any missing model, room, texture or effect is an ASSET PCG task and must be done first with the skill that owns it.

`chapter-implementer` is the execution counterpart to `chapter-architect-intake`. Once `chapters/<chapter-id>/` specs exist on disk, follow this exact 5-step pipeline to turn those specs into a playable, illustrated, browser-selectable Haunted Terminal issue.

---

> Step 6 is human: open `/editor` (skill `chapter-editor`) to review dialogs, animations and interactions on the real game and tune the specs by hand. Agents must keep those edits (read specs from disk, patch only what the task names).

---

## Step 1 — Validate Input Specifications
Before touching `src/`, verify that the chapter's manifest, Comix script, dialogues, and level specs satisfy all `ModelCatalog`, `BESTIARY`, and `HUMAN_ZONE_MISUSE` contracts:

```bash
node .kiro/skills/chapter-architect-intake/scripts/validate-chapter-specs.mjs --chapter <chapter-id>
```

---

## Step 2 — Draw the Comix Story Issue (`comix-story-drawer`)
Render all pages of `chapters/<chapter-id>/story/comix.spec.json` to `chapters/<chapter-id>/story/out/page-01.png` .. `page-NN.png`, `contact-sheet.png`, and `public/comix/<chapter-id>/`:

```bash
node scripts/harness/draw-comix.mjs --chapter <chapter-id>
```

Always inspect `chapters/<chapter-id>/story/out/contact-sheet.png` via `read_file` to confirm clean framing, actor grounding, and bubble legibility.

---

## Step 3 — Compile Level Specs & Custom Mechanics (`chapter-level-generator`)
1. If the chapter introduces a brand-new `WinRule` kind or domain validator (e.g., SQL query plans, Kubernetes Deployment YAML, Nginx TLS blocks), add a deterministic, zero-LLM validator to `src/chapters/validators.ts`, declare the `WinRule` variant in `src/chapters/types.ts`, and wire `evalWinRule` + `liveLintFeedback` in `src/chapters/chapter-session.ts`.
2. Compile `chapters/*` into `src/chapters/generated/catalog-data.ts`:
   ```bash
   node scripts/harness/generate-chapter.mjs
   ```
   Because `/chapters.html` (`src/pages/chapters-page.ts`), `/comic.html` (`src/pages/comic-page.ts`), and `/play.html` (`src/main.ts`) read directly from `CHAPTER_MANIFESTS` in `src/chapters/catalog.ts`, any compiled chapter with `"status": "playable"` automatically becomes selectable per-chapter and per-level in `/chapters.html`!

---

## Step 4 — Run End-to-End Chapter Verification Gate
Run the single-command verification gate:

```bash
node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs --chapter <chapter-id>
```

This verifies:
1. All chapter JSON specs pass `validate-chapter-specs.mjs`.
2. `src/chapters/generated/catalog-data.ts` is 100% in sync with `chapters/*` (`--check`).
3. Rendered Comix PNG pages + `contact-sheet.png` exist in both `chapters/<id>/story/out/` and `public/comix/<id>/`.
4. Every level in the chapter clears headlessly under `--ticks 3` real enemy tick pressure with **`deaths === 0`** and **`ended === true`**.
5. All skill self-tests (`chapter-architect-intake`, `comix-story-drawer`, `chapter-level-generator`) pass.

---

## Step 5 — Browser & Build Verification
Finish with:
```bash
npm run build
```
and inspect `/chapters.html`, `/comic.html?chapter=<chapter-id>`, and `/play.html?chapter=<chapter-id>&nointro=1` via `screenshot-lab.mjs` + `read_file`.
