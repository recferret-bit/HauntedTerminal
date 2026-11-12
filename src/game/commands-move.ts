import type { KernelEvent } from '../contracts/events.js';
import {
  boss, cut, denied, die, enterFloorEvents, find, gargoyleNeutral, load, plankBridged, push, spawnRoom, target,
} from './runtime.js';
import { empty, globReg, out, splitShortFlags, type Play } from './play.js';
import type { Step } from './shell.js';
import { absPath, findId, hasExec, modeString, resolve, type VNode } from './tree.js';
import type { FloorId } from './types.js';

export function transition(g: Play, from: number, ups: number, loop: boolean): KernelEvent {
  return {
    type: 'ROOM_TRANSITION',
    fromDir: from,
    toDir: g.run.cwd.id,
    toPath: absPath(g.run.cwd),
    upwardPanelsSmashed: ups,
    viaSymlinkLoop: loop,
  };
}

export function advance(g: Play, next: FloorId, cleared: FloorId, bonus: boolean): Step {
  const events: KernelEvent[] = [];
  const from = g.run.cwd.id;
  const kills = g.run.world.counts();
  const loot = g.run.world.pickupCounts();
  push(g, events, { type: 'FLOOR_CLEARED', floorId: cleared, speedrunBonus: bonus, commandsCount: g.run.commands });
  g.run.entryRam = g.run.ram;
  g.run.entrySsd = g.run.ssd;
  load(g, next);
  push(g, events, transition(g, from, 0, false));
  enterFloorEvents(g, events);
  const story: Record<number, string> = {
    2: 'ENTERING FLOOR 2: /var/dungeon\nThe agents\' firewall crypt. Locked doors, and something that picks locks.',
    3: 'ENTERING FLOOR 3: /usr/local/labyrinth\nA bus maze of mirrors. Half the doors lead back to you.',
    4: 'ENTERING FLOOR 4: /proc_mansion/boiler_room\nThe CPU furnace. The agents\' processes breed down here.',
    5: 'ENTERING FLOOR 5: /sys/kernel/panic_chamber\nKERNEL_OVERLORD: the core of the agents. "BACK TO WORK, WORKER."',
  };
  const tally = `Floor ${cleared} cleared: malware ${kills.total - kills.left}/${kills.total}, pickups ${loot.got}/${loot.total}.`;
  return out(`${tally}\n${story[next] ?? 'The page turns.'}\n`, events);
}

export function cmdCd(g: Play, path: string | undefined): Step {
  if (!path) return empty(1, 'cd: HOME is outside the machine. Try cd .. (or cd -)\n');
  if (path === '-') {
    if (!g.run.prev || !findId(g.run.root, g.run.prev.id)) return empty(1, 'cd: OLDPWD not set\n');
    path = absPath(g.run.prev);
  }
  const base = path.split('/').filter((part) => part && part !== '.' && part !== '..').pop();
  if (base === 'north_exit' || base === 'east_exit' || base === 'south_exit') {
    g.run.flood = Math.min(100, g.run.flood + 20);
    const events: KernelEvent[] = [];
    push(g, events, transition(g, g.run.cwd.id, 0, true));
    if (g.run.flood >= 100) return { stdout: '', stderr: `cd: too many levels of symbolic links\n${die(g, events)}`, code: 1, events };
    return { stdout: '', stderr: `cd: too many levels of symbolic links (the black water rises: ${g.run.flood}%)\n`, code: 1, events };
  }
  const resolved = resolve(g.run.cwd, path, true);
  if (resolved.loop) return empty(1, 'cd: too many levels of symbolic links\n');
  if (!resolved.node) {
    if (resolved.denied) return denied(g, resolved.denied, 'cd: Permission denied\n', `cd ${path}`);
    return empty(1, `cd: ${resolved.error ?? 'No such file or directory'}\n`);
  }
  const node = resolved.node;
  if (node.kind !== 'dir') return empty(1, `cd: not a directory: ${path}\n`);
  if (!hasExec(node)) return denied(g, node, 'cd: Permission denied\n', `cd ${path}`);
  if (node.name === 'cellar_hatch') {
    const ghost = find(g, '/home/dev/nightmare_workspace/.poltergeist.lock');
    const power = find(g, '/home/dev/nightmare_workspace/cellar_hatch/.power_on');
    if (ghost || !power) {
      const why = ghost ? 'An unseen lock holds the hatch.\n' : 'The relay is dark.\n';
      return denied(g, node, why, `cd ${path}`);
    }
    const bonus = g.run.line.includes('poltergeist') && g.run.line.includes('power_on');
    if (bonus) cut(g, 'floor1-oneliner');
    return advance(g, 2, 1, bonus);
  }
  if (node.name === 'crypt_stairs') {
    if (!plankBridged(g)) return empty(1, 'The gap is still open.\n');
    if (!gargoyleNeutral(g)) return empty(1, 'The gargoyle blocks the stair.\n');
    return advance(g, 3, 2, false);
  }
  if (node.name === 'boiler_shaft') return advance(g, 4, 3, false);
  if (node.name === 'core_elevator') {
    const necromancer = boss(g);
    if (!necromancer.dead && !necromancer.frozen) return empty(1, 'The elevator is sealed. The necromancer still forks.\n');
    return advance(g, 5, 4, false);
  }
  const from = g.run.cwd;
  const ups = path.split('/').filter((part) => part === '..').length;
  g.run.prev = from;
  g.run.cwd = node;
  const landed = absPath(node);
  const smashed = landed === '/usr/local/labyrinth' && ups >= 3 ? ups : 0;
  if (landed === '/usr/local/labyrinth') g.run.flood = 0;
  const events: KernelEvent[] = [];
  push(g, events, {
    type: 'ROOM_TRANSITION',
    fromDir: from.id,
    toDir: node.id,
    toPath: landed,
    upwardPanelsSmashed: smashed,
    viaSymlinkLoop: false,
  });
  if (from !== node) spawnRoom(g, events);
  const say = smashed >= 3 ? 'PANEL SMASH x3!\n' : '';
  return out(say, events);
}

export function owner(_g: Play, node: VNode): string {
  return node.uid === 0 ? 'root' : 'dev ';
}

export function longLine(g: Play, node: VNode, label: string): string {
  const arrow = node.kind === 'symlink' && node.link ? ` -> ${node.link}` : '';
  const size = String(node.kind === 'dir' ? 4096 : node.content.length).padStart(5);
  return `${modeString(node)} 1 ${owner(g, node)} mansion ${size} ${label}${arrow}`;
}

export function cmdLs(g: Play, args: string[]): Step {
  const parsed = splitShortFlags(args);
  const all = parsed.flags.includes('a') || parsed.flags.includes('A');
  const long = parsed.flags.includes('l');
  const paths = parsed.paths;
  const events: KernelEvent[] = [];
  const targets = paths.length ? paths : ['.'];
  const files: string[] = [];
  const chunks: string[] = [];
  const revealed: number[] = [];
  let stderr = '';
  let code = 0;
  for (const entry of targets) {
    const found = resolve(g.run.cwd, entry, true);
    if (!found.node) {
      stderr += `ls: cannot access '${entry}': ${found.denied ? 'Permission denied' : 'No such file or directory'}\n`;
      code = 1;
      continue;
    }
    const node = found.node;
    if (node.kind !== 'dir') {
      target(g, node);
      files.push(long ? longLine(g, node, entry) : entry);
      continue;
    }
    if (!hasExec(node) || (node.mode & 0o444) === 0) {
      push(g, events, { type: 'PERMISSION_DENIED_RATTLE', targetId: node.id, command: `ls ${entry}` });
      stderr += `ls: cannot open directory '${entry}': Permission denied\n`;
      code = 1;
      continue;
    }
    if (all) {
      revealed.push(...g.run.world.reveal(node, events));
      for (const child of node.children.values()) if (child.name.startsWith('.') && !revealed.includes(child.id)) revealed.push(child.id);
    }
    const rows: Array<{ node: VNode; label: string }> = [];
    if (all) rows.push({ node, label: '.' }, { node: node.parent ?? node, label: '..' });
    const kids = [...node.children.values()].filter((child) => all || !child.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
    for (const kid of kids) rows.push({ node: kid, label: kid.name });
    const head = targets.length > 1 ? `${entry}:\n` : '';
    const body = long
      ? [`total ${rows.length}`, ...rows.map((row) => longLine(g, row.node, row.label))].join('\n')
      : rows.map((row) => row.label).join('  ');
    chunks.push(head + body);
  }
  if (all && !g.run.lantern) g.run.lantern = true;
  if (all) push(g, events, { type: 'LANTERN_REVEAL', dirId: g.run.cwd.id, revealedInodes: revealed });
  const fileBlock = files.length ? files.join(long ? '\n' : '  ') : '';
  const text = [fileBlock, ...chunks].filter((chunk) => chunk.length > 0).join('\n\n');
  return { stdout: text ? `${text}\n` : '', stderr, code, events };
}

export function cmdReadlink(g: Play, args: string[]): Step {
  const full = args.includes('-f');
  const path = args.find((arg) => !arg.startsWith('-'));
  if (!path) return empty(1, 'readlink: missing operand\n');
  if (full) {
    const found = resolve(g.run.cwd, path, true);
    if (found.loop) return empty(1, `readlink: ${path}: Too many levels of symbolic links\n`);
    return found.node ? out(`${absPath(found.node)}\n`) : empty(1, `readlink: ${path}: No such file or directory\n`);
  }
  const found = resolve(g.run.cwd, path, false);
  if (!found.node) return empty(1, `readlink: ${path}: No such file or directory\n`);
  if (found.node.kind !== 'symlink' || !found.node.link) return empty(1, `readlink: ${path}: not a symlink\n`);
  const loops = found.node.link === absPath(found.node.parent ?? g.run.root);
  return out(`${found.node.link}\n`, [], 0, loops ? `readlink: ${path} points back at this room. A trap.\n` : '');
}

export function cmdFind(g: Play, args: string[]): Step {
  let start = '.';
  let pattern = '*';
  let type: 'f' | 'd' | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-name' || arg === '-iname') pattern = args[++i] ?? '*';
    else if (arg === '-type') type = (args[++i] ?? 'f') === 'd' ? 'd' : 'f';
    else if (!arg.startsWith('-')) start = arg;
  }
  const root = resolve(g.run.cwd, start, false).node;
  if (!root) return empty(1, `find: '${start}': No such file or directory\n`);
  const rx = globReg(pattern);
  const hits: string[] = [];
  const base = absPath(root);
  const visit = (node: VNode) => {
    const kindOk = !type || (type === 'd' ? node.kind === 'dir' : node.kind !== 'dir');
    if (kindOk && (rx.test(node.name) || (node === root && pattern === '*')) && node !== g.run.root) {
      const abs = absPath(node);
      if (abs === base) hits.push(start);
      else if (base !== '/' && abs.startsWith(`${base}/`)) hits.push(`${start.replace(/\/$/, '')}/${abs.slice(base.length + 1)}`);
      else hits.push(abs);
    }
    if (node.kind !== 'dir' || !hasExec(node)) return;
    for (const child of node.children.values()) visit(child);
  };
  visit(root);
  return out(hits.length ? `${hits.join('\n')}\n` : '');
}
