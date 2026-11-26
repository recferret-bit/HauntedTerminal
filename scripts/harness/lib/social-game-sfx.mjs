// Pure mapping of captured Out Of Credits gameplay KernelEvents and terminal keystrokes to public/sfx/<cue>.mp3 IDs.
// Mirrors src/audio/sfx-kernel.ts without importing TypeScript runtime modules so Node harness scripts run directly.

const SPEAKER_CUES = {
  vibecoder: 'dialog_hero',
  antigravy: 'taunt_antigravy_1',
  codec: 'taunt_codec_1',
  gork: 'taunt_gork_1',
  clod: 'taunt_clod_1',
  kiro: 'kiro_advice',
};

const KILL_HOW = {
  SIGKILL: 'kill',
  SIGTERM: 'sigterm',
  rm: 'kill_rm',
  chmod: 'chmod',
  devnull: 'kill_null',
  other: 'kill',
};

const KIRO_ACTIONS = {
  scan: ['kiro_scan', 'sting_kiro'],
  load: ['kiro_load'],
  crack_start: ['kiro_crack_start'],
  crack_step: ['kiro_crack_step'],
  crack_done: ['kiro_crack_done'],
};

function pickupCue(item) {
  if (item === 'energy') return 'pickup_energy';
  if (item === 'ram') return 'pickup_ram';
  if (item === 'ssd') return 'pickup_ssd';
  if (item === 'lantern') return 'pickup_lantern';
  return null;
}

/** Returns an array of public/sfx cue IDs for one KernelEvent. */
export function cuesForKernelEvent(ev) {
  if (!ev || typeof ev !== 'object') return [];
  switch (ev.type) {
    case 'ROOM_TRANSITION':
      if (ev.viaSymlinkLoop) return ['symlink_loop', 'data_flood'];
      if ((ev.upwardPanelsSmashed ?? 0) >= 3) return ['panels_smash'];
      return ['hop'];
    case 'FILE_CREATED':
      return ['file_create'];
    case 'FILE_REMOVED':
      return ['file_remove'];
    case 'OBJECT_MOVED':
      if (ev.suckedIntoNull) return ['null_suck'];
      if (ev.formedBridge) return ['crate_bridge'];
      return ['file_move'];
    case 'INODE_MODE_CHANGED': {
      const was = ((ev.oldMode ?? 0) & 0o111) !== 0;
      const now = ((ev.newMode ?? 0) & 0o111) !== 0;
      return was !== now ? [now ? 'gate_open' : 'gate_locked'] : ['chmod'];
    }
    case 'BATTLE_STARTED':
      return ['battle_start'];
    case 'BATTLE_ENDED':
      return ev.reason === 'cleared' ? ['battle_won'] : [];
    case 'BATTLE_TURN': {
      const cues = [ev.actor === 'player' ? 'turn_player' : 'turn_enemy'];
      if (ev.actor === 'player' && ev.first) cues.unshift('fight');
      return cues;
    }
    case 'ENEMY_ACTING':
      return ['enemy_tell'];
    case 'ENEMY_ATTACK':
      return [String(ev.model ?? '').startsWith('boss.') ? 'boss_kernel_panic' : 'atk_virus'];
    case 'ENEMY_HIT':
      return ['enemy_hit'];
    case 'ENEMY_KILLED': {
      const base = KILL_HOW[ev.how] ?? 'kill';
      return String(ev.model ?? '').startsWith('boss.') ? [base, 'boss_defeated'] : [base];
    }
    case 'ENEMY_STATE':
      if (ev.state === 'petrified') return ['petrify'];
      if (ev.state === 'revealed') return ['reveal'];
      return [];
    case 'PROC_SIGNALED':
      if (ev.signal === 'SIGSTOP' || ev.outcome === 'FROZEN') return ['sigstop'];
      if (ev.outcome === 'KILLED') return ['lightning'];
      return ['sigterm'];
    case 'DIALOG_BOX':
      return [SPEAKER_CUES[String(ev.speaker ?? '').toLowerCase()] ?? 'kiro_advice'];
    case 'AGENT_TAUNT':
      return [SPEAKER_CUES[String(ev.agent ?? '').toLowerCase()] ?? 'taunt_clod_1'];
    case 'KIRO_ACTION':
      return KIRO_ACTIONS[ev.action] ?? ['kiro_scan'];
    case 'PICKUP_COLLECTED': {
      const p = pickupCue(ev.item);
      const out = p ? [p, 'hero_collect'] : ['hero_collect'];
      if (ev.item === 'lantern') out.push('sting_lantern', 'lantern_on');
      return out;
    }
    case 'LANTERN_REVEAL':
      return ['lantern_on', 'reveal'];
    case 'ITEM_GIVEN':
      return [ev.item === 'terminal' ? 'term_boot' : 'item_lit'];
    case 'PUZZLE_DOOR_RESOLVED':
      return ['puzzle_solved'];
    case 'ACHIEVEMENT_UNLOCKED':
      return ['achievement'];
    case 'FLOOR_CLEARED':
      return ['level_clear', 'sting_clear'];
    case 'GAME_ENDED':
      return ['lightning', 'rank_reveal'];
    default:
      return [];
  }
}

/** Generates subtle mechanical keystroke SFX timestamps across a typed command string. */
export function keystrokeCues(startSec, text, cps = 18, submitAtEnd = false) {
  const clean = String(text ?? '');
  const step = 1 / Math.max(4, cps);
  const variants = ['key_press', 'key_press_2', 'key_press_3'];
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    out.push({
      at: +(startSec + i * step).toFixed(4),
      cue: variants[(i / 2) % variants.length],
      gainDb: -8,
    });
  }
  if (submitAtEnd) {
    out.push({
      at: +(startSec + clean.length * step + 0.02).toFixed(4),
      cue: 'key_enter',
      gainDb: -4,
    });
  }
  return out;
}

/** Deduplicates cues that fire closer than minGapSec for the same sample, capping total layers for clean ffmpeg amix. */
export function compactTimedCues(cues, { maxDuration = Infinity, minGapSec = 0.08, maxLayers = 28 } = {}) {
  const sorted = [...cues]
    .filter((c) => c && typeof c.cue === 'string' && Number.isFinite(c.at) && c.at >= 0 && c.at < maxDuration - 0.04)
    .sort((a, b) => a.at - b.at);
  const lastByCue = new Map();
  const kept = [];
  for (const item of sorted) {
    const prev = lastByCue.get(item.cue);
    if (prev !== undefined && item.at - prev < minGapSec) continue;
    lastByCue.set(item.cue, item.at);
    kept.push(item);
    if (kept.length >= maxLayers) break;
  }
  return kept;
}
