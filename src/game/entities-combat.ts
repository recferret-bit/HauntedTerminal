import type { KernelEvent, PosixSignal } from '../contracts/events.js';
import {
  BESTIARY, FORKBOMB_RAGE_DAMAGE, KERNEL_PHASE_DAMAGE, ZOMBIE_CAP, kernelPhaseCadence,
} from './bestiary.js';
import { GRACE_TICKS, type Enemy, type KillHow, type SignalResult, type World } from './entities.js';
import { absPath, baseName, findId, hasExec, hasWrite, makeNode, parentDir, type VNode } from './tree.js';

type ShownState = Extract<KernelEvent, { type: 'ENEMY_STATE' }>['state'];

const SIGNAL_HOW: Record<PosixSignal, KillHow> = { SIGKILL: 'SIGKILL', SIGTERM: 'SIGTERM', SIGSTOP: 'other', SIGCONT: 'other' };

/** `ls -a` on `dir`: hidden enemies there show themselves. Returns the inodes revealed. */
export function reveal(world: World, dir: VNode, events: KernelEvent[]): number[] {
  const path = absPath(dir);
  const shown: number[] = [];
  for (const e of world.enemies) {
    if (e.dead || e.revealed) continue;
    const node = world.file(e);
    if (!node?.parent || absPath(node.parent) !== path) continue;
    e.revealed = true;
    e.revealTick = world.ticks;
    shown.push(node.id);
  }
  sync(world, events);
  return shown;
}

/** `ps` / `top`: processes cannot hide from the table, except rootkits. */
export function revealProcesses(world: World, events: KernelEvent[]): void {
  for (const e of world.enemies) {
    if (e.dead || e.revealed || e.type === 'rootkit' || e.pid === null) continue;
    e.revealed = true;
    e.revealTick = world.ticks;
  }
  sync(world, events);
}

/**
 * About to delete `node` (rm, rm -r, mv over it, mv to /dev/null). Returns an error line to refuse
 * (and may react, e.g. a running virus splits), or null to allow. Pickups are allowed: they are lost.
 */
export function vetoRemove(world: World, node: VNode, events: KernelEvent[]): string | null {
  const e = world.enemyByInode(node.id);
  if (!e) return null;
  const running = !e.frozen;
  switch (e.type) {
    case 'bug':
      return `${node.name}: refusing to delete production. Patch the bug: sed -i 's/BUG/FIXED/' ${node.name}`;
    case 'crack':
      return running ? `${node.name}: Text file busy (it is running). Find its PID with ps and kill it.` : null;
    case 'exploit':
      return `${node.name}: Operation not permitted (owned by root). Its buffer is yours: chmod -w ${e.bufferPath ? baseName(e.bufferPath) : 'stack.buf'}`;
    case 'forkbomb':
      return `${node.name}: Operation not permitted (owned by root). Signals work on PID ${e.pid}.`;
    case 'kernel':
      return `${node.name}: Operation not permitted (PID 1 owns it).`;
    case 'virus':
      return running ? split(world, e, node, events) : null;
    default:
      return null;
  }
}

/** About to chmod `node`: root-owned malware refuses. */
export function vetoChmod(world: World, node: VNode): string | null {
  const e = world.enemyByInode(node.id);
  if (!e) return null;
  if (e.type === 'exploit' || e.type === 'forkbomb' || e.type === 'kernel') return `${node.name}: Operation not permitted (owned by root)`;
  return null;
}

function split(world: World, e: Enemy, node: VNode, events: KernelEvent[]): string {
  const root = world.enemies.find((x) => x.pid === e.ppid && x.type === 'virus' && !x.dead) ?? e;
  const kin = world.enemies.filter((x) => x.type === 'virus' && !x.dead && (x === root || x.ppid === root.pid)).length;
  world.host.push(events, { type: 'ENEMY_HIT', entityId: e.id, model: e.model, damage: 0, hpRemaining: e.hp, command: `rm ${node.name}` });
  if (kin >= 4 || !node.parent) {
    return `${node.name}: it rewrites itself faster than you delete it. kill -9 ${root.pid} first.`;
  }
  root.family += 1;
  const name = `${root.name}.${root.family}`;
  const copy = makeNode(node.parent, name, 'file', node.mode);
  copy.content = node.content;
  const pid = world.nextPid++;
  const child = world.addEnemy({ id: `${root.id}-${root.family}`, type: 'virus', path: absPath(copy), pid, ppid: root.pid ?? 1 }, true);
  child.inode = copy.id;
  world.host.push(events, { type: 'FILE_CREATED', inodeId: copy.id, name, entityId: child.id });
  world.host.push(events, { type: 'ENTITY_SPAWNED', entityId: child.id, model: child.model, reason: 'virus_split' });
  return `${node.name}: rm only spread it! The running virus copied itself to ${name} (PID ${pid}). Kill the parent first: kill -9 ${root.pid}`;
}

/** Deliver a signal to the enemy with this PID. Null when no enemy owns the PID. */
export function signal(world: World, pid: number, sig: PosixSignal, events: KernelEvent[]): SignalResult | null {
  const e = world.enemyByPid(pid);
  if (!e) return null;
  const ok = (stdout = ''): SignalResult => ({ code: 0, stdout, stderr: '' });
  const fail = (stderr: string): SignalResult => ({ code: 1, stdout: '', stderr: `${stderr}\n` });
  const proc = (outcome: 'FROZEN' | 'KILLED' | 'TRAPPED_ENRAGED') => world.host.push(events, { type: 'PROC_SIGNALED', pid, signal: sig, outcome });
  const shrug = () => world.host.push(events, { type: 'ENEMY_HIT', entityId: e.id, model: e.model, damage: 0, hpRemaining: e.hp, command: `kill ${pid}` });

  if (e.type === 'kernel' || e.type === 'exploit') {
    return fail(`kill: (${pid}): Operation not permitted${e.type === 'exploit' ? ' (it escalated to root; make its buffer read-only)' : ''}`);
  }
  if (e.type === 'bug' || e.type === 'trojan') {
    e.pid = world.nextPid++;
    proc('TRAPPED_ENRAGED');
    shrug();
    return e.type === 'bug'
      ? ok(`prod.service restarted (Restart=always) as PID ${e.pid}. The bug is in the code: sed -i it.\n`)
      : ok(`${e.name} relaunches as PID ${e.pid}: it is still executable. chmod -x it.\n`);
  }
  if (sig === 'SIGSTOP') {
    if (!e.frozen) {
      e.frozen = true;
      e.told = false;
      proc('FROZEN');
      if (e.type === 'forkbomb') world.host.bossDown(e.id, 'frozen');
    }
    sync(world, events);
    return ok(e.type === 'forkbomb' ? 'The necromancer locks in ice.\n' : `${e.name} freezes (SIGSTOP).\n`);
  }
  if (sig === 'SIGCONT') {
    if (e.frozen) {
      e.frozen = false;
      if (e.type === 'forkbomb') world.host.bossDown(e.id, 'thawed');
    }
    sync(world, events);
    return ok(`${e.name} resumes (SIGCONT).\n`);
  }
  if (sig === 'SIGTERM' && e.type === 'forkbomb') {
    e.enraged = true;
    proc('TRAPPED_ENRAGED');
    world.host.push(events, { type: 'ENEMY_ATTACK', entityId: e.id, model: e.model, damage: FORKBOMB_RAGE_DAMAGE, attack: 'SIGTERM IGNORED' });
    sync(world, events);
    const boom = world.host.hurt(FORKBOMB_RAGE_DAMAGE, 'necromancer_forkd', events);
    return { code: 0, stdout: '', stderr: `SIGTERM IGNORED!\n${boom}` };
  }
  if (sig === 'SIGTERM' && e.type === 'virus') {
    proc('TRAPPED_ENRAGED');
    shrug();
    return fail(`kill: (${pid}): ${e.name} traps SIGTERM. SIGKILL cannot be trapped: kill -9 ${pid}`);
  }
  proc('KILLED');
  kill(world, e, SIGNAL_HOW[sig], events);
  if (e.type === 'forkbomb') {
    world.host.bossDown(e.id, 'killed');
    return ok('SIGKILL. The forks go quiet.\n');
  }
  sync(world, events);
  return ok('');
}

function kill(world: World, e: Enemy, how: KillHow, events: KernelEvent[]): void {
  if (e.dead) return;
  const node = world.file(e);
  e.deathZone = world.zone(e);
  e.dead = true;
  e.hp = 0;
  e.told = false;
  e.frozen = false;
  e.deathTicks = 0;
  const keepFile = e.type === 'bug' || e.type === 'trojan';
  if (node?.parent && !keepFile) {
    node.parent.children.delete(node.name);
    node.parent = null;
    world.host.push(events, { type: 'FILE_REMOVED', inodeId: node.id, name: node.name, entityId: e.id });
  }
  world.host.push(events, { type: 'ENEMY_KILLED', entityId: e.id, model: e.model, how });
  world.notes.push(epitaph(world, e, how));
  for (const child of world.enemies) {
    if (child.dead || child === e || e.pid === null || child.ppid !== e.pid) continue;
    if (e.type === 'virus' || e.type === 'forkbomb') kill(world, child, how, events);
  }
}

function epitaph(_world: World, e: Enemy, how: KillHow): string {
  switch (e.type) {
    case 'bug': return `Bug squashed: ${e.name} is patched. Ship it.`;
    case 'worm': return how === 'chmod' ? 'Quarantined: worm.bin starves behind a closed port.' : 'worm.bin unthreads and falls apart.';
    case 'exploit': return 'Segmentation fault (core dumped): the exploit hit a read-only page.';
    case 'ransomware': return 'ransom.exe is dead. Your files stay encrypted: chmod 644 them back.';
    case 'kernel': return 'KERNEL_OVERLORD cracks. The agents lose their grip.';
    case 'forkbomb': return 'necromancer_forkd collapses.';
    case 'zombie': return `zombie_worker (${e.pid}) drops.`;
    case 'rootkit': return `${e.name} is exorcised.`;
    default: return `${e.name} is gone.`;
  }
}

/**
 * Compare the world with what was last reported: files that vanished, a bug that got patched, a buffer
 * made read-only, kernel phases, state changes (petrified, frozen, revealed...).
 */
export function sync(world: World, events: KernelEvent[], how: KillHow = world.cause): void {
  const root = world.host.root();
  for (const e of world.enemies) {
    if (e.dead) continue;
    const node = e.inode === null ? null : findId(root, e.inode);
    if (e.inode !== null && !node) {
      kill(world, e, how, events);
      continue;
    }
    if (e.type === 'bug' && node && !node.content.includes('BUG')) {
      kill(world, e, 'other', events);
      continue;
    }
    if (e.type === 'exploit' && e.buffer !== null) {
      const buf = findId(root, e.buffer);
      if (buf && !hasWrite(buf)) {
        kill(world, e, 'chmod', events);
        continue;
      }
    }
    if (e.type === 'zombie') {
      const parent = world.enemies.find((p) => p.pid === e.ppid && p.type === 'forkbomb');
      if (parent?.dead) {
        kill(world, e, 'SIGKILL', events);
        continue;
      }
    }
    if (e.type === 'kernel') {
      const hp = Math.max(0, e.maxHp - world.host.kernelPhase());
      if (hp < e.hp) {
        const damage = e.hp - hp;
        e.hp = hp;
        if (hp > 0) world.host.push(events, { type: 'ENEMY_HIT', entityId: e.id, model: e.model, damage, hpRemaining: hp, command: world.cause });
      }
      if (e.hp <= 0) {
        kill(world, e, 'other', events);
        continue;
      }
    }
  }
  for (const e of world.enemies) {
    if (e.dead) continue;
    const next = shownState(world, e);
    if (next !== e.shown) {
      e.shown = next;
      world.host.push(events, { type: 'ENEMY_STATE', entityId: e.id, model: e.model, state: next });
    }
  }
}

function shownState(world: World, e: Enemy): ShownState {
  if (!e.revealed) return 'hidden';
  if (world.petrified(e)) return 'petrified';
  if (e.frozen) return 'frozen';
  if (world.sealedPort(e)) return 'hidden';
  if (e.enraged) return 'enraged';
  return e.shown === 'hidden' ? 'revealed' : e.shown === 'revealed' ? 'revealed' : 'idle';
}

/** After an in-place respawn: everyone takes a breath, no queued hits. */
export function calm(world: World): void {
  world.grace = GRACE_TICKS;
  for (const e of world.enemies) {
    e.clock = 0;
    e.told = false;
  }
}

export function tick(world: World, events: KernelEvent[]): string {
  world.ticks += 1;
  const resting = world.grace > 0;
  if (resting) world.grace -= 1;
  let out = '';
  for (const e of world.enemies) if (e.dead) e.deathTicks += 1;
  for (const e of [...world.enemies]) {
    if (!world.host.alive()) break;
    if (e.dead) continue;
    out += passive(world, e, events);
    if (e.dead || !world.host.alive()) continue;
    if ((resting || world.host.truce()) && damage(world, e) > 0) {
      // Grace holds back attacks on the hero only; lock picks and encryption carry on.
      e.clock = 0;
      e.told = false;
      continue;
    }
    out += act(world, e, events);
  }
  if (world.host.alive()) sync(world, events, 'other');
  return out + world.drain();
}

/** Things that happen wherever the hero is: a closed port starves its worm, a buffer grows back. */
function passive(world: World, e: Enemy, events: KernelEvent[]): string {
  if (e.type === 'worm') {
    if (world.sealedPort(e)) {
      e.sealed += 1;
      e.told = false;
      if (e.sealed >= 3) kill(world, e, 'chmod', events);
    } else e.sealed = 0;
  }
  if (e.type === 'exploit' && e.bufferPath && !e.frozen && here(world, e)) {
    let buf = e.buffer === null ? null : findId(world.host.root(), e.buffer);
    if (!buf) {
      const dir = world.node(parentDir(e.bufferPath));
      if (dir?.kind === 'dir') {
        buf = makeNode(dir, baseName(e.bufferPath), 'file', 0o666);
        buf.content = 'AAAA\n';
        e.buffer = buf.id;
        world.host.push(events, { type: 'FILE_CREATED', inodeId: buf.id, name: buf.name, entityId: e.id });
        return `${e.name} allocates a fresh ${buf.name}.\n`;
      }
    } else if (hasWrite(buf) && buf.content.length < 400) {
      buf.content = buf.content.replace(/\n$/, '') + 'AAAA\n';
    }
  }
  return '';
}

/** Is this enemy able to act at all right now? */
function active(world: World, e: Enemy): boolean {
  if (e.dead || e.frozen || world.petrified(e) || world.sealedPort(e)) return false;
  if (e.type === 'rootkit') return false;
  if (e.type === 'zombie') {
    const parent = world.enemies.find((p) => p.pid === e.ppid && p.type === 'forkbomb');
    if (parent?.frozen) return false;
  }
  return true;
}

function cadence(world: World, e: Enemy): number {
  if (e.type === 'kernel') return kernelPhaseCadence(Math.min(2, world.host.kernelPhase()));
  return BESTIARY[e.type].every;
}

function damage(world: World, e: Enemy): number {
  if (e.type === 'kernel') return KERNEL_PHASE_DAMAGE[Math.min(2, world.host.kernelPhase())] ?? 3;
  return BESTIARY[e.type].damage;
}

/** Indirect actors only tell when they have something to do. */
function wants(world: World, e: Enemy): string | null {
  if (e.type === 'crack') {
    const target = e.helps ? world.get(e.helps) : undefined;
    return target && !target.dead && world.sealedPort(target) ? 'lock pick' : null;
  }
  if (e.type === 'ransomware') {
    const prey = preyOf(world, e);
    return prey ? `encrypt ${prey.name}` : null;
  }
  if (e.type === 'forkbomb') {
    const alive = world.enemies.filter((z) => z.type === 'zombie' && !z.dead && z.ppid === e.pid).length;
    return alive < ZOMBIE_CAP ? 'fork()' : null;
  }
  return damage(world, e) > 0 ? BESTIARY[e.type].attack : null;
}

function preyOf(world: World, e: Enemy): VNode | null {
  const room = world.zone(e)[0];
  for (const p of world.pickups) {
    if (p.collected) continue;
    const node = findId(world.host.root(), p.inode);
    if (node?.parent && absPath(node.parent) === room && (node.mode & 0o400) !== 0) return node;
  }
  return null;
}

function act(world: World, e: Enemy, events: KernelEvent[]): string {
  const every = cadence(world, e);
  if (every <= 0 || !active(world, e) || !here(world, e)) {
    e.clock = 0;
    e.told = false;
    return '';
  }
  if (e.type === 'crack') {
    // Reactive: the tick after a port closes it lines up its pick, the tick after that the port is open.
    if (e.told) {
      e.told = false;
      return strike(world, e, events);
    }
    const attack = wants(world, e);
    if (attack) {
      e.told = true;
      world.host.push(events, { type: 'ENEMY_ATTACK', entityId: e.id, model: e.model, damage: 0, attack });
    }
    return '';
  }
  let out = '';
  e.clock += 1;
  if (e.told) {
    e.told = false;
    out += strike(world, e, events);
    if (!world.host.alive() || e.dead) return out;
  }
  if ((e.clock + 1) % every === 0) {
    const attack = wants(world, e);
    if (attack) {
      e.told = true;
      world.host.push(events, { type: 'ENEMY_ATTACK', entityId: e.id, model: e.model, damage: damage(world, e), attack });
    }
  }
  return out;
}

function strike(world: World, e: Enemy, events: KernelEvent[]): string {
  if (e.type === 'crack') {
    const target = e.helps ? world.get(e.helps) : undefined;
    const port = target?.port != null ? findId(world.host.root(), target.port) : null;
    if (!target || target.dead || !port || hasExec(port)) return '';
    const old = port.mode;
    port.mode = 0o755;
    target.sealed = 0;
    world.host.push(events, { type: 'INODE_MODE_CHANGED', inodeId: port.id, oldMode: old, newMode: port.mode });
    return `${e.name} picked the lock on ${port.name}! The worm is loose again.\n`;
  }
  if (e.type === 'ransomware') {
    const prey = preyOf(world, e);
    if (!prey) return '';
    const old = prey.mode;
    prey.mode = 0;
    world.host.push(events, { type: 'INODE_MODE_CHANGED', inodeId: prey.id, oldMode: old, newMode: 0 });
    return `${e.name} encrypted ${prey.name} (mode 000). Kill it, then chmod 644 ${prey.name}.\n`;
  }
  if (e.type === 'forkbomb') return fork(world, e, events);
  const label = e.type === 'kernel' ? 'stderr' : e.type === 'zombie' ? 'zombie_worker' : e.name;
  return world.host.hurt(damage(world, e), label, events);
}

function fork(world: World, boss: Enemy, events: KernelEvent[]): string {
  const alive = world.enemies.filter((z) => z.type === 'zombie' && !z.dead && z.ppid === boss.pid).length;
  if (alive >= ZOMBIE_CAP) return '';
  const pid = world.nextZombie++;
  const zombie = world.addEnemy({ id: `f4-zombie-${pid}`, type: 'zombie', path: world.zone(boss)[0] ?? boss.home, pid, ppid: boss.pid ?? 666 }, true);
  world.host.push(events, { type: 'SYSTEM_HAND_SPAWN', entityKind: 'process', id: pid, name: 'zombie_worker', reason: 'boss_fork' });
  world.host.push(events, { type: 'ENTITY_SPAWNED', entityId: zombie.id, model: zombie.model, reason: 'boss_fork' });
  return `necromancer_forkd forked zombie_worker (${pid})\n`;
}

function here(world: World, e: Enemy): boolean {
  return world.zone(e).includes(world.host.cwdPath());
}

