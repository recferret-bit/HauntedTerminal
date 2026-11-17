#!/usr/bin/env node
// Makes the repo's team agents visible outside the repo (Kiro Crew reads ~/.kiro/agents/): symlinks each
// .kiro/agents/<name>.json and the prompt folder into ~/.kiro/agents/.
//   npm run agents:install                 link (again: harmless)
//   npm run agents:install -- --remove     remove only the links that point into this repo
//   npm run agents:install -- --dry-run    print what would happen
// It never replaces a file it did not create: a clash is reported and the run exits 1. HOME decides the target folder.
// The agents' resources, hooks and permission paths are repo-relative, so a Crew session must run in this repo folder
// (docs/AGENTS_CREW.md). Spec: .kiro/specs/agent-team/.
import { existsSync, lstatSync, mkdirSync, readlinkSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { projectRoot } from './lib/load.mjs';

const remove = process.argv.includes('--remove');
const dry = process.argv.includes('--dry-run');
const source = join(projectRoot, '.kiro/agents');
const target = join(process.env.HOME || homedir(), '.kiro/agents');
/** The agents' `file://./prompts/<name>.md` resolves next to the link, so the prompt folder is linked too. */
const PROMPTS_LINK = 'prompts';

if (!existsSync(source)) {
  console.error(`no agents in ${source}`);
  process.exit(1);
}
const agents = readdirSync(source).filter((f) => f.endsWith('.json')).sort();
const links = [...agents.map((f) => [f, join(source, f)]), [PROMPTS_LINK, join(source, 'prompts')]];

/** What is at `path`: nothing, our link, someone else's link, or a real file. */
function stateOf(path, wanted) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return 'none';
  }
  if (!st.isSymbolicLink()) return 'file';
  return resolve(target, readlinkSync(path)) === wanted ? 'ours' : 'other';
}

let clashes = 0;
const say = (verb, name, note = '') => console.log(`${verb.padEnd(8)} ~/.kiro/agents/${name}${note ? `  (${note})` : ''}`);
if (!dry && !remove) mkdirSync(target, { recursive: true });
for (const [name, from] of links) {
  const to = join(target, name);
  const state = stateOf(to, from);
  if (remove) {
    if (state !== 'ours') continue;
    if (!dry) unlinkSync(to);
    say('removed', name);
  } else if (state === 'ours') {
    say('ok', name);
  } else if (state === 'none') {
    if (!dry) symlinkSync(from, to);
    say('linked', name, `-> ${from}`);
  } else {
    clashes += 1;
    say('CLASH', name, state === 'file' ? 'a real file is there; left untouched' : `a link to ${readlinkSync(to)} is there; left untouched`);
  }
}
if (clashes) {
  console.error(`\n${clashes} clash(es): move those files away yourself, then run this again.`);
  process.exit(1);
}
console.log(remove ? '\nremoved the links into this repo.' : `\n${agents.length} agents available to Kiro Crew. Start the gateway from ${projectRoot} (docs/AGENTS_CREW.md).`);
