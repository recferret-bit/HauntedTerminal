# Netlify deploy power: requirements

Status: done (requirements, design and tasks: every answer delegated by the user, "use your recommendations across all the questions, then go", 2026-11-17; first production deploy 2026-11-17)

Capability: a project Kiro power, `credits-ship`, that puts Out Of Credits on a public Netlify URL only after the project's gates pass and the whole chapter has been played on the deployed preview. Production gets exactly the build that was played, and only after the user says yes. It gives the Kiroween submission its working-app URL and is the project's use of Kiro powers and MCP.

## Requirements

1. WHEN the developer asks Kiro to deploy, publish, ship or put the game online, THE SYSTEM SHALL activate the `credits-ship` power through its keywords and follow its `ship` skill.
2. WHEN a preview deploy starts, THE SYSTEM SHALL run `npm run quality`, `node scripts/harness/generate-chapter.mjs --verify` and `npm run build`, in that order, and IF one fails, THEN THE SYSTEM SHALL stop without uploading anything.
3. WHEN the gates pass, THE SYSTEM SHALL upload `dist/` as a Netlify draft deploy (a preview URL) without a Netlify-side build, and SHALL never publish to production in the same run.
4. WHEN the preview is live, THE SYSTEM SHALL play the whole chapter on the preview URL (`scripts/harness/play-browser.mjs --url <preview> --nointro`), and IF that run fails, THEN THE SYSTEM SHALL report the preview as failed and SHALL NOT offer it for production.
5. WHEN a preview passes, THE SYSTEM SHALL record its deploy id, URL, commit, working-tree state and a hash of `dist/` in the git-ignored `scripts/harness/out/ship/last-preview.json`.
6. WHEN the user explicitly says yes to production, THE SYSTEM SHALL deploy to production only the build recorded by the last passing preview, and IF the commit, the working-tree state or the `dist/` hash differ from that record, or the preview was made from a dirty tree, THEN THE SYSTEM SHALL refuse and ask for a new preview.
7. WHEN a production deploy finishes, THE SYSTEM SHALL play the whole chapter on the production URL and print the URL.
8. THE SYSTEM SHALL read Netlify credentials only from the Netlify CLI login or `NETLIFY_AUTH_TOKEN` in the environment, and SHALL never write a token into the repository or print it.
9. IF the developer is not logged in to Netlify, THEN THE SYSTEM SHALL stop before the gates and print the one-time setup command.
10. THE SYSTEM SHALL bundle the Netlify MCP server pinned to an exact version for questions about sites and deploys; uploads go through the gated script, never through an MCP deploy tool.
11. THE SYSTEM SHALL keep deploys out of reach of the seven team agents: the power is infrastructure no agent writes, and every agent's shell refuses the deploy script (checked by `npm run quality:agents`).
12. WHEN a production deploy passes, THE SYSTEM SHALL tell the developer which README placeholders and GitHub About fields to update; Kiro replaces `<LIVE_URL>` in `README.md` only when the user asks, as a normal reviewed edit.

## Out of scope

- Git-connected continuous deploys (Netlify building on every push): they would skip the gates.
- Netlify Functions, any backend, environment variables, custom domains.
- The infinite-mode level generator and the `credits-forge` MCP server (separate specs).
- CI pipelines.
- Installing the official Netlify power next to this one (see Decisions).

## Decisions

- **Q:** What is the power?
  **A (user delegated, 2026-11-17):** Our own project power `credits-ship` that bundles the Netlify MCP server with a gated-deploy skill. The official Netlify power is not installed next to it, because both would start a second copy of the same Netlify MCP server; ours pins the version the official one leaves floating.
- **Q:** Where does our power live?
  **A (user delegated, 2026-11-17):** `.kiro/powers/credits-ship/` in this repo, so judges find it in `/.kiro`.
- **Q:** Which gates must pass before a deploy, and is the live URL played after the deploy?
  **A (user delegated, 2026-11-17):** `npm run quality`, `generate-chapter.mjs --verify`, `npm run build`; then `play-browser.mjs` against the deployed URL.
- **Q:** Preview first, or straight to production?
  **A (user delegated, 2026-11-17):** Always a preview first; production only after the user's explicit yes in chat.
- **Q:** Who may deploy?
  **A (user delegated, 2026-11-17):** Only the user in a normal session. No team agent gets deploy rights or the token.
- **Q:** Does a Netlify account and site exist, and are deploys Git-connected or uploaded from the CLI?
  **A (user delegated, 2026-11-17):** Uploaded from the CLI by the gated script (Git-connected builds would skip the gates). No login exists on this Mac yet (`netlify status` says `NOT_LOGGED_IN`); the user runs `netlify login` once. The site is created on the first deploy with `--site-name`, and its id is kept in the git-ignored `scripts/harness/out/ship/site.json` (or `NETLIFY_SITE_ID`), so no `.netlify/` link folder is needed.
- **Q:** Which Netlify MCP server and version, and how is the token supplied?
  **A (user delegated, 2026-11-17):** `@netlify/mcp@1.22.1` and `netlify-cli@27.20.0`, both run through `npx` at exact versions (no `package.json` dependency). Auth is `netlify login` (OAuth) or `NETLIFY_AUTH_TOKEN` in the environment, never in the repo.
- **Q:** Does the power update the README `<LIVE_URL>` placeholders and the GitHub About website?
  **A (user delegated, 2026-11-17):** It prints what to change; Kiro edits the README only when asked; the About box is the user's.
- **Q:** What problem does this solve, and what does "done" look like?
  **A (user delegated, 2026-11-17):** The submission needs a working URL. Done: one command gives a played-through preview URL, and a yes promotes that exact build.
- **Q:** What is explicitly out of scope?
  **A (user delegated, 2026-11-17):** The list under Out of scope.

## Open questions

## Verification

- Req 1, 10: `plugin.json` and `mcp.json` parse and carry the fields of the Agent Plugins schema; `kiro-cli powers install .kiro/powers/credits-ship` succeeds.
- Req 2, 3, 5, 6, 8, 9: `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs --selftest` (stamp checks, refusal cases, token never echoed) and `--dry-run` (the gates and the build, no upload).
- Req 4, 7: `play-browser.mjs --url` on the first real preview and production deploy (needs the user's Netlify login; done by hand).
- Req 11: `npm run quality:agents` (the deny probe for the deploy script in every agent).
- Req 12: read in the skill; checked by hand after the first production deploy.
