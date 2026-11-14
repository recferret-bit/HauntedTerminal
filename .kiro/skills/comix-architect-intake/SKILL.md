---
name: comix-architect-intake
description: "[LEVEL GEN] Step 1 of animated 3D Comix generation. Interview the user on sequence premise, room/cast from ModelCatalog, duration, cue milestones, and page/panel breakdown, then scaffold and validate a connected `comix/<slug>/` package (`README.md`, `comix.manifest.json`, `pages/page-XX-<slug>/page.spec.json`) ready for `comix-sequence-generator`, `comix-implementer`, and `/comix-editor`. Use whenever the user asks to plan, design, scaffold, restructure, or create a 3D animated comix sequence (intro, outro, interlude, boss reveal, epilogue, or standalone reel). Never creates 3D models; uses existing ModelCatalog and FxCatalog assets."
---

# Comix Architect Intake (`comix-architect-intake`)

**Category: LEVEL GEN** (animated 3D Comix layer; see `.kiro/steering/skills-map.md` and `.kiro/steering/declarative-comix.md`).

> **Scope distinction:**
> - **Animated 3D Comix (`comix/<slug>/`)** — real-time cel-shaded 3D comic reels played by `src/cinematic/` and edited in `/comix-editor` (handled by `comix-architect-intake` -> `comix-sequence-generator` -> `comix-implementer` -> `comix-editor`).
> - **Static Chapter Story Issues (`chapters/<slug>/story/comix.spec.json`)** — rasterized PNG comic pages (`draw-comix.mjs`) read in `/comic.html` (handled by `comix-story-drawer`).

Read `haunted-art-direction` first so every chosen room, prop, actor, sky colour, and lettering beat honours the Comix Zone art bible.

---

## 1. Adaptive Intake Protocol (2–3 Concise Rounds)

Skip any question already answered in the user's request. Use `ask_question` when choices are open:

### Round 1 — Sequence Role, Setting & Cast
1. **Sequence Slug & Purpose:** What is `<slug>` (kebab-case, e.g. `intro`, `outro`, `midboss-reveal`) and where does it play (`playComix(slug, ...)` or `/cinematic.html?play=<slug>`)?
2. **3D Stage (`stage.room` + `props` + `fixtures`):**
   - Pick an existing room in `ModelCatalog` (`room.intro`, `room.outro`, `room.desk`, `room.attic`, `room.crypt_entrance`, `room.lab_hall`, `room.crypt_hall`, `room.catwalk`, `room.furnace`, `room.core`).
   - Pick stage fixtures if needed: `rain`, `bolt` (`bolt` or `comic`), `vortex`.
3. **Cast (`cast[]`):** Which `ModelCatalog` actors appear (`vibecoder.dev`, `npc.kiro_ghost`, `npc.greybeard_rig`, `agent.clod`, `agent.antigravy`, `agent.gork`, `agent.codec`, `malware.*`, `boss.*`)? If an asset does not exist yet, stop and build it with an `[ASSET PCG]` skill first.

### Round 2 — Pacing, Page Breakdown & Skip Policy
1. **Duration & Page Count:** Total `durationSec` and number of connected pages (`1–4` pages, typically `1–4` panels per page).
2. **Page Windows & Transitions:** Each page owns a clear `[from, until]` window in seconds and an optional 3D page-flip `turn` (`{ from, to, ease }`) into the next page.
3. **End & Skip Behaviour:**
   - `holdAtEnd`: `false` (auto-completes at `durationSec`) or `true` (holds final splash until key/click after `acceptsKeyFrom`).
   - `skip`: `"end"` (skip jumps straight to completion) or stepped waypoints `[{ before, to }]`.

---

## 2. Connected Comix Directory Layout

Every sequence under `comix/<slug>/` is **strictly connected** — `comix.manifest.json` indexes every page in `pages/page-XX-<name>/page.spec.json`, and every `page.spec.json` owns its panels, camera shots, lettering, discrete beats, and continuous tracks in one self-contained file:

```text
comix/<slug>/
├── README.md                              # Human-readable premise, stage, cast & page/panel timing table
├── comix.manifest.json                    # ComixManifest: duration, skip, shared cues, 3D stage, cast, pages[] summaries
└── pages/
    ├── page-01-<beat-slug>/
    │   └── page.spec.json                 # ComixPageSpec: from, until, cues, turn, overlays, tracks, panels[]
    └── page-02-<beat-slug>/
        └── page.spec.json
```

**No disconnected sidecar files** (`marks.json`, `letters.json`, `camera.json`, `beats.json`, `poses.json`, etc.) are allowed. `validate-comix.mjs` fails immediately if any unreferenced JSON file sits in `comix/<slug>/`.

---

## 3. Scaffold & Validate Commands

Scaffold a new connected Comix package:

```bash
node .kiro/skills/comix-architect-intake/scripts/scaffold-comix-specs.mjs \
  --id interlude-breach \
  --title "SECTOR BREACH" \
  --subtitle "Firewall Collapse on Floor 02" \
  --room room.lab_hall \
  --cast vibecoder.dev,npc.kiro_ghost,agent.clod \
  --pages 2 \
  --panels-per-page 3,1 \
  --duration 18
```

Validate all `comix/` sequences (folder connectivity + schema + catalog refs + 60fps simulation):

```bash
node .kiro/skills/comix-architect-intake/scripts/validate-comix-specs.mjs
```

Compile into `src/cinematic/generated/catalog-data.ts` and verify:

```bash
node scripts/harness/generate-comix.mjs --verify
```

Hand off to `comix-sequence-generator` to choreograph rich panel shots, lettering, beats, and tracks, then `comix-implementer` and `comix-editor` (`/comix-editor`) for visual polish.
