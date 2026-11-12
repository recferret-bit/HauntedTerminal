import type { KernelEvent, PosixSignal } from '../contracts/events.js';
import { SOURCE_MALWARE_DAMAGE } from './bestiary.js';
import { SIGNAL_LIST } from './manual.js';
import { SHELL_PID, empty, out, type Play } from './play.js';
import { backups, bump, collectStep, denied, hurt, maxHp, push } from './runtime.js';
import type { Step } from './shell.js';
import type { ProcRow } from './entities.js';
import { resolve } from './tree.js';

export function procs(g: Play): ProcRow[] {
  const rows: ProcRow[] = [];
  if (g.run.floor !== 5) rows.push({ pid: 1, ppid: 0, name: 'agentd --orchestrate', user: 'root', cpu: 0.3, state: 'RUNNING' });
  rows.push({ pid: 10, ppid: 1, name: 'cron_restorer', user: 'root', cpu: 0.1, state: 'RUNNING' });
  rows.push(...g.run.world.procs());
  rows.push({ pid: SHELL_PID, ppid: 1, name: '-bash', user: 'dev', cpu: 0, state: 'RUNNING' });
  return rows.sort((a, b) => a.pid - b.pid);
}

export function cmdPs(g: Play, args: string[], top: boolean): Step {
  g.run.xray = true;
  const events: KernelEvent[] = [];
  g.run.world.revealProcesses(events);
  const rows = procs(g);
  push(g, events, {
    type: 'HUD_OVERLAY_TOGGLED',
    mode: 'PS_XRAY',
    processes: rows.map((row) => ({ pid: row.pid, ppid: row.ppid, name: row.name, cpu: row.cpu, state: row.state })),
  });
  const stat = (row: ProcRow) => (row.state === 'STOPPED' ? 'T' : row.state === 'ZOMBIE' ? 'Z' : row.cpu > 5 ? 'R' : 'S');
  const wide = top || args.some((arg) => arg.includes('a') || arg.includes('u') || arg.includes('x'));
  let text = '';
  if (top) {
    const counts = g.run.world.counts();
    text += `top - ${String(3 + Math.floor(g.run.commands / 60)).padStart(2, '0')}:${String(g.run.commands % 60).padStart(2, '0')} up 13 min, 1 user (you), load average: 6.66, 4.04, 1.00\n`;
    text += `Tasks: ${rows.length} total, malware left on this floor: ${counts.left}/${counts.total}\n`;
    text += `GiB Mem: ${16 + g.run.ram} total (${g.run.ram} collected)   SSD: ${g.run.ssd} GB, ${backups(g)} backup(s)   HP ${g.run.hp}/${maxHp(g)}\n\n`;
  }
  if (wide) {
    text += `${'USER'.padEnd(6)}${'PID'.padStart(6)}${'PPID'.padStart(6)} %CPU STAT COMMAND\n`;
    text += rows.map((row) => `${row.user.padEnd(6)}${String(row.pid).padStart(6)}${String(row.ppid).padStart(6)} ${row.cpu.toFixed(1).padStart(4)} ${stat(row).padEnd(4)} ${row.name}`).join('\n');
  } else {
    text += `${'PID'.padStart(5)}${'PPID'.padStart(6)} STAT %CPU COMMAND\n`;
    text += rows.map((row) => `${String(row.pid).padStart(5)}${String(row.ppid).padStart(6)} ${stat(row).padEnd(4)} ${row.cpu.toFixed(1).padStart(4)} ${row.name}`).join('\n');
  }
  return out(`${text}\n`, events);
}

export function signalOf(_g: Play, token: string | undefined): PosixSignal | null {
  if (!token) return 'SIGTERM';
  const name = token.replace(/^-/, '').toUpperCase().replace(/^SIG/, '');
  if (name === '9' || name === 'KILL') return 'SIGKILL';
  if (name === '15' || name === 'TERM') return 'SIGTERM';
  if (name === 'STOP' || name === '19' || name === '17' || name === '23') return 'SIGSTOP';
  if (name === 'CONT' || name === '18' || name === '19c') return 'SIGCONT';
  return null;
}

export function cmdKill(g: Play, args: string[]): Step {
  if (args[0] === '-l' || args[0] === '-L') return out(`${SIGNAL_LIST}\n`);
  let signal: PosixSignal = 'SIGTERM';
  const pids: number[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-s') {
      const parsed = signalOf(g, args[++i]);
      if (!parsed) return empty(1, `kill: ${args[i]}: invalid signal specification\n`);
      signal = parsed;
    } else if (arg.startsWith('-')) {
      const parsed = signalOf(g, arg);
      if (!parsed) return empty(1, `kill: ${arg}: invalid signal specification\n`);
      signal = parsed;
    } else {
      const pid = Number(arg);
      if (!Number.isInteger(pid)) return empty(1, `kill: ${arg}: arguments must be process IDs\n`);
      pids.push(pid);
    }
  }
  if (pids.length === 0) return empty(2, 'kill: usage: kill [-s sigspec | -signum | -sigspec] pid\n');
  const events: KernelEvent[] = [];
  let stdout = '';
  let stderr = '';
  let code = 0;
  for (const pid of pids) {
    const step = signalPid(g, pid, signal);
    stdout += step.stdout;
    stderr += step.stderr;
    events.push(...step.events);
    if (step.code !== 0) code = step.code;
    if (g.deadNow) break;
  }
  return { stdout, stderr, code, events };
}

export function signalPid(g: Play, pid: number, signal: PosixSignal): Step {
  const events: KernelEvent[] = [];
  const enemy = g.run.world.enemyByPid(pid);
  if (enemy) bump(g, 'cast', enemy.id);
  const hit = g.run.world.signal(pid, signal, events);
  if (hit) return { stdout: hit.stdout, stderr: hit.stderr, code: hit.code, events };
  if (pid === 1) return empty(1, 'kill: (1): Operation not permitted (agentd is the agents\' PID 1)\n');
  if (pid === 10) return empty(1, 'kill: (10): Operation not permitted (cron_restorer keeps you from soft-locking)\n');
  if (pid === SHELL_PID) return empty(1, `kill: (${pid}): that is your own shell. The agents would love that.\n`);
  return empty(1, `kill: (${pid}): No such process\n`);
}

export function cmdPkill(g: Play, args: string[]): Step {
  const name = args.filter((arg) => !arg.startsWith('-')).pop();
  if (!name) return empty(2, 'pkill: no matching criteria specified\n');
  const flag = args.find((arg) => arg.startsWith('-'));
  const signal = signalOf(g, flag);
  if (!signal) return empty(2, `pkill: ${flag}: invalid signal\n`);
  const hits = procs(g).filter((proc) => proc.name.includes(name) && proc.pid !== 10 && proc.pid !== SHELL_PID);
  if (hits.length === 0) return empty(1);
  const events: KernelEvent[] = [];
  let stdout = '';
  let stderr = '';
  for (const proc of hits) {
    const step = signalPid(g, proc.pid, signal);
    stdout += step.stdout;
    stderr += step.stderr;
    events.push(...step.events);
    if (g.deadNow) break;
  }
  return { stdout, stderr, code: 0, events };
}

export function cmdSource(g: Play, args: string[]): Step {
  const path = args[0];
  if (!path) return empty(2, 'source: filename argument required\n');
  const node = resolve(g.run.cwd, path, true).node;
  if (!node) return empty(1, `source: ${path}: No such file or directory\n`);
  if (node.kind === 'dir') return empty(1, `source: ${path}: is a directory\n`);
  const events: KernelEvent[] = [];
  const enemy = g.run.world.enemyByInode(node.id);
  if (enemy) {
    bump(g, 'cast', enemy.id);
    push(g, events, { type: 'ENEMY_ATTACK', entityId: enemy.id, model: enemy.model, damage: SOURCE_MALWARE_DAMAGE, attack: 'you ran it' });
    const boom = hurt(g, SOURCE_MALWARE_DAMAGE, node.name, events);
    return { stdout: '', stderr: `source: ${path}: you ran malware, and it ran you back.\n${boom}`, code: 1, events };
  }
  const pickup = g.run.world.pickupByInode(node.id);
  if (!pickup) return empty(1, `source: ${path}: nothing to load (pickups: *.cell *.dimm *.img)\n`);
  if ((node.mode & 0o400) === 0) {
    return denied(g, node, `source: ${path}: Permission denied (encrypted: chmod 644 ${path})\n`, `source ${path}`);
  }
  return collectStep(g, pickup, node, path);
}
