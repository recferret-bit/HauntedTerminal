---
inclusion: fileMatch
fileMatchPattern: "{comix/**,src/cinematic/**,src/comix-editor/**}"
---

# Declarative comix

Comixes are data. A new kind is typed in `spec-types.ts`, interpreted once in `src/cinematic`, and added to `src/comix-editor/schema.ts`. The editor at `/comix-editor` is how humans tune them. Canonical JSON is `JSON.stringify(value, null, 2)` plus a trailing newline (a no-op save changes zero bytes).

Intro and outro are the comixes Kiroween ships (`comix/intro/`, `comix/outro/`). The player is `src/cinematic/`. It does not name a line, a panel time or a camera move.
