#!/usr/bin/env node
// The storybook inspect checklist as screenshots: one PNG per read test for one model, under the
// game's real shaders and post passes, in headless Chrome. Open every PNG it lists and judge it
// against the checklist in ../SKILL.md.
//
//   node .kiro/skills/comic-panel-viewport-auditor/scripts/lab-qa.mjs malware.trojan
//   node .kiro/skills/comic-panel-viewport-auditor/scripts/lab-qa.mjs vibecoder.dev --seed 3 --t 0.5
//   node .kiro/skills/comic-panel-viewport-auditor/scripts/lab-qa.mjs malware.bug --only game,silhouette,lantern
//
// Writes scripts/harness/out/lab-<id>-<test>.png. Enemy states are shot only for malware and boss.
// Exit code 1 if any shot failed (page error, blank frame, unknown id).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs, projectRoot, startPageServer } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--seed', '--t', '--only']);
const id = args.rest[0];
if (!id) {
  console.error('usage: lab-qa.mjs <model id> [--seed 1] [--t 0.5] [--only game,silhouette,...]');
  process.exit(2);
}
const seed = args.val('--seed', '1');
const t = args.val('--t', '0.5');
const base = `inspect=${encodeURIComponent(id)}&seed=${seed}&t=${t}&ui=0`;
const enemy = /^(malware|boss)\./.test(id);

// [name, extra params, width, height]. Small frames at scale=game are the honest ones.
const TESTS = [
  ['game', 'scale=game', 360, 300],
  ['silhouette', 'scale=game&silhouette=1', 360, 300],
  ['fit', '', 800, 600],
  ['truecolour', 'palette=0', 800, 600],
  ['nopost', 'post=0', 800, 600],
  ['lantern', 'lantern=1&scale=game', 360, 300],
  ['flash', 'flash=1&scale=game', 360, 300],
  ...[1, 2, 3, 4, 5].map((n) => [`floor${n}`, `bg=floor${n}&scale=game`, 360, 300]),
  ['paper', 'bg=paper&scale=game', 360, 300],
  ...(enemy
    ? [
        ['hidden', 'state=hidden&scale=game', 360, 300],
        ['petrified', 'state=petrified&scale=game', 360, 300],
        ['frozen', 'state=frozen&scale=game', 360, 300],
        ['enraged', 'state=enraged&scale=game', 360, 300],
        ['attack', 'state=attack&t=0.3&scale=game', 360, 300],
      ]
    : []),
];
const only = args.val('--only') ? new Set(args.val('--only').split(',')) : null;
const shots = TESTS.filter(([name]) => !only || only.has(name));

const { vite, base: url } = await startPageServer(5320);
const script = resolve(projectRoot, 'scripts/harness/screenshot-lab.mjs');
let failed = 0;
try {
  for (const [name, extra, width, height] of shots) {
    const query = `${base}${extra ? `&${extra}` : ''}`.replace(/&t=[^&]*(.*&t=)/, '$1');
    const stem = `${id}-${name}`;
    const code = await new Promise((done) => {
      const child = spawn(process.execPath, [script, '--url', url, '--query', query, '--name', stem, '--width', String(width), '--height', String(height), '--dpr', '1'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('exit', (c) => {
        const bad = out.split('\n').filter((l) => /^(ERROR|FAIL|WARN)/.test(l));
        console.log(`${c === 0 ? 'ok  ' : 'FAIL'} ${name.padEnd(11)} scripts/harness/out/lab-${stem}.png${bad.length ? `\n     ${bad.join('\n     ')}` : ''}`);
        done(c);
      });
    });
    if (code !== 0) failed++;
  }
} finally {
  await vite.close();
}
console.log(`\n${shots.length - failed}/${shots.length} shots. Now open each PNG and run the checklist in comic-panel-viewport-auditor/SKILL.md.`);
process.exitCode = failed ? 1 : 0;
