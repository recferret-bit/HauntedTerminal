# MCP: Chrome DevTools and credits-forge: requirements

Status: done (requirements, design and tasks: every answer delegated by the user, "lets use your recommendations", 2026-11-17; all tasks done 2026-11-17, probe 9/9)

Capability: two MCP servers for the agent team. Chrome DevTools MCP lets `qa` look at the real game in Chrome (screenshots, console, DOM, network) instead of a hand-written CDP client. `credits-forge`, a server of our own, lets agents list the valid asset ids and validate, solve and write a level through tools, so a level that fails validation or does not clear with 0 deaths cannot reach `chapters/` through the forge. Each agent gets only the tools it needs, `npm run quality` checks the lists, and a probe against the real Kiro CLI proves the agents call them.

## Requirements

1. THE SYSTEM SHALL declare each MCP server in the `mcpServers` of the agents that use it (the agents table in `scripts/harness/agents-build.mjs`), list its tools in that agent's `tools` as exact `@server/tool` selectors (never `@server`, `@mcp` or `*`), set `includeMcpJson` and `includePowers` to `false`, refuse every other MCP tool with a catch-all deny, and keep the workspace `.kiro/settings/mcp.json` empty.
2. THE SYSTEM SHALL give Chrome DevTools MCP to `qa` only, started from an exact pinned version fast enough to be connected when the agent's first turn starts, headless, with an isolated temporary profile, usage statistics and CrUX lookups off, JavaScript evaluation off, `file:` navigation off, and an allowed-URL list of the local dev servers and `*.netlify.app` (Chrome enforces it, requests and redirects included).
3. IF a Chrome DevTools tool call carries a URL outside the allowed list (`localhost`, `127.0.0.1`, `*.netlify.app`), THEN THE SYSTEM SHALL block the call in a PreToolUse hook (`@chrome-devtools`) before the server sees it. The hook is a second fence; the server flag is the first.
4. THE SYSTEM SHALL provide the `credits-forge` MCP server (stdio) with exactly these tools: `list_assets`, `list_levels`, `get_level`, `validate_level`, `solve_level`, `write_level`.
5. WHEN `list_assets` is called, THE SYSTEM SHALL return the ids a level or comix spec may reference: model ids with their category, room kinds, and FX ids, read from the catalogs the game uses.
6. WHEN `list_levels` or `get_level` is called, THE SYSTEM SHALL return the levels of a chapter (id, index, title, mechanic) or one level's spec with its current etag, read from disk.
7. WHEN `validate_level` is called with a level spec, THE SYSTEM SHALL return the same issues as the chapter editor's Check tab (`checkPack`) for the chapter with that level in place, as structured data (`severity`, `where`, `message`), without touching the disk.
8. WHEN `solve_level` is called with a level spec, THE SYSTEM SHALL play that level's `solutionCommands` headlessly under enemy tick pressure (the chapter's grants applied) and return `ok`, `commands`, `deaths`, `problem` and the last output, without touching the disk.
9. WHEN `write_level` is called with a level id, a spec and the etag the caller read, and the spec has 0 validation errors, solves with 0 deaths, and the etag matches the file on disk, THE SYSTEM SHALL write the spec with the canonical chapter JSON writer (atomically) and recompile the catalog exactly as `/editor` does.
10. IF `write_level` fails any of those checks, or the level id is not in the manifest, or the target path leaves the chapter folder, THEN THE SYSTEM SHALL refuse with the reasons and leave every file byte-identical.
11. THE SYSTEM SHALL validate every tool input (types, id and slug shape, spec size limit) before acting, and SHALL write only through `write_level`.
12. THE SYSTEM SHALL give `write_level` to `chapters-designer` only; `list_levels`, `get_level`, `validate_level` and `solve_level` to `chapters-designer` and `qa`; `list_assets` to `chapters-designer`, `comix-designer` and `qa`; and no MCP tool to the other agents. `lead-dev` has no MCP server and no MCP tool of its own, and its session permissions allow its sub-agents' MCP tools (a sub-agent's call is checked against the parent session too).
13. WHEN `npm run quality` runs, THE SYSTEM SHALL fail IF an agent's MCP servers, tool selectors or permissions differ from the table, a selector is a wildcard, a server is not pinned to an exact version, `write_level` is reachable by anyone but `chapters-designer`, `lead-dev` holds an MCP server, or `.kiro/settings/mcp.json` is not empty.
14. THE SYSTEM SHALL ship a forge test (`scripts/harness/forge-unit.mjs`, run by `npm run quality`) that starts the real server over stdio with the SDK client and checks: the tool list, each tool on a known level, a refused `write_level` for each failure case with the disk unchanged, and a successful `write_level` on a temporary copy of the chapter.
15. THE SYSTEM SHALL tell the agents when to use the tools: `qa` looks at the game through Chrome DevTools MCP for any claim about what is on screen and attaches the screenshots to its report; `chapters-designer` runs `validate_level` and `solve_level` on a changed or new level spec and saves it through `write_level`. The prompts and skills say so, and `check-agents.mjs` checks that each prompt names its tools.
16. WHEN the probe `node scripts/harness/mcp-probe.mjs` runs against the real Kiro CLI, THE SYSTEM SHALL show that `qa` takes a screenshot of the local game through Chrome DevTools MCP, that `qa` is refused a navigation to another site, that `chapters-designer` calls `validate_level` and `solve_level`, and that `qa` cannot call `write_level`. It is a manual gate (it needs Chrome and model credits) and is not part of `npm run quality`.

## Out of scope

- A `credits-forge` power that packages the server and the LEVEL GEN skills (a later change; needs a decision on the duplicated skills).
- A `compile_chapter` tool, and creating a level that is not yet in the manifest (a new level is added in `/editor` or by the chapter skills; the forge updates existing levels and checks any draft).
- Making the forge the only way to change a level spec (the write fence on `chapters/**` stays as it is; humans keep `/editor`).
- Chrome DevTools MCP for any agent but `qa`; other MCP servers (GitHub, Context7, Playwright).
- Infinite mode and any runtime (in-game) use of the forge.
- Crew's own MCP configuration (`docs/AGENTS_CREW.md` is updated only to say what a Crew member sees).

## Decisions

- **Q:** Where does the MCP wiring live?
  **A (user delegated, 2026-11-17):** Per agent, in the agents table; `.kiro/settings/mcp.json` stays empty. Least privilege and checkable.
- **Q:** Who gets Chrome DevTools MCP, and how is it contained?
  **A (user delegated, 2026-11-17):** `qa` only; headless, isolated profile, localhost-only. The user asked for a hook; research found the server's own `--allowedUrlPattern` (Chrome 149+, this Mac has Chrome 157), so the server enforces it and the hook is the second fence. JavaScript evaluation is off (screenshots, snapshots, console and network need none).
- **Q:** Which forge tools, and who may write?
  **A (user delegated, 2026-11-17):** `list_assets`, `list_levels`, `get_level`, `validate_level`, `solve_level`, `write_level`; `write_level` for `chapters-designer` only. `write_level` recompiles the catalog as the editor's PUT does, so `generate-chapter --check` stays green; that is its one side effect besides the spec file.
- **Q:** How is the forge built, and where does it live?
  **A (user delegated, 2026-11-17):** The official SDK, pinned (`@modelcontextprotocol/sdk@1.32.2`, exact, devDependency). `scripts/mcp/credits-forge/` (tooling, not a `src/` layer): the pure tool logic in `tools.mjs`, the stdio server in `server.mjs`, so a unit test can call the tools without a protocol client.
- **Q:** How is "agents use it properly" enforced and proven?
  **A (user delegated, 2026-11-17):** Prompts and skills say when; `check-agents.mjs` checks the exact tool lists and that prompts name their tools; a probe against the real Kiro CLI proves the calls (manual gate). Not the forge-only write path (it would fight `/editor`).
- **Q:** (while building) The first probe showed Kiro does not wait for a slow MCP server. Change the design?
  **A (user delegated, 2026-11-17):** Yes, within the delegation: run `chrome-devtools-mcp` from a pinned devDependency with Node's compile cache instead of `npx`, and move the `write_level` property into `forge-unit.mjs`. Both are recorded in the design's "Found while building"; no requirement was dropped.
- **Q:** (round 2, answered by the assistant from the docs and probes, recorded for review) Tool syntax in Kiro CLI 3.4?
  **A (user delegated, 2026-11-17):** Per the Kiro docs: `tools` takes `@server/tool`; `mcpServers` is per agent; `includeMcpJson` controls the workspace file; a hook `matcher` accepts `@<server>`. The permission rule for MCP calls (`capability: mcp`) and the parent-session rule for sub-agents are probed in task 7 and written into the design's "Found while building".

## Open questions

## Verification

- Req 1, 12, 13: `npm run quality:agents` (the table, the exact lists, the pin check, the empty `mcp.json`), plus `node scripts/harness/agents-build.mjs --check`.
- Req 2, 3: `forge-unit.mjs` does not cover them; `node scripts/harness/mcp-probe.mjs` (qa: local screenshot works, other site refused); the hook's decision function is unit-tested in `agents-unit.mjs`.
- Req 4-11, 14: `node scripts/harness/forge-unit.mjs` (real server over stdio, every refusal with a byte-identical disk), including a fast-check property: for any mix of edits to any level, `write_level` writes only if `validate_level` and `solve_level` pass, and a refusal changes nothing. (Planned for `props/chapters.mjs`; moved, see the design's "Found while building".)
- Req 15: `check-agents.mjs` (prompts name their tools) and the probe.
- Req 16: `node scripts/harness/mcp-probe.mjs`, run by hand; its output goes to `docs/qa/`.

## Later changes

- **2026-11-24, `.kiro/specs/turn-based-battles/` (approved by the user):** Req 8: `solve_level` runs the same solver, so "enemy tick pressure" now means enemy turn pressure (one enemy turn per command plus N-1 forced turn-timer runouts); its answer fields are unchanged.
