# QA reports

The `qa` agent (`.kiro/agents/qa.json`) writes one report per pass here: `docs/qa/<YYYY-MM-DD>-<scope>.md`, with screenshots of visual findings in `docs/qa/media/`. Reports are committed on the `agent/<task>` branch they check, so they can be read on GitHub. Spec: `.kiro/specs/agent-team/` (requirements 13 and 14).

`docs/qa/baselines/` holds the approved screens of the visual audit (`node scripts/harness/visual-audit.mjs`, spec `.kiro/specs/qa-visual-audit/`) and `masks.json`, the animated regions it ignores. A person approves them with `node scripts/harness/visual-audit.mjs --update <screen>[@<WxH>]` after looking at the capture; no agent writes there.

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

## Visual audit

`node scripts/harness/visual-audit.mjs <options>`: exit <code>, <n> captures, <n> flags, <duration>. Every flag:

| Screen @ size | Flag | Verdict | Finding # or reason |
|---|---|---|---|
| level-04@1280x820 | overlap (.st-say over #hud) | finding | 2 |
| hub@1600x950 | no-baseline | expected | no baseline approved yet |

### Checklist per screen

Items: 1 overlap, 2 clipped text, 3 contrast, 4 off-palette colour, 5 z-fighting, 6 floating parts, 7 missing ink outlines, 8 wrong font, 9 blank or black frame, 10 misaligned panels, 11 inconsistent style, 12 stale text, 13 flicker and stutter, 14 layout at size (`.kiro/agents/prompts/qa.md`). `p` pass, `F` fail (with the finding number), `-` n/a.

| Screen | Sizes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level-01 | all four | p | F2 | p | p | p | p | p | F3 | p | p | p | p | p | p |

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | high / medium / low | chapters | chapters-designer | ... | `cd ...; kill -9 ...` | media/<date>-<scope>-1.png |

## Played by hand

What was tried beyond the gates (wrong commands, help and man pages, leaving early, dying), and what happened.
```
