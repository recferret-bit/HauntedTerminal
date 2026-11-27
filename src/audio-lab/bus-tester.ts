import type { AppEvent, MusicScene } from '../contracts/app-bus.js';
import { musicFor, sceneFor } from '../audio/music-for.js';
import { sfxFor } from '../audio/sfx-for.js';
import { clear, h } from '../editor-core/dom.js';

export interface BusTesterDeps {
  onScene(scene: MusicScene | null): void;
  onEmit(ev: AppEvent): void;
}

const SCENE_PRESETS: ReadonlyArray<{ id: string; label: string; scene: MusicScene | null }> = [
  { id: 'title', label: 'Title', scene: sceneFor('title') },
  { id: 'menu', label: 'Esc Menu', scene: sceneFor('play', { menu: true, floorTheme: 1 }) },
  { id: 'level_select', label: 'Level Select', scene: sceneFor('level-select') },
  { id: 'manual', label: 'Manual', scene: sceneFor('manual') },
  { id: 'achievements', label: 'Achievements', scene: sceneFor('achievements') },
  { id: 'comic', label: 'Comic Issue', scene: sceneFor('comic') },
  { id: 'rank', label: 'Rank Card', scene: sceneFor('rank') },
  { id: 'floor1', label: 'Floor 1 (Attic)', scene: sceneFor('play', { floorTheme: 1 }) },
  { id: 'floor2', label: 'Floor 2 (Crypt)', scene: sceneFor('play', { floorTheme: 2 }) },
  { id: 'floor3', label: 'Floor 3 (Maze)', scene: sceneFor('play', { floorTheme: 3 }) },
  { id: 'floor4', label: 'Floor 4 (Furnace)', scene: sceneFor('play', { floorTheme: 4 }) },
  { id: 'floor5', label: 'Floor 5 (Core)', scene: sceneFor('play', { floorTheme: 5 }) },
  { id: 'hub', label: 'Matrix Hub', scene: sceneFor('play', { hub: true, floorTheme: 1 }) },
  { id: 'battle', label: 'Battle', scene: sceneFor('play', { battle: 'fight', floorTheme: 2 }) },
  { id: 'boss', label: 'Boss Fight', scene: sceneFor('play', { battle: 'boss', floorTheme: 5 }) },
  { id: 'low_hp', label: 'Low HP Battle', scene: sceneFor('play', { battle: 'fight', lowHp: true, floorTheme: 3 }) },
  { id: 'laptop', label: 'Laptop', scene: sceneFor('laptop') },
  { id: 'lab', label: 'Terminal Lab', scene: sceneFor('lab') },
  { id: 'cine_intro', label: 'Cine Intro', scene: sceneFor('cine-intro') },
  { id: 'cine_outro', label: 'Cine Outro', scene: sceneFor('cine-outro') },
  { id: 'quiet', label: 'Quiet (null)', scene: null },
];

const EVENT_PRESETS: ReadonlyArray<{ id: string; label: string; event: AppEvent }> = [
  { id: 'cmd_ok', label: 'cmd ok', event: { kind: 'command', result: 'ok' } },
  { id: 'cmd_fail', label: 'cmd fail', event: { kind: 'command', result: 'fail' } },
  { id: 'cmd_locked', label: 'cmd locked', event: { kind: 'command', result: 'locked' } },
  { id: 'sigkill', label: 'SIGKILL', event: { kind: 'kernel', event: { type: 'PROC_SIGNALED', pid: 4001, signal: 'SIGKILL', outcome: 'KILLED' } } },
  { id: 'petrify', label: 'chmod -x', event: { kind: 'kernel', event: { type: 'INODE_MODE_CHANGED', inodeId: 9, oldMode: 0o755, newMode: 0o644 } } },
  { id: 'reveal', label: 'lantern reveal', event: { kind: 'kernel', event: { type: 'LANTERN_REVEAL', dirId: 1, revealedInodes: [2] } } },
  { id: 'dmg', label: 'player hit', event: { kind: 'kernel', event: { type: 'PLAYER_DAMAGED', amount: 15, hpRemaining: 75, sourceName: 'virus' } } },
  { id: 'dlg_clod', label: 'talk clod', event: { kind: 'dialog', speaker: 'clod' } },
  { id: 'dlg_kiro', label: 'talk kiro', event: { kind: 'dialog', speaker: 'kiro' } },
  { id: 'dlg_dad', label: 'talk dad', event: { kind: 'dialog', speaker: 'dad' } },
  { id: 'lap_open', label: 'laptop open', event: { kind: 'laptop', action: 'open' } },
  { id: 'cine_zap', label: 'cine zap', event: { kind: 'cine', cue: 'zap' } },
];

export interface BusTesterHandle {
  el: HTMLElement;
  record(entry: { kind: string; summary: string; cls: string }): void;
  setSceneState(scene: MusicScene | null): void;
}

export function createBusTesterPanel(deps: BusTesterDeps): BusTesterHandle {
  const bedStatus = h('div', { class: 'al-kv' }, 'scene: none -> bed: null');
  const logList = h('ul', { class: 'al-log', 'aria-label': 'Audio AppBus event log' });
  const logs: Array<{ kind: string; summary: string; cls: string }> = [];

  const renderLogs = (): void => {
    clear(logList);
    for (const item of logs) logList.append(h('li', { class: item.cls }, item.summary));
  };

  const sceneBtns = SCENE_PRESETS.map((p) => {
    const btn = h(
      'button',
      { type: 'button', class: 'al-chip', 'data-scene': p.id, onclick: () => deps.onScene(p.scene) },
      p.label,
    );
    return { preset: p, btn };
  });

  const eventBtns = EVENT_PRESETS.map((p) =>
    h(
      'button',
      { type: 'button', class: 'al-chip', 'data-app-event': p.id, onclick: () => deps.onEmit(p.event) },
      `${p.label} (${sfxFor(p.event).join('+') || '-'})`,
    ),
  );

  const el = h(
    'div',
    {},
    h('section', { class: 'al-card', 'aria-label': 'MusicScene tester' },
      h('h3', {}, 'MusicScene Tester'),
      bedStatus,
      h('div', { class: 'al-filters' }, ...sceneBtns.map((s) => s.btn)),
    ),
    h('section', { class: 'al-card', 'aria-label': 'AppBus event tester' },
      h('h3', {}, 'AppBus & sfxFor Tester'),
      h('div', { class: 'al-filters' }, ...eventBtns),
    ),
    h('section', { class: 'al-card', 'aria-label': 'Resolved cues log' },
      h('h3', {}, 'Live Bus Resolution Log'),
      logList,
    ),
  );

  return {
    el,
    record(entry) {
      logs.unshift(entry);
      if (logs.length > 30) logs.length = 30;
      renderLogs();
    },
    setSceneState(scene) {
      const bed = scene ? musicFor(scene) : null;
      bedStatus.textContent = `scene: ${scene ? scene.surface : 'null'} -> bed: ${bed ?? 'none'}`;
      for (const { preset, btn } of sceneBtns) {
        const match = JSON.stringify(preset.scene) === JSON.stringify(scene);
        btn.setAttribute('aria-pressed', String(match));
      }
    },
  };
}
