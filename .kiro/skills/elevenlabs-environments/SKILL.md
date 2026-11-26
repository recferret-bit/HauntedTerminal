---
name: "elevenlabs-environments"
description: "[AUDIO] Manage workspace environments that environment variables can hold values for."
---

# environments

> **PREREQUISITE:** Read `../elevenlabs-shared/SKILL.md` for auth, global flags, and output formatting. If missing, run `elevenlabs generate-skills` to create it.

```bash
elevenlabs environments <method> [flags]
```

## API Resources

 - `create` — Create Environment
 - `delete` — Delete Environment
 - `list` — List Environments
## Discovering Commands

**Agents: always prefer `--schema` over `--help`** — `--schema` returns JSON; `--help` returns human prose.

```bash
# Machine-readable surface (use this)
elevenlabs environments --schema
elevenlabs environments <method> --schema

# Human-readable help (for humans)
elevenlabs environments --help
```


## Nothing here fits?

`--schema` and `--help` list only what exists. If the user's request cannot be done
with any command, report the gap — it is how missing commands get built:

```bash
elevenlabs feedback missing-capability "<what you needed>"
```
