import { readChapterProgress } from '../chapters/catalog.js';
import type { ChapterLevelSummary, ChapterManifest } from '../chapters/types.js';
import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';
import type { GameSnapshot } from '../game/types.js';
import {
  buildCurrentBeacon,
  buildDimmPostBay,
  buildFanDipBay,
  buildPcbBackdropDecor,
  buildPciStorageBay,
  buildVrmPowerBay,
} from './chapter-map-hardware.js';
import {
  buildMotherboardTopology,
  resolveLevelByQuery,
  resolveMapManifest,
  type MotherboardBlock,
  type MotherboardChannel,
  type MotherboardTopology,
} from './chapter-map-model.js';
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

interface MapParts {
  dialog: HTMLDialogElement;
  issueBadge: HTMLElement;
  progressBadge: HTMLElement;
  board: HTMLElement;
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
  closeBtn: HTMLButtonElement;
  xBtn: HTMLButtonElement;
}

function buildBlockButton(
  block: MotherboardBlock,
  selectedId: string,
  onSelect: (id: string) => void,
  onQuickDeploy: (id: string) => void,
): HTMLButtonElement {
  const { level, status, chipPackage, record, grants } = block;
  const selected = level.id === selectedId;
  const cls = `cm-block pkg-${level.mechanic} status-${status}${selected ? ' selected' : ''}`;
  const numText = `LVL ${String(level.index).padStart(2, '0')}`;
  const threatLabel =
    level.enemies.length > 0
      ? `${level.enemies.length} THREAT${level.enemies.length > 1 ? 'S' : ''}`
      : 'SAFE';
  const stateTag =
    status === 'current'
      ? '◉ ACTIVE // HERE'
      : status === 'cleared'
        ? `RANK ${record?.bestRank ?? 'S'}`
        : status === 'ready'
          ? `OPENED · ${threatLabel}`
          : 'LOCKED // UNKNOWN';

  const top = el('div', 'cm-block-top', [
    el('span', 'cm-led'),
    el('span', 'cm-block-num', [numText]),
    el('span', 'cm-block-pkg', [chipPackage]),
  ]);
  const title = el('strong', 'cm-block-title', [level.title]);
  const cwd = el('code', 'cm-block-cwd', [level.cwd]);
  const footChildren: (Node | string)[] = [el('span', `cm-block-state ${status}`, [stateTag])];
  if (grants.length > 0) footChildren.push(el('span', 'cm-block-grant', [grants[0]!]));
  const foot = el('div', 'cm-block-foot', footChildren);

  const btn = el('button', cls, [
    el('span', 'cm-pins-l'),
    el('span', 'cm-pins-r'),
    ...(status === 'current' ? [buildCurrentBeacon()] : []),
    top,
    title,
    cwd,
    foot,
  ]) as HTMLButtonElement;
  btn.type = 'button';
  btn.dataset.levelId = level.id;
  btn.dataset.levelIndex = String(level.index);
  btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  btn.setAttribute('aria-label', `${numText}: ${level.title} (${status})`);
  btn.onclick = () => onSelect(level.id);
  btn.ondblclick = () => onQuickDeploy(level.id);
  return btn;
}

function buildWire(label: string, powered: boolean, toHub = false, activeFlow = false): HTMLElement {
  const cls = `cm-wire${powered ? ' powered' : ''}${toHub ? ' to-hub' : ''}${activeFlow ? ' active-flow' : ''}`;
  return el('div', cls, [
    el('span', 'cm-wire-line', powered || activeFlow ? [el('span', 'cm-wire-pulse')] : []),
    el('span', 'cm-wire-tag', [label]),
    el('span', 'cm-wire-arrow', ['>']),
  ]);
}

function buildChannelRow(
  channel: MotherboardChannel,
  selectedId: string,
  onSelect: (id: string) => void,
  onQuickDeploy: (id: string) => void,
): HTMLElement {
  const chState = channel.hasCurrent ? '◉ ACTIVE BUS' : channel.powered ? 'ONLINE' : 'OFFLINE // UNPROBED';
  const chCls = channel.hasCurrent ? ' active' : channel.powered ? ' online' : ' offline';
  const head = el('div', 'cm-channel-head', [
    el('span', 'cm-channel-code', [channel.code]),
    el('span', 'cm-channel-bus', [channel.busLabel]),
    el('span', `cm-channel-state${chCls}`, [chState]),
  ]);
  const trackNodes: HTMLElement[] = [];
  channel.taskBlocks.forEach((b, i) => {
    if (i > 0) {
      const prev = channel.taskBlocks[i - 1]!;
      const wirePowered = b.status !== 'unknown' && prev.status !== 'unknown';
      const wireFlow = b.status === 'current' || prev.status === 'current';
      trackNodes.push(buildWire('BUS', wirePowered, false, wireFlow));
    }
    trackNodes.push(buildBlockButton(b, selectedId, onSelect, onQuickDeploy));
  });
  if (channel.hubBlock) {
    if (channel.taskBlocks.length > 0) {
      const grantText = channel.hubBlock.coreGrant ?? 'UPGRADE';
      const lastTask = channel.taskBlocks[channel.taskBlocks.length - 1]!;
      const hubPowered = channel.hubBlock.status !== 'unknown' && lastTask.status !== 'unknown';
      const hubFlow = channel.hubBlock.status === 'current' || lastTask.status === 'current';
      trackNodes.push(buildWire(grantText, hubPowered, true, hubFlow));
    }
    trackNodes.push(buildBlockButton(channel.hubBlock, selectedId, onSelect, onQuickDeploy));
  }
  const track = el('div', 'cm-channel-track', trackNodes);
  return el('section', `cm-channel${channel.powered ? ' powered' : ' unpowered'}${channel.hasCurrent ? ' has-current' : ''}`, [
    head,
    track,
  ]);
}

function buildDialogParts(): MapParts {
  const badge = el('span', 'cm-kicker', ['MOTHERBOARD SCHEMATIC // REV 1.1']);
  const title = el('h2', 'cm-title', ['CHAPTER CIRCUIT MAP']);
  title.id = 'cm-title';
  const issueBadge = el('span', 'cm-issue-badge');
  issueBadge.id = 'cm-issue-badge';
  const progressBadge = el('span', 'cm-progress-badge');
  progressBadge.id = 'cm-progress-badge';

  const xBtn = el('button', 'cm-x', ['×']) as HTMLButtonElement;
  xBtn.type = 'submit';
  xBtn.value = 'close';
  xBtn.id = 'cm-close-x';
  xBtn.setAttribute('aria-label', 'Close chapter motherboard map');

  const headLeft = el('div', 'cm-head-left', [badge, title, issueBadge]);
  const headRight = el('div', 'cm-head-right', [progressBadge, xBtn]);
  const head = el('header', 'cm-head', [headLeft, headRight]);

  const board = el('div', 'cm-board');
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
  const confirmNote = el('p', 'cm-confirm-note', ['Current sector commands will be dropped. Deploy anyway?']);
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
    el('div', 'cm-insp-group', [el('div', 'cm-insp-label', ['TEACHES / SHELL BUS']), inspTeaches]),
    el('div', 'cm-insp-group', [el('div', 'cm-insp-label', ['ACTIVE THREATS']), inspThreats]),
    el('div', 'cm-insp-actions', [deployBtn, confirmRow]),
  ]);
  inspector.id = 'cm-inspector';
  inspector.setAttribute('aria-live', 'polite');

  const workspace = el('div', 'cm-workspace', [board, inspector]);

  const legend = el('div', 'cm-legend', [
    el('span', 'cm-leg-item active', ['ACTIVE (HERE)']),
    el('span', 'cm-leg-item cleared', ['CLEARED']),
    el('span', 'cm-leg-item ready', ['OPENED']),
    el('span', 'cm-leg-item unknown', ['UNKNOWN']),
    el('span', 'cm-leg-hint', ['Arrows: select · F3 / Esc: close']),
  ]);
  const closeBtn = el('button', 'cm-close-btn', ['Close']) as HTMLButtonElement;
  closeBtn.type = 'submit';
  closeBtn.value = 'close';
  closeBtn.id = 'cm-close-btn';
  const foot = el('footer', 'cm-foot', [legend, closeBtn]);

  const form = el('form', 'cm-form', [head, workspace, foot]) as HTMLFormElement;
  form.setAttribute('method', 'dialog');
  const dialog = el('dialog', 'chapter-map-dialog', [form]) as HTMLDialogElement;
  dialog.id = 'chapter-map-dialog';
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'cm-title');

  return {
    dialog,
    issueBadge,
    progressBadge,
    board,
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
    closeBtn,
    xBtn,
  };
}

function renderBoard(
  p: MapParts,
  topo: MotherboardTopology,
  selectedId: string,
  onSelect: (id: string) => void,
  onQuickDeploy: (id: string) => void,
): void {
  const { manifest, bootBlock, channels, coreBlocks, clearedCount, totalCount } = topo;
  const selectedBlock = topo.orderedBlocks.find((b) => b.level.id === selectedId) ?? topo.orderedBlocks[0]!;
  setText(p.issueBadge, `${manifest.badge} // ${totalCount} SECTORS`);
  setText(p.progressBadge, `${clearedCount}/${totalCount} CLEARED`);

  const nodes: HTMLElement[] = [
    buildPcbBackdropDecor(),
    el('span', 'cm-screw tl'),
    el('span', 'cm-screw tr'),
    el('span', 'cm-screw bl'),
    el('span', 'cm-screw br'),
    el('div', 'cm-pcb-header', [
      el('span', 'cm-silk', [`PCB // ${manifest.id.toUpperCase()}`]),
      el('span', 'cm-rails', ['+5V_VRAM · GGUF_BUS · PID1_IRQ · REV_1.1']),
    ]),
  ];

  if (bootBlock) {
    const bootStage = el('section', 'cm-stage cm-stage-boot', [
      el('div', 'cm-socket-tag', ['SOCKET 00 // BOOT ROM']),
      buildBlockButton(bootBlock, selectedId, onSelect, onQuickDeploy),
    ]);
    nodes.push(el('div', 'cm-top-deck', [buildVrmPowerBay(topo), bootStage, buildDimmPostBay(topo, selectedBlock)]));
    if (channels.length > 0) {
      const bridgeActive = bootBlock.status === 'current' || bootBlock.status === 'cleared';
      nodes.push(
        el('div', `cm-bus-bridge${bridgeActive ? ' active-flow' : ''}`, [
          el('span', 'cm-bus-stem'),
          el('span', 'cm-bus-label', ['3-CHANNEL DATA BUS']),
          el('span', 'cm-bus-rail'),
        ]),
      );
    }
  }

  if (channels.length > 0) {
    nodes.push(
      el(
        'div',
        'cm-channels',
        channels.map((ch) => buildChannelRow(ch, selectedId, onSelect, onQuickDeploy)),
      ),
    );
  }

  if (coreBlocks.length > 0) {
    const mergeActive = coreBlocks.some((b) => b.status === 'current' || b.status === 'cleared' || b.status === 'ready');
    const coreStage = el('section', 'cm-stage cm-stage-core', [
      el('div', 'cm-socket-tag core', [`CPU CORE SOCKET // PID ${manifest.boss.pid}`]),
      el('span', 'cm-zif-lever'),
      ...coreBlocks.map((b) => buildBlockButton(b, selectedId, onSelect, onQuickDeploy)),
    ]);
    nodes.push(
      el('div', `cm-bus-bridge merge${mergeActive ? ' active-flow' : ''}`, [
        el('span', 'cm-bus-rail'),
        el('span', 'cm-bus-label', ['NORTHBRIDGE // KERNEL BUS']),
        el('span', 'cm-bus-stem'),
      ]),
      el('div', 'cm-core-deck', [buildPciStorageBay(topo), coreStage, buildFanDipBay(topo)]),
    );
  }

  p.board.replaceChildren(...nodes);
}

function renderInspector(p: MapParts, topo: MotherboardTopology, block: MotherboardBlock, confirmOpen: boolean): void {
  const { manifest } = topo;
  const { level, status, chipPackage, record, grants, summary } = block;
  const lvlPad = String(level.index).padStart(2, '0');
  setText(p.inspBadge, `${chipPackage} // LVL ${lvlPad}/${String(topo.totalCount).padStart(2, '0')}`);
  p.inspStatus.className = `cm-insp-status ${status}`;
  const inspLabel =
    status === 'current'
      ? '◉ CURRENT SECTOR'
      : record?.cleared
        ? `CLEARED • RANK ${record.bestRank}`
        : status === 'ready'
          ? 'OPENED • READY'
          : 'UNKNOWN • UNPROBED';
  setText(p.inspStatus, inspLabel);
  setText(p.inspTitle, level.title);
  setText(p.inspSummary, summary);

  if (record?.cleared) {
    p.inspBest.classList.remove('hidden');
    setText(
      p.inspBest,
      `BEST CLEAR: Rank ${record.bestRank} · ${record.bestCommands} cmd(s) · ${record.bestTimeSec}s${record.chaosCleared ? ' · Chaos' : ''}`,
    );
  } else {
    p.inspBest.classList.add('hidden');
  }

  const metaPairs: Array<[string, string]> = [
    ['Directory', level.cwd],
    ['Room Set', `room.${level.roomKind}`],
    ['Mechanic', level.mechanicLabel],
    ['Difficulty', `${'*'.repeat(level.difficulty)}${'-'.repeat(5 - level.difficulty)} (${level.difficulty}/5)`],
    ['Bus Grants', grants.length ? grants.join(' · ') : 'None (salvage sector)'],
    [level.mechanic === 'boss' ? 'Boss' : 'Ally', level.mechanic === 'boss' ? manifest.boss.name : manifest.allyNpc.name],
  ];
  p.inspMeta.replaceChildren(
    ...metaPairs.flatMap(([k, v]) => [el('dt', '', [k]), el('dd', '', [k === 'Directory' || k === 'Room Set' ? el('code', '', [v]) : v])]),
  );

  p.inspTeaches.replaceChildren(
    ...(level.teaches.length ? level.teaches.map((t) => el('span', 'cm-chip code', [t])) : [el('span', 'cm-chip code', ['shell'])]),
  );
  p.inspThreats.replaceChildren(
    ...(level.enemies.length
      ? level.enemies.map((e) => el('span', 'cm-chip enemy', [`malware.${e}`]))
      : [el('span', 'cm-chip safe', ['0 hostiles (Safe Zone)'])]),
  );

  setText(p.deployBtn, status === 'current' ? `Reload Level ${lvlPad} >` : `Deploy to Level ${lvlPad} >`);
  setText(p.confirmYes, `Confirm Deploy to Level ${lvlPad}`);
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
    findBlockBtn(p.board, next.level.id)?.focus({ preventScroll: true });
  });
  p.deployBtn.onclick = () => d.triggerDeploy(false);
  p.confirmYes.onclick = () => d.triggerDeploy(true);
  p.confirmNo.onclick = d.cancelConfirm;
}

/**
 * Big motherboard-styled Chapter Map popup dialog (`#chapter-map-dialog`).
 * Blocks terminal input while open without pausing the game clock or 30s battle turn timer.
 */
export function mountChapterMap(host: HTMLElement, handlers: ChapterMapHandlers): ChapterMapDialog {
  host.querySelector('#chapter-map-dialog')?.remove();
  const p = buildDialogParts();
  host.appendChild(p.dialog);

  let selectedId = '';
  const fsm = createChapterMapMachine();
  let topology: MotherboardTopology | null = null;

  const currentTopology = (): MotherboardTopology => {
    const manifest = resolveMapManifest(undefined, handlers.getManifest?.());
    topology = buildMotherboardTopology(manifest, readChapterProgress(), handlers.getCurrentLevelId?.() ?? null);
    return topology;
  };
  const selectedBlock = (topo: MotherboardTopology): MotherboardBlock =>
    topo.orderedBlocks.find((b) => b.level.id === selectedId) ?? topo.orderedBlocks[0]!;

  const modal = createNativeModal(p.dialog, [p.closeBtn, p.xBtn], (back) => {
    fsm.send('CLOSE');
    handlers.onClose?.(back);
  });

  const draw = (): void => {
    const topo = currentTopology();
    const block = selectedBlock(topo);
    selectedId = block.level.id;
    renderBoard(p, topo, selectedId, selectLevel, quickDeploy);
    renderInspector(p, topo, block, fsm.state === 'confirming');
  };
  const selectLevel = (id: string): void => {
    if (selectedId === id) return;
    selectedId = id;
    fsm.send('SELECT');
    handlers.onMove?.();
    draw();
  };
  const triggerDeploy = (forceDirect = false): void => {
    const topo = topology ?? currentTopology();
    const block = selectedBlock(topo);
    if (!forceDirect && handlers.hasUnsavedLevelProgress?.() && fsm.state === 'browsing') {
      fsm.send('ARM_DEPLOY');
      handlers.onMove?.();
      renderInspector(p, topo, block, true);
      p.confirmNo.focus?.({ preventScroll: true });
      return;
    }
    modal.close();
    handlers.onDeploy(block.level, topo.manifest.id);
  };
  const quickDeploy = (id: string): void => {
    selectedId = id;
    fsm.send('SELECT');
    draw();
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
      draw();
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
      draw();
      modal.open(findBlockBtn(p.board, selectedId) ?? p.closeBtn);
      if (!wasOpen) handlers.onOpen?.();
    },
    close: modal.close,
    isOpen: modal.isOpen,
    update() {
      if (modal.isOpen()) draw();
    },
  };
}
