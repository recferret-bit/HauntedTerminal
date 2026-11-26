import { readChapterProgress } from '../chapters/catalog.js';
import type { ChapterLevelSummary, ChapterManifest } from '../chapters/types.js';
import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';
import type { GameSnapshot } from '../game/types.js';
import { buildBoardNodes, syncBoardSelection } from './chapter-map-hardware.js';
import {
  buildMotherboardTopology,
  resolveLevelByQuery,
  resolveMapManifest,
  type MotherboardBlock,
  type MotherboardTopology,
} from './chapter-map-model.js';
import { mountMapSparkOverlay } from './chapter-map-sparks.js';
import { el, setText } from './dom-lite.js';
import { createNativeModal } from './modal-dialog.js';

export interface ChapterMapHandlers {
  getManifest?(): ChapterManifest | undefined;
  getCurrentLevelId?(): string | null;
  hasUnsavedLevelProgress?(): boolean;
  onDeploy(level: ChapterLevelSummary, chapterId: string): void;
  onOpen?(): void;
  onClose?(returnFocus: HTMLElement | null): void;
  onMove?(): void;
}

export interface ChapterMapDialog {
  open(queryOrIndex?: string | number): void;
  close(): void;
  isOpen(): boolean;
  update(snap: GameSnapshot): void;
}

export type ChapterMapMode = 'closed' | 'browsing' | 'confirming';
export type ChapterMapEvent = 'OPEN' | 'CLOSE' | 'SELECT' | 'ARM_DEPLOY' | 'CANCEL_DEPLOY';

export const CHAPTER_MAP_TRANSITIONS: TransitionTable<ChapterMapMode, ChapterMapEvent> = {
  closed: { OPEN: 'browsing' },
  browsing: { CLOSE: 'closed', SELECT: 'browsing', ARM_DEPLOY: 'confirming' },
  confirming: { CLOSE: 'closed', SELECT: 'browsing', CANCEL_DEPLOY: 'browsing' },
};

export function createChapterMapMachine(): StateMachine<ChapterMapMode, ChapterMapEvent> {
  return createStateMachine({ initial: 'closed', transitions: CHAPTER_MAP_TRANSITIONS });
}

/** Stable structural key for board DOM caching: unchanged clock ticks never rebuild the PCB DOM. */
export function chapterMapTopologyKey(topo: MotherboardTopology): string {
  const parts = topo.orderedBlocks.map(
    (b) => `${b.level.id}:${b.status}:${b.record?.bestRank ?? ''}:${b.record?.bestCommands ?? ''}:${b.record?.bestTimeSec ?? ''}:${b.record?.chaosCleared ? 1 : 0}`,
  );
  return `${topo.manifest.id}|${topo.clearedCount}/${topo.totalCount}|${parts.join(',')}`;
}

interface MapParts {
  dialog: HTMLDialogElement;
  progLeds: HTMLElement;
  progressBadge: HTMLElement;
  board: HTMLElement;
  boardInner: HTMLElement;
  inspector: HTMLElement;
  inspBadge: HTMLElement;
  inspStatus: HTMLElement;
  inspTitle: HTMLElement;
  inspSummary: HTMLElement;
  inspBest: HTMLElement;
  inspMeta: HTMLElement;
  inspTeaches: HTMLElement;
  inspThreats: HTMLElement;
  deployBtn: HTMLButtonElement;
  confirmRow: HTMLElement;
  confirmNote: HTMLElement;
  confirmYes: HTMLButtonElement;
  confirmNo: HTMLButtonElement;
  xBtn: HTMLButtonElement;
}

const DISPOSERS = new WeakMap<Element, () => void>();

function buildDialogParts(): MapParts {
  const title = el('h2', 'cm-title', ['CHAPTER CIRCUIT MAP']);
  title.id = 'cm-title';
  const progLeds = el('div', 'cm-prog-leds');
  progLeds.setAttribute('aria-hidden', 'true');
  const progressBadge = el('span', 'cm-progress-badge');
  progressBadge.id = 'cm-progress-badge';

  const xBtn = el('button', 'cm-x', ['×']) as HTMLButtonElement;
  xBtn.type = 'submit';
  xBtn.value = 'close';
  xBtn.id = 'cm-close-x';
  xBtn.setAttribute('aria-label', 'Close chapter motherboard map');

  const head = el('header', 'cm-head', [
    el('div', 'cm-head-left', [title]),
    el('div', 'cm-head-right', [progLeds, progressBadge, xBtn]),
  ]);

  const boardInner = el('div', 'cm-board-inner');
  const board = el('div', 'cm-board', [boardInner]);
  board.id = 'cm-board';
  board.setAttribute('role', 'region');
  board.setAttribute('aria-label', 'Motherboard circuit layout');

  const inspBadge = el('span', 'cm-insp-badge');
  const inspStatus = el('span', 'cm-insp-status');
  const inspTitle = el('h3', 'cm-insp-title');
  inspTitle.id = 'cm-insp-title';
  const inspSummary = el('p', 'cm-insp-summary');
  const inspBest = el('div', 'cm-insp-best');
  const inspMeta = el('dl', 'cm-insp-meta');
  const inspTeaches = el('div', 'cm-chip-row');
  const inspThreats = el('div', 'cm-chip-row');

  const deployBtn = el('button', 'cm-deploy-btn', ['Deploy to Level']) as HTMLButtonElement;
  deployBtn.type = 'button';
  deployBtn.id = 'cm-deploy-btn';
  const confirmNote = el('p', 'cm-confirm-note', ['Drop current sector progress and deploy?']);
  const confirmYes = el('button', 'cm-confirm-yes', ['Confirm Deploy']) as HTMLButtonElement;
  confirmYes.type = 'button';
  confirmYes.id = 'cm-confirm-yes';
  const confirmNo = el('button', 'cm-confirm-no', ['Cancel']) as HTMLButtonElement;
  confirmNo.type = 'button';
  confirmNo.id = 'cm-confirm-no';
  const confirmRow = el('div', 'cm-confirm-row hidden', [confirmNote, confirmYes, confirmNo]);
  confirmRow.id = 'cm-confirm-row';

  const inspector = el('aside', 'cm-inspector', [
    el('div', 'cm-insp-head', [inspBadge, inspStatus]),
    inspTitle,
    inspSummary,
    inspBest,
    inspMeta,
    el('div', 'cm-insp-group', [el('div', 'cm-insp-label', ['SHELL BUS']), inspTeaches]),
    el('div', 'cm-insp-group', [el('div', 'cm-insp-label', ['THREATS']), inspThreats]),
    el('div', 'cm-insp-actions', [deployBtn, confirmRow]),
  ]);
  inspector.id = 'cm-inspector';
  inspector.setAttribute('aria-live', 'polite');

  const workspace = el('div', 'cm-workspace', [board, inspector]);
  const form = el('form', 'cm-form', [head, workspace]) as HTMLFormElement;
  form.setAttribute('method', 'dialog');
  const dialog = el('dialog', 'chapter-map-dialog', [form]) as HTMLDialogElement;
  dialog.id = 'chapter-map-dialog';
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'cm-title');

  return {
    dialog,
    progLeds,
    progressBadge,
    board,
    boardInner,
    inspector,
    inspBadge,
    inspStatus,
    inspTitle,
    inspSummary,
    inspBest,
    inspMeta,
    inspTeaches,
    inspThreats,
    deployBtn,
    confirmRow,
    confirmNote,
    confirmYes,
    confirmNo,
    xBtn,
  };
}

function renderProgressHeader(p: MapParts, topo: MotherboardTopology): void {
  setText(p.progressBadge, `${topo.clearedCount}/${topo.totalCount} CLEARED`);
  p.progLeds.replaceChildren(...topo.orderedBlocks.map((b) => el('span', `cm-prog-seg ${b.status}`)));
}

function renderSummaryWithCode(target: HTMLElement, text: string): void {
  const parts = text.split(/`([^`]+)`/g);
  const nodes: (Node | string)[] = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!;
    if (!seg) continue;
    nodes.push(i % 2 === 1 ? el('code', 'cm-inline-code', [seg]) : seg);
  }
  target.replaceChildren(...nodes);
}

function renderInspector(p: MapParts, topo: MotherboardTopology, block: MotherboardBlock, confirmOpen: boolean): void {
  const { level, status, chipPackage, record, grants, summary } = block;
  const lvlPad = String(level.index).padStart(2, '0');
  setText(p.inspBadge, `${chipPackage} // LVL ${lvlPad}/${String(topo.totalCount).padStart(2, '0')}`);
  p.inspStatus.className = `cm-insp-status ${status}`;
  const inspLabel =
    status === 'current'
      ? '◉ CURRENT'
      : record?.cleared
        ? `CLEARED • ${record.bestRank}`
        : status === 'ready'
          ? 'OPENED'
          : 'UNKNOWN';
  setText(p.inspStatus, inspLabel);
  setText(p.inspTitle, level.title);
  renderSummaryWithCode(p.inspSummary, summary);

  if (record?.cleared) {
    p.inspBest.classList.remove('hidden');
    setText(
      p.inspBest,
      `BEST: Rank ${record.bestRank} · ${record.bestCommands} cmd · ${record.bestTimeSec}s${record.chaosCleared ? ' · Chaos' : ''}`,
    );
  } else {
    p.inspBest.classList.add('hidden');
  }

  const metaPairs: Array<[string, string]> = [
    ['Path', level.cwd],
    ['Type', level.mechanicLabel],
    ['Threat', `${'*'.repeat(level.difficulty)}${'-'.repeat(5 - level.difficulty)} (${level.difficulty}/5)`],
    ['Grants', grants.length ? grants.join(' · ') : 'None'],
  ];
  p.inspMeta.replaceChildren(
    ...metaPairs.flatMap(([k, v]) => [el('dt', '', [k]), el('dd', '', [k === 'Path' ? el('code', '', [v]) : v])]),
  );

  p.inspTeaches.replaceChildren(
    ...(level.teaches.length ? level.teaches.map((t) => el('span', 'cm-chip code', [t])) : [el('span', 'cm-chip code', ['shell'])]),
  );
  p.inspThreats.replaceChildren(
    ...(level.enemies.length
      ? level.enemies.map((e) => el('span', 'cm-chip enemy', [`malware.${e}`]))
      : [el('span', 'cm-chip safe', ['0 hostiles'])]),
  );

  setText(p.deployBtn, status === 'current' ? `Reload Level ${lvlPad} >` : `Deploy to Level ${lvlPad} >`);
  setText(p.confirmYes, `Confirm Level ${lvlPad}`);
  p.confirmRow.classList.toggle('hidden', !confirmOpen);
  p.deployBtn.classList.toggle('hidden', confirmOpen);
}

function findBlockBtn(board: HTMLElement, id: string): HTMLButtonElement | undefined {
  return [...board.querySelectorAll<HTMLButtonElement>('.cm-block')].find((b) => b.dataset.levelId === id);
}

interface MapWireDeps {
  isOpen: () => boolean;
  getTopology: () => MotherboardTopology;
  getSelectedId: () => string;
  selectLevel: (id: string) => void;
  triggerDeploy: (forceDirect?: boolean) => void;
  cancelConfirm: () => void;
}

function wireMapControls(p: MapParts, d: MapWireDeps): void {
  p.dialog.addEventListener?.('keydown', (e: KeyboardEvent) => {
    if (!d.isOpen()) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return;
    const blocks = d.getTopology().orderedBlocks;
    if (!blocks.length) return;
    e.preventDefault();
    const idx = Math.max(0, blocks.findIndex((b) => b.level.id === d.getSelectedId()));
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = blocks[(idx + delta + blocks.length) % blocks.length]!;
    d.selectLevel(next.level.id);
    findBlockBtn(p.boardInner, next.level.id)?.focus({ preventScroll: true });
  });
  p.deployBtn.onclick = () => d.triggerDeploy(false);
  p.confirmYes.onclick = () => d.triggerDeploy(true);
  p.confirmNo.onclick = d.cancelConfirm;
}

/**
 * Motherboard-styled Chapter Map popup dialog (`#chapter-map-dialog`) sized to viewport height.
 * Blocks terminal input while open without pausing the game clock or 30s battle turn timer.
 */
export function mountChapterMap(host: HTMLElement, handlers: ChapterMapHandlers): ChapterMapDialog {
  const prev = host.querySelector('#chapter-map-dialog');
  if (prev) {
    DISPOSERS.get(prev)?.();
    prev.remove();
  }
  const p = buildDialogParts();
  host.appendChild(p.dialog);

  const sparks = mountMapSparkOverlay(p.board);
  DISPOSERS.set(p.dialog, () => sparks.dispose());

  let selectedId = '';
  let lastBoardKey = '';
  const fsm = createChapterMapMachine();
  let topology: MotherboardTopology | null = null;

  const currentTopology = (): MotherboardTopology => {
    const manifest = resolveMapManifest(undefined, handlers.getManifest?.());
    topology = buildMotherboardTopology(manifest, readChapterProgress(), handlers.getCurrentLevelId?.() ?? null);
    return topology;
  };
  const selectedBlock = (topo: MotherboardTopology): MotherboardBlock =>
    topo.orderedBlocks.find((b) => b.level.id === selectedId) ?? topo.orderedBlocks[0]!;

  const modal = createNativeModal(p.dialog, [p.xBtn], (back) => {
    sparks.stop();
    fsm.send('CLOSE');
    handlers.onClose?.(back);
  });

  const syncAll = (forceBoard: boolean): void => {
    const topo = currentTopology();
    const block = selectedBlock(topo);
    selectedId = block.level.id;
    const key = chapterMapTopologyKey(topo);
    if (forceBoard || key !== lastBoardKey) {
      lastBoardKey = key;
      renderProgressHeader(p, topo);
      p.boardInner.replaceChildren(...buildBoardNodes(topo, selectedId, selectLevel, quickDeploy));
      syncBoardSelection(p.boardInner, block);
      sparks.syncWires();
    } else {
      syncBoardSelection(p.boardInner, block);
      sparks.syncStates();
    }
    renderInspector(p, topo, block, fsm.state === 'confirming');
  };

  const applySelection = (id: string): void => {
    selectedId = id;
    fsm.send('SELECT');
    const topo = topology ?? currentTopology();
    const block = selectedBlock(topo);
    syncBoardSelection(p.boardInner, block);
    sparks.syncStates();
    renderInspector(p, topo, block, false);
  };

  const selectLevel = (id: string): void => {
    if (selectedId === id) return;
    handlers.onMove?.();
    applySelection(id);
  };

  const triggerDeploy = (forceDirect = false): void => {
    const topo = topology ?? currentTopology();
    const block = selectedBlock(topo);
    if (!forceDirect && handlers.hasUnsavedLevelProgress?.()) {
      if (fsm.state === 'browsing') {
        fsm.send('ARM_DEPLOY');
        handlers.onMove?.();
        renderInspector(p, topo, block, true);
      }
      p.confirmNo.focus?.({ preventScroll: true });
      return;
    }
    modal.close();
    handlers.onDeploy(block.level, topo.manifest.id);
  };

  const quickDeploy = (id: string): void => {
    applySelection(id);
    triggerDeploy(false);
  };

  wireMapControls(p, {
    isOpen: modal.isOpen,
    getTopology: () => topology ?? currentTopology(),
    getSelectedId: () => selectedId,
    selectLevel,
    triggerDeploy,
    cancelConfirm: () => {
      fsm.send('CANCEL_DEPLOY');
      handlers.onMove?.();
      const topo = topology ?? currentTopology();
      renderInspector(p, topo, selectedBlock(topo), false);
      p.deployBtn.focus?.({ preventScroll: true });
    },
  });

  return {
    open(queryOrIndex) {
      const wasOpen = modal.isOpen();
      const topo = currentTopology();
      selectedId = resolveLevelByQuery(topo.manifest, queryOrIndex, handlers.getCurrentLevelId?.() ?? null).id;
      if (wasOpen) fsm.send('SELECT');
      else fsm.send('OPEN');
      syncAll(!lastBoardKey);
      modal.open(findBlockBtn(p.boardInner, selectedId) ?? p.xBtn);
      sparks.start();
      window.requestAnimationFrame?.(() => {
        if (modal.isOpen()) sparks.syncWires();
      });
      if (!wasOpen) handlers.onOpen?.();
    },
    close: modal.close,
    isOpen: modal.isOpen,
    update() {
      if (!modal.isOpen()) return;
      const topo = currentTopology();
      const key = chapterMapTopologyKey(topo);
      if (key === lastBoardKey) return;
      syncAll(true);
    },
  };
}
