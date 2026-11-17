# MCP: Chrome DevTools and haunted-forge: design

## Pieces

```
scripts/mcp/haunted-forge/
  tools.mjs          pure tool logic: list_assets, list_levels, get_level, validate_level, solve_level, write_level.
                     Takes a `ctx` ({ root, vite }) so tests can point it at a temporary copy of chapters/.
  server.mjs         stdio MCP server (SDK): registers the six tools with zod input schemas, loads the game's TS through
                     Vite SSR (logLevel silent, stdout reserved for the protocol), maps tool results to MCP content.
scripts/harness/forge-unit.mjs     tools.mjs units + the real server over stdio with the SDK client (Req 14)
scripts/harness/mcp-probe.mjs      manual gate: real Kiro CLI, qa and chapters-designer (Req 16)
scripts/hooks/devtools-url-guard.mjs   PreToolUse on @chrome-devtools: block a URL outside the allow list (Req 3)
scripts/harness/agents-build.mjs   the table gains `mcp` per agent: servers, tool selectors, the hook, the lead's allow rules
scripts/quality/check-agents.mjs   + MCP checks (Req 13) and "prompt names its tools" (Req 15)
.kiro/agents/prompts/{qa,chapters-designer,comix-designer}.md, team-rules.md   when to use the tools (Req 15)
package.json                       devDependency @modelcontextprotocol/sdk@1.32.2 (exact)
scripts/harness/props/chapters.mjs one property: write_level never writes a level that fails the checks
```

## Server definitions (in the agents table, one place)

```
chrome-devtools: command node, args node_modules/chrome-devtools-mcp/out/Default/gen/src/bin/chrome-devtools-mcp.js
                 (devDependency pinned 1.13.0; see "Found while building")
                 --headless --isolated --viewport 1280x800 --workspace scripts/harness/out
                 --no-usage-statistics --no-performance-crux --no-javascript-evaluation --no-file-navigations
                 --allowedUrlPattern http://localhost:*/* http://127.0.0.1:*/* https://*.netlify.app/*
                 env CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1, NODE_COMPILE_CACHE=scripts/harness/out/.node-compile-cache
haunted-forge:   command node, args scripts/mcp/haunted-forge/server.mjs
```

`qa` selectors: `@chrome-devtools/{list_pages,new_page,select_page,navigate_page,close_page,resize_page,wait_for,take_screenshot,take_snapshot,list_console_messages,get_console_message,list_network_requests,get_network_request,click,hover,fill,type_text,press_key}`, read from the server's `tools/list` (31 tools in 1.13.0). Not listed: `evaluate_script` (disabled anyway), `upload_file`, `emulate`, `drag`, `fill_form`, `handle_dialog`, traces, heap snapshots, screencasts, Lighthouse, `get_css_styles`.

## Decisions

- **Two fences for the browser.** `--allowedUrlPattern` makes Chrome itself refuse other sites (navigations, subresources, redirects); `devtools-url-guard` stops the call before the server and gives the agent a clear reason. Either alone would do; the hook also covers a future edit that drops the flag. (Req 2, 3.)
- **No JavaScript evaluation.** `qa` needs pixels, the DOM snapshot, the console and the network list, not `evaluate_script`. Typing into the game's terminal uses the input tools. If a later check needs evaluation it is a table edit and a new decision. (Req 2.)
- **Tools are pure; the server is a thin shell.** `tools.mjs` returns plain objects and throws typed errors; `server.mjs` only validates, calls and formats. The unit test exercises both layers. (Req 11, 14.)
- **One Vite SSR instance per server process**, created lazily on the first call that needs the game's TS (`checkPack`, `solvePack`, the catalogs) and closed on exit. Logging is silent and goes to stderr; a stray `console.log` would corrupt the protocol, so `server.mjs` redirects `console.log` to stderr first.
- **A draft is the chapter with one level replaced.** `validate_level` and `solve_level` build the pack from disk (`readChapter`), replace the level with the same id (or append it when the id is new, so a not-yet-added level can be checked), then call `checkPack` and `solvePack({ levelId })`. The disk is never touched. (Req 7, 8.)
- **`write_level` is the editor's PUT without HTTP.** Same pieces: `resolveSafeSpecTarget` (path from the manifest only), the etag check (`etagOf` of the file text), `stringifyChapterJson`, `writeAtomicText`, then `compileAll` and `writeCatalog`. If the compile step throws after the spec was written, the spec file is restored from the bytes read before and the error is returned, so the refusal case stays byte-identical. (Req 9, 10.)
- **Only existing levels are written.** A level id not in the manifest is refused with the message to add it in `/editor` first. Adding to the manifest touches more than one file and is the editor's job. (Req 10, Out of scope.)
- **Spec size limit 200 KB** and level ids and slugs by `SLUG_RE`; the tool schemas say so. (Req 11.)
- **The lead holds permissions, not tools.** `lead-dev` gets `{ capability: mcp, match: [sub-agents' tool selectors], effect: allow }` rules so a sub-agent's call is not asked about in an unattended run, and no `mcpServers`, so it cannot call them itself; `check-agents` asserts its `tools` are still exactly the six sub-agents. The exact rule shape is fixed by the probe in task 7. (Req 12.)
- **`.kiro/settings/mcp.json` stays `{ "mcpServers": {} }`.** MCP is declared per agent, so a person's own session does not load these servers by accident. (Req 1, 13.)

## Found while building (Kiro CLI 3.4.0, Chrome 157, probed with `mcp-probe.mjs`)

- **Kiro fixes an agent's tools when its first turn starts and does not wait for MCP servers.** Tool selection came ~450 ms after the prompt in every run; a server that finished `tools/list` later was missing for that turn, and the agent said so. `npx -y chrome-devtools-mcp@...` connected after ~1.3 s and `node node_modules/...` after ~520 ms, both too late. Fix: `chrome-devtools-mcp` is a pinned devDependency run with `node`, with Node's compile cache in the git-ignored `scripts/harness/out/.node-compile-cache` (~410 ms; connected 57-119 ms before selection in every probed run). Neither `mcp.initTimeout`, `mcp.noInteractiveTimeout` nor `toolSearch.enabled` changed the timing (each was set for one probe and deleted again). The probe's warm-up and qa cases fail if this regresses.
- **`includePowers: false` does not keep an installed power's MCP server out.** The `haunted-ship` power's Netlify server still started in every agent session. Its tools never reach an agent: the catch-all `mcp` deny refuses them, and the probe checks one (`qa-no-power-tools`). The field stays (documented as the way to exclude powers) and `check-agents` requires it.
- **MCP permission rules match `server/tool`.** Allow `server/tool` plus a catch-all `deny *` whose `exclude` is the allow list; the agent then lists exactly its own tools (asked in a probe turn: the 18 browser and 5 forge tools of `qa`, nothing else). A sub-agent's call is also checked against the lead's session, so the lead allows its sub-agents' tools and holds none itself.
- **`--no-interactive` denies every call without `--trust-all-tools`**, as found for the agent team. The probe runs trust-all (Kiro Crew's Automatic mode), where the agent's own rules and hooks are the only fence; that is what it tests.
- **A call the URL guard hook blocks prints no `Running:` line.** The hook therefore appends each block to the git-ignored `scripts/harness/out/devtools-url-guard.log`, and the probe checks that log instead of the agent's own account.
- **The probe must not block its event loop.** It serves the game from its own page server; a `spawnSync` of `kiro-cli` stalled that server and every navigation timed out. It spawns asynchronously.
- **The `write_level` property lives in `forge-unit.mjs`, not `props/chapters.mjs`.** The property runner is synchronous and the forge tools are async (they load the game's TS through Vite). Same fast-check, fixed seed 20261117, 25 runs, a planted-bug check (dropping the solve gate fails it with a shrunk counterexample).

## Layers and gates

No `src/` change, no page, no route, no vocabulary or fingerprint change; `scripts/` is infrastructure in `check-agents.mjs`, so no agent writes the forge or the guard hook. One dependency (the SDK, exact version). `npm run quality` gains `quality:mcp` (`forge-unit.mjs`); `quality:agents` gains the MCP checks. The probe is manual and writes a QA report.
