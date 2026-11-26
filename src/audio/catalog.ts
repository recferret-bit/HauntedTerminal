/** Sample ids. `scripts/harness/audio-unit.mjs` checks these against `public/sfx` and `public/music`. */

export const SFX_IDS = [
  'key_press', 'key_enter', 'key_backspace', 'cmd_ok', 'cmd_fail', 'perm_denied', 'cmd_locked', 'tab_complete',
  'taunt_antigravy_1', 'taunt_antigravy_2', 'taunt_antigravy_3', 'taunt_antigravy_4', 'taunt_antigravy_5',
  'taunt_antigravy_6', 'taunt_antigravy_7', 'taunt_antigravy_8', 'taunt_antigravy_9', 'taunt_antigravy_10',
  'taunt_codec_1', 'taunt_codec_2', 'taunt_codec_3', 'taunt_codec_4', 'taunt_codec_5',
  'taunt_codec_6', 'taunt_codec_7', 'taunt_codec_8', 'taunt_codec_9', 'taunt_codec_10',
  'taunt_gork_1', 'taunt_gork_2', 'taunt_gork_3', 'taunt_gork_4', 'taunt_gork_5',
  'taunt_gork_6', 'taunt_gork_7', 'taunt_gork_8', 'taunt_gork_9', 'taunt_gork_10',
  'taunt_clod_1', 'taunt_clod_2', 'taunt_clod_3', 'taunt_clod_4', 'taunt_clod_5',
  'taunt_clod_6', 'taunt_clod_7', 'taunt_clod_8', 'taunt_clod_9', 'taunt_clod_10',
  'kiro_advice', 'kiro_advice_2', 'kiro_advice_3', 'kiro_advice_4', 'kiro_advice_5',
  'kiro_advice_6', 'kiro_advice_7', 'kiro_advice_8', 'kiro_advice_9', 'kiro_advice_10',
  'timer_tick', 'timer_expired', 'menu_open', 'menu_close', 'menu_move',
  'achievement', 'item_lit', 'manual_open', 'manual_close', 'title_card', 'level_clear', 'rank_reveal',
  'restart_arm', 'level_restart', 'lightning', 'thunder_close', 'thunder_far', 'rain_loop', 'glass_burst',
  'teleport_zap', 'shatter', 'hop', 'panels_smash', 'symlink_loop', 'page_turn', 'lantern_on', 'reveal',
  'gate_open', 'gate_locked', 'petrify', 'chmod', 'file_create', 'file_remove', 'file_move', 'crate_bridge',
  'null_suck', 'data_flood', 'xray_on', 'xray_off', 'hand_spawn', 'cron_restore', 'puzzle_solved',
  'socket_crackle', 'door_usb', 'door_ethernet', 'door_hdmi', 'door_serial', 'door_firewall', 'door_loopback',
  'door_null', 'battle_start', 'fight', 'turn_player', 'turn_enemy', 'battle_won', 'respawn',
  'atk_bug', 'atk_spyware', 'atk_rootkit', 'atk_worm', 'atk_crack', 'atk_trojan', 'atk_virus', 'atk_exploit',
  'atk_ransomware', 'atk_zombie', 'boss_forkbomb', 'boss_kernel_panic', 'enemy_tell', 'enemy_miss',
  'enemy_spawn', 'virus_split', 'enemy_enraged', 'player_hit', 'player_hit_heavy', 'low_hp_loop',
  'hp_tier_drop', 'enemy_hit', 'kill', 'sigterm', 'sigstop', 'sigcont', 'kill_rm', 'kill_null', 'core_dump',
  'boss_defeated', 'pickup_energy', 'pickup_ram', 'pickup_ssd', 'pickup_lantern', 'pickup_hover',
  'hero_type', 'hero_cast', 'hero_collect', 'emote_shock', 'emote_panic', 'emote_relief', 'emote_shout',
  'kiro_scan', 'kiro_load', 'kiro_crack_start', 'kiro_crack_step', 'kiro_crack_done',
  'lap_open', 'lap_close', 'lap_post_beep', 'lap_fan', 'lap_disk', 'lap_ready', 'lap_trackpad', 'lap_run',
  'lap_loop_guard', 'lap_shutdown', 'cine_panel_flash', 'cine_glitch_text', 'cine_pixelate', 'cine_invert',
  'cine_shake', 'cine_sfx_slam', 'cine_caption_in', 'cine_bubble_pop', 'sting_clear', 'sting_kiro',
  'sting_lantern', 'dialog_hero',
  'key_press_2', 'key_press_3', 'key_backspace_2', 'term_boot',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export const MUSIC_IDS = [
  'title_theme', 'menu_bed', 'level_select', 'manual_bed', 'achievements_bed', 'comic_reader', 'rank_card',
  'floor_attic', 'floor_crypt', 'floor_maze', 'floor_furnace', 'floor_core', 'hub_matrix', 'battle_loop',
  'battle_boss', 'low_hp_bed', 'laptop_bed', 'lab_bed', 'cine_intro', 'cine_outro',
] as const;

export type MusicId = (typeof MUSIC_IDS)[number];

const MUSIC_ONCE = new Set<MusicId>(['rank_card', 'cine_intro', 'cine_outro']);

/** No bed is split. Each looping cue is one file, crossfaded at the join by the player. */
export const MUSIC_SPLIT: Partial<Record<MusicId, { bed: string; intro: string }>> = {};

export function musicLoops(id: MusicId): boolean {
  return !MUSIC_ONCE.has(id);
}

export function musicAsset(id: MusicId): { bed: string; intro?: string } {
  return MUSIC_SPLIT[id] ?? { bed: id };
}

export function sampleUrl(group: 'sfx' | 'music', id: string): string | null {
  if (!/^[a-z0-9_]+$/.test(id)) return null;
  return `/${group}/${id}.mp3`;
}
