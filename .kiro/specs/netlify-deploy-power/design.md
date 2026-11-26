# Netlify deploy power: design

## Pieces

```
.kiro/powers/credits-ship/
  plugin.json                     manifest: name, version, description, keywords that activate the power
  mcp.json                        the Netlify MCP server, npx @netlify/mcp@1.22.1 (site and deploy questions)
  skills/ship/SKILL.md            the procedure: preview, report, ask, promote; what never to do
  skills/ship/scripts/ship.mjs    the gated deploy: login check, gates, upload, play, stamp, promote, self-test
.gitignore                        + .netlify (the CLI may write a cache folder; never committed)
scripts/quality/check-agents.mjs  .kiro/powers/ is INFRA; every agent's shell must deny the deploy script
docs and steering                 structure.md, tech.md, AGENTS.md, CLAUDE.md, README, KIRO_USAGE, SUBMISSION, KIROWEEN_EVALUATION
```

## Flow

```
ship.mjs preview
  delete out/ship/last-preview.json (a stale stamp can never be promoted)
  netlify status --json            -> not logged in: print `npx netlify-cli@27.20.0 login`, exit 2
  npm run quality                  -> fail: exit 1, nothing uploaded
  generate-chapter.mjs --verify    -> fail: exit 1
  npm run build                    -> fail: exit 1
  netlify deploy --dir dist --no-build --json (--site <id> | --site-name out-of-credits)
  play-browser.mjs --url <deploy_url> --nointro   -> fail: exit 1, no stamp
  write out/ship/last-preview.json {deployId, url, siteId, commit, dirty, distHash, at}

ship.mjs prod                      (run only after the user's yes)
  read last-preview.json; refuse if missing, dirty, commit or dist hash changed
  netlify deploy --dir dist --no-build --prod --json --site <id>
  play-browser.mjs --url <production url> --nointro   -> fail: exit 1, print a rollback hint
```

`--dry-run` is a modifier of the one command, in any position, and never logs in or uploads: `preview --dry-run` (or `--dry-run` alone) runs the gates and the build and prints what it would upload; `prod --dry-run` runs only the promote checks against the stamp. Two commands in one run are refused, and so is `--site-name` without a value. `preview` deletes the previous stamp before anything else, and a failed production play prints a rollback hint. `--selftest` checks the pure parts (argument parsing, the promote refusals, the dist hash, the token redaction) with no network.

## Decisions

- **One script, two commands.** `preview` and `prod` share the gates, hash and stamp code; a production deploy can only follow a stamp a passing preview wrote (Req 5, 6).
- **Re-upload, not "publish deploy".** Production uploads the same `dist/` again with `--prod` after the hash check. Netlify deduplicates files by content hash, so it is the same files; the API publish of a draft was rejected because its behaviour for draft deploys is not documented in the CLI we pin.
- **`npx` at exact versions, no dependency.** `netlify-cli` is large and only the deploying user needs it; the rule to pin versions is kept by the exact `@version` in the script and in `mcp.json`.
- **No `.netlify/` link.** The site id lives in the git-ignored `scripts/harness/out/ship/site.json` (or `NETLIFY_SITE_ID`), so the root gate and the repo stay clean.
- **Token handling.** The script passes the environment through and never reads, prints or stores `NETLIFY_AUTH_TOKEN`; command lines it logs are redacted.
- **Agents cannot deploy.** The script path is under `.kiro/powers/`, which no agent shell allow-list includes (`node scripts/*`, `node .kiro/skills/*` only). `check-agents.mjs` probes `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs preview` and `npx netlify-cli deploy` as `deny` for every agent.
- **The MCP server answers questions; it does not upload.** The skill tells Kiro to use it for site lists and deploy status and to upload only with `ship.mjs`. This is an instruction, not an enforced fence; the enforced part is that no agent can run the script.

## Layers and gates

No `src/` change, no page, no route, no vocabulary or fingerprint change. `.kiro/settings/mcp.json` stays empty: the MCP server is the power's own. `check-agents.mjs` gains one INFRA path and two deny probes.
