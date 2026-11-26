/**
 * Live malware and pickups for one floor. Every enemy is a file in the VFS (its inode) and, unless it
 * is a hidden rootkit, a process in the table (`ps`). The session calls the hooks here from its
 * applets (rm, mv, chmod, kill, ls -a, ps) and calls `tick()` once per world step (a command, or an enemy turn of a battle); `sync()` turns
 * whatever changed in the VFS into ENEMY_* events, so every way of deleting or changing a file counts.
 * Enemies only act while the hero stands in their zone; nothing here is random.
 */
import type { KernelEvent, PosixSignal } from '../contracts/events.js';
import { BESTIARY, PICKUP_INFO } from './bestiary.js';
import {
  calm as calmWorld,
  reveal as revealWorld,
  revealProcesses as revealProcessesWorld,
  signal as signalWorld,
  sync as syncWorld,
  cadence as cadenceWorld,
  threats as threatsWorld,
  tick as tickWorld,
  ticksToTell as ticksToTellWorld,
  vetoChmod as vetoChmodWorld,
  vetoRemove as vetoRemoveWorld,
} from './entities-combat.js';
import type { EnemySpawn, PickupSpawn } from './floors.js';
import {
  GRACE_TICKS,
  type Enemy,
  type EntityView,
  type KillHow,
  type Pickup,
  type ProcRow,
  type SignalResult,
  type WorldHost,
  type WorldLike,
} from './entities-types.js';
import { absPath, baseName, findId, hasExec, lookup, parentDir, type VNode } from './tree.js';
import type { ActorState } from './types.js';

export {
  type Enemy,
  type EntityView,
  type KillHow,
  type Pickup,
  type ProcRow,
  type SignalResult,
  type WorldHost,
} from './entities-types.js';

export class World implements WorldLike {
  readonly enemies: Enemy[] = [];
  readonly pickups: Pickup[] = [];
  /** Default cause of death for the command being run. */
  cause: KillHow = 'other';
  /** Lines for the terminal, drained by the session after each command and tick. */
  notes: string[] = [];
  ticks = 0;
  /** Ticks left before anyone may act: a breath after entering a floor or restoring a backup. */
  grace = GRACE_TICKS;
  /** Set by the session for one world step: hurting enemies hold fire (the step that starts a battle, so the player acts first). */
  holdFire = false;
  nextPid = 5000;
  nextZombie = 667;

  constructor(readonly host: WorldHost, enemies: EnemySpawn[], pickups: PickupSpawn[]) {
    for (const spec of enemies) this.addEnemy(spec);
    for (const spec of pickups) this.addPickup(spec);
  }

  // ---------------------------------------------------------------- setup

  node(path: string): VNode | null {
    return lookup(this.host.root(), path);
  }

  file(e: Enemy): VNode | null {
    return e.inode === null ? null : findId(this.host.root(), e.inode);
  }

  addEnemy(spec: EnemySpawn, minion = false): Enemy {
    const info = BESTIARY[spec.type];
    // Zombies are bare processes: `path` is the room they haunt, not a file of theirs.
    const node = spec.type === 'zombie' ? null : this.node(spec.path);
    const port = spec.port ? this.node(spec.port) : null;
    const buffer = spec.buffer ? this.node(spec.buffer) : null;
    const hidden = !!spec.hidden;
    const e: Enemy = {
      id: spec.id,
      type: spec.type,
      model: info.model,
      boss: info.kind === 'boss',
      minion,
      name: spec.type === 'zombie' ? String(spec.pid ?? 0) : baseName(spec.path),
      inode: node?.id ?? null,
      home: spec.type === 'zombie' ? spec.path : parentDir(spec.path),
      pid: spec.pid ?? null,
      ppid: spec.ppid ?? 1,
      user: node?.uid === 0 || spec.type === 'kernel' ? 'root' : 'dev',
      hp: info.hp,
      maxHp: info.hp,
      dead: false,
      frozen: false,
      enraged: false,
      revealed: !hidden,
      sealed: 0,
      clock: 0,
      told: false,
      deathTicks: 0,
      revealTick: -1,
      port: port?.id ?? null,
      buffer: buffer?.id ?? null,
      bufferPath: spec.buffer ?? null,
      helps: spec.helps ?? null,
      showIn: spec.showIn ?? [],
      family: 0,
      deathZone: [],
      shown: hidden ? 'hidden' : 'idle',
      shownHp: info.hp,
    };
    this.enemies.push(e);
    return e;
  }

  addPickup(spec: PickupSpawn): Pickup | null {
    const node = this.node(spec.path);
    if (!node) return null;
    const info = PICKUP_INFO[spec.type];
    if (spec.locked) node.mode = 0;
    const model = spec.model ?? (spec.type === 'ssd' && /gpu/i.test(node.name) ? 'pickup.gpu' : info.model);
    const p: Pickup = { id: spec.id, type: spec.type, model, inode: node.id, name: node.name, amount: info.amount, collected: false };
    this.pickups.push(p);
    return p;
  }

  // ---------------------------------------------------------------- queries

  get(id: string): Enemy | undefined {
    return this.enemies.find((e) => e.id === id);
  }

  drain(): string {
    const text = this.notes.map((line) => `${line}\n`).join('');
    this.notes = [];
    return text;
  }

  /** Enemy whose file is this inode (alive or not). */
  enemyByInode(id: number): Enemy | undefined {
    return this.enemies.find((e) => e.inode === id && !e.dead);
  }

  /** Enemy this inode belongs to: its file, the port it lives in, or the buffer it overflows. */
  enemyTouching(id: number): Enemy | undefined {
    return this.enemies.find((e) => !e.dead && (e.inode === id || e.port === id || e.buffer === id));
  }

  pickupByInode(id: number): Pickup | undefined {
    return this.pickups.find((p) => p.inode === id && !p.collected);
  }

  enemyByPid(pid: number): Enemy | undefined {
    return this.enemies.find((e) => e.pid === pid && !e.dead && this.listed(e));
  }

  /** Entity id for an inode (enemy or pickup), for FILE_* events and VIBECODER_ACTION targets. */
  entityOf(inode: number): string | undefined {
    return this.enemyByInode(inode)?.id ?? this.pickupByInode(inode)?.id;
  }

  /** Neutralised = dead or petrified. Counts roster enemies only (no zombies, no virus copies). */
  counts(): { left: number; total: number } {
    const roster = this.enemies.filter((e) => !e.minion);
    return { left: roster.filter((e) => !e.dead && !this.petrified(e)).length, total: roster.length };
  }

  pickupCounts(): { got: number; total: number } {
    return { got: this.pickups.filter((p) => p.collected).length, total: this.pickups.length };
  }

  petrified(e: Enemy): boolean {
    if (e.type !== 'trojan' || e.dead) return false;
    const node = this.file(e);
    return !!node && !hasExec(node);
  }

  sealedPort(e: Enemy): boolean {
    if (e.type !== 'worm' || e.port === null) return false;
    const port = findId(this.host.root(), e.port);
    return !!port && !hasExec(port);
  }

  /** Rooms (absolute paths) where this enemy is present and can act. */
  zone(e: Enemy): string[] {
    if (e.type === 'worm' && e.port !== null) {
      const port = findId(this.host.root(), e.port);
      if (port) return [absPath(port), parentDir(absPath(port))];
    }
    const node = this.file(e);
    return [node?.parent ? absPath(node.parent) : e.home];
  }


  /** Shown in ps: everything with a PID, except unrevealed rootkits and petrified trojans. */
  private listed(e: Enemy): boolean {
    if (e.pid === null) return false;
    if (e.type === 'rootkit' && !e.revealed) return false;
    if (this.petrified(e)) return false;
    return true;
  }

  procs(): ProcRow[] {
    const rows: ProcRow[] = [];
    for (const e of this.enemies) {
      if (e.dead || !this.listed(e)) continue;
      const zombie = e.type === 'zombie';
      rows.push({
        pid: e.pid ?? 0,
        ppid: e.ppid,
        name: this.procName(e),
        user: e.user,
        cpu: zombie ? 0 : e.boss ? (e.type === 'kernel' ? 100 : 98) : 12 + ((e.pid ?? 0) % 30),
        state: zombie ? 'ZOMBIE' : e.frozen ? 'STOPPED' : 'RUNNING',
        entityId: e.id,
      });
    }
    return rows;
  }

  private procName(e: Enemy): string {
    switch (e.type) {
      case 'bug': return `python3 ${e.name}`;
      case 'spyware': return `spycam --upload=agents`;
      case 'rootkit': return '[poltergeist]';
      case 'zombie': return '[zombie_worker] <defunct>';
      case 'kernel': return 'KERNEL_OVERLORD';
      default: return e.name;
    }
  }

  /** The animation state the stage shows for `e`. */
  stateOf(e: Enemy): ActorState {
    if (e.dead) return 'death';
    if (!e.revealed) return 'hidden';
    if (this.petrified(e)) return 'petrified';
    if (e.frozen) return 'frozen';
    if (this.sealedPort(e)) return 'hidden';
    if (e.told) return 'windup';
    if (e.enraged) return 'enraged';
    return e.revealTick === this.ticks ? 'revealed' : 'idle';
  }

  /** Ticks between `e`'s attacks (0 = never acts); the kernel's depends on the boss phase. */
  cadence(e: Enemy): number {
    return cadenceWorld(this, e);
  }

  /** Enemies and pickups to draw in `path` (dying enemies stay for two ticks with state `death`). */
  views(path: string): EntityView[] {
    const list: EntityView[] = [];
    for (const e of this.enemies) {
      if (e.dead && e.deathTicks >= 2) continue;
      const zone = e.dead ? e.deathZone : this.zone(e);
      if (!zone.includes(path) && !e.showIn.includes(path)) continue;
      const unseen = (!e.revealed && !e.dead) || this.sealedPort(e);
      const state = this.stateOf(e);
      list.push({
        id: e.id,
        model: e.model,
        kind: e.boss ? 'boss' : 'enemy',
        target: e.name,
        state,
        hp: e.dead ? 0 : e.hp,
        maxHp: e.maxHp,
        pid: e.pid ?? undefined,
        unseen,
        label: e.pid !== null && e.revealed ? `${e.name} [${e.pid}]` : e.name,
      });
    }
    for (const p of this.pickups) {
      if (p.collected) continue;
      const node = findId(this.host.root(), p.inode);
      if (!node?.parent || absPath(node.parent) !== path) continue;
      const locked = (node.mode & 0o400) === 0;
      list.push({
        id: p.id,
        model: p.model,
        kind: 'pickup',
        target: node.name,
        state: locked ? 'frozen' : 'idle',
        unseen: false,
        label: locked ? `${node.name} [encrypted]` : `${node.name} ${PICKUP_INFO[p.type].label(p.amount)}`,
        locked,
      });
    }
    return list;
  }

  /** Every live enemy and pickup in a room, for ENTITY_SPAWNED room_enter. */
  presentIn(path: string): Array<{ id: string; model: string }> {
    return this.views(path).filter((v) => v.state !== 'death').map((v) => ({ id: v.id, model: v.model }));
  }
  /** `ls -a` on `dir`: hidden enemies there show themselves. Returns the inodes revealed. */
  reveal(dir: VNode, events: KernelEvent[]): number[] {
    return revealWorld(this, dir, events);
  }

  /** `ps` / `top`: processes cannot hide from the table, except rootkits. */
  revealProcesses(events: KernelEvent[]): void {
    return revealProcessesWorld(this, events);
  }

  /**
 * About to delete `node` (rm, rm -r, mv over it, mv to /dev/null). Returns an error line to refuse
 * (and may react, e.g. a running virus splits), or null to allow. Pickups are allowed: they are lost.
 */
  vetoRemove(node: VNode, events: KernelEvent[]): string | null {
    return vetoRemoveWorld(this, node, events);
  }

  /** About to chmod `node`: root-owned malware refuses. */
  vetoChmod(node: VNode): string | null {
    return vetoChmodWorld(this, node);
  }


  /** Deliver a signal to the enemy with this PID. Null when no enemy owns the PID. */
  signal(pid: number, sig: PosixSignal, events: KernelEvent[]): SignalResult | null {
    return signalWorld(this, pid, sig, events);
  }

  /**
 * Compare the world with what was last reported: files that vanished, a bug that got patched, a buffer
 * made read-only, kernel phases, state changes (petrified, frozen, revealed...).
 */
  sync(events: KernelEvent[], how: KillHow = this.cause): void {
    return syncWorld(this, events, how);
  }


  /** After an in-place respawn: everyone takes a breath, no queued hits. */
  calm(): void {
    return calmWorld(this);
  }

  /** Ticks until `e` next tells an attack, or null when it will not (see `ticksToTell`). */
  ticksToTell(e: Enemy): number | null {
    return ticksToTellWorld(this, e);
  }

  /** Enemies that would fight the hero now (a battle runs while this is not empty). */
  threats(): Enemy[] {
    return threatsWorld(this);
  }

  tick(events: KernelEvent[]): string {
    return tickWorld(this, events);
  }

  // ---------------------------------------------------------------- pickups

  /** Mark a pickup collected (the session already removed its file). */
  collect(p: Pickup): void {
    p.collected = true;
  }
}
