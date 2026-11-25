export type InodeId = number;
export type PosixSignal = 'SIGTERM' | 'SIGKILL' | 'SIGSTOP' | 'SIGCONT';
export type ProcState = 'RUNNING' | 'STOPPED' | 'ZOMBIE' | 'DEAD';
/** The four AI agents that taunt the vibecoder before a battle. */
export type BattleAgent = 'clod' | 'gork' | 'codec' | 'antigravy';
/** Who is acting in a battle: nobody (`idle`), the intro, the player, or the enemies. */
export type BattlePhase = 'idle' | 'intro' | 'player' | 'enemy';

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
      /** How the stage brings the actor in: `appear` (default) or `glide` in from the panel edge to its slot beside the hero. */
      entrance?: 'appear' | 'glide';
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
  // ---- Turn-based battles (`src/game/battle.ts`).
  | {
      /** A battle began: the intro plays (an agent of the big four taunts, then Kiro advises). Nobody acts yet. */
      type: 'BATTLE_STARTED';
      battle: number;
      agent: BattleAgent;
      /** procgen model id of the taunting agent, e.g. `agent.gork`. */
      model: string;
      taunt: string;
      /** Kiro Ghost's one-line advice for the enemies present. */
      advice: string;
      enemyIds: string[];
    }
  | {
      /** The turn passed to `actor`. `first` marks the first player turn of a battle (the FIGHT! beat). */
      type: 'BATTLE_TURN';
      battle: number;
      actor: 'player' | 'enemy';
      first: boolean;
      /** Why: the intro ended (`start`), the player acted, the turn timer ran out, or a tool forced the enemy turn. */
      reason: 'start' | 'action' | 'timeout' | 'forced';
    }
  | {
      /** Inside an enemy turn: the events up to the next ENEMY_ACTING belong to this enemy (the stage staggers them). */
      type: 'ENEMY_ACTING';
      entityId: string;
    }
  | {
      type: 'BATTLE_ENDED';
      battle: number;
      reason: 'cleared' | 'left' | 'respawn' | 'level';
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
      item: 'energy' | 'ram' | 'ssd' | 'lantern';
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
      /** Set (true) only when the command exited with a non-zero status. Absent means success. */
      failed?: boolean;
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
      agent: 'clod' | 'gork' | 'codec' | 'antigravy' | 'kiro';
      /** procgen model id of the agent, e.g. `agent.clod` or `npc.kiro_ghost`. */
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
      agent: 'clod' | 'gork' | 'codec' | 'antigravy' | 'kiro';
      done: boolean;
    }
  | {
      /** A chapter script `dialog_box` step: one line in the dialog box in the screen corner, with the speaker's avatar. */
      type: 'DIALOG_BOX';
      /** `vibecoder` or an agent id (`kiro`, `clod`, ...). */
      speaker: string;
      /** Display name in the box. */
      name: string;
      /** procgen model id drawn as the avatar (`vibecoder.dev_terminal`, `npc.kiro_ghost`). */
      model: string;
      text: string;
      /** How long the box stays after the text is shown, in ms. */
      holdMs: number;
    }
  | {
      /** A local achievement was unlocked for the first time (never emitted in preview or lab sessions). */
      type: 'ACHIEVEMENT_UNLOCKED';
      id: string;
      steamApiName: string;
      title: string;
      description: string;
      icon: string;
    };
