# QA reports

The `qa` agent (`.kiro/agents/qa.json`) writes one report per pass here: `docs/qa/<YYYY-MM-DD>-<scope>.md`, with screenshots of visual findings in `docs/qa/media/`. Reports are committed on the `agent/<task>` branch they check, so they can be read on GitHub. Spec: `.kiro/specs/agent-team/` (requirements 13 and 14).

## Template

```markdown
# QA <YYYY-MM-DD>: <scope>

Branch: agent/<task>  ·  Asked by: lead-dev  ·  Scope: <features, or full>

## Verdict

PASS | FAIL (<n> findings)

## Checks run

| Command | Exit | Notes |
|---|---|---|
| npm run quality | 0 | |
| node scripts/harness/play-browser.mjs --nointro | 0 | 11 levels, rank S |
| ... | | |

Not run: <command> (<reason>)

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | high / medium / low | chapters | chapters-designer | ... | `cd ...; kill -9 ...` | media/<date>-<scope>-1.png |

## Played by hand

What was tried beyond the gates (wrong commands, help and man pages, leaving early, dying), and what happened.
```
