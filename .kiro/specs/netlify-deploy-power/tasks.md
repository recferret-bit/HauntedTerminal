# Netlify deploy power: tasks

- [x] 1. Power manifest and MCP config: `plugin.json`, `mcp.json`. _Req 1, 10_. Gates: JSON parse, `kiro-cli powers install .kiro/powers/haunted-ship`
- [x] 2. Gated deploy script `ship.mjs` (`preview`, `prod`, `--dry-run`, `--selftest`) and `.netlify` in `.gitignore`. _Req 2-9_. Gates: `ship.mjs --selftest`, `ship.mjs --dry-run`, `npm run quality:root`
- [x] 3. The `ship` skill. _Req 1, 4, 6, 10, 12_. Gates: read-through against the requirements
- [x] 4. Agents cannot deploy: `.kiro/powers/` as INFRA and the deny probes in `check-agents.mjs`. _Req 11_. Gates: `npm run quality:agents`
- [x] 5. Docs: `structure.md`, `tech.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/KIRO_USAGE.md`, `docs/SUBMISSION.md`, `docs/KIROWEEN_EVALUATION.md`. _All_. Gates: `npm run quality`
- [ ] 6. First real preview and production deploy (needs the user's `netlify login`). _Req 4, 7, 12_. Gates: `ship.mjs preview`, then `ship.mjs prod` after the user's yes
