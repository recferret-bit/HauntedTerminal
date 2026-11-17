---
inclusion: always
---

# Spec-first work

A new feature or a big refactor starts as a **Kiro spec** in `.kiro/specs/<name>/`, not as code. The user is grilled until every open question has their answer, and approves each phase. Only then is code written. Procedure, question bank and templates: skill `feature-spec-grill`.

## Does the request qualify?

It qualifies if any of these is true:

- It adds something the player or a developer can use: a command, mechanic, item, page, mode, lab or UI surface.
- It creates a new `src/<area>/`, a new `pages/*.html`, a layer rule, a route, a model category or a dependency.
- It changes a vocabulary (chapter, comix, Terminal Lab), a type in `src/contracts/`, save data or progress, or a security boundary (for example, running player code).
- It reworks, redesigns, replaces or migrates an existing system, or it changes behaviour across two or more layers.

It does not qualify when it is a bug fix with clear expected behaviour, a tuned value, content inside an existing vocabulary (chapters and comixes have their own intake skills), one asset made through its skill, or docs. Unsure? It qualifies.

Say the result in one line before doing anything else, for example: "Spec-first: yes, this adds a new item system."

## The workflow

1. **Stop.** Write no source code. If a spec for the topic exists in `.kiro/specs/`, resume it.
2. **Scaffold** with `node .kiro/skills/feature-spec-grill/scripts/scaffold-spec.mjs <name>`. The new spec has `Status: draft`.
3. **Grill.** Ask in rounds of at most five questions. Each question offers options, a recommended default and its trade-off. Do not answer for the user and do not fill gaps with guesses. Open questions are `- [ ]` items under `## Open questions`. Each answer moves to `## Decisions`, attributed to the user.
4. **Approve requirements.** Once `## Open questions` is empty, show the requirements and ask for approval. Approval has to be explicit; silence or "looks fine so far" does not count. Then set `Status: requirements-approved`.
5. **Design**, then ask for approval, then set `design-approved`. Then write **tasks**, ask for approval, and set `approved`. Every task names the requirements it covers and the gates it runs.
6. **Implement** task by task and tick each one. A new question or a scope change stops the work: ask the user, record the answer, and update the requirements first.
7. **Finish.** Run the gates. Update steering, `AGENTS.md`, `CLAUDE.md`, skills and hooks in the same change. Set `Status: done` once every task is ticked.

Statuses, in order: `draft`, `requirements-approved`, `design-approved`, `approved`, `done`. A bugfix spec uses `bugfix.md` in place of `requirements.md`.

## Code that was written before its spec

Do not delete it and do not keep extending it. Write the spec from what exists. Mark the existing behaviour as *proposed*, not decided. List every choice the code made on its own as an open question, then grill the user as above.

## Enforced by

- The `spec-first-on-prompt` hook puts this reminder in context when a prompt reads like a feature or a refactor.
- The `guard-spec-first` hook blocks writes into a new `src/<area>/` or a new `pages/*.html` until a spec that names the path reaches `approved`. It asks before edits to `check-layers.mjs` and `vite.config.ts`.
- `npm run quality:specs` (part of `npm run quality`) fails on a bad status, open questions past `draft`, a missing `## Decisions` section, or new areas without an approved spec. The `spec-status-on-stop` hook reports the same problems when a turn ends.
