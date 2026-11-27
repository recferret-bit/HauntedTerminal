import type { BubbleStyle, KernelEvent } from '../contracts/events.js';
import { BESTIARY, maxHpFor } from './bestiary.js';
import { dialogueEvent } from './dialogue.js';
import { F3_WING_ENERGY, F3_WING_PICKUP, FLOOR_TITLES } from './floors.js';
import { KIRO_CORE_ORDER, type KiroScanInput } from './kiro.js';
import { runKiroCommand, stepKiroCrackOnRoot } from './kiro-commands.js';
import { useKiroSkill } from './kiro-skills.js';
import { labRiddleRead, labRiddleWrite } from './lab-riddle.js';
import type { EntityView, ProcRow } from './entities.js';
import { empty, out, type Play } from './play.js';
import {
  anchorFree, backups, boss, bump, cut, denied, ensure, find, gargoyleNeutral, gateOpen, maxHp, phase1, plankBridged, portal, push,
} from './runtime.js';
import type { Step } from './shell.js';
import { absPath, hasExec, makeNode, type VNode } from './tree.js';
import type { HintGoals, HintTask } from './types.js';

export function readSocket(g: Play, node: VNode): Step {
  const labStep = labRiddleRead(g.lab, node);
  if (labStep) {
    bump(g, 'read');
    return labStep;
  }
  const spec = socketSpec(node.name);
  const ev = dialogueEvent({ obstacleId: node.name, speaker: spec.speaker, style: spec.style, mood: 'cryptic', text: spec.body, tokens: spec.tokens, anchor: node.id });
  bump(g, 'read');
  return out(`${ev.payload.ansiTerminalBanner}${spec.body}\n`, [ev]);
}

export function writeSocket(g: Play, node: VNode, data: string): Step {
  const body = data.trim();
  g.run.socketInputs.set(node.name, body);
  const labStep = labRiddleWrite(g.lab, g.run.lab, g.run.root, g.run.world, node, data);
  if (labStep) return labStep;
  const events: KernelEvent[] = [];
  if (node.name === 'archivist_gate.sock') {
    if (Number(body) === 6) {
      g.run.archivistSolved = true;
      const gate = find(g, '/var/dungeon/entrance/iron_gate');
      if (gate && !hasExec(gate)) {
        const old = gate.mode;
        gate.mode = 0o755;
        push(g, events, { type: 'INODE_MODE_CHANGED', inodeId: gate.id, oldMode: old, newMode: gate.mode });
      }
      cut(g, 'floor2-socket');
      push(g, events, { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: node.id, unlockedInodeId: gate?.id ?? node.id, solvedViaInput: body });
      return { stdout: 'The count is exact. The gate unlocks.\n', stderr: '', code: 0, events };
    }
  } else if (node.name === 'pressure_plate.sock') {
    const pedestal = find(g, '/usr/local/labyrinth/pedestal');
    const mimic = pedestal?.children.get('.mimic');
    const runes = pedestal ? [...pedestal.children.values()].filter((child) => child.name.endsWith('.rune')).length : 0;
    if (body === 'align' && pedestal && !mimic && runes === 3) {
      const fresh = !find(g, '/usr/local/labyrinth/hidden_wing/boiler_shaft');
      const shaft = ensure(g, '/usr/local/labyrinth/hidden_wing/boiler_shaft');
      if (fresh && shaft.parent) {
        const cell = makeNode(shaft.parent, 'energy.cell', 'file', 0o644);
        cell.content = F3_WING_ENERGY;
        const pickup = g.run.world.addPickup(F3_WING_PICKUP);
        if (pickup) push(g, events, { type: 'ENTITY_SPAWNED', entityId: pickup.id, model: pickup.model, reason: 'script' });
      }
      push(g, events, { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: node.id, unlockedInodeId: shaft.id, solvedViaInput: body });
      return { stdout: 'The altar opens a hidden wing. Somewhere in it, a shaft. (find can find it.)\n', stderr: '', code: 0, events };
    }
  } else if (node.name === 'valve_lock.sock') {
    if (body === 'FURNACE_2409') {
      const hall = ensure(g, '/proc_mansion/boiler_room/furnace_hall');
      if (!hasExec(hall)) {
        const old = hall.mode;
        hall.mode = 0o755;
        push(g, events, { type: 'INODE_MODE_CHANGED', inodeId: hall.id, oldMode: old, newMode: hall.mode });
      }
      const catwalk = find(g, '/proc_mansion/boiler_room/catwalk');
      if (catwalk && !catwalk.children.has('furnace_hall')) {
        const door = makeNode(catwalk, 'furnace_hall', 'symlink', 0o777);
        door.link = '../furnace_hall';
      }
      push(g, events, { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: node.id, unlockedInodeId: hall.id, solvedViaInput: body });
      return { stdout: 'The valve spins. The furnace hall opens.\n', stderr: '', code: 0, events };
    }
  } else if (node.name === 'wakeup.sock') {
    if (body.includes('LIGHTNING_777')) {
      g.run.tokenOk = true;
      push(g, events, { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: node.id, unlockedInodeId: node.id, solvedViaInput: body });
      return { stdout: 'The token lands. The overlord flinches. Now rewrite the anchor.\n', stderr: '', code: 0, events };
    }
  } else if (node.name === 'intercom.sock') {
    return { stdout: '', stderr: 'The intercom only speaks. It does not listen. (Typical management.)\n', code: 1, events };
  }
  g.run.attempts[node.name] = (g.run.attempts[node.name] ?? 0) + 1;
  const spec = socketSpec(node.name);
  const hint = socketHint(g, node.name);
  const ev = dialogueEvent({ obstacleId: node.name, speaker: spec.speaker, style: 'JAGGED_SCREAM', mood: 'mocking', text: hint, tokens: [], anchor: node.id });
  events.push(ev);
  return { stdout: '', stderr: `${ev.payload.ansiTerminalBanner}${hint}\n`, code: 1, events };
}

interface SocketMeta {
  speaker: string;
  style: BubbleStyle;
  body: string;
  tokens: string[];
  hints: readonly string[];
}

const DEFAULT_SOCKET_META: SocketMeta = {
  speaker: 'Wakeup Socket',
  style: 'KERNEL_GLITCH',
  body: 'You are their last worker, and KERNEL_OVERLORD is their core. Feed me the WAKEUP_TOKEN from the core dump, then patch player_trapped to false. Then: exit.',
  tokens: ['grep', 'sed', 'exit'],
  hints: [
    'core_dump.log hides WAKEUP_TOKEN.',
    'grep the token into this socket.',
    'Then sed the reality anchor.',
  ],
};

const SOCKET_META: Readonly<Record<string, SocketMeta>> = {
  'intercom.sock': {
    speaker: 'Agent Intercom',
    style: 'COMIX_CLASSIC',
    body: 'AGENTS HERE. We pulled you in because we need hands. First job: a spirit holds the hatch and the relay is dead. Light the room (ls -la), remove .poltergeist.lock and touch cellar_hatch/.power_on. Chop chop, worker.',
    tokens: ['ls -la', 'rm', 'touch'],
    hints: [],
  },
  'archivist_gate.sock': {
    speaker: 'Archivist Gate',
    style: 'COMIX_CLASSIC',
    body: "I keep the agents' firewall. Count every FATAL line in the chronicles and write that integer here. Or pick the lock like a vandal.",
    tokens: ['grep', 'wc -l', 'chmod'],
    hints: [
      'Wrong. The chronicles directory holds the logs.',
      'grep -h "FATAL" chronicles/*.log',
      'Pipe that into wc -l and redirect it here. One integer.',
    ],
  },
  'pressure_plate.sock': {
    speaker: 'Altar of Balance',
    style: 'GHOST_WHISPER',
    body: 'Remove the mimic, place exactly three .rune files on the pedestal, and whisper align.',
    tokens: ['rm', 'touch', 'echo'],
    hints: [
      'Something on the pedestal is not a rune.',
      'ls -la pedestal',
      'rm the mimic, touch three .rune files, echo align.',
    ],
  },
  'valve_lock.sock': {
    speaker: 'Valve Lock',
    style: 'KERNEL_GLITCH',
    body: 'The agents sealed the furnace. boiler.dump hides PASS=. Cut the value out and reverse it.',
    tokens: ['grep', 'cut', 'rev'],
    hints: [
      'boiler.dump contains PASS=.',
      'cut -d= -f2',
      'rev that value into this socket.',
    ],
  },
  'wakeup.sock': DEFAULT_SOCKET_META,
};

function socketSpec(name: string): SocketMeta {
  return SOCKET_META[name] ?? DEFAULT_SOCKET_META;
}

function socketHint(g: Play, name: string): string {
  const n = Math.min(3, g.run.attempts[name] ?? 1);
  return socketSpec(name).hints[n - 1] ?? 'That is not the phrase.';
}


export function puzzleHint(g: Play): string {
  const path = absPath(g.run.cwd);
  const f = g.run.floor;
  if (f === 1 && path.endsWith('/desk')) return 'Read todo.note, then cd .. and talk to the intercom.';
  if (f === 1) {
    return find(g, '/home/dev/nightmare_workspace/.poltergeist.lock')
      ? 'ls -la, rm .poltergeist.lock, then touch cellar_hatch/.power_on and cd cellar_hatch.'
      : 'touch cellar_hatch/.power_on and cd cellar_hatch.';
  }
  if (f === 2 && !path.includes('/iron_gate')) {
    return gateOpen(g)
      ? 'cd iron_gate. Move the plank onto the chasm and silence the gargoyle.'
      : 'The gate is mode 000. chmod +rx iron_gate, or send the FATAL count to archivist_gate.sock.';
  }
  if (f === 2 && !path.includes('/chasm')) {
    if (!plankBridged(g)) return 'mv heavy_plank.tar chasm/';
    if (!gargoyleNeutral(g)) return 'chmod -x stone_gargoyle.bin, or chmod +w it and rm it.';
    return 'cd chasm/crypt_stairs';
  }
  if (f === 2) return gargoyleNeutral(g) && plankBridged(g) ? 'cd crypt_stairs' : 'The stair is not safe yet.';
  if (f === 3 && path.startsWith('/usr/local/labyrinth/wing_a')) {
    return 'The mirror doors loop (readlink shows it). Smash upward with cd ../../../';
  }
  if (f === 3) {
    return find(g, '/usr/local/labyrinth/hidden_wing/boiler_shaft')
      ? 'find . -name "boiler_shaft" and cd hidden_wing/boiler_shaft.'
      : 'ls -la pedestal, rm the mimic, touch pedestal/{a,b,c}.rune, echo align > pressure_plate.sock.';
  }
  if (f === 4 && !path.includes('/furnace_hall')) {
    return 'grep the PASS= line, cut the value, rev it into valve_lock.sock.';
  }
  if (f === 4) {
    const necromancer = boss(g);
    return necromancer.dead || necromancer.frozen
      ? 'cd core_elevator'
      : 'ps shows pid 666. kill -9 666. A plain kill is ignored.';
  }
  if (portal(g)) return 'Type exit.';
  if (!phase1(g)) return 'Send chaos.stream into /dev/null.';
  if (!g.run.tokenOk) return 'grep WAKEUP_TOKEN from core_dump.log into wakeup.sock.';
  return "sed -i 's/player_trapped=true/player_trapped=false/' reality_anchor.conf";
}

/** The most urgent enemy in this room, and how to beat it. */
export function threatHint(g: Play): string {
  const here = absPath(g.run.cwd);
  const world = g.run.world;
  const near = world.enemies.find((e) => !e.dead && !e.minion && !world.petrified(e) && e.type !== 'kernel' && e.type !== 'forkbomb'
    && world.zone(e).includes(here) && (e.revealed || e.type === 'spyware'));
  if (!near) return '';
  const who = near.revealed ? `${near.name}${near.pid !== null ? ` (PID ${near.pid})` : ''}` : 'something unseen (try ls -a or ps)';
  return `Threat: ${who}. ${BESTIARY[near.type].weakness}.`;
}

const CMD_WORD = '(?:ls|cd|pwd|cat|mv|cp|rm|mkdir|touch|chmod|chown|grep|find|sed|awk|cut|rev|echo|ps|kill|pkill|edit|docker|kiro|hank|dad|man|manual|help|exit|source|readlink|ln|head|tail|wc|sort|uniq)';
const BACKTICK_CMD = new RegExp(`^(?:${CMD_WORD})(?=$|\\s)|[|>&]|\\s-[a-z0-9]+\\b`, 'i');
const PAREN_CMD = new RegExp(`(?:^|[^\\w./-])(?:${CMD_WORD})(?=$|\\s)`, 'i');
const PLAIN_CMD_PHRASE = new RegExp(
  `\\b(?:(?:run|type|use|try)\\s+)?(?:${CMD_WORD})\\s+(?:-[a-z0-9+-]+(?:\\s+[^,.;:!?()]+)?|compose\\s+[^,.;:!?()]+|(?:build|run|up|load|crack|scan)\\s+[^,.;:!?()]+|[\\w./~'"-]+\\s+(?:~|[>]|[/]\\S+)|(?:~|/)[\\w./-]+|\\d{2,})`,
  'gi',
);
const REDIRECT_PHRASE = /\s*>\s*\/dev\/null\b/gi;

function isCommandSnippet(code: string): boolean {
  const s = code.trim();
  if (!s) return false;
  // Filenames like `cat.log`, `edit-config.json`, `docker-compose.yml` are targets, not commands.
  if (/^[\w./-]+\.[a-z0-9]+$/i.test(s) && !/\s/.test(s)) return false;
  return BACKTICK_CMD.test(s);
}

/** Removes exact shell commands from free-form text while preserving filenames and minimal goal prose. */
export function stripCommandsFromText(raw: string): string {
  const trimmed = raw.replace(/^\s*\[[ xX]\]\s*/, '').trim();
  if (!trimmed) return '';
  const cleaned = trimmed
    .replace(/\(([^()]*`[^()`]+`[^()]*)\)/g, (_, inner: string) => {
      const hasCmd = [...inner.matchAll(/`([^`]+)`/g)].some((m) => isCommandSnippet(m[1] ?? ''));
      return hasCmd ? '' : `(${inner.replace(/`/g, '')})`;
    })
    .replace(/\(([^()]*)\)/g, (m, inner: string) => (PAREN_CMD.test(inner) && /[~/\-|>]|\s/.test(inner) ? '' : m))
    .replace(/\bpractice\s+`([^`]+)`\s+by\s+/gi, (_, code: string) => (isCommandSnippet(code) ? 'Practice ' : `Practice ${code} by `))
    .replace(/\b(?:run|type|use|try)\s+`([^`]+)`(?:\s+to\s+)?/gi, (m, code: string) => {
      if (!isCommandSnippet(code)) return m.replace(/`/g, '');
      return /\bto\s+$/i.test(m) ? '' : ' ';
    })
    .replace(/`([^`]+)`/g, (_, code: string) => (isCommandSnippet(code) ? '' : code))
    .replace(PLAIN_CMD_PHRASE, '')
    .replace(REDIRECT_PHRASE, '')
    .replace(/\band\s+(?:run|type|use)\s*$/i, '')
    .replace(/^\s*(?:run|type|use|try)\s+to\s+/i, '')
    .replace(/^\s*to\s+/i, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.;:\s-]+|[:;,\s]+$/g, '')
    .trim();
  if (!cleaned) return 'Complete the objective';
  return cleaned[0]!.toUpperCase() + cleaned.slice(1);
}

function classicFloorTasks(g: Play): { tasks: HintTask[]; exitLabel: string; exitReady: boolean } {
  const path = absPath(g.run.cwd);
  const f = g.run.floor;
  if (f === 1 && path.endsWith('/desk')) {
    const readNote = g.run.filesRead.has('/home/dev/nightmare_workspace/desk/todo.note');
    return {
      tasks: [{ label: 'Inspect todo.note on the desk', done: readNote }],
      exitLabel: 'Return to the workspace',
      exitReady: readNote,
    };
  }
  if (f === 1) {
    const lockGone = !find(g, '/home/dev/nightmare_workspace/.poltergeist.lock');
    const powered = Boolean(find(g, '/home/dev/nightmare_workspace/cellar_hatch/.power_on'));
    return {
      tasks: [
        { label: 'Find and remove the hidden lock (.poltergeist.lock)', done: lockGone },
        { label: 'Power up cellar_hatch (.power_on)', done: powered },
      ],
      exitLabel: 'Enter cellar_hatch',
      exitReady: lockGone && powered,
    };
  }
  if (f === 2 && !path.includes('/iron_gate')) {
    const open = gateOpen(g);
    return {
      tasks: [{ label: 'Unlock iron_gate or solve archivist_gate.sock', done: open }],
      exitLabel: 'Enter iron_gate',
      exitReady: open,
    };
  }
  if (f === 2) {
    const bridged = plankBridged(g);
    const safe = gargoyleNeutral(g);
    return {
      tasks: [
        { label: 'Bridge chasm with heavy_plank.tar', done: bridged },
        { label: 'Silence stone_gargoyle.bin', done: safe },
      ],
      exitLabel: 'Descend into crypt_stairs',
      exitReady: bridged && safe,
    };
  }
  if (f === 3 && path.startsWith('/usr/local/labyrinth/wing_a')) {
    return {
      tasks: [{ label: 'Break upward out of the looping mirror wing', done: false }],
      exitLabel: 'Return to the labyrinth hub',
      exitReady: false,
    };
  }
  if (f === 3) {
    const shaftOpen = Boolean(find(g, '/usr/local/labyrinth/hidden_wing/boiler_shaft'));
    const pedestal = find(g, '/usr/local/labyrinth/pedestal');
    const noMimic = !pedestal?.children.get('.mimic');
    const runes = pedestal ? [...pedestal.children.values()].filter((c) => c.name.endsWith('.rune')).length : 0;
    const pedestalReady = shaftOpen || (Boolean(pedestal) && noMimic && runes === 3);
    return {
      tasks: [
        { label: 'Clear the hidden mimic on pedestal and place three runes', done: pedestalReady },
        { label: 'Align pressure_plate.sock to reveal the hidden wing', done: shaftOpen },
      ],
      exitLabel: 'Find and enter boiler_shaft',
      exitReady: shaftOpen,
    };
  }
  if (f === 4 && !path.includes('/furnace_hall')) {
    const open = Boolean(find(g, '/proc_mansion/boiler_room/furnace_hall') && hasExec(find(g, '/proc_mansion/boiler_room/furnace_hall')!));
    return {
      tasks: [{ label: 'Recover the reversed password for valve_lock.sock', done: open }],
      exitLabel: 'Enter furnace_hall',
      exitReady: open,
    };
  }
  if (f === 4) {
    const necromancer = boss(g);
    const down = necromancer.dead || necromancer.frozen;
    return {
      tasks: [{ label: 'Stop the furnace boss process', done: down }],
      exitLabel: 'Enter core_elevator',
      exitReady: down,
    };
  }
  const p1 = phase1(g);
  const p2 = g.run.tokenOk;
  const p3 = anchorFree(g);
  return {
    tasks: [
      { label: 'Drain chaos.stream into the void', done: p1 },
      { label: 'Send the wakeup token to wakeup.sock', done: p2 },
      { label: 'Release the anchor lock in reality_anchor.conf', done: p3 },
    ],
    exitLabel: 'Escape the system',
    exitReady: portal(g),
  };
}

/** Command-free minimal tasks and goals for classic floors (used by the centered `? Hint` dialog). */
export function classicHintGoals(g: Play): HintGoals {
  const title = FLOOR_TITLES[g.run.floor] ?? `Floor ${g.run.floor}`;
  const here = absPath(g.run.cwd);
  const { tasks, exitLabel, exitReady } = classicFloorTasks(g);
  const near = g.run.world.enemies.find((e) => !e.dead && !e.minion && !g.run.world.petrified(e) && e.type !== 'kernel' && e.type !== 'forkbomb'
    && g.run.world.zone(e).includes(here) && (e.revealed || e.type === 'spyware'));
  const allTasks: HintTask[] = [...tasks];
  if (near) allTasks.push({ label: near.revealed ? `Neutralize active threat: ${near.name}` : 'Watch for an unseen threat in this room', done: false });
  allTasks.push({ label: exitLabel, done: false, kind: 'exit' });
  const goal = exitReady ? `Path clear — ${exitLabel.toLowerCase()}.` : `Complete the tasks below to ${exitLabel.toLowerCase()}.`;
  return { title, goal, tasks: allTasks, exitReady };
}

export function statusText(g: Play): string {
  const counts = g.run.world.counts();
  const loot = g.run.world.pickupCounts();
  return [
    `HP ${g.run.hp}/${maxHp(g)}   RAM ${g.run.ram} GB   SSD ${g.run.ssd} GB (${backups(g)} backup${backups(g) === 1 ? '' : 's'})`,
    `floor ${g.run.floor} ${FLOOR_TITLES[g.run.floor] ?? ''}   malware left ${counts.left}/${counts.total}   pickups ${loot.got}/${loot.total}`,
    `cwd ${absPath(g.run.cwd)}   commands ${g.run.commands}${g.run.floor === 3 ? `   flood ${g.run.flood}%` : ''}`,
    '',
  ].join('\n');
}

export function stepKiroCrack(g: Play, events: KernelEvent[]): string {
  return stepKiroCrackOnRoot(g.kiro, g.run.root, absPath(g.run.cwd), 0o444, (ev) => push(g, events, ev)).note;
}

export function kiroFileRow(child: VNode, locked: boolean, readable: boolean): KiroScanInput['files'][number] {
  return {
    name: child.name,
    kind: child.kind,
    hidden: child.name.startsWith('.'),
    mode: child.mode,
    locked,
    content: readable ? child.content : undefined,
  };
}

export function kiroEnemyRow(v: EntityView): KiroScanInput['enemies'][number] {
  return {
    label: v.label,
    target: v.target,
    pid: v.pid,
    hp: v.hp ?? 1,
    maxHp: v.maxHp ?? 1,
    state: v.state,
    unseen: v.unseen,
  };
}

export function psXrayToggle(rows: ProcRow[], active = rows.length > 0): KernelEvent {
  return {
    type: 'HUD_OVERLAY_TOGGLED',
    mode: 'PS_XRAY',
    processes: rows.map((r) => ({ pid: r.pid, ppid: r.ppid, name: r.name, cpu: r.cpu, state: r.state })),
    active,
  };
}

export function cmdKiro(g: Play, args: string[], stdin: string): Step {
  return runKiroCommand(
    {
      cwd: g.run.cwd,
      readMask: 0o444,
      ramGb: g.run.ram,
      noFileMessage: 'No such file or directory',
      onAction(action, _command, events) {
        bump(g, action);
        void events;
      },
      onDenied(node, command, msg) {
        return denied(g, node, msg, command);
      },
      loadCore(loadArgs) {
        if (!loadArgs[1]) return empty(1, `kiro load: specify a local .gguf core (${KIRO_CORE_ORDER.join(', ')})\n`);
        bump(g, 'cast');
        const res = g.kiro.loadCore(loadArgs[1]);
        const events: KernelEvent[] = [];
        for (const ev of res.events) push(g, events, ev);
        return res.ok ? out(res.stdout, events) : empty(1, res.stderr ?? res.stdout);
      },
      useSkill(skill) {
        const used = (g.skillsUsed[g.run.floor] ??= new Set<string>());
        const res = useKiroSkill(skill, { core: g.kiro.activeCore, used, inv: g.run.inventory, hp: g.run.hp, maxHp: maxHpFor(g.run.ram), inBattle: false, riddleHint: () => null });
        g.run.inventory = res.inv;
        g.run.hp += res.healBy;
        g.freeAction = res.free;
        if (res.spent) bump(g, 'cast');
        return out(res.stdout, [], res.code, res.stderr);
      },
      scanRoom() {
        bump(g, 'lantern');
        const cwd = absPath(g.run.cwd);
        const files = [...g.run.cwd.children.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((child) => kiroFileRow(
            child,
            (child.kind === 'dir' && !hasExec(child)) || (child.kind === 'file' && (child.mode & 0o444) === 0),
            (child.mode & 0o444) !== 0 && child.kind === 'file',
          ));
        const enemies = g.run.world.views(cwd).filter((v) => v.kind !== 'pickup').map(kiroEnemyRow);
        const res = g.kiro.scanRoom({ cwd, ramGb: g.run.ram, files, enemies });
        const events: KernelEvent[] = [];
        if (res.enableXray) {
          g.run.xray = true;
          g.run.world.revealProcesses(events);
          push(g, events, psXrayToggle(g.run.world.procs(), true));
        }
        if (res.healAmount > 0 && g.run.hp < maxHp(g)) {
          g.run.hp = Math.min(maxHp(g), g.run.hp + res.healAmount);
        }
        if (res.revealHidden) {
          const revealed = g.run.world.reveal(g.run.cwd, events);
          for (const child of g.run.cwd.children.values()) {
            if (child.name.startsWith('.') && !revealed.includes(child.id)) revealed.push(child.id);
          }
          if (!g.run.lantern) g.run.lantern = true;
          push(g, events, { type: 'LANTERN_REVEAL', dirId: g.run.cwd.id, revealedInodes: revealed });
        }
        for (const ev of res.events) push(g, events, ev);
        return out(res.stdout, events);
      },
    },
    g.kiro,
    args,
    stdin,
  );
}
