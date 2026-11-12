export type InodeId = number;
export type PosixSignal = 'SIGTERM' | 'SIGKILL' | 'SIGSTOP' | 'SIGCONT';
export type ProcState = 'RUNNING' | 'STOPPED' | 'ZOMBIE' | 'DEAD';

export type SpriteArchetype =
  | 'room_panel'
  | 'locked_gate'
  | 'poltergeist'
  | 'gargoyle'
  | 'crate_bridge'
  | 'mirror_door'
  | 'black_hole'
  | 'socket_guardian'
  | 'item_scroll';

export type BubbleStyle =
  | 'COMIX_CLASSIC'
  | 'JAGGED_SCREAM'
  | 'GHOST_WHISPER'
  | 'KERNEL_GLITCH';

export type SpeakerMood = 'mocking' | 'cryptic' | 'enraged' | 'defeated' | 'hinting';

export interface ComicDialogueRenderPayload {
  obstacleId: string;
  speakerName: string;
  portraitSprite: string;
  mood: SpeakerMood;
  bubbleStyle: BubbleStyle;
  anchorInodeId: InodeId;
  pages: Array<{
    text: string;
    highlightedUnixTokens: string[];
  }>;
  ansiTerminalBanner: string;
  challengeHud?: {
    objectiveSummary: string;
    attemptsUsed: number;
    unlockedTargetDir?: string;
  };
}

export type KernelEvent =
  | {
      type: 'ROOM_TRANSITION';
      fromDir: InodeId;
      toDir: InodeId;
      toPath: string;
      upwardPanelsSmashed: number;
      viaSymlinkLoop: boolean;
    }
  | {
      type: 'LANTERN_REVEAL';
      dirId: InodeId;
      revealedInodes: InodeId[];
    }
  | {
      type: 'PERMISSION_DENIED_RATTLE';
      targetId: InodeId;
      command: string;
    }
  | {
      type: 'INODE_MODE_CHANGED';
      inodeId: InodeId;
      oldMode: number;
      newMode: number;
    }
  | {
      type: 'OBJECT_MOVED';
      inodeId: InodeId;
      fromDir: InodeId;
      toDir: InodeId;
      formedBridge: boolean;
      suckedIntoNull: boolean;
    }
  | {
      type: 'SYSTEM_HAND_SPAWN';
      entityKind: 'inode' | 'process';
      id: number;
      name: string;
      reason: 'boss_fork' | 'cron_restore';
    }
  | {
      type: 'PROC_SIGNALED';
      pid: number;
      signal: PosixSignal;
      outcome: 'FROZEN' | 'KILLED' | 'TRAPPED_ENRAGED';
    }
  | {
      type: 'HUD_OVERLAY_TOGGLED';
      mode: 'PS_XRAY';
      processes: Array<{ pid: number; ppid: number; name: string; cpu: number; state: ProcState }>;
    }
  | {
      type: 'OBSTACLE_DIALOGUE_RENDERED';
      payload: ComicDialogueRenderPayload;
    }
  | {
      type: 'PUZZLE_DOOR_RESOLVED';
      socketInodeId: InodeId;
      unlockedInodeId: InodeId;
      solvedViaInput: string;
    }
  | {
      type: 'PLAYER_DAMAGED';
      amount: number;
      hpRemaining: number;
      sourceName: string;
    }
  | {
      type: 'FLOOR_CLEARED';
      floorId: number;
      speedrunBonus: boolean;
      commandsCount: number;
     }
  // ---- Added for the full campaign (enemies, pickups, files, lifecycle). Entity ids match RoomActor.id.
  | {
      type: 'ENTITY_SPAWNED';
      entityId: string;
      /** procgen ModelCatalog id, e.g. `malware.worm`, `pickup.ram`. */
      model: string;
      reason: 'room_enter' | 'boss_fork' | 'cron_restore' | 'virus_split' | 'script';
    }
  | {
      /** An enemy starts an attack. Damage (if any) follows as PLAYER_DAMAGED in the same batch or the next tick. */
      type: 'ENEMY_ATTACK';
      entityId: string;
      model: string;
      damage: number;
      attack: string;
    }
  | {
      type: 'ENEMY_HIT';
      entityId: string;
      model: string;
      damage: number;
      hpRemaining: number;
      command: string;
    }
  | {
      type: 'ENEMY_KILLED';
      entityId: string;
      model: string;
      how: 'SIGKILL' | 'SIGTERM' | 'rm' | 'chmod' | 'devnull' | 'other';
    }
  | {
      type: 'ENEMY_STATE';
      entityId: string;
      model: string;
      state: 'idle' | 'hidden' | 'revealed' | 'frozen' | 'petrified' | 'enraged';
    }
  | {
      type: 'PICKUP_COLLECTED';
      entityId: string;
      item: 'energy' | 'ram' | 'ssd';
      /** HP healed, GB of RAM or GB of SSD gained. */
      amount: number;
      /** Short HUD/FX word, e.g. `+25HP`, `+16GB RAM`. */
      label: string;
    }
  | {
      type: 'FILE_REMOVED';
      inodeId: InodeId;
      name: string;
      entityId?: string;
    }
  | {
      type: 'FILE_CREATED';
      inodeId: InodeId;
      name: string;
      entityId?: string;
    }
  | {
      type: 'PLAYER_RESPAWNED';
      from: 'ssd_backup' | 'floor_restart';
      hp: number;
    }
  | {
      /** A new floor was loaded (after FLOOR_CLEARED, a restart or a debug jump). Drives the title card. */
      type: 'FLOOR_ENTERED';
      floorId: number;
      title: string;
      path: string;
    }
  | {
      /** The vibecoder acts out the command just typed (typing pose, lantern raise, cast at a target). */
      type: 'VIBECODER_ACTION';
      action: 'type' | 'read' | 'write' | 'cast' | 'lantern' | 'collect';
      command: string;
      targetEntityId?: string;
    }
  | {
      type: 'GAME_ENDED';
      rank: 'C' | 'B' | 'A' | 'S';
      timeSec: number;
      commands: number;
     }
  // ---- Tutorial and the AI agents' running commentary.
  | {
      /** One of the four AI agents (or Kiro Ghost companion) speaks in a cameo bubble on the stage. */
      type: 'AGENT_TAUNT';
      agent: 'claude' | 'grok' | 'codex' | 'agy' | 'kiro';
      /** procgen model id of the agent, e.g. `agent.claude` or `npc.kiro_ghost`. */
      model: string;
      text: string;
      mood: 'laugh' | 'order' | 'smug' | 'annoyed';
    }
  | {
      /** Kiro Ghost companion action (Destiny-style scan sweep, GGUF weight swap, or cipher crack). */
      type: 'KIRO_ACTION';
      action: 'scan' | 'load' | 'crack_start' | 'crack_step' | 'crack_done';
      core: string;
      target?: string;
      message: string;
    }
  | {
      /** The vibecoder reacts emotionally (shock on arrival, relief, panic at low HP). */
      type: 'VIBECODER_EMOTE';
      emote: 'shock' | 'confused' | 'determined' | 'relief' | 'panic';
      text?: string;
    }
  | {
      /** Tutorial progress on floor 1. `done` is true when this step was just completed. */
      type: 'TUTORIAL_STEP';
      step: number;
      total: number;
      /** The agent's prompt for this step, e.g. "PROMPT #1: look around, bag of bones." */
      prompt: string;
      /** The command the player should type, e.g. `ls`. */
      command: string;
      agent: 'claude' | 'grok' | 'codex' | 'agy' | 'kiro';
      done: boolean;
    };
