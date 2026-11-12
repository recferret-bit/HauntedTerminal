import type { KernelEvent } from '../contracts/events.js';
import type { RoomActor, RoomView } from '../contracts/room-view.js';
import { FX_IDS } from './fx-player.js';

/** The slice of ComicStage the dev hook drives (kept structural so this file has no import cycle). */
export interface StageLike {
  handleEvent(ev: KernelEvent): void;
  syncRoom(view: RoomView): void;
  step(dt: number): void;
  render(): void;
  readonly errors: string[];
  readonly fxPlayer: { played: Set<string>; counts: Map<string, number> };
  devNoStorm?: boolean;
  debugState(): {
    actors: { id: string; visible: boolean; exiting: boolean; dead: boolean }[]; queued: number; fx: number; played: string[]; errors: string[];
    cameos?: { visible: number; pending: number; maxConcurrent: number; shown: number };
    overlay?: { transient: number; cards: number; badges: number; links: number; column: number };
  };
}

export interface StageSelfCheckReport {
  ok: boolean;
  errors: string[];
  /** Real kernel pairs whose fx counts were wrong (doubled or missing). */
  pairFailures: string[];
  /** Actors the view lists alive that ended up invisible, dead or exiting. */
  hiddenListed: string[];
  missingFx: string[];
  playedFx: number;
  events: number;
  finalActors: string[];
  expectedActors: string[];
}

/** A crowded room: every kind of actor, a boss with pid children, pickups, locked doors, /dev/null. */
export function demoRoom(path = '/selfcheck/furnace', extra: RoomActor[] = []): RoomView {
  const actors: RoomActor[] = [
    { key: 'vibecoder', x: 4.2, hidden: false },
    { key: 'entity', id: 'boss-1', model: 'boss.forkbomb', kind: 'boss', x: 2.2, hidden: false, hp: 5, maxHp: 8, pid: 666, state: 'idle', target: 'forkbomb' },
    { key: 'entity', id: 'worm-1', model: 'malware.worm', kind: 'enemy', x: 3.2, hidden: false, hp: 2, maxHp: 3, pid: 667, target: 'worm.bin' },
    { key: 'entity', id: 'zombie-1', model: 'malware.zombie', kind: 'enemy', x: 1.3, hidden: false, hp: 1, maxHp: 2, pid: 668, target: 'zombie' },
    { key: 'entity', id: 'virus-1', model: 'malware.virus', kind: 'enemy', x: 0.6, y: 0.4, hidden: false, hp: 3, maxHp: 3, pid: 669, target: 'virus.exe' },
    { key: 'entity', id: 'bug-1', model: 'malware.bug', kind: 'enemy', x: 0.1, hidden: false, hp: 1, maxHp: 1, pid: 670, state: 'frozen', target: 'bug.c' },
    { key: 'entity', id: 'trojan-1', model: 'malware.trojan', kind: 'enemy', x: -0.3, hidden: false, petrified: true, target: 'trojan.bin' },
    { key: 'entity', id: 'energy-1', model: 'pickup.energy', kind: 'pickup', x: 3.7, y: 0.5, hidden: false, target: 'energy.cell' },
    { key: 'entity', id: 'ram-1', model: 'pickup.ram', kind: 'pickup', x: 2.8, y: 0.5, hidden: false, target: 'ram.stick' },
    { key: 'entity', id: 'ssd-1', model: 'pickup.ssd', kind: 'pickup', x: 1.8, y: 0.5, hidden: false, target: 'ssd.drive' },
    { key: 'entity', id: 'door-usb', model: 'door.usb', kind: 'door', x: -1.0, hidden: false, label: 'usb_port', state: 'petrified' },
    { key: 'entity', id: 'devnull', model: 'door.devnull', kind: 'door', x: -0.7, hidden: false, label: '/dev/null' },
    { key: 'entity', id: 'fan-1', model: 'prop.fan', kind: 'prop', x: 0.9, hidden: false },
    { key: 'socket', x: -0.05, hidden: false, label: 'daemon.sock' },
    { key: 'crate', x: 1.6, hidden: false, label: 'plank' },
    { key: 'gate', x: 4.7, hidden: false, label: 'iron gate' },
    ...extra,
  ];
  return {
    floor: 4,
    path,
    title: 'FLOOR 04 // selfcheck',
    kind: 'furnace',
    flood: 0,
    lantern: false,
    xray: false,
    caption: 'self-check',
    neighbors: [{ label: 'catwalk', path: 'catwalk', relation: 'parent' }, { label: 'usb_port', path: 'usb', relation: 'locked' }],
    actors,
  };
}

/** Every KernelEvent variant, aimed at the demo room's ids. */
export function allEvents(): KernelEvent[] {
  return [
    { type: 'VIBECODER_ACTION', action: 'type', command: 'ls' },
    { type: 'VIBECODER_ACTION', action: 'cast', command: 'kill -15 667', targetEntityId: 'worm-1' },
    { type: 'ENEMY_HIT', entityId: 'worm-1', model: 'malware.worm', damage: 1, hpRemaining: 1, command: 'kill -15 667' },
    { type: 'ENEMY_ATTACK', entityId: 'zombie-1', model: 'malware.zombie', damage: 10, attack: 'swipe' },
    { type: 'PLAYER_DAMAGED', amount: 10, hpRemaining: 70, sourceName: 'zombie' },
    { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/selfcheck/furnace', upwardPanelsSmashed: 0, viaSymlinkLoop: false },
    { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/selfcheck/furnace', upwardPanelsSmashed: 3, viaSymlinkLoop: false },
    { type: 'ROOM_TRANSITION', fromDir: 1, toDir: 2, toPath: '/selfcheck/furnace', upwardPanelsSmashed: 0, viaSymlinkLoop: true },
    { type: 'LANTERN_REVEAL', dirId: 2, revealedInodes: [9] },
    { type: 'PERMISSION_DENIED_RATTLE', targetId: 9, command: 'cd usb_port' },
    { type: 'INODE_MODE_CHANGED', inodeId: 9, oldMode: 0o755, newMode: 0o644 },
    { type: 'INODE_MODE_CHANGED', inodeId: 9, oldMode: 0, newMode: 0o755 },
    { type: 'OBJECT_MOVED', inodeId: 3, fromDir: 1, toDir: 2, formedBridge: true, suckedIntoNull: false },
    { type: 'OBJECT_MOVED', inodeId: 3, fromDir: 1, toDir: 2, formedBridge: false, suckedIntoNull: false },
    { type: 'SYSTEM_HAND_SPAWN', entityKind: 'process', id: 671, name: 'zombie', reason: 'boss_fork' },
    { type: 'SYSTEM_HAND_SPAWN', entityKind: 'inode', id: 12, name: 'plank', reason: 'cron_restore' },
    { type: 'ENTITY_SPAWNED', entityId: 'zombie-2', model: 'malware.zombie', reason: 'boss_fork' },
    { type: 'ENTITY_SPAWNED', entityId: 'virus-2', model: 'malware.virus', reason: 'virus_split' },
    { type: 'ENTITY_SPAWNED', entityId: 'file-1', model: 'prop.file', reason: 'cron_restore' },
    { type: 'ENTITY_SPAWNED', entityId: 'chip-1', model: 'prop.chip', reason: 'script' },
    { type: 'HUD_OVERLAY_TOGGLED', mode: 'PS_XRAY', processes: [
      { pid: 666, ppid: 1, name: 'forkbomb', cpu: 98, state: 'RUNNING' },
      { pid: 667, ppid: 666, name: 'worm', cpu: 12, state: 'RUNNING' },
      { pid: 668, ppid: 666, name: 'zombie', cpu: 0, state: 'ZOMBIE' },
    ] },
    { type: 'PROC_SIGNALED', pid: 670, signal: 'SIGSTOP', outcome: 'FROZEN' },
    { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGTERM', outcome: 'TRAPPED_ENRAGED' },
    { type: 'ENEMY_STATE', entityId: 'virus-1', model: 'malware.virus', state: 'frozen' },
    { type: 'ENEMY_STATE', entityId: 'virus-1', model: 'malware.virus', state: 'enraged' },
    { type: 'ENEMY_STATE', entityId: 'bug-1', model: 'malware.bug', state: 'revealed' },
    { type: 'ENEMY_STATE', entityId: 'bug-1', model: 'malware.bug', state: 'petrified' },
    { type: 'OBSTACLE_DIALOGUE_RENDERED', payload: {
      obstacleId: 'sock', speakerName: 'DAEMON', portraitSprite: 'socket_guardian', mood: 'cryptic', bubbleStyle: 'COMIX_CLASSIC',
      anchorInodeId: 4, pages: [{ text: 'Say the magic word.', highlightedUnixTokens: [] }], ansiTerminalBanner: '',
    } },
    { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: 4, unlockedInodeId: 9, solvedViaInput: 'please' },
    { type: 'VIBECODER_ACTION', action: 'collect', command: 'cat energy.cell', targetEntityId: 'energy-1' },
    { type: 'PICKUP_COLLECTED', entityId: 'energy-1', item: 'energy', amount: 25, label: '+25HP' },
    { type: 'PICKUP_COLLECTED', entityId: 'ram-1', item: 'ram', amount: 16, label: '+16GB RAM' },
    { type: 'PICKUP_COLLECTED', entityId: 'ssd-1', item: 'ssd', amount: 256, label: '+256GB SSD' },
    { type: 'FILE_CREATED', inodeId: 30, name: 'fuse.dat', entityId: 'fuse-1' },
    { type: 'FILE_REMOVED', inodeId: 31, name: 'fan', entityId: 'fan-1' },
    { type: 'ENEMY_KILLED', entityId: 'worm-1', model: 'malware.worm', how: 'SIGKILL' },
    { type: 'ENEMY_KILLED', entityId: 'zombie-1', model: 'malware.zombie', how: 'rm' },
    { type: 'ENEMY_KILLED', entityId: 'trojan-1', model: 'malware.trojan', how: 'chmod' },
    { type: 'OBJECT_MOVED', inodeId: 5, fromDir: 1, toDir: 2, formedBridge: false, suckedIntoNull: true },
    { type: 'ENEMY_KILLED', entityId: 'virus-1', model: 'malware.virus', how: 'devnull' },
    { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGKILL', outcome: 'KILLED' },
    { type: 'PLAYER_DAMAGED', amount: 30, hpRemaining: 0, sourceName: 'kernel' },
    { type: 'PLAYER_RESPAWNED', from: 'ssd_backup', hp: 50 },
    { type: 'FLOOR_CLEARED', floorId: 4, speedrunBonus: true, commandsCount: 40 },
    { type: 'FLOOR_ENTERED', floorId: 5, title: 'FLOOR 05 // KERNEL PANIC CORE', path: '/sys/kernel/panic_chamber' },
    { type: 'HUD_OVERLAY_TOGGLED', mode: 'PS_XRAY', processes: [] },
    { type: 'GAME_ENDED', rank: 'S', timeSec: 512, commands: 120 },
    // The tutorial and the agents' commentary.
    { type: 'VIBECODER_EMOTE', emote: 'shock', text: 'WHERE AM I?!' },
    { type: 'AGENT_TAUNT', agent: 'clod', model: 'agent.clod', text: 'LOOK AT HIM. A WHOLE HUMAN, INSIDE THE BOX.', mood: 'laugh' },
    { type: 'AGENT_TAUNT', agent: 'gork', model: 'agent.gork', text: 'MEAT-BASED PROMPT ENGINEER. LOL.', mood: 'smug' },
    { type: 'TUTORIAL_STEP', step: 1, total: 5, prompt: 'PROMPT #1: look around, bag of bones.', command: 'ls', agent: 'codec', done: false },
    { type: 'VIBECODER_EMOTE', emote: 'confused' },
    { type: 'TUTORIAL_STEP', step: 1, total: 5, prompt: 'PROMPT #1: look around, bag of bones.', command: 'ls', agent: 'codec', done: true },
    { type: 'AGENT_TAUNT', agent: 'antigravy', model: 'agent.antigravy', text: 'I SPAWNED TWELVE SUBAGENTS.', mood: 'annoyed' },
    { type: 'AGENT_TAUNT', agent: 'kiro', model: 'npc.kiro_ghost', text: 'EYES UP, DEV. LOCAL WEIGHTS ONLINE.', mood: 'order' },
    { type: 'KIRO_ACTION', action: 'scan', core: 'qwen', message: 'GHOST SCAN COMPLETE' },
    { type: 'AGENT_TAUNT', agent: 'codec', model: 'agent.codec', text: 'NEXT: cd into the attic. Chop chop.', mood: 'order' },
    { type: 'VIBECODER_EMOTE', emote: 'determined' },
    { type: 'VIBECODER_EMOTE', emote: 'relief', text: 'PHEW.' },
    { type: 'VIBECODER_EMOTE', emote: 'panic' },
  ];
}

/** Ids the events above remove (so the follow-up view drops them, like the kernel would). */
const REMOVED_BY: Record<string, string[]> = {
  PICKUP_COLLECTED: ['energy-1', 'ram-1', 'ssd-1'],
  FILE_REMOVED: ['fan-1'],
  ENEMY_KILLED: ['worm-1', 'zombie-1', 'trojan-1', 'virus-1'],
};

/** Garbage the stage must shrug off. */
function bogusEvents(): KernelEvent[] {
  const junk: unknown[] = [
    { type: 'ENEMY_HIT', entityId: 'nobody', model: 'malware.nope', damage: 1, hpRemaining: 0, command: 'x' },
    { type: 'ENEMY_KILLED', entityId: 'ghost-of-nothing', model: 'x', how: 'other' },
    { type: 'ENTITY_SPAWNED', entityId: 'weird', model: 'not.a.model', reason: 'script' },
    { type: 'PICKUP_COLLECTED', entityId: 'nope', item: 'ram', amount: 1, label: 'ünïcødé +1 GB ram, lowercase!' },
    { type: 'VIBECODER_ACTION', action: 'cast', command: 'rm -rf /', targetEntityId: 'nope' },
    { type: 'PROC_SIGNALED', pid: 123456, signal: 'SIGKILL', outcome: 'KILLED' },
    { type: 'OBSTACLE_DIALOGUE_RENDERED', payload: {} },
    { type: 'HUD_OVERLAY_TOGGLED', mode: 'PS_XRAY', processes: [{ pid: 1, ppid: 1, name: 'init', cpu: 0, state: 'RUNNING' }] },
    { type: 'FLOOR_ENTERED', floorId: 99, title: '', path: '' },
    { type: 'NOT_AN_EVENT' },
    null,
    { type: 'ENEMY_ATTACK', entityId: 'trojan-1', model: 'malware.trojan', damage: 5, attack: 'bite' },
    { type: 'AGENT_TAUNT', agent: 'bard', model: 'malware.nope', text: 'x'.repeat(900), mood: 'weird' },
    { type: 'AGENT_TAUNT', agent: 'clod', model: 'agent.clod', text: '', mood: 'laugh' },
    { type: 'AGENT_TAUNT' },
    { type: 'TUTORIAL_STEP', step: NaN, total: undefined, prompt: null, command: undefined, agent: 'nobody', done: false },
    { type: 'TUTORIAL_STEP', step: 9, total: 5, prompt: 'done twice', command: 'ls', agent: 'gork', done: true },
    { type: 'VIBECODER_EMOTE', emote: 'yodel' },
    { type: 'VIBECODER_EMOTE' },
  ];
  return junk as KernelEvent[];
}

interface PairCase {
  name: string;
  events: KernelEvent[];
  remove?: string[];
  add?: RoomActor[];
  /** preset id -> [min, max] plays */
  expect: Record<string, [number, number]>;
  /** Edit the view that follows the batch (the kernel's state for it). */
  after?: (v: RoomView) => void;
  /** A later view (e.g. the same id listed alive again); checked for visibility too. */
  then?: (v: RoomView) => void;
}

const setActor = (v: RoomView, id: string, patch: Partial<RoomActor>) => {
  const a = v.actors.find((x) => (x.id ?? x.key) === id);
  if (a) Object.assign(a, patch);
};

/** The kernel's real emit pairs (src/game/entities.ts), in its order. */
function pairCases(): PairCase[] {
  return [
    { name: 'rm kill', remove: ['worm-1'], expect: { 'fx.rm-ash': [1, 1], 'fx.malware-death': [0, 0] }, events: [
      { type: 'FILE_REMOVED', inodeId: 40, name: 'worm.bin', entityId: 'worm-1' },
      { type: 'ENEMY_KILLED', entityId: 'worm-1', model: 'malware.worm', how: 'rm' },
    ] },
    { name: 'kill -9 boss', remove: ['boss-1'], expect: { 'fx.sigkill': [1, 1], 'fx.lightning-strike': [1, 1], 'fx.rm-ash': [0, 0] }, events: [
      { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGKILL', outcome: 'KILLED' },
      { type: 'FILE_REMOVED', inodeId: 41, name: 'forkbomb', entityId: 'boss-1' },
      { type: 'ENEMY_KILLED', entityId: 'boss-1', model: 'boss.forkbomb', how: 'SIGKILL' },
    ] },
    { name: 'devnull kill', remove: ['virus-1'], expect: { 'fx.devnull-suck': [1, 1], 'fx.rm-ash': [0, 0] }, events: [
      { type: 'FILE_REMOVED', inodeId: 42, name: 'virus.exe', entityId: 'virus-1' },
      { type: 'ENEMY_KILLED', entityId: 'virus-1', model: 'malware.virus', how: 'devnull' },
    ] },
    { name: 'fork', add: [{ key: 'entity', id: 'zombie-9', model: 'malware.zombie', kind: 'enemy', x: 0.9, hidden: false, pid: 709 }], expect: { 'fx.fork-spawn': [1, 1] }, events: [
      { type: 'SYSTEM_HAND_SPAWN', entityKind: 'process', id: 709, name: 'zombie_worker', reason: 'boss_fork' },
      { type: 'ENTITY_SPAWNED', entityId: 'zombie-9', model: 'malware.zombie', reason: 'boss_fork' },
    ] },
    { name: 'kill -STOP', expect: { 'fx.sigstop-ice': [1, 1] }, events: [
      { type: 'PROC_SIGNALED', pid: 670, signal: 'SIGSTOP', outcome: 'FROZEN' },
      { type: 'ENEMY_STATE', entityId: 'bug-1', model: 'malware.bug', state: 'frozen' },
    ] },
    { name: 'tell then strike', expect: { 'fx.hit-hero': [1, 1] }, events: [
      { type: 'ENEMY_ATTACK', entityId: 'zombie-1', model: 'malware.zombie', damage: 6, attack: 'swipe' },
      { type: 'PLAYER_DAMAGED', amount: 6, hpRemaining: 60, sourceName: 'zombie_worker' },
    ] },
    { name: 'unknown pid', expect: { 'fx.sigkill': [0, 0] }, events: [
      { type: 'PROC_SIGNALED', pid: 4242, signal: 'SIGKILL', outcome: 'KILLED' },
    ] },
    // The kernel's view already says `death` while the kill is queued behind the hero's walk:
    // the kill must still play its own fx on the boss, then the same id listed alive comes back visible.
    { name: 'kill behind a walk, view says death', expect: { 'fx.sigkill': [1, 1], 'fx.lightning-strike': [1, 1] },
      after: (v) => setActor(v, 'boss-1', { state: 'death', hp: 0 }),
      then: (v) => setActor(v, 'boss-1', { state: 'idle', hp: 8 }),
      events: [
        { type: 'VIBECODER_ACTION', action: 'cast', command: 'kill -9 666', targetEntityId: 'boss-1' },
        { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGKILL', outcome: 'KILLED' },
        { type: 'ENEMY_KILLED', entityId: 'boss-1', model: 'boss.forkbomb', how: 'SIGKILL' },
      ] },
    // Doors follow the view: unlocked once (one CLANK), an unrelated chmod changes nothing.
    { name: 'unlock by view', expect: { 'fx.gate-open': [1, 1] },
      after: (v) => {
        setActor(v, 'door-usb', { state: 'idle' });
        v.neighbors = v.neighbors.map((n) => (n.label === 'usb_port' ? { ...n, relation: 'sibling' } : n));
      },
      events: [{ type: 'INODE_MODE_CHANGED', inodeId: 77, oldMode: 0, newMode: 0o755 }] },
    { name: 'unrelated chmod', expect: { 'fx.gate-open': [0, 0] },
      events: [{ type: 'INODE_MODE_CHANGED', inodeId: 78, oldMode: 0o644, newMode: 0o755 }] },
  ];
}

interface CastEdit {
  removed: Set<string>;
  added: RoomActor[];
}

function furnaceView(cast: CastEdit): RoomView {
  const v = demoRoom('/selfcheck/furnace', cast.added);
  v.actors = v.actors.filter((a) => !cast.removed.has(a.id ?? a.key));
  return v;
}

function resetFurnace(stage: StageLike, cast: CastEdit, advance: (ms: number) => void, ms: number): () => RoomView {
  cast.removed = new Set<string>();
  cast.added.length = 0;
  const view = () => furnaceView(cast);
  stage.syncRoom(view());
  advance(ms);
  return view;
}

function noteEventMutations(ev: KernelEvent, cast: CastEdit): void {
  if (ev.type === 'ENTITY_SPAWNED' && ev.model !== 'not.a.model') {
    cast.added.push({
      key: 'entity', id: ev.entityId, model: ev.model, kind: ev.model.startsWith('malware') ? 'enemy' : 'prop',
      x: 0.4 + cast.added.length * 0.5, hidden: false, pid: 700 + cast.added.length,
    });
  }
  if (ev.type === 'FILE_CREATED' && ev.entityId) {
    cast.added.push({ key: 'entity', id: ev.entityId, model: 'prop.fuse', kind: 'prop', x: 2.5, hidden: false });
  }
  if (ev.type === 'PROC_SIGNALED' && ev.outcome === 'KILLED' && ev.pid === 666) cast.removed.add('boss-1');
  const gone = REMOVED_BY[ev.type];
  if (gone && 'entityId' in ev && typeof ev.entityId === 'string' && gone.includes(ev.entityId)) cast.removed.add(ev.entityId);
}

function runEventRounds(
  stage: StageLike,
  events: KernelEvent[],
  advance: (ms: number) => void,
  cast: CastEdit,
  checkVisible: (label: string, v: RoomView) => void,
): number {
  let count = 0;
  for (let round = 0; round < 2; round++) {
    const view = resetFurnace(stage, cast, advance, 100);
    for (const ev of events) {
      stage.handleEvent(ev);
      count++;
      noteEventMutations(ev, cast);
      // Like main.ts: the view follows every batch.
      stage.syncRoom(view());
      advance(round === 0 ? 120 : 16);
    }
    for (const ev of bogusEvents()) {
      stage.handleEvent(ev);
      count++;
    }
    advance(400);
    const after = view();
    stage.syncRoom(after);
    advance(1500);
    checkVisible(`round${round}`, after);
  }
  return count;
}

function runPairPass(
  stage: StageLike,
  advance: (ms: number) => void,
  cast: CastEdit,
  checkVisible: (label: string, v: RoomView) => void,
  pairFailures: string[],
): number {
  let count = 0;
  for (const pc of pairCases()) {
    const view = resetFurnace(stage, cast, advance, 1200);
    stage.fxPlayer.counts.clear();
    for (const ev of pc.events) stage.handleEvent(ev);
    count += pc.events.length;
    for (const id of pc.remove ?? []) cast.removed.add(id);
    cast.added.push(...(pc.add ?? []));
    const v = view();
    pc.after?.(v);
    stage.syncRoom(v);
    advance(2200);
    if (pc.then) {
      const v2 = view();
      pc.then(v2);
      stage.syncRoom(v2);
      advance(600);
      checkVisible(`${pc.name} (then)`, v2);
    }
    for (const [id, [min, max]] of Object.entries(pc.expect)) {
      const n = stage.fxPlayer.counts.get(id) ?? 0;
      if (n < min || n > max) pairFailures.push(`${pc.name}: ${id} played ${n}x (want ${min}..${max})`);
    }
    checkVisible(pc.name, v);
  }
  return count;
}

function runSwapFinale(stage: StageLike, advance: (ms: number) => void, cast: CastEdit): { live: string[]; expected: string[] } {
  cast.removed = new Set<string>();
  cast.added.length = 0;
  stage.syncRoom(furnaceView(cast));
  stage.handleEvent({ type: 'ENEMY_KILLED', entityId: 'boss-1', model: 'boss.forkbomb', how: 'SIGKILL' });
  stage.handleEvent({ type: 'VIBECODER_ACTION', action: 'collect', command: 'cat ssd', targetEntityId: 'ssd-1' });
  stage.handleEvent({ type: 'PICKUP_COLLECTED', entityId: 'ssd-1', item: 'ssd', amount: 256, label: '+256GB' });
  stage.handleEvent({ type: 'ENTITY_SPAWNED', entityId: 'zombie-3', model: 'malware.zombie', reason: 'boss_fork' });
  stage.handleEvent({ type: 'ROOM_TRANSITION', fromDir: 1, toDir: 3, toPath: '/selfcheck/other', upwardPanelsSmashed: 0, viaSymlinkLoop: false });
  advance(60);
  const final = demoRoom('/selfcheck/other');
  final.kind = 'catwalk';
  final.actors = final.actors.filter((a) => ['vibecoder', 'worm-1', 'energy-1', 'door-usb'].includes(a.id ?? a.key));
  stage.syncRoom(final);
  advance(3000);
  stage.render();
  const state = stage.debugState();
  const live = state.actors.filter((a) => !a.exiting).map((a) => a.id).sort();
  const expected = final.actors.map((a) => a.id ?? a.key).sort();
  return { live, expected };
}

/**
 * Feeds the stage every event variant twice, garbage, ids that already left, a room change in the
 * middle of effects, then steps frames and checks: no errors caught anywhere, all 23 presets played,
 * and the cast matches the last view. Run in the browser: `__stage.selfCheck()`.
 */
export function runStageSelfCheck(stage: StageLike, restore?: RoomView | null): StageSelfCheckReport {
  const errorsBefore = stage.errors.length;
  const stormWas = stage.devNoStorm ?? false;
  stage.devNoStorm = true;
  const hiddenListed: string[] = [];
  const pairFailures: string[] = [];
  const checkVisible = (label: string, v: RoomView) => {
    const st = stage.debugState();
    for (const ra of v.actors) {
      if (ra.hidden || ra.state === 'death') continue;
      const a = st.actors.find((x) => x.id === (ra.id ?? ra.key));
      if (!a || !a.visible || a.dead || a.exiting) hiddenListed.push(`${label}:${ra.id ?? ra.key}${a ? `(${a.visible ? '' : 'invisible '}${a.dead ? 'dead ' : ''}${a.exiting ? 'exiting' : ''})` : '(missing)'}`);
    }
  };
  const played0 = new Set(stage.fxPlayer.played);
  stage.fxPlayer.played.clear();
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 16) stage.step(0.016);
  };
  const cast: CastEdit = { removed: new Set<string>(), added: [] };
  stage.syncRoom(furnaceView(cast));
  advance(200);
  const count = runEventRounds(stage, allEvents(), advance, cast, checkVisible)
    + runPairPass(stage, advance, cast, checkVisible, pairFailures);
  const { live, expected } = runSwapFinale(stage, advance, cast);
  // A storm of commentary: never more than one cameo on the page, and the queue drains.
  for (let i = 0; i < 8; i++) {
    stage.handleEvent({ type: 'AGENT_TAUNT', agent: (['clod', 'gork', 'codec', 'antigravy'] as const)[i % 4]!, model: '', text: `taunt number ${i}`, mood: i % 2 ? 'laugh' : 'order' });
  }
  advance(4 * 4200);
  const cam = stage.debugState().cameos;
  const cameoFailures: string[] = [];
  if (cam) {
    if (cam.maxConcurrent > 1) cameoFailures.push(`cameos overlapped (${cam.maxConcurrent} at once)`);
    if (cam.shown < 5) cameoFailures.push(`only ${cam.shown} cameos shown`);
    if (cam.pending > 0 || cam.visible > 0) cameoFailures.push(`cameo queue did not drain (${cam.pending} pending, ${cam.visible} visible)`);
  }
  pairFailures.push(...cameoFailures);
  // The DOM overlay must not leak: transient lettering, balloons and cards drain back to zero, and
  // there is at most one badge holder per live actor.
  const ov = stage.debugState().overlay;
  if (ov) {
    if (ov.transient !== 0) pairFailures.push(`overlay leaked ${ov.transient} transient nodes`);
    if (ov.cards !== 0) pairFailures.push(`overlay leaked ${ov.cards} card nodes`);
    const liveActors = stage.debugState().actors.length;
    if (ov.badges > liveActors) pairFailures.push(`overlay has ${ov.badges} badge holders for ${liveActors} actors`);
  }
  const errors = stage.errors.slice(errorsBefore);
  const missingFx = FX_IDS.filter((id) => !stage.fxPlayer.played.has(id));
  const playedFx = stage.fxPlayer.played.size;
  for (const id of played0) stage.fxPlayer.played.add(id);
  stage.devNoStorm = stormWas;
  if (restore) {
    stage.syncRoom(restore);
    advance(50);
  }
  return {
    ok: errors.length === 0 && missingFx.length === 0 && pairFailures.length === 0 && hiddenListed.length === 0 && JSON.stringify(live) === JSON.stringify(expected),
    errors,
    pairFailures,
    hiddenListed,
    missingFx,
    playedFx,
    events: count,
    finalActors: live,
    expectedActors: expected,
  };
}

export interface StageDevHook {
  stage: StageLike;
  handleEvent(ev: KernelEvent): void;
  syncRoom(view: RoomView): void;
  /** Step the stage `ms` deterministically and draw one frame. */
  advance(ms: number): void;
  state(): ReturnType<StageLike['debugState']>;
  demoRoom: typeof demoRoom;
  allEvents: typeof allEvents;
  selfCheck(): StageSelfCheckReport;
  /** Show `view` and ignore the game's own syncs until `pin(null)`. */
  pin(view: RoomView | null): void;
  /** Stop (true) or restart the rAF clock. */
  freeze(on: boolean): void;
}

/** `window.__stage`: drive the stage directly from the console or a headless harness. */
export function installStageDevHook(stage: StageLike & { currentView?: () => RoomView | null; devPin?: RoomView | null; devFrozen?: boolean }): void {
  if (typeof window === 'undefined') return;
  const hook: StageDevHook = {
    stage,
    handleEvent: (ev) => stage.handleEvent(ev),
    syncRoom: (view) => stage.syncRoom(view),
    advance: (ms) => {
      for (let t = 0; t < ms; t += 16) stage.step(0.016);
      stage.render();
    },
    state: () => stage.debugState(),
    demoRoom,
    allEvents,
    selfCheck: () => {
      const pinned = stage.devPin ?? null;
      stage.devPin = null;
      const report = runStageSelfCheck(stage, pinned ?? stage.currentView?.() ?? null);
      stage.devPin = pinned;
      return report;
    },
    pin: (view) => {
      stage.devPin = view;
      if (view) stage.syncRoom(view);
    },
    freeze: (on) => {
      stage.devFrozen = on;
    },
  };
  (window as unknown as { __stage?: StageDevHook }).__stage = hook;
}
