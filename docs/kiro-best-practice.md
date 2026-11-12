# Kiro Best Practices for Haunted Terminal

Short version: put **facts** in steering, **procedures** in skills, **truth** in JSON schemas, **enforcement** in hooks, and **capabilities** in specs. A complex game gets messy when those roles blur.

## Core principle for the game

Anything an agent might get wrong should be checked by a script, not by prose. With many entities, interaction rules, screens and transitions, agents will drift unless a validator catches them. So:

1. Screens, entities, rules and transitions are data (JSON) with JSON Schemas.
2. A `validate` script checks the data, including cross-references such as "this transition points to a screen that exists".
3. Skills teach agents how to author data.
4. Hooks run the validator automatically.

## Suggested layout

```
content/                  # the game, as data
  schemas/                # screen, entity, rule, transition, command JSON Schemas
  screens/                # one JSON per page/panel layout
  entities/
  rules/
  transitions/
  commands/               # puzzle/command definitions
scripts/validate-content.ts
docs/                     # long-form design (game bible, rule semantics)
src/                      # engine: renderer, rule engine, shell emulator
.kiro/
  steering/ specs/ skills/ hooks/ settings/
```

## Steering (facts, always-true context)

Keep each file short and non-overlapping. Suggested files:

- `product.md` (always): the vision, i.e. Comix Zone style comic pages and panels, with a terminal as the only input and unix commands and code as the gameplay. List the design pillars.
- `tech.md` (always): Three.js, xterm, Vite and TypeScript strict mode, plus how to run build, validate and test.
- `structure.md` (always): the layout above and where things go.
- `glossary.md` (always, short): the exact meaning of Page, Panel, Entity, Rule, Transition and Command. Agents invent inconsistent vocabulary without this.
- `content-authoring.md` (`inclusion: fileMatch`, pattern `content/**/*.json`): ID naming, references and conventions, and a pointer to the skills.
- `spec-conventions.md` (`inclusion: manual`): how your specs should be written. Pull it in with `#` when needed.

Use `#[[file:content/schemas/screen.schema.json]]` references instead of pasting schemas, so there is one source of truth. Don't put the whole game design in steering. That bloats every request, so keep long design material in `docs/` and link to it.

## Specs (capabilities, not content)

Don't make one spec per screen. Screens are data and skills produce them. Specs are for building the systems that interpret that data. Each spec lives in `.kiro/specs/<name>/` with `requirements.md`, `design.md` and `tasks.md`.

Suggested spec set, in dependency order:

1. `entity-model`: entity types, components and state.
2. `rule-engine`: how entities interact. Define rules declaratively as condition, effect and priority, and specify conflict resolution and ordering explicitly.
3. `screen-schema-and-renderer`: the declarative screen format plus its Three.js rendering (panels, layers, the vibecoder breaking out of the frame).
4. `transition-system`: page and panel transitions, plus state handoff between screens.
5. `terminal-shell`: the virtual unix shell (a fake filesystem, which commands exist, parsing, and how input becomes game events).
6. `code-execution`: how the code the player writes is sandboxed and evaluated. This is its own risk, so give it its own spec.
7. `content-pipeline`: the validator, cross-reference checks and the skills' contract.
8. `save-progress`: game state persistence.

Practices:

- Write requirements in EARS form ("WHEN the player enters `ls` in the cellar screen, THE SYSTEM SHALL..."). They map directly to tests.
- Treat the interaction rules as a specified matrix or table in `design.md`, because that's the hardest thing to get right.
- Keep specs small enough to finish in one go. Split a spec that has more than about 15 tasks.
- Have tasks reference requirement numbers, and put tests inside the tasks.
- When the schema changes, update the spec's design and the schema in the same change.
- Build the first vertical slice (one page, two panels, one command, one transition) before the full set.

## Skills (procedures for populating the declarative data)

This is where the content workflow lives. Each skill is a folder with a `SKILL.md` (front-matter `name` and `description`, then steps). Candidates:

- `create-screen`: copy the template, fill the fields, register the transitions, run validate.
- `create-entity`
- `create-rule`
- `create-transition`
- `create-command-puzzle`
- `validate-content`: run the validator and interpret its errors.

Each skill should say which schema applies, include one canonical example, list common mistakes, and end with "run `npm run validate` and fix everything". The description in the front-matter decides when it activates, so make it specific.

## Hooks (cheap, fast enforcement)

Hooks are JSON files in `.kiro/hooks/`. Useful ones:

- `PostFileSave` on `content/.*\.json`: run the content validator.
- `PostFileSave` on `src/.*\.ts`: run `tsc --noEmit`.
- `Stop`: run the validator and typecheck as a final gate.
- `PreToolUse` guard: block (exit 2) or ask before edits to `content/schemas/**`, since schema changes ripple everywhere.

Keep them fast, since slow hooks make the agent sluggish. Avoid hooks that rewrite files, and prefer ones that only report errors.

## Settings

Keep `mcp.json` empty until you need something. Likely later additions are an image or asset tool for comic art, or a docs server. Anything a script can do offline is better as a plain script plus a skill.

## Suggested order

1. Write steering (`product`, `tech`, `structure`, `glossary`).
2. Write the first JSON schemas and a validator.
3. Add the hooks that run the validator.
4. Write the `create-screen` skill and test it on a sample.
5. Write the `screen-schema-and-renderer` spec and implement the slice.
6. Add other specs and skills as the engine needs them.

## Open decision

Screen format: panel-based (a page with a grid of panels) or free layout?
