import type { BubbleStyle, KernelEvent } from '../contracts/events.js';

const BUBBLE_STYLES: BubbleStyle[] = [
  'COMIX_CLASSIC',
  'JAGGED_SCREAM',
  'GHOST_WHISPER',
  'KERNEL_GLITCH',
];

type CmdHit = { output: string; events: KernelEvent[] };

function hit(output: string, events: KernelEvent[] = []): CmdHit {
  return { output, events };
}

function matchHelp(cmd: string): CmdHit | null {
  if (cmd !== 'help') return null;
  return hit([
    'Sandbox Mock Commands:',
    '  ls -la                 -> Ignite lantern & reveal .poltergeist.lock',
    '  cd door | cd ..        -> Hop between comic panels',
    '  cd ../../../           -> Smash 3 comic panels upward!',
    '  cd mirror              -> Trigger ELOOP symlink mirror flood',
    '  cd locked              -> Rattle locked 000 iron gate',
    '  chmod +rx gate         -> Open iron gate',
    '  chmod -x gargoyle      -> Petrify stone gargoyle',
    '  mv plank chasm         -> Slide crate bridge across pit',
    '  mv chaos /dev/null     -> Open /dev/null black hole vortex',
    '  cat gate.sock          -> Render comic dialogue bubble (cycles 4 styles)',
    '  echo 42 > gate.sock    -> Solve sentient socket door',
    '  ps | top               -> Toggle PS_XRAY PID/PPID HUD overlay',
    '  kill -STOP 666         -> Freeze boss daemon in blue ice',
    '  kill -15 666           -> Trigger SIGTERM boss enrage',
    '  kill -9 666            -> Reap boss & zombie minions',
  ].join('\r\n'));
}

function matchLs(cmd: string): CmdHit | null {
  if (!(cmd.startsWith('ls') && cmd.includes('a'))) return null;
  return hit('.  ..  .poltergeist.lock  heavy_plank.tar  gate.sock  iron_gate', [
    { type: 'LANTERN_REVEAL', dirId: 4, revealedInodes: [7] },
  ]);
}

function matchCd(cmd: string): CmdHit | null {
  if (cmd === 'cd ../../../') {
    return hit('Smashed 3 parent directories upward!', [
      {
        type: 'ROOM_TRANSITION',
        fromDir: 9,
        toDir: 1,
        toPath: '/usr/local/labyrinth',
        upwardPanelsSmashed: 3,
        viaSymlinkLoop: false,
      },
    ]);
  }
  if (cmd === 'cd mirror') {
    return hit('ELOOP: Too many levels of symbolic links!', [
      {
        type: 'ROOM_TRANSITION',
        fromDir: 9,
        toDir: 9,
        toPath: '/usr/local/labyrinth/cell_9',
        upwardPanelsSmashed: 0,
        viaSymlinkLoop: true,
      },
    ]);
  }
  if (cmd === 'cd locked') {
    return hit('cd: Permission denied: locked (000)', [
      { type: 'PERMISSION_DENIED_RATTLE', targetId: 6, command: cmd },
    ]);
  }
  if (cmd.startsWith('cd')) {
    return hit('', [
      {
        type: 'ROOM_TRANSITION',
        fromDir: 4,
        toDir: 5,
        toPath: '/var/dungeon/next_panel',
        upwardPanelsSmashed: 0,
        viaSymlinkLoop: false,
      },
    ]);
  }
  return null;
}

function matchChmod(cmd: string): CmdHit | null {
  if (cmd === 'chmod +rx gate' || cmd === 'chmod 755 gate') {
    return hit('mode of gate changed to 0755 (rwxr-xr-x)', [
      { type: 'INODE_MODE_CHANGED', inodeId: 6, oldMode: 0, newMode: 0o755 },
    ]);
  }
  if (cmd === 'chmod -x gargoyle') {
    return hit('stone_gargoyle.bin stripped of execute bit (petrified)', [
      { type: 'INODE_MODE_CHANGED', inodeId: 11, oldMode: 0o555, newMode: 0o444 },
    ]);
  }
  return null;
}

function matchMove(cmd: string): CmdHit | null {
  if (cmd.startsWith('mv') && cmd.includes('chasm')) {
    return hit('heavy_plank.tar bridged the chasm!', [
      { type: 'OBJECT_MOVED', inodeId: 12, fromDir: 4, toDir: 15, formedBridge: true, suckedIntoNull: false },
    ]);
  }
  if (cmd.includes('/dev/null')) {
    return hit('chaos.stream redirected into /dev/null sink!', [
      { type: 'OBJECT_MOVED', inodeId: 19, fromDir: 4, toDir: 0, formedBridge: false, suckedIntoNull: true },
    ]);
  }
  return null;
}

function matchSocket(cmd: string, director: MockDirector): CmdHit | null {
  if (cmd === 'cat gate.sock') {
    const ev = director.nextDialogueEvent();
    const banner = ev.type === 'OBSTACLE_DIALOGUE_RENDERED' ? ev.payload.ansiTerminalBanner : '';
    return hit(banner, [ev]);
  }
  if (cmd.includes('> gate.sock')) {
    return hit('Archivist Gate unlocked!', [
      { type: 'PUZZLE_DOOR_RESOLVED', socketInodeId: 20, unlockedInodeId: 6, solvedViaInput: '42' },
    ]);
  }
  return null;
}

function matchProc(cmd: string): CmdHit | null {
  if (cmd !== 'ps' && cmd !== 'top') return null;
  return hit('PID 666 necromancer_forkd (98% CPU) | PID 667 zombie_worker', [
    {
      type: 'HUD_OVERLAY_TOGGLED',
      mode: 'PS_XRAY',
      processes: [
        { pid: 666, ppid: 1, name: 'necromancer_forkd', cpu: 98, state: 'RUNNING' },
        { pid: 667, ppid: 666, name: 'zombie_worker', cpu: 24, state: 'RUNNING' },
      ],
    },
  ]);
}

function matchKill(cmd: string): CmdHit | null {
  if (cmd === 'kill -STOP 666') {
    return hit('[666]+ Stopped   necromancer_forkd', [
      { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGSTOP', outcome: 'FROZEN' },
    ]);
  }
  if (cmd === 'kill -15 666') {
    return hit('necromancer_forkd trapped SIGTERM and entered ENRAGED mode!', [
      { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGTERM', outcome: 'TRAPPED_ENRAGED' },
    ]);
  }
  if (cmd === 'kill -9 666') {
    return hit('[666]+ Killed    necromancer_forkd', [
      { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGKILL', outcome: 'KILLED' },
    ]);
  }
  return null;
}

function matchSandboxCommand(cmd: string, director: MockDirector): CmdHit | null {
  return matchHelp(cmd)
    ?? matchLs(cmd)
    ?? matchCd(cmd)
    ?? matchChmod(cmd)
    ?? matchMove(cmd)
    ?? matchSocket(cmd, director)
    ?? matchProc(cmd)
    ?? matchKill(cmd);
}

export class MockDirector {
  private bubbleIndex = 0;

  nextDialogueEvent(): KernelEvent {
    const style = BUBBLE_STYLES[this.bubbleIndex % BUBBLE_STYLES.length];
    this.bubbleIndex += 1;
    const banner = [
      '\x1b[35m╔══════════════════════════════════════════════════════╗\x1b[0m',
      `\x1b[35m║\x1b[1;36m [ARCHIVIST GATE // ${style}]\x1b[0m`,
      '\x1b[35m╚══════════════════════════════════════════════════════╝\x1b[0m',
      '  Pipe exact FATAL count: `grep -c FATAL *.log > gate.sock`',
    ].join('\r\n');

    return {
      type: 'OBSTACLE_DIALOGUE_RENDERED',
      payload: {
        obstacleId: 'archivist_gate',
        speakerName: 'Archivist Gate',
        portraitSprite: 'socket_guardian',
        mood: 'cryptic',
        bubbleStyle: style,
        anchorInodeId: 20,
        pages: [
          {
            text: 'Count the FATAL lines with `grep -c` and pipe `42 > gate.sock` to pass!',
            highlightedUnixTokens: ['grep -c', 'gate.sock'],
          },
        ],
        ansiTerminalBanner: banner,
      },
    };
  }

  runTerminalCommand(raw: string): CmdHit {
    const cmd = raw.trim();
    if (!cmd) return { output: '', events: [] };
    return matchSandboxCommand(cmd, this) ?? { output: `mock-sh: try 'help' (unknown demo command: ${cmd})`, events: [] };
  }
}
