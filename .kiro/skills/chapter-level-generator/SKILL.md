---
name: chapter-level-generator
description: "[LEVEL GEN] Step 3 of level generation (compiler and solver). Compile declarative chapter folders (`chapters/*/chapter.manifest.json`, `levels/*/level.spec.json`, story files) into `src/chapters/generated/catalog-data.ts`, validate HTML/CSS, JS, Dockerfile and Docker Compose level tasks via `src/chapters/validators.ts`, and run fast headless solvability playthroughs under enemy tick pressure. Use whenever adding, editing, compiling or testing levels, win rules or level mechanics of a chapter."
---

# Chapter Level Generator (`chapter-level-generator`)

**Category: LEVEL GEN** (see `.kiro/steering/skills-map.md`). A level here is declarative data (`level.spec.json`): files, enemies, pickups, win rules and the canonical solution. It never defines new geometry, shaders or particle presets. Kiroween scope: one chapter, about 11 levels, all of which must clear headlessly with 0 deaths.

This skill compiles declarative JSON specs under `chapters/` into strongly-typed TypeScript catalog modules (`src/chapters/generated/catalog-data.ts`) executed by `createChapterSession` (`src/chapters/chapter-session.ts`), and proves every level is 100% solvable with 0 deaths.

---

## 1. Supported Declarative `WinRule` & Mechanic Types

Every `levels/<level-id>/level.spec.json` declares:
- **`mechanic`:** `'hub' | 'terminal' | 'html-css' | 'terminal-code' | 'docker-image' | 'docker-compose' | 'boss'`
- **`roomKind`:** `'desk' | 'attic' | 'crypt_entrance' | 'crypt_hall' | 'chasm' | 'cell' | 'lab_hall' | 'catwalk' | 'furnace' | 'core' | 'outro'`
- **`files[]`:** VFS files, directories, and `.sock` UNIX domain sockets (`questCritical: true` registers automatic 2-tick `cron_restorer` protection).
- **`enemies[]` & `pickups[]`:** Live `World` spawns (`src/game/entities.ts`).
- **`patches[]`:** Optional 1-click Patch Chips surfaced inside the Split Code Mini-Editor (`edit <file>`).
- **`winRules[]`:**
  - `read_file` (`cat <path>`)
  - `talk_ally` (`hank` or `cat hank.tty.sock`)
  - `file_absent` (`rm <path>`)
  - `file_contains` (`sed -i` or `edit <file>`)
  - `dir_accessible` (`chmod +rx <dir>`)
  - `enemy_neutralized` (`kill`, `rm`, `chmod -x`, or `chmod -w <buffer>`)
  - `html_css_valid` (validated by `validateStorefrontHtmlCss` in `src/chapters/validators.ts`)
  - `cart_js_valid` (validated + test-vector executed by `validateCartJs`)
  - `docker_image_running` (`docker build -t <tag> .` + `docker run -d -p <port>:<port> <tag>`)
  - `docker_compose_healthy` (`docker compose up -d` across `nginx`, `website`, `payment`)
  - `boss_defeated` (3-phase stream -> verify socket -> anchor override takedown)

---

## 2. Commands

### Compile `chapters/*` -> `src/chapters/generated/catalog-data.ts`
```bash
node scripts/harness/generate-chapter.mjs
```

### Compile + Run Full Headless Playthrough Verification (with Enemy Tick Pressure)
```bash
node scripts/harness/generate-chapter.mjs --verify --ticks 3
```

### Run Validator + Runtime Edge-Case Self-Tests
```bash
node .kiro/skills/chapter-level-generator/scripts/self-test.mjs
```

---

## 3. Authoring Checklist Before Marking Done
1. Every `level.spec.json` has a non-empty `solutionCommands[]` that starts in `spec.cwd` and ends with `cd <exitDir>` (or `exit` on the final boss).
2. Both **CLI players** (`sed -i`) and **Split Editor players** (`edit <file>` + Patch Chips) can solve every code/config task.
3. `node scripts/harness/generate-chapter.mjs --check` exits `0` (generated TS matches JSON specs on disk).
