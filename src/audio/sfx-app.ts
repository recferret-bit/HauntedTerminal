import { isSfxId } from '../contracts/audio-cues.js';
import type { AppEvent } from '../contracts/app-bus.js';
import type { SfxId } from './catalog.js';
import { speakerCue } from './sfx-kernel.js';

const KEY: Record<Extract<AppEvent, { kind: 'key' }>['key'], SfxId> = {
  press: 'key_press',
  enter: 'key_enter',
  backspace: 'key_backspace',
  tab: 'tab_complete',
};

const COMMAND: Record<Extract<AppEvent, { kind: 'command' }>['result'], SfxId> = {
  ok: 'cmd_ok',
  fail: 'cmd_fail',
  locked: 'cmd_locked',
};

const MENU: Record<Extract<AppEvent, { kind: 'menu' }>['action'], SfxId> = {
  open: 'menu_open',
  close: 'menu_close',
  move: 'menu_move',
};

const LAPTOP: Record<Extract<AppEvent, { kind: 'laptop' }>['action'], SfxId> = {
  open: 'lap_open',
  close: 'lap_close',
  post: 'lap_post_beep',
  disk: 'lap_disk',
  ready: 'lap_ready',
  trackpad: 'lap_trackpad',
  run: 'lap_run',
  'loop-guard': 'lap_loop_guard',
  shutdown: 'lap_shutdown',
  key: 'key_press',
  solved: 'puzzle_solved',
  'check-fail': 'gate_locked',
  'win-open': 'file_create',
  'win-min': 'file_move',
  'win-close': 'file_remove',
};

const CINE: Record<Extract<AppEvent, { kind: 'cine' }>['cue'], SfxId> = {
  thunder: 'thunder_close',
  'thunder-far': 'thunder_far',
  burst: 'glass_burst',
  zap: 'teleport_zap',
  shatter: 'shatter',
  lightning: 'lightning',
  boot: 'term_boot',
};

const LETTER: Record<Extract<AppEvent, { kind: 'letter' }>['letter'], SfxId> = {
  slam: 'cine_sfx_slam',
  bubble: 'cine_bubble_pop',
  caption: 'cine_caption_in',
  glitch: 'cine_glitch_text',
  flash: 'cine_panel_flash',
  invert: 'cine_invert',
  shake: 'cine_shake',
  pixel: 'cine_pixelate',
};

const STAGE_SFX: Partial<Record<string, SfxId>> = {
  bat_wings: 'bat_wings',
};

const SILENT_POINTER_IDS = new Set([
  'unknown', 'background', 'tty-manual-btn', 'sandbox-toggle-btn',
  'hint-dialog-close', 'hint-dialog-x', 'ce-save', 'ce-close', 'ce-chip',
  'mb-close', 'mb-close-btn', 'mb-nav-btn', 'mb-cover-chip',
  'esc-close', 'esc-mute', 'esc-fullscreen', 'esc-restart', 'esc-restart-no', 'esc-restart-yes',
  'esc-leave', 'esc-leave-no', 'esc-leave-yes', 'esc-volume',
  'mb-corner-left', 'mb-corner-right', 'mb-tab-btn', 'mb-toc-sec-btn', 'mb-toc-link',
  'mb-hit-item', 'mb-rel-btn',
  'comix-prev', 'comix-next',
  'lt-key', 'lt-pad', 'lt-btn', 'lt-lid',
  'btn-lightning', 'btn-intro', 'btn-outro', 'btn-damage', 'perk-action-btn',
  'chapters-export-save-btn', 'waitlist-export-btn', 'waitlist-submit-btn', 'll-sound',
]);

function pointerCues(id: string, surface?: string): SfxId[] {
  const low = id.toLowerCase();
  if (!low || SILENT_POINTER_IDS.has(low) || low.startsWith('dev-ev:') || low.startsWith('dev-give:')) return [];
  if (low === 'btn-heal') return ['pickup_energy'];
  if (low === 'item' || low === 'item-slot' || low.startsWith('item-')) return ['item_lit'];
  if (low === 'htc-btn-skip') return ['menu_close'];
  if (low === 'mb-insert-btn') return ['tab_complete'];
  if (low === 'outro-export' || low === 'export-save-btn') {
    return ['cmd_ok'];
  }
  if (low === 'outro-again') return ['level_restart'];
  if (surface === 'laptop') return ['lap_trackpad'];
  return ['menu_move'];
}

/** App events other than kernel events. Loops are started by the orchestrator, not here. */
export function appCues(event: AppEvent): SfxId[] {
  switch (event.kind) {
    case 'key':
      return [KEY[event.key]];
    case 'command':
      return [COMMAND[event.result]];
    case 'menu':
      return [MENU[event.action]];
    case 'restart':
      return [event.step === 'arm' ? 'restart_arm' : 'level_restart'];
    case 'manual':
      return [event.open ? 'manual_open' : 'manual_close'];
    case 'timer':
      return event.secondsLeft >= 1 && event.secondsLeft <= 5 ? ['timer_tick'] : [];
    case 'laptop':
      return [LAPTOP[event.action]];
    case 'cine':
      return [CINE[event.cue]];
    case 'letter':
      return [LETTER[event.letter]];
    case 'dialog':
      return [speakerCue(event.speaker)];
    case 'page':
      return ['page_turn'];
    case 'pointer':
      return pointerCues(event.id, event.surface);
    case 'sfx': {
      const mapped = STAGE_SFX[event.cue];
      return mapped ? [mapped] : isSfxId(event.cue) ? [event.cue] : [];
    }
    default:
      return [];
  }
}
