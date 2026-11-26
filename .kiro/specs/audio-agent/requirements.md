# Audio agent: requirements

Status: approved (requirements, design and tasks approved by the user 2026-11-28)

Capability: an eighth agent of the team (`.kiro/specs/agent-team/`), `sound-designer`, owns the game's sound effects, music and voice lines and the code that maps app events to them (`src/audio/`). It writes prompts and generates samples with the ElevenLabs CLI (`elevenlabs` 1.13.0, logged in through OAuth in the macOS Keychain), only through one project wrapper with a credit cap. `lead-dev` delegates to it. The 36 ElevenLabs skills that sit untracked in `skills/` move into `.kiro/skills/` under a new `[AUDIO]` category, next to one project skill with the house rules.

## Requirements

### The agent

1. THE SYSTEM SHALL add `sound-designer` to the table in `scripts/harness/agents-build.mjs`, generate `.kiro/agents/sound-designer.json` from it, and give it a hand-written prompt `.kiro/agents/prompts/sound-designer.md`.
2. THE SYSTEM SHALL list `sound-designer` in `lead-dev`'s sub-agents (`subagent/sound-designer`), in its delegation table (sound effects, music, voice lines, cue mapping) and in the ownership table of `team-rules.md`, so the team is eight agents everywhere it is counted (prompts, steering `team.md`, `AGENTS.md`, `CLAUDE.md`, `docs/AGENTS_CREW.md`, the agent-team spec).
3. THE SYSTEM SHALL let `sound-designer` write only `public/sfx/**`, `public/music/**`, `docs/audio/SFX_LIST.md`, `docs/audio/MUSIC_LIST.md`, `src/audio/**`, `scripts/harness/audio-unit.mjs` and `scripts/harness/audio-smoke.mjs`; `lead-dev` SHALL no longer own `src/audio/**` and SHALL own `scripts/harness/audio-gen.mjs`, and `check-agents.mjs` SHALL no longer classify `public/sfx/` and `public/music/` as infrastructure.
4. WHEN `sound-designer` starts, THE SYSTEM SHALL load `sfx-and-music-pipeline` and `elevenlabs-{shared,text-to-sound-effects,music,text-to-speech,voices,audio-effects,usage,models}` within the CLI limit of 32 files and 100,000 characters.

### Generation through one wrapper

5. THE SYSTEM SHALL provide `scripts/harness/audio-gen.mjs`, the only way an agent reaches ElevenLabs. It SHALL take a cue name from `docs/audio/SFX_LIST.md`, `docs/audio/MUSIC_LIST.md` or a manifest, build the `elevenlabs text-to-sound-effects convert`, `music compose` (prompt or composition plan) or `text-to-speech convert` call with the house settings of the lists, write only into `public/sfx/` or `public/music/`, and update that folder's `manifest.json`.
6. WHEN the wrapper runs without `--generate`, THE SYSTEM SHALL print the request it would send and its estimated cost and SHALL NOT call the API (dry run is the default).
7. WHEN the wrapper runs with `--generate`, THE SYSTEM SHALL read `elevenlabs user subscription get` (`character_count`, `character_limit`) first, and IF the run's estimated cost exceeds 15,000 credits, or fewer than 30,000 credits (twice the cap) would remain, THEN it SHALL refuse without calling the API.
8. IF the CLI is not logged in, THEN THE SYSTEM SHALL fail with a message naming `elevenlabs auth login`, and SHALL never read, print or store an API key.
9. WHEN `ffmpeg` is on the PATH, THE SYSTEM SHALL trim leading and trailing silence, normalise the peak to -3 dBFS and, for loop rows, crossfade the join; IF it is missing, THEN the post step SHALL fail with a message naming `brew install ffmpeg` and leave the raw file in place, and no gate SHALL require `ffmpeg`.
10. THE SYSTEM SHALL deny every agent's shell the `elevenlabs` binary and `--output` (as today), and the shell guard hook SHALL refuse `audio-gen.mjs ... --generate` from any agent but `sound-designer`.

### Check

11. WHEN `node scripts/harness/audio-gen.mjs --check` runs, THE SYSTEM SHALL exit 1 on a manifest entry without its file, a file without a manifest entry, a name that is not in the matching list, or a cue that no app event or scene maps to; it SHALL make no network call.

### Skills

12. THE SYSTEM SHALL move all 36 `skills/elevenlabs-*` folders into `.kiro/skills/`, prefix each description with `[AUDIO]`, and leave no `skills/` folder at the root.
13. THE SYSTEM SHALL add `.kiro/skills/sfx-and-music-pipeline/SKILL.md` (`[AUDIO]`): models, settings, variants, naming, manifests, the wrapper, the cap, post-processing and how to map a new cue, taken from the two lists.
14. THE SYSTEM SHALL add the `[AUDIO]` category to `skills-map.md`, the skill count and categories in `AGENTS.md` and `CLAUDE.md`, and `sound-designer` to "Who uses which skills".

### Gates

15. `sound-designer` SHALL run `npm run quality`, `node scripts/harness/audio-unit.mjs`, `node scripts/harness/audio-smoke.mjs` and `node scripts/harness/audio-gen.mjs --check`; `qa` SHALL run `audio-unit` and `audio-smoke` when audio is in scope and SHALL NOT judge sound by ear.
16. `npm run quality:agents` SHALL pass with the eighth agent: its file matches the table, every source file has one owner, and the rule self-test proves `sound-designer` may run `audio-gen.mjs --generate` while every other agent is refused it and every agent is refused `elevenlabs ...` and `--output`.

## Out of scope

- Judging how a sample sounds; a person listens.
- Raising or changing the cap from inside a session (the cap lives in the wrapper, which `lead-dev` owns; Q11).
- Installing `ffmpeg` (the user runs `brew install ffmpeg`).
- The other ElevenLabs products the moved skills describe (agents, dubbing, studio, webhooks, workspaces, reception): the skills move, the agent is not allowed to call them.

## Decisions

- **Q:** What is asked for?
  **A (user, 2026-11-28):** "Extend the Kiro Crew agent team: create a new agent responsible for music and SFX, make it use the ElevenLabs CLI (installed) and proper skills. Check `skills/` here and adapt it to the Kiro Crew. Make sure lead-dev can use the new agent. Move the skills into `.kiro` too."

- **Q1:** Agent name?
  **A (user, 2026-11-28):** `sound-designer`.
- **Q2:** Which files does it own?
  **A (user, 2026-11-28):** `public/sfx/**`, `public/music/**` (plans and manifests included), `docs/SFX_LIST.md`, `docs/MUSIC_LIST.md`, and `src/audio/**` plus `scripts/harness/audio-unit.mjs` and `audio-smoke.mjs`, moved from `lead-dev`, so a new cue and its mapping land in one change.
- **Q3:** How does it call ElevenLabs?
  **A (user, 2026-11-28):** Through a project wrapper, `scripts/harness/audio-gen.mjs`: takes a row name from the list or manifest, calls `elevenlabs`, writes only into `public/sfx` or `public/music`, updates the manifest, supports `--dry-run`. `--output` stays denied in every agent's shell.
- **Q4:** How is credit spending limited?
  **A (user, 2026-11-28):** A cap per run: the wrapper reads the remaining credits before generating and refuses past the cap. It generates only when the brief says "generate"; otherwise it writes prompts and dry runs.
- **Q5:** What happens to the 36 skills?
  **A (user, 2026-11-28):** All 36 move into `.kiro/skills/`, tagged with a new `[AUDIO]` category in `skills-map.md`, plus one project skill `sfx-and-music-pipeline` built from the rules of the two lists. The agent loads that skill plus `elevenlabs-{shared,text-to-sound-effects,music,text-to-speech,voices,audio-effects,usage,models}`.
- **Q6:** Cap per run?
  **A (user, 2026-11-28):** 15,000 credits; the wrapper also refuses when fewer than twice the cap would remain. Credits are read from `elevenlabs user subscription get` (`character_count` / `character_limit`; on that day 84,517 of 130,291 used, tier `creator`).
- **Q7:** Speech too?
  **A (user, 2026-11-28):** Yes: SFX, music and the voice lines (`taunt_*`, `kiro_advice*`: text-to-speech, a voice, the robot filter).
- **Q8:** Post-processing?
  **A (user, 2026-11-28):** Install `ffmpeg` and let the wrapper call it for trim, -3 dBFS peak and loop joins.
- **Q9:** Authentication?
  **A (user, 2026-11-28):** The existing Keychain OAuth login; the wrapper fails clearly when it is not logged in. No key on disk.
- **Q10:** Gates and QA?
  **A (user, 2026-11-28):** `sound-designer` runs `npm run quality`, `audio-unit.mjs`, `audio-smoke.mjs` and a new `audio-gen.mjs --check` (orphans both ways, names against the lists, every cue mapped); `qa` adds `audio-unit` and `audio-smoke` to its audio scope and does not judge sound by ear.
- **Q12:** Approve the requirements?
  **A (user, 2026-11-28):** "Go for it."
- **Q13:** Approve design and tasks, and move the lists to `docs/audio/`?
  **A (user, 2026-11-28):** "I approve" (the design as written: the two lists move to `docs/audio/`, so Req 3 and 5 name the new paths).
- **Q11:** Who owns `scripts/harness/audio-gen.mjs`, and with it the cap?
  **A (user, 2026-11-28):** `lead-dev`, so the agent that spends credits cannot raise its own cap (the same reason `lead-dev` owns the visual audit of `qa`). A wrapper change is a handoff to `lead-dev`.

## Open questions


## Verification

- Req 1-4, 10, 16: `npm run quality:agents` (table, ownership, resource limit, rule self-test) and `kiro-cli agent validate --path .kiro/agents/sound-designer.json`.
- Req 5-9: a unit suite for the wrapper against a fake `elevenlabs` on the PATH (dry run sends nothing, cap and reserve refusals, not-logged-in message, `ffmpeg` missing), plus one real `--generate` of one short cue, run by the user.
- Req 11: `audio-gen.mjs --check` on the current tree, and on a temporary copy with one orphan each way.
- Req 12-14: `npm run quality:root` (no `skills/` at the root) and a check that every `.kiro/skills/*/SKILL.md` description starts with a known tag.
- Req 15: one real task through `lead-dev` that `sound-designer` finishes and `qa` checks.
