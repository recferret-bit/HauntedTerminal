#!/usr/bin/env node
// Scaffolds a draft Kiro spec: .kiro/specs/<name>/requirements.md (or bugfix.md with --bugfix), Status: draft.
// Never overwrites an existing spec. Design and tasks come later, at their own phase (skill feature-spec-grill).
//   node .kiro/skills/feature-spec-grill/scripts/scaffold-spec.mjs <kebab-name> [--bugfix] [--title "Laptop"]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--title');
const bugfix = args.includes('--bugfix');
const titleAt = args.indexOf('--title');
if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/.test(name)) {
  console.error('usage: scaffold-spec.mjs <kebab-name> [--bugfix] [--title "Title"]');
  process.exit(1);
}
const title = titleAt >= 0 && args[titleAt + 1] ? args[titleAt + 1] : name.split('/').pop().replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const folder = join(process.cwd(), '.kiro/specs', name);
if (existsSync(folder)) {
  console.error(`.kiro/specs/${name} already exists: resume it instead.`);
  process.exit(1);
}

const common = `## Out of scope

- (asked, not assumed)

## Decisions

(The user's answers, one per question: **Q:** ... **A (user, <date>):** ...)

## Open questions

- [ ] What problem does this solve, and what does "done" look like in one sentence?
- [ ] What is explicitly out of scope?

## Verification

(Which gate proves each requirement.)
`;
const body = bugfix
  ? `# ${title}: bugfix

Status: draft

## Current behaviour

1. WHEN <condition> THEN the system <incorrect behaviour>.

## Expected behaviour

1. WHEN <condition> THEN the system SHALL <correct behaviour>.

## Unchanged behaviour

1. WHEN <condition> THEN the system SHALL CONTINUE TO <behaviour>.

${common}`
  : `# ${title}: requirements

Status: draft

Capability: (one paragraph, in the user's words once grilled.)

## Requirements

1. WHEN <trigger>, THE SYSTEM SHALL <response>.

${common}`;

mkdirSync(folder, { recursive: true });
const file = bugfix ? 'bugfix.md' : 'requirements.md';
writeFileSync(join(folder, file), body);
console.log(`created .kiro/specs/${name}/${file} (Status: draft). Next: grill the user (skill feature-spec-grill, section 2).`);
