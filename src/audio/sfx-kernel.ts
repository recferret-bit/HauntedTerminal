import { isSfxId } from '../contracts/audio-cues.js';
import type { KernelEvent } from '../contracts/events.js';
import type { SfxId } from './catalog.js';
import { doorCue, doorModelCue } from './sfx-doors.js';
import { attackCue, isBossModel, isEnemyModel, pickupCue } from './sfx-models.js';

function validSfx(cue: string | undefined): SfxId | null {
  return cue && isSfxId(cue) ? cue : null;
}

function roomCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'SOUND_CUE') {
    const id = validSfx(ev.cue);
    return id ? [id] : [];
  }
  if (ev.type !== 'ROOM_TRANSITION') return [];
  if (ev.viaSymlinkLoop) return ['symlink_loop', 'data_flood'];
  if (ev.upwardPanelsSmashed >= 3) return ['panels_smash'];
  return [validSfx(ev.sfx) ?? doorModelCue(ev.doorModel) ?? doorCue(ev.toPath) ?? 'hop'];
}

function fileCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'FILE_CREATED') return ['file_create'];
  if (ev.type === 'FILE_REMOVED') return [validSfx(ev.sfx) ?? 'file_remove'];
  if (ev.type === 'OBJECT_MOVED') {
    if (ev.suckedIntoNull) return ['null_suck'];
    if (ev.formedBridge) return ['crate_bridge'];
    return ['file_move'];
  }
  if (ev.type !== 'INODE_MODE_CHANGED') return [];
  const was = (ev.oldMode & 0o111) !== 0;
  const now = (ev.newMode & 0o111) !== 0;
  if (was !== now) return now ? ['gate_open', 'lap_run'] : ['gate_locked'];
  return ['chmod'];
}

const SPEAKER_CUES: Record<string, SfxId> = {
  vibecoder: 'dialog_hero',
  dad: 'dad_cheer',
  antigravy: 'taunt_antigravy_1',
  codec: 'taunt_codec_1',
  gork: 'taunt_gork_1',
  clod: 'taunt_clod_1',
  kiro: 'kiro_advice',
};

/** Maps a dialog/taunt speaker id to its voice or notification sample cue. */
export function speakerCue(speaker: string): SfxId {
  return SPEAKER_CUES[speaker.toLowerCase()] ?? 'kiro_advice';
}

function battleCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'BATTLE_STARTED') return ['battle_start'];
  if (ev.type === 'BATTLE_ENDED') return ev.reason === 'cleared' ? ['battle_won'] : [];
  if (ev.type === 'BATTLE_TURN') {
    const cues: SfxId[] = [ev.actor === 'player' ? 'turn_player' : 'turn_enemy'];
    if (ev.actor === 'player' && ev.first) cues.unshift('fight');
    if (ev.reason === 'timeout') cues.unshift('timer_expired');
    return cues;
  }
  if (ev.type === 'ENEMY_ACTING') return ['enemy_tell'];
  if (ev.type === 'ENEMY_ATTACK') return [validSfx(ev.sfx) ?? attackCue(ev.model, ev.damage)];
  if (ev.type === 'ENEMY_HIT') return ['enemy_hit'];
  return [];
}

function killCues(ev: Extract<KernelEvent, { type: 'ENEMY_KILLED' }>): SfxId[] {
  const how: Record<typeof ev.how, SfxId> = {
    SIGKILL: 'kill',
    SIGTERM: 'sigterm',
    rm: 'kill_rm',
    chmod: 'chmod',
    devnull: 'kill_null',
    other: 'kill',
  };
  const cues: SfxId[] = [validSfx(ev.sfx) ?? how[ev.how]];
  if (isBossModel(ev.model)) cues.push('boss_defeated');
  return cues;
}

function spawnCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'SYSTEM_HAND_SPAWN') return [ev.reason === 'cron_restore' ? 'cron_restore' : 'hand_spawn'];
  if (ev.type !== 'ENTITY_SPAWNED') return [];
  if (ev.reason === 'virus_split') return ['virus_split'];
  if (ev.model.startsWith('pickup.')) return ['pickup_hover'];
  if (isEnemyModel(ev.model)) return ['enemy_spawn'];
  return [];
}

function actorCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'VIBECODER_ACTION') {
    if (ev.failed) return [];
    if (ev.action === 'cast') return ['hero_cast'];
    if (ev.action === 'collect') return [ev.command.startsWith('hold') ? 'item_lit' : 'hero_collect'];
    if (ev.action === 'read') return ['reveal'];
    if (ev.action === 'type') return ['hero_type'];
    return [];
  }
  if (ev.type === 'VIBECODER_EMOTE') {
    if (ev.emote === 'shock' || ev.emote === 'confused') return ['emote_shock'];
    if (ev.emote === 'panic') return ['emote_panic'];
    if (ev.emote === 'relief' || ev.emote === 'determined') return ['emote_relief'];
    if (ev.emote === 'shout') return ['emote_shout', 'lightning'];
    return [];
  }
  if (ev.type === 'DIALOG_BOX') return [speakerCue(ev.speaker)];
  if (ev.type === 'TUTORIAL_STEP') return ev.done ? [] : ['cine_caption_in'];
  if (ev.type === 'KIRO_ACTION') {
    const cue: Record<typeof ev.action, SfxId> = {
      scan: 'kiro_scan',
      load: 'kiro_load',
      crack_start: 'kiro_crack_start',
      crack_step: 'kiro_crack_step',
      crack_done: 'kiro_crack_done',
      empower: 'kiro_magic',
    };
    return ev.action === 'scan' ? ['kiro_scan', 'sting_kiro'] : [cue[ev.action]];
  }
  if (ev.type === 'AGENT_TAUNT') return [speakerCue(ev.agent)];
  return [];
}

function lifeCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'PLAYER_DAMAGED') {
    if (ev.hpRemaining <= 0) return ['player_hit_heavy', 'core_dump'];
    return [ev.amount >= 8 ? 'player_hit_heavy' : 'player_hit'];
  }
  if (ev.type === 'PLAYER_RESPAWNED') return [ev.from === 'floor_restart' ? 'level_restart' : 'respawn'];
  if (ev.type === 'PICKUP_COLLECTED') {
    const cue = validSfx(ev.sfx) ?? pickupCue(ev.item);
    const cues: SfxId[] = cue ? [cue, 'hero_collect'] : ['hero_collect'];
    if (ev.item === 'tube_transistor') cues.push('sting_lantern', 'lantern_on');
    if (ev.item === 'laptop') cues.push('item_lit');
    return cues;
  }
  if (ev.type === 'LANTERN_REVEAL') return ['lantern_on', 'reveal', 'sting_lantern'];
  if (ev.type === 'ITEM_CARRIED') return ['pickup_hover'];
  if (ev.type === 'ACTOR_FLY_TO') return ['kiro_fly'];
  if (ev.type === 'ITEM_GIVEN') return [ev.item === 'terminal' ? 'term_boot' : 'item_lit'];
  if (ev.type === 'ENEMY_STATE') {
    if (ev.state === 'petrified') return ['petrify'];
    if (ev.state === 'revealed') return ['reveal'];
    return [];
  }
  return [];
}

function signalCues(ev: KernelEvent): SfxId[] {
  if (ev.type !== 'PROC_SIGNALED') return [];
  if (ev.signal === 'SIGCONT') return ['sigcont'];
  if (ev.signal === 'SIGSTOP' || ev.outcome === 'FROZEN') return ['sigstop'];
  if (ev.outcome === 'TRAPPED_ENRAGED') return ['enemy_enraged'];
  if (ev.pid === 1 && ev.outcome === 'KILLED') return ['lightning'];
  if (ev.signal === 'SIGTERM' && ev.outcome === 'KILLED') return [];
  if (ev.signal === 'SIGTERM') return ['sigterm'];
  if (ev.outcome === 'KILLED') return ['lightning'];
  return [];
}

function worldCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'PERMISSION_DENIED_RATTLE') return [validSfx(ev.sfx) ?? 'perm_denied'];
  if (ev.type === 'HUD_OVERLAY_TOGGLED') return [(ev.active ?? ev.processes.length > 0) ? 'xray_on' : 'xray_off'];
  if (ev.type === 'OBSTACLE_DIALOGUE_RENDERED') return ['socket_crackle'];
  if (ev.type === 'PUZZLE_DOOR_RESOLVED') return ['puzzle_solved'];
  if (ev.type === 'ACHIEVEMENT_UNLOCKED') return ['achievement'];
  if (ev.type === 'FLOOR_CLEARED') return [validSfx(ev.sfx) ?? 'level_clear', 'sting_clear'];
  if (ev.type === 'FLOOR_ENTERED') return [validSfx(ev.sfx) ?? 'title_card'];
  if (ev.type === 'GAME_ENDED') return ['lightning', 'rank_reveal'];
  return [];
}

const PARTS = [roomCues, fileCues, battleCues, spawnCues, actorCues, lifeCues, signalCues, worldCues];

export function kernelCues(ev: KernelEvent): SfxId[] {
  if (ev.type === 'ENEMY_KILLED') return killCues(ev);
  const out: SfxId[] = [];
  for (const part of PARTS) out.push(...part(ev));
  return out;
}
