import { type MusicId } from '../audio/catalog.js';
import { createGraph, type AudioGraph } from '../audio/engine.js';
import { SOUND_SOURCES, TYPING_MIN_INTERVAL_MS, TYPING_SOUND_SOURCES } from '../audio/limits.js';
import { attachOrchestrators } from '../audio/orchestrators.js';
import { sfxFor } from '../audio/sfx-for.js';
import { createAppBus, type AppEvent, type MusicScene } from '../contracts/app-bus.js';
import { clear, h } from '../editor-core/dom.js';
import { createBusTesterPanel } from './bus-tester.js';
import {
  AUDIO_FILTERS,
  buildCatalogItems,
  filterCatalogItems,
  isMusicId,
  isSfxId,
  type AudioCueItem,
  type AudioFilterId,
} from './catalog-meta.js';
import { createMixerPanel } from './mixer.js';
import { createWaveformPanel } from './waveform.js';

export interface AudioLabSnapshot {
  selectedCue: string;
  selectedGroup: 'sfx' | 'music';
  filter: AudioFilterId;
  query: string;
  trim: { offset: number; duration?: number };
  durationSec: number | null;
  waveformBins: number;
  sfxCount: number;
  musicCount: number;
  visibleCount: number;
  muted: boolean;
  volume: number;
  currentScene: MusicScene | null;
  currentBed: MusicId | null;
  activeLoops: Record<string, { on: boolean; gain: number }>;
  recentCues: string[];
}

export interface AudioLabHandle {
  ready: Promise<void>;
  selectCue(id: string): Promise<void>;
  playCue(id: string, opts?: { raw?: boolean }): Promise<void>;
  setTrim(id: string, trim: { offset: number; duration?: number }): void;
  setLoop(id: string, on: boolean, gain?: number): void;
  testScene(scene: MusicScene | null): void;
  emit(ev: AppEvent): void;
  state(): AudioLabSnapshot;
  dispose(): void;
}

function makeObservedGraph(
  inner: AudioGraph,
  onLog: (op: string, id: string, cls: string) => void,
  onBed: (id: MusicId | null) => void,
): AudioGraph {
  return {
    get live() { return inner.live; },
    setMuted: (m) => inner.setMuted(m),
    setVolume: (v) => inner.setVolume(v),
    play(id) {
      onLog('sfx', `play -> ${id}`, '');
      inner.play(id);
    },
    loop(id, on) {
      onLog('loop', `loop -> ${id} (${on ? 'on' : 'off'})`, 'loop');
      inner.loop(id, on);
    },
    bed(id) {
      onBed(id);
      onLog('scene', `bed -> ${id ?? 'none'}`, 'scene');
      inner.bed(id);
    },
    hold: (p) => inner.hold(p),
    dispose: () => inner.dispose(),
  };
}

function createSoundboardCard(
  items: readonly AudioCueItem[],
  getFilter: () => AudioFilterId,
  setFilter: (f: AudioFilterId) => void,
  getQuery: () => string,
  setQuery: (q: string) => void,
  getSelected: () => AudioCueItem,
  onPick: (item: AudioCueItem) => void,
) {
  const searchInput = h('input', {
    class: 'al-search',
    type: 'search',
    placeholder: 'Filter cues (e.g. taunt, key, door, floor)...',
    'aria-label': 'Filter cues',
  }) as HTMLInputElement;
  const filterRow = h('div', { class: 'al-filters' });
  const cueList = h('ul', { class: 'al-cues', 'aria-label': 'Sound and music cues' });

  const renderFilters = (): void => {
    clear(filterRow);
    for (const f of AUDIO_FILTERS) {
      filterRow.append(
        h('button', {
          type: 'button',
          class: 'al-chip',
          'data-filter': f.id,
          'aria-pressed': String(getFilter() === f.id),
          onclick: () => { setFilter(f.id); renderFilters(); renderList(); },
        }, f.label),
      );
    }
  };

  const renderList = (): void => {
    clear(cueList);
    const activeId = getSelected().id;
    for (const item of filterCatalogItems(items, getFilter(), getQuery())) {
      const tags = h(
        'span',
        { class: 'al-tags' },
        item.trimmed ? h('span', { class: 'al-tag trim' }, 'trim') : null,
        item.loop ? h('span', { class: 'al-tag loop' }, 'loop') : null,
        item.group === 'music' ? h('span', { class: 'al-tag music' }, 'mus') : null,
      );
      const btn = h(
        'button',
        { type: 'button', class: `al-cue-btn${item.id === activeId ? ' active' : ''}`, 'data-cue': item.id, onclick: () => onPick(item) },
        h('span', {}, item.id),
        tags,
      );
      cueList.append(h('li', {}, btn));
    }
  };

  searchInput.oninput = () => { setQuery(searchInput.value); renderList(); };
  renderFilters();
  renderList();
  return {
    card: h('section', { class: 'al-card', 'aria-label': 'Soundboard' }, h('h3', {}, 'Soundboard'), searchInput, filterRow, cueList),
    renderList,
  };
}

function buildTopControls(
  initialVol: number,
  onMute: (m: boolean) => void,
  onVolume: (v: number) => void,
  onStopAll: () => void,
) {
  let isMuted = false;
  const muteBtn = h('button', { type: 'button', id: 'al-mute', class: 'btn small', 'aria-pressed': 'false' }, 'Mute');
  muteBtn.onclick = () => {
    isMuted = !isMuted;
    onMute(isMuted);
    muteBtn.setAttribute('aria-pressed', String(isMuted));
    muteBtn.textContent = isMuted ? 'Muted' : 'Mute';
  };
  const volRange = h('input', { id: 'al-vol', type: 'range', min: '0', max: '1', step: '0.05', value: String(initialVol), 'aria-label': 'Master volume' }) as HTMLInputElement;
  volRange.oninput = () => onVolume(Number(volRange.value));
  const stopAll = h('button', { type: 'button', id: 'al-stop', class: 'btn small' }, 'Stop Bed & Loops');
  stopAll.onclick = onStopAll;
  return h('div', { class: 'al-top-ctrl' }, muteBtn, volRange, stopAll);
}

function mountAudioLabShell(
  root: HTMLElement,
  sfxCount: number,
  musicCount: number,
  bedBadge: HTMLElement,
  topCtrl: HTMLElement,
  boardEl: HTMLElement,
  waveformEl: HTMLElement,
  mixerEl: HTMLElement,
  busEl: HTMLElement,
): void {
  const top = h(
    'header',
    { class: 'al-top' },
    h('a', { class: 'al-back', href: '/dev' }, '<- DEV'),
    h('b', {}, 'AUDIO ', h('span', {}, 'LAB')),
    h('span', { class: 'al-note' }, `${sfxCount} SFX · ${musicCount} Music`),
    h('span', { class: 'al-spacer' }),
    bedBadge,
    topCtrl,
  );
  const grid = h(
    'main',
    { class: 'al-grid' },
    h('aside', { class: 'al-col' }, boardEl),
    h('section', { class: 'al-col' }, waveformEl, mixerEl),
    h('aside', { class: 'al-col' }, busEl),
  );
  root.replaceChildren(h('div', { class: 'al-shell' }, top, grid));
}

type WaveformHandle = ReturnType<typeof createWaveformPanel>;

function findCueOrThrow(items: readonly AudioCueItem[], id: string): AudioCueItem {
  const hit = items.find((i) => i.id === id);
  if (!hit) throw new Error(`unknown audio cue "${id}"`);
  return hit;
}

function triggerCue(hit: AudioCueItem, opts: { raw?: boolean } | undefined, waveform: WaveformHandle, observed: AudioGraph): Promise<void> | void {
  if (opts?.raw !== undefined) return waveform.playBuffer(opts.raw);
  if (isSfxId(hit.id)) observed.play(hit.id);
  else if (isMusicId(hit.id)) observed.bed(hit.id);
}

interface SnapshotFields {
  selected: AudioCueItem;
  filter: AudioFilterId;
  query: string;
  waveform: WaveformHandle;
  sfxCount: number;
  musicCount: number;
  items: readonly AudioCueItem[];
  muted: boolean;
  volume: number;
  currentScene: MusicScene | null;
  currentBed: MusicId | null;
  activeLoops: AudioLabSnapshot['activeLoops'];
  recentCues: readonly string[];
}

function makeSnapshot(s: SnapshotFields): AudioLabSnapshot {
  return {
    selectedCue: s.selected.id,
    selectedGroup: s.selected.group,
    filter: s.filter,
    query: s.query,
    trim: s.waveform.getTrim(s.selected.id),
    durationSec: s.waveform.currentDuration(),
    waveformBins: s.waveform.peakSamples(),
    sfxCount: s.sfxCount,
    musicCount: s.musicCount,
    visibleCount: filterCatalogItems(s.items, s.filter, s.query).length,
    muted: s.muted,
    volume: s.volume,
    currentScene: s.currentScene,
    currentBed: s.currentBed,
    activeLoops: s.activeLoops,
    recentCues: [...s.recentCues],
  };
}

export function startAudioLab(root: HTMLElement): AudioLabHandle {
  const items = buildCatalogItems();
  const sfxCount = items.filter((i) => i.group === 'sfx').length;
  const musicCount = items.filter((i) => i.group === 'music').length;
  const recentCues: string[] = [];

  let filter: AudioFilterId = 'all';
  let query = '';
  let selected: AudioCueItem = items[0]!;
  let muted = false;
  let volume = 0.85;
  let currentScene: MusicScene | null = null;
  let currentBed: MusicId | null = null;

  const rawGraph = createGraph(SOUND_SOURCES, TYPING_SOUND_SOURCES, TYPING_MIN_INTERVAL_MS);
  rawGraph.setVolume(volume);
  const bus = createAppBus();
  const recordCue = (id: string): void => {
    recentCues.unshift(id);
    if (recentCues.length > 25) recentCues.length = 25;
  };

  let inSceneEmit = false;
  const bedBadge = h('span', { class: 'al-badge' }, 'BED: NONE');
  const busTester = createBusTesterPanel({ onScene: (scene) => handleScene(scene), onEmit: (ev) => handleEmit(ev) });
  const observed = makeObservedGraph(
    rawGraph,
    (op, summary, cls) => { recordCue(summary); busTester.record({ kind: op, summary, cls }); },
    (id) => {
      currentBed = id;
      bedBadge.textContent = `BED: ${id ?? 'NONE'}`;
      if (!inSceneEmit && currentScene !== null) {
        currentScene = null;
        busTester.setSceneState(null);
      }
    },
  );
  const unsubBus = attachOrchestrators(bus, observed);

  const waveform = createWaveformPanel((id, raw) => {
    recordCue(`${id}${raw ? ':raw' : ':trimmed'}`);
    busTester.record({ kind: 'wave', summary: `${raw ? 'raw' : 'trimmed'} -> ${id}`, cls: '' });
  });
  const mixer = createMixerPanel((id, on) => observed.loop(id, on), (id) => observed.play(id));

  const board = createSoundboardCard(
    items,
    () => filter,
    (f) => { filter = f; },
    () => query,
    (q) => { query = q; },
    () => selected,
    (item) => {
      void selectCueItem(item);
      if (isSfxId(item.id)) observed.play(item.id);
      else if (isMusicId(item.id)) observed.bed(item.id);
    },
  );
  async function selectCueItem(item: AudioCueItem): Promise<void> {
    selected = item;
    board.renderList();
    await waveform.loadCue(item);
  }

  const handleScene = (scene: MusicScene | null): void => {
    currentScene = scene;
    busTester.setSceneState(scene);
    if (scene) {
      inSceneEmit = true;
      try {
        bus.emit({ kind: 'scene', scene });
      } finally {
        inSceneEmit = false;
      }
    } else observed.bed(null);
  };
  const handleEmit = (ev: AppEvent): void => {
    if (ev.kind === 'scene') { handleScene(ev.scene); return; }
    if (sfxFor(ev).length === 0) busTester.record({ kind: ev.kind, summary: `emit(${ev.kind}) -> (no sfx)`, cls: '' });
    bus.emit(ev);
  };

  const topCtrl = buildTopControls(
    volume,
    (m) => { muted = m; observed.setMuted(m); },
    (v) => { volume = v; observed.setVolume(v); },
    () => {
      observed.bed(null);
      for (const id of Object.keys(mixer.activeLoops())) if (isSfxId(id)) mixer.setLoop(id, false);
    },
  );
  mountAudioLabShell(root, sfxCount, musicCount, bedBadge, topCtrl, board.card, waveform.el, mixer.el, busTester.el);
  const ready = selectCueItem(selected);
  const requireCue = (id: string): AudioCueItem => findCueOrThrow(items, id);

  return {
    ready,
    async selectCue(id) {
      await selectCueItem(requireCue(id));
    },
    async playCue(id, opts) {
      const hit = requireCue(id);
      await selectCueItem(hit);
      await triggerCue(hit, opts, waveform, observed);
    },
    setTrim: (id, trim) => waveform.setTrim(id, trim),
    setLoop(id, on, gain) {
      if (!isSfxId(id)) throw new Error(`unknown sfx cue "${id}"`);
      mixer.setLoop(id, on, gain);
    },
    testScene: handleScene,
    emit: handleEmit,
    state: () => makeSnapshot({
      selected, filter, query, waveform, sfxCount, musicCount, items, muted, volume,
      currentScene, currentBed, activeLoops: mixer.activeLoops(), recentCues,
    }),
    dispose() { unsubBus(); waveform.dispose(); observed.dispose(); },
  };
}
