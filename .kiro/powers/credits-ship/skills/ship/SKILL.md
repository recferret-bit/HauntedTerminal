---
name: ship
description: "[WORKFLOW] Deploy Out Of Credits to Netlify through its gates. A preview deploy runs `npm run quality`, the 0-death chapter verify and the build, uploads `dist/` as a draft and plays the whole chapter on the preview URL in Chrome; production gets exactly that build, only after the user says yes. Use whenever someone wants to deploy, publish, ship, go live, get a live or preview URL, or asks about the Netlify site or its deploys."
---

# Ship to Netlify (`ship`)

Power `credits-ship`. Spec: `.kiro/specs/netlify-deploy-power/`. Script: `node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs`.

## Rules

- **Upload only with `ship.mjs`.** Never deploy with a Netlify MCP tool, `netlify deploy` by hand, or a Git-connected build: each of those skips the gates. Use the Netlify MCP server (bundled in this power) only to answer questions: which sites exist, the status or log of a deploy.
- **Production needs the user's explicit yes in this conversation**, given after you showed them the passing preview URL. "Looks good so far" or silence is not a yes. Never run `ship.mjs prod` on your own initiative.
- **No token in the repo, the chat or a command line.** Credentials come from `netlify login` or `NETLIFY_AUTH_TOKEN` in the user's own shell. If a token is pasted into the chat, tell the user to revoke it.
- **The seven team agents cannot deploy.** Their shells deny this script (`npm run quality:agents` checks it). If you are one of them, hand the request to the user.

## Steps

1. **Setup check (once).** `npx -y netlify-cli@27.20.0 status --json`. If `loggedIn` is false, ask the user to run `npx netlify-cli@27.20.0 login` in their terminal (it opens a browser for OAuth). Do not run it for them. Continue when they say it is done.
2. **Dry run (optional, no login needed).** `ship.mjs --dry-run` runs the gates and the build and prints what would be uploaded.
3. **Preview.** `ship.mjs preview`. The first time it creates the site `out-of-credits` (or `--site-name <name>` if that name is taken) and keeps its id in the git-ignored `scripts/harness/out/ship/site.json`. It takes a few minutes: the gates, the upload, then about 90 s of real play.
   - Exit 0: show the preview URL. If the output says the preview was made from uncommitted changes, say production needs a commit and a new preview.
   - Exit 1: report the failing gate or step from the output and stop. Do not retry a deploy to get around a failing gate; fix the cause through the owning skill or agent.
   - Exit 2: setup is missing (step 1).
4. **Ask.** "The preview at <URL> passed the gates and played to the end. Promote this exact build to production?" Wait for the answer.
5. **Production, on yes only.** `ship.mjs prod`. It refuses when the preview came from a dirty tree, or when the commit or `dist/` changed since; then run a new preview (step 3). On success it plays the chapter again on the production URL.
6. **After production.** Tell the user the URL and what is left, which is theirs to do: the GitHub About website, and `<LIVE_URL>` in `README.md` (two places). Edit the README only if they ask; show the diff.

## Troubleshooting

- `--site-name` taken: Netlify site names are global. Pass another, for example `--site-name out-of-credits-<handle>`.
- Deep links 404 on the live site: `public/_redirects` must map `/play` and `/play/*` to `/play.html`; it is copied into `dist/` by the build.
- `play-browser` cannot find Chrome: set `CHROME_BIN`.
- A deploy to the wrong site: `NETLIFY_SITE_ID` in the environment wins over `site.json`. Check both before you deploy.
