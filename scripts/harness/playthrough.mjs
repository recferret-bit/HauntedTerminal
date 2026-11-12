#!/usr/bin/env node
// Plays the whole campaign through the real Session API (src/game/session.ts), floor 1 to the ending,
// with idle game ticks between commands so enemies get time to act at human typing speed.
//   node scripts/harness/playthrough.mjs                 (3 ticks between commands)
//   node scripts/harness/playthrough.mjs --ticks 6 --verbose
//   node scripts/harness/playthrough.mjs --script my.json   (a JSON array of commands or {"tick": n})
// Exit 1 when the run does not end, the hero dies, or any step throws.
// The default script lives in scripts/harness/playthrough.script.json; the game owner keeps it current.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { withProcgen, parseArgs, projectRoot } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--ticks', '--script']);
const ticks = Number(args.val('--ticks', 3));
const verbose = args.flag('--verbose');
const scriptPath = resolve(projectRoot, args.val('--script', 'scripts/harness/playthrough.script.json'));
if (!existsSync(scriptPath)) { console.error(`missing script ${scriptPath}`); process.exit(2); }
const script = JSON.parse(readFileSync(scriptPath, 'utf8'));

await withProcgen(async (game) => {
  const session = game.createSession();
  if (typeof session.skipIntro === 'function') session.skipIntro();
  let snap = session.snapshot();
  let deaths = 0;
  let lastFloor = snap.floor;
  const eventCounts = {};
  const count = (evs) => evs.forEach((e) => { eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1; });
  const tickN = (n) => {
    for (let i = 0; i < n && !snap.ended; i++) {
      const t = session.tick();
      count(t.events);
      if (t.events.some((e) => e.type === 'PLAYER_RESPAWNED' || (e.type === 'PLAYER_DAMAGED' && e.hpRemaining <= 0))) deaths++;
      snap = t.snapshot;
    }
  };
  for (const step of script) {
    if (snap.ended) break;
    if (typeof step === 'object' && step && 'tick' in step) { tickN(step.tick); continue; }
    const line = String(step);
    const res = session.exec(line);
    count(res.events);
    if (res.events.some((e) => e.type === 'PLAYER_DAMAGED' && e.hpRemaining <= 0)) deaths++;
    snap = res.snapshot;
    if (verbose) console.log(`[F${snap.floor} HP ${snap.hp}] ${snap.cwd}$ ${line}\n${res.output.trimEnd().split('\n').map((l) => '    ' + l).join('\n')}`);
    if (snap.floor !== lastFloor) { console.log(`-> floor ${snap.floor} (${snap.cwd}) hp ${snap.hp}`); lastFloor = snap.floor; }
    tickN(ticks);
  }
  console.log(`events: ${Object.entries(eventCounts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const ok = snap.ended && deaths === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} playthrough: ended ${snap.ended}, floor ${snap.floor}, hp ${snap.hp}, deaths ${deaths}, commands ${snap.commands}, rank ${snap.rank}`);
  process.exitCode = ok ? 0 : 1;
}, '/src/game/session.ts');
