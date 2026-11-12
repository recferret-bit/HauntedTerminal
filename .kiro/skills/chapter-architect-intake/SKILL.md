---
name: chapter-architect-intake
description: "[LEVEL GEN] Step 1 of level generation. Interview the user across premise, mechanics mix, level count, enemy roster, dialogue tone and Comix page count, then generate and validate structured chapter specs (`chapter.manifest.json`, `story/comix.spec.json`, `story/dialogs.json`, `levels/*/level.spec.json`) ready for `chapter-implementer`. For the Kiroween build the target is ONE chapter of about 11 levels. Use whenever the user asks to design, plan, brainstorm or create a chapter, a level, a level pack, a story arc or a campaign issue. Level specs only reference existing assets; asset creation belongs to the ASSET PCG skills."
---

# Chapter Architect Intake (`chapter-architect-intake`)

This skill turns a high-level chapter idea into a complete, schema-validated `chapters/<chapter-slug>/` specification package before any runtime code is written.

**Category: LEVEL GEN** (see `.kiro/steering/skills-map.md`). Level generation composes levels and chapters from assets that already exist in `ModelCatalog` / `RoomKind`. If a level needs a model, room, texture or effect that does not exist yet, stop and use the matching ASSET PCG skill first (`procedural-malware-3d`, `procedural-rooms-3d`, ...); never invent asset IDs in a spec.

**Kiroween scope:** the hackathon build ships exactly **one chapter of about 11 levels**. Do not scaffold additional chapters; if the user asks for one, confirm it is post-hackathon work. Default structure: `1` tutorial + `6` task levels + `3` hub levels + `1` boss (the shape of the former `chapter-05-kiroween`), adjustable by the user within 10 to 12 levels.

Read `haunted-art-direction` first so every chosen `ModelCatalog` actor, `RoomKind`, and palette choice honours the Comix Zone art bible.

---

## 1. Dynamic 4-Round User Interview Protocol

Never dump a static 30-question form on the user, and never guess unstated creative choices. Conduct an adaptive **2-to-4 round dynamic intake** using the `ask_question` tool (or concise multi-choice prompts if `ask_question` is unavailable), skipping any question already answered in the user's prompt:

### Round 1 — Story Premise, Client Contract & Cast
Ask for:
1. **Premise & Client Stakes:** What broken system or client disaster pulled `DEV` in? (e.g., *Freelance PC Parts Storefront*, *Port Authority API Gateway*, *Full-Stack Bank Vault*, *Kubernetes Cluster Meltdown*).
2. **Veteran Ally Spirit (`allyNpc`):** Which hardware-bound mentor rides shotgun?
   - `(Recommended) hank.tty` (`door.socket` — 1978 UNIX sysadmin)
   - `ada.sh` (`door.loopback` — NetOps / TLS packet-routing specialist)
   - `linus.ko` (`door.firewall` — grumpy kernel / container architect)
   - Custom socket spirit (must use `hardware` + `signal` zones, never `human` zones per `HUMAN_ZONE_MISUSE`).
3. **Chapter Boss (`boss`):** Name, corrupted daemon process (`PID 1` or custom), and visual `ModelCatalog` ID (`boss.kernel` or `boss.forkbomb`).

### Round 2 — Scope, Level Count & Mechanics Mix
Ask for:
1. **Total Level Count:** Recommend **`11 levels`** for the single Kiroween chapter (`1` tutorial + `6` escalating task levels + `3` hubs + `1` 3-Phase Boss Finale). Accept `10` to `12`; anything else needs a reason, because the whole hackathon scope is one chapter.
2. **Mechanics Mix (`is_multi_select: true`):**
   - `(Recommended) Sanctuary Hub (/home/dev)` (`hub`)
   - `POSIX Terminal & Permissions Triage` (`terminal`)
   - `HTML + CSS Landing Page Repair` (`html-css`)
   - `JavaScript Logic & Skimmer Cleanup` (`terminal-code`)
   - `Dockerfile Image Forge` (`docker-image`)
   - `Multi-Service Docker Compose Stack` (`docker-compose`)
   - `3-Phase Kernel/Supervisor Boss` (`boss`)
3. **Learning Curve & Pacing:** Confirm whether players get both **Split Code Mini-Editor (`edit <file>`)** with optional **Patch Chips** and pure CLI **`sed -i`** paths.

### Round 3 — Enemy Roster & Room Sets
Ask which malware archetypes from `BESTIARY` should haunt the chapter (`is_multi_select: true`):
- **Tier 1 (Early rooms):** `bug`, `spyware`, `rootkit` (hidden dotfiles revealed by `ls -la`)
- **Tier 2 (Mid rooms):** `worm` + `crack` (`kill` PID before `rm`), `virus` (`kill -9`, never `rm`), `trojan` (`chmod -x` petrifies to stone)
- **Tier 3 (Container/Network rooms):** `ransomware` (locks pickups `mode 000`), `exploit` (`chmod -w` on overflow buffer), `zombie` (kill parent daemon)
- **Bosses:** `fork_bomb`, `kernel` (3-phase `kernelPhase()` shield -> verify -> anchor takedown)

Map rooms across `desk` -> `attic` -> `crypt_entrance` -> `lab_hall` -> `crypt_hall` -> `catwalk` -> `furnace` -> `core`.

### Round 4 — Comix Story Pages & Dialogue Voice
Ask for:
1. **Comix Issue Length:** How many full Comix pages (`2`, `4` *(Recommended)*, `6`, or `8` pages) and panels per page (`3`–`4` panels/page).
2. **Dialogue & Taunt Tone:**
   - `(Recommended) Vibe-Coder Satire + Gritty UNIX Mentor` (overconfident AI agent taunts vs. `hank.tty` dry Socratic hints)
   - `Cyberpunk Thriller`
   - `Pure Deadpan Sysadmin`
3. **Hint Granularity:** Confirm the 3-rung Socratic hint ladder (`Rung 1: Symptom`, `Rung 2: Tool/Concept`, `Rung 3: Exact Command`).

---

## 2. Generate the Structured Chapter Specifications

Once the user confirms the intake choices (or immediately if the user's prompt already specified all parameters), scaffold or author the chapter directory under `chapters/<chapter-id>/`:

```bash
node .kiro/skills/chapter-architect-intake/scripts/scaffold-chapter-specs.mjs \
  --id chapter-05-redis-nightmare \
  --issue 5 \
  --title "CACHE STAMPEDE" \
  --subtitle "Stale Keys, Thundering Herds & Docker Networks" \
  --client " ArcadeVault Indie Keys" \
  --levels 6 \
  --pages 4 \
  --mechanics hub,terminal,html-css,docker-image,docker-compose,boss \
  --enemies bug,worm,virus,ransomware,exploit,kernel
```

### Required Output Tree
```text
chapters/<chapter-id>/
├── README.md                     # Human-readable narrative arc & level table
├── chapter.manifest.json         # Issue metadata, allyNpc, boss, mechanicsSummary, level summaries
├── story/
│   ├── comix.spec.json           # Multi-page Comix script (pages -> panels -> rect, room, cast, caption, bubbles, sfx)
│   └── dialogs.json              # Cast colors + per-level banner, 3 hankRungs, and agentTaunt
└── levels/
    ├── level-01-.../
    │   ├── LEVEL.md              # Human design doc & narrative beat
    │   └── level.spec.json       # Executable VFS files, enemies, pickups, patches, winRules, solutionCommands
    └── ...
```

### Non-Negotiable Authoring Rules
1. **World Kill Rules Match `src/game/entities.ts`:**
   - `virus`: Never `rm` (`rm` clones it!). Always `kill -9 <pid>`.
   - `crack`: `rm` fails with `Text file busy` while running. `kill -9 <pid>` kills & removes it.
   - `trojan`: Do not execute; `chmod -x <file>` petrifies it into harmless stone.
   - `exploit`: `kill` is blocked (`Operation not permitted`); make its `buffer` read-only (`chmod -w <buffer>`).
   - `kernel` boss: `kill` is blocked; complete the 3-phase stream/socket/anchor sequence so `kernelPhase()` reaches `3/3`, which automatically drops `hp` to `0` and unlocks `exit`.
2. **Art-Bible Palette Guard (`HUMAN_ZONE_MISUSE`):**
   - Only `hero.dev` and `hero.hand` use `human` palette zones. Ally NPCs must use `door.socket`, `door.loopback`, or `door.firewall`.
3. **Anti-Softlock Protection:**
   - Mark every config, HTML, CSS, JS, `Dockerfile`, and `docker-compose.yml` required by `winRules` with `"questCritical": true` so `cron_restorer` respawns it if a player runs `rm` by mistake.

---

## 3. Validate Specs & Hand Off to `chapter-implementer`

Always run the validator before handing off:

```bash
node .kiro/skills/chapter-architect-intake/scripts/validate-chapter-specs.mjs --chapter <chapter-id>
```

Once validation prints `OK (0 errors)`, invoke the **`chapter-implementer`** skill (which orchestrates **`comix-story-drawer`** + **`chapter-level-generator`**) to draw the Comix PNG pages, compile `src/chapters/generated/catalog-data.ts`, register the chapter in `/chapters.html`, and verify a 0-death headless playthrough.
