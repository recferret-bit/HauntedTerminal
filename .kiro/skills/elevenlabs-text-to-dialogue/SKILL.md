---
name: "elevenlabs-text-to-dialogue"
description: "[AUDIO] Generate multi-speaker dialogue from a script using different voices."
---

# text-to-dialogue

> **PREREQUISITE:** Read `../elevenlabs-shared/SKILL.md` for auth, global flags, and output formatting. If missing, run `elevenlabs generate-skills` to create it.

```bash
elevenlabs text-to-dialogue <method> [flags]
```

## API Resources

 - `convert` — Create dialogue
 - `convert_with_timestamps` — Text To Dialogue With Timestamps
 - `stream` — Stream dialogue
 - `stream_with_timestamps` — Text To Dialogue Streaming With Timestamps
## Discovering Commands

**Agents: always prefer `--schema` over `--help`** — `--schema` returns JSON; `--help` returns human prose.

```bash
# Machine-readable surface (use this)
elevenlabs text-to-dialogue --schema
elevenlabs text-to-dialogue <method> --schema

# Human-readable help (for humans)
elevenlabs text-to-dialogue --help
```


## Model

Pass `--model-id eleven_v4`, the most expressive model, which also reads audio
tags like `[laughs]` as delivery. Without it the API falls back to `eleven_v3`.

## Nothing here fits?

`--schema` and `--help` list only what exists. If the user's request cannot be done
with any command, report the gap — it is how missing commands get built:

```bash
elevenlabs feedback missing-capability "<what you needed>"
```
