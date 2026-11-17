#!/usr/bin/env node
// UserPromptSubmit hook. When the prompt reads like a new feature or a big refactor, prints a short reminder
// that is added to the agent's context: spec first, grill the user, no code before approval. Also lists Kiro
// specs that still wait for the user's answers. Silent for every other prompt. Always exits 0.
// Rules: .kiro/steering/spec-first.md. Usage (see .kiro/hooks/spec-first-on-prompt.json):
//   node scripts/hooks/spec-first-reminder.mjs
import { readFileSync } from 'node:fs';
import { loadSpecs } from '../quality/spec-status.mjs';

let prompt = process.env.USER_PROMPT ?? '';
try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (typeof event?.prompt === 'string') prompt = event.prompt;
} catch {
  // No JSON on stdin: keep USER_PROMPT.
}

const FEATURE = [
  /\b(new|big|whole|another)\s+(feature|system|mechanic|mode|page|tool|lab|screen|module|subsystem)\b/i,
  /\b(implement|build|add|introduce|create|design)\b[^.?!\n]{0,60}\b(feature|system|mechanic|mode|page|tool|lab|module|inventory|editor)\b/i,
  /\b(refactor\w*|rework\w*|redesign\w*|rewrit\w*|overhaul\w*|re-?architect\w*|migrat\w*|replac\w+ (the|all|every))\b/i,
];
if (!FEATURE.some((re) => re.test(prompt))) process.exit(0);

const specs = loadSpecs(process.cwd());
const waiting = specs.filter((s) => s.status !== 'done' && s.status !== 'approved');
const lines = [
  'SPEC-FIRST (.kiro/steering/spec-first.md): this request may be a new feature or a big refactor.',
  'Decide with the size test in spec-first.md. If it qualifies: write no code yet. Activate the feature-spec-grill skill,',
  'create or resume .kiro/specs/<name>/ (Status: draft), grill the user in rounds until "## Open questions" is empty,',
  'and get each phase (requirements, design, tasks) approved by the user before setting "Status: approved" and coding.',
  'If it does not qualify, say so in one line and why, then proceed.',
];
if (waiting.length) {
  lines.push(`Specs not yet approved: ${waiting.map((s) => `${s.name} (${s.status || 'no status'}, ${s.open.length} open question(s))`).join('; ')}.`);
}
console.log(lines.join('\n'));
process.exit(0);
