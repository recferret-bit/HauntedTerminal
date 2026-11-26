---
name: feature-spec-grill
description: "[WORKFLOW] Spec-first intake for any new feature or big refactor (new command, mechanic, item, page, lab, layer, model category, contract or save-data change; any rework, redesign, rewrite or migration). Scaffolds `.kiro/specs/<name>/`, grills the user in rounds until every open question has their answer, records the answers as Decisions, and walks requirements -> design -> tasks with an explicit user approval at each gate before any code is written. Also used to write a spec retroactively when code was written first. Use whenever the user asks to implement, add, build, rework, refactor or redesign something that qualifies under `.kiro/steering/spec-first.md`."
---

# Feature spec grill (`feature-spec-grill`)

**Category: WORKFLOW**, cross-cutting. It runs before the ASSET PCG and LEVEL GEN skills and decides which of them the tasks will use. Rule: `.kiro/steering/spec-first.md`. Gate: `npm run quality:specs`.

The goal is a spec the user recognises as theirs. Every product, scope and architecture choice in it is either answered by the user or explicitly delegated by them ("you pick"). It is never silently assumed.

## 1. Scaffold or resume

```
ls .kiro/specs/                                                   # resume an existing spec on the same topic
node .kiro/skills/feature-spec-grill/scripts/scaffold-spec.mjs <kebab-name> [--bugfix]
```

The scaffold writes `requirements.md` (or `bugfix.md`) with `Status: draft`, `## Requirements`, `## Out of scope`, `## Decisions`, `## Open questions` and `## Verification`. It refuses to overwrite an existing spec. `design.md` and `tasks.md` are written later, at their own phase, using the templates in section 4.

From Kiro CLI, `/spec new <name>` or `/spec <name>` works on the same folder. Keep the `Status:` line and the sections this skill uses.

**Retroactive spec** (code exists, no spec). Read the code and the diff (`git status`, `git diff --stat`). Write what it does as requirements tagged *(proposed, from code)*. List every choice the code made on its own as a `- [ ]` open question. Do not write more code until the spec is `approved`.

## 2. Grill

Ask in rounds of up to five questions, using the `ask_question` tool when it is available. Each question:

- is concrete, and can be answered in one line or by picking an option;
- offers 2 to 4 options, marks one `(Recommended)` and gives the trade-off in one clause;
- skips anything the user already answered.

After each round, move every answer into `## Decisions`:

```
- **Q:** Where does the laptop open: over the comic stage, or in place of it?
  **A (user, 2026-11-15):** Over the stage, the terminal stays visible.
```

A delegated answer is written as `**A (user delegated, 2026-11-15):** <the default you chose>`. Any new question you think of goes under `## Open questions` as `- [ ] ...`. Keep going until that section is empty. Then ask for approval of the requirements.

### Question bank (pick what applies; do not ask all of it)

1. **Intent.** What problem does it solve for the player or the developer? What does "done" look like in one sentence?
2. **Player experience.** How does the player find it, use it and leave it? Which terminal commands does it add? What text does `help` and `man` show? What happens on a wrong input?
3. **Scope.** What is in this spec and what is explicitly out (later, or never)? Does it fit the Kiroween scope (one chapter of about 11 levels)?
4. **Content as data.** Is level content involved (tasks, puzzles, dialogue, which level gives an item)? If so, it is chapter spec data played by generic code. Which new step, condition, win rule or manifest field does it need? That is a vocabulary change in four places: type, interpreter, editor schema and validator (`declarative-chapters.md`).
5. **Existing systems.** Which existing system does it reuse or overlap? Candidates are `src/chapters/validators.ts` (HTML/CSS, JS, Docker task checks), the Terminal Lab, editor-core, `ModelCatalog` and progress or perks. Should it extend that system or stand alone?
6. **Architecture.** Which layer owns it (`architecture.md`)? Does it need a new `src/<area>/`, layer rule, page or route? Is it Three.js or DOM? Who may import it?
7. **State and saves.** Is the state per level, per chapter or per run? Does it persist? Which key does it use? What does a preview or lab record (nothing)? Does it interact with `manifest.grants`?
8. **Assets.** Does it need new models, rooms, textures, FX or animation? Each one is an ASSET PCG task with its validator and a visual QA pass. Does it add a model category? That changes `quality:fingerprint`.
9. **Tooling.** Does `/editor`, `/terminal-lab` or the storybook need to show or edit it? Does it need a dev lab page of its own?
10. **Security and performance.** Does it run player code? Then decide the sandbox, timeouts and CSP. What is the frame or bundle budget?
11. **Refactors only.** What must stay byte-identical (fingerprint, transcripts, saves)? Is there a migration path for old saves? Should it ship as one change or in steps?
12. **Verification.** Which gates prove each requirement (headless playthrough, a lab file, a smoke test, a unit suite)? Which requirement has no automatic check, and how will a person check it?

## 3. Gates and statuses

| Status | Meaning | Before moving on |
|---|---|---|
| `draft` | Grilling. No code. | `## Open questions` is empty, and the user approves the requirements in words. |
| `requirements-approved` | Requirements fixed. Design is being written. | The user approves `design.md`. |
| `design-approved` | Design fixed. Tasks are being written. | The user approves `tasks.md`. |
| `approved` | Code may be written, task by task. | Every task is ticked and its gates are run. |
| `done` | Shipped. Later edits are maintenance. | (none) |

Change the `Status:` line only at a gate, and add the date and who approved: `Status: approved (requirements, design, tasks approved by the user 2026-11-15)`. Never move a spec past `draft` yourself because answers "seem obvious". After each edit, run `node scripts/quality/check-specs.mjs`.

The status lives only in `requirements.md` (or `bugfix.md`). `design.md` and `tasks.md` carry no status of their own: write `Status: see requirements.md` (or `see bugfix.md`) there, and keep dated notes on the requirements line. The gate fails on a design or tasks status that disagrees, on an `approved` spec whose tasks are all ticked (run the gates and set `Status: done`), and counts `[ ]`, `[-]` and `[~]` boxes (with `-` or `*` bullets) as unticked.

## 4. Templates

**requirements.md**: see the scaffold. Requirements are numbered and written in EARS: `WHEN <trigger>, THE SYSTEM SHALL <response>`, `IF <bad case>, THEN THE SYSTEM SHALL ...`, `WHILE <state>, THE SYSTEM SHALL ...`.

**design.md**, in the style of `.kiro/specs/inventory/items/terminal/design.md`:

```
# <Feature>: design

## Pieces
<file tree: each new or changed file, one line on what it owns>

## Decisions
- **<choice>.** <why, which alternative was rejected, which Decision in requirements.md it follows>

## Layers and gates
<layer rule changes (check-layers.mjs), new pages (vite.config.ts), vocabulary changes, fingerprint impact>
```

**tasks.md**:

```
# <Feature>: tasks

- [ ] 1. <one reviewable change>. _Req 1, 3_. Gates: `npm run quality`, `<suite>`
- [ ] 2. ...
- [ ] N. Docs: steering (architecture, structure, tech, glossary), AGENTS.md, CLAUDE.md, skills-map, README. _All_
```

## 5. Done

Every task is ticked. The gates named in `## Verification` were run and reported. The steering and the skills describe the new system. Then `Status: done`.
