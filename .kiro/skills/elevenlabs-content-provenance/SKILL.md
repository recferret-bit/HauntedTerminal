---
name: "elevenlabs-content-provenance"
description: "[AUDIO] Check audio for an embedded ElevenLabs watermark to verify where it came from."
---

# content-provenance

> **PREREQUISITE:** Read `../elevenlabs-shared/SKILL.md` for auth, global flags, and output formatting. If missing, run `elevenlabs generate-skills` to create it.

```bash
elevenlabs content-provenance <method> [flags]
```

## API Resources

 - `watermark` — Check Watermark
## Discovering Commands

**Agents: always prefer `--schema` over `--help`** — `--schema` returns JSON; `--help` returns human prose.

```bash
# Machine-readable surface (use this)
elevenlabs content-provenance --schema
elevenlabs content-provenance <method> --schema

# Human-readable help (for humans)
elevenlabs content-provenance --help
```


## Nothing here fits?

`--schema` and `--help` list only what exists. If the user's request cannot be done
with any command, report the gap — it is how missing commands get built:

```bash
elevenlabs feedback missing-capability "<what you needed>"
```
