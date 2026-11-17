# MCP: Chrome DevTools and haunted-forge: tasks

- [x] 1. Add the SDK (`npm install -D --save-exact @modelcontextprotocol/sdk@1.32.2`) and write `tools.mjs` with its units in `forge-unit.mjs`. _Req 4-11_. Gates: `forge-unit.mjs`, `npm run quality:root`
- [x] 2. Write `server.mjs` (stdio, zod schemas, stdout reserved) and the protocol half of `forge-unit.mjs`. _Req 4, 11, 14_. Gates: `forge-unit.mjs`
- [x] 3. Read Chrome DevTools MCP's real tool names, add the `mcp` field to the agents table (servers, selectors, `includeMcpJson: false`, the lead's allow rules), regenerate the agents. _Req 1, 2, 12_. Gates: `agents-build.mjs`, `kiro-cli agent validate` on every agent, `quality:agents`
- [x] 4. `devtools-url-guard.mjs` and its unit tests in `agents-unit.mjs`, wired as a `qa` PreToolUse hook. _Req 3_. Gates: `agents-unit.mjs`
- [x] 5. `check-agents.mjs`: MCP checks (exact lists, no wildcard, pinned, `write_level` only for `chapters-designer`, lead has no server, empty `mcp.json`, prompts name their tools), with planted-bad self-tests. _Req 13, 15_. Gates: `quality:agents`
- [x] 6. Prompts and skills: `qa`, `chapters-designer`, `comix-designer`, `team-rules.md`, the `chapter-level-generator` skill. _Req 15_. Gates: `quality:agents`
- [x] 7. `mcp-probe.mjs` against the real Kiro CLI; write the findings (permission rule shape, sub-agent rule, URL refusal text) into the design's "Found while building"; run it and save the QA report in `docs/qa/`. _Req 16, 2, 3, 12_. Gates: `mcp-probe.mjs`
- [x] 8. The `write_level` property (a refused write changes nothing; a written level passed the checks), in `forge-unit.mjs` (the property runner is synchronous; see the design). _Req 9, 10_. Gates: `forge-unit.mjs`, planted-bug check
- [x] 9. `quality:mcp` in `package.json` and in `npm run quality`. _Req 14_. Gates: `npm run quality`
- [x] 10. Docs: `.kiro/steering/{tech,structure,team}.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/{KIRO_USAGE,SUBMISSION,KIROWEEN_EVALUATION,AGENTS_CREW}.md`. _All_. Gates: `npm run quality`
