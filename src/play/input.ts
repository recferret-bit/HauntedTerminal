import '../styles/manual-book.css';
import { publishKernel } from '../contracts/app-bus.js';
import type { KernelEvent } from '../contracts/events.js';
import { buildPlayUrl, getChapterPack } from '../chapters/catalog.js';
import { isChapterSession } from '../chapters/chapter-session.js';
import { findComixByRole, playComix, type ComixRole } from '../cinematic/index.js';
import { mountDevInspector } from '../sandbox/dev-inspector.js';
import { mountChapterMap } from '../ui/chapter-map.js';
import { mountCodeEditor } from '../ui/code-editor.js';
import { mountDialogOrchestrator } from '../ui/dialog-orchestrator.js';
import { mountHintDialog } from '../ui/hint-dialog.js';
import { mountHud } from '../ui/hud.js';
import { mountManualBook } from '../ui/manual-book.js';
import { drawPortrait } from '../renderer/portrait.js';
import { powerOff, powerOn } from '../ui/screen.js';
import { colourise, mountShell } from '../ui/terminal.js';
import { mountVisualLab } from '../ui/visual-lab.js';
import { holdForComix, mountPlayAudio, syncPlayAudio } from './audio-sync.js';
import { routeModalAction } from './events.js';
import { closeLaptop, isLaptopOpen, openLaptop } from './laptop.js';
import { recordExec } from './lab.js';
import { finishPlayLevelTransition } from './loop.js';
import { mountPlayMenu } from './menu.js';
import { runOverlay, statsFrom } from './outro.js';
import { anyModalOpen, chapterBanner, closeOtherModals, FLOOR_NAMES, STORY, writeSkipPref, type Play } from './state.js';

/** Enter during the battle intro skips it; the typed line stays on the prompt and does not run (Req 12). */
function skipBattleIntroOnEnter(play: Play): boolean {
  if (play.lifecycle.phase() !== 'play' || !isChapterSession(play.session)) return false;
  const res = play.session.skipBattleIntro();
  if (!res) return false;
  play.events.emit({ kind: 'apply-tick', res });
  return true;
}

function runShellLine(play: Play, line: string): { output: string; clear?: boolean; stderr?: string } {
  if (play.lifecycle.phase() !== 'play') return { output: '' };
  const session = play.session;
  const res = session.exec(line);
  recordExec(play, line, res);
  play.execTaunts = [];
  let extra: string[];
  try {
    play.events.emit({ kind: 'apply-events', events: res.events, snap: res.snapshot, printed: res.output });
    if (isChapterSession(session) && play.codeEditor) {
      const edReq = session.consumeEditorRequest();
      if (edReq) {
        session.holdTurnTimer('editor', true);
        play.codeEditor.open(edReq);
        play.session.bus?.emit({ kind: 'menu', action: 'open' });
      }
    }
    const skinReq = session.consumeSkinRequest?.();
    if (skinReq) play.events.emit({ kind: 'skin-change', id: skinReq });
    const manualReq = session.consumeManualRequest?.();
    if (manualReq !== null && manualReq !== undefined && !play.terminalLab) {
      play.events.emit({ kind: 'modal', modal: 'manual', action: 'open', query: manualReq });
    }
    const mapReq = session.consumeMapRequest?.();
    if (mapReq !== null && mapReq !== undefined && !play.terminalLab) {
      play.events.emit({ kind: 'modal', modal: 'map', action: 'open', query: mapReq });
    }
  } finally {
    extra = play.execTaunts ?? [];
    play.execTaunts = null;
  }
  if (extra.length > 0) {
    const sep = res.output && !res.output.endsWith('\n') ? '\n' : '';
    return { output: `${res.output}${sep}${extra.join('\n')}\n`, clear: res.clear, stderr: res.stderr };
  }
  return { output: res.output, clear: res.clear, stderr: res.stderr };
}

function handleNonPausingModalClose(play: Play): void {
  play.events.emit({ kind: 'sync-pause' });
  syncPlayAudio(play);
  window.setTimeout(() => {
    if (play.lifecycle.phase() === 'play' && !anyModalOpen(play)) {
      play.shell.focus();
    }
  }, 0);
}

export function mountPlayShell(play: Play): void {
  mountPlayAudio(play);
  play.shell = mountShell(play.dom.termEl, {
    run: (line) => runShellLine(play, line),
    complete: (before) => play.session.complete(before),
    prompt() {
      const snap = play.session.snapshot();
      return { cwd: snap.cwd, gold: snap.promptGold };
    },
    onEnter: () => skipBattleIntroOnEnter(play),
    onAudibleKey: (key) => play.session.bus?.emit({ kind: 'key', key }),
  });
  play.shell.setBlocked(true);
  const pane = play.dom.editorPaneEl;
  const dock = play.dom.termDockEl;
  if (pane && dock) {
    play.codeEditor = mountCodeEditor(pane, dock, {
      onSave: (fileName, content) => {
        if (!isChapterSession(play.session)) return;
        const res = play.session.saveEditableFile(fileName, content);
        play.session.bus?.emit({ kind: 'command', result: res.stderr ? 'fail' : 'ok' });
        if (res.output) play.shell.printAbove(colourise(res.output, res.stderr));
        play.events.emit({ kind: 'apply-events', events: res.events, snap: res.snapshot, printed: res.output });
      },
      onMove: () => play.session.bus?.emit({ kind: 'menu', action: 'move' }),
      onClose: () => {
        play.session.bus?.emit({ kind: 'menu', action: 'close' });
        if (isChapterSession(play.session)) play.session.holdTurnTimer('editor', false);
        if (play.lifecycle.phase() === 'play') window.setTimeout(() => play.shell.focus(), 0);
      },
      onLayoutChange: () => {
        window.requestAnimationFrame(() => {
          play.shell.fit();
          play.stage.resize();
        });
      },
    });
  }
  if (play.dom.manualModalEl) {
    play.manualBook = mountManualBook(play.dom.manualModalEl, {
      modal: true,
      onPageChange: (_page, turned, animated) => {
        if (animated) play.session.bus?.emit(turned ? { kind: 'page' } : { kind: 'menu', action: 'move' });
      },
      onSearchDismiss: () => play.session.bus?.emit({ kind: 'menu', action: 'move' }),
      onInsertCommand: (cmd) => {
        play.events.emit({ kind: 'modal', modal: 'manual', action: 'close' });
        if (play.shell.dialogLocked) return;
        play.shell.setInput(cmd);
        window.setTimeout(() => play.shell.focus(), 0);
      },
      onClose: () => handleNonPausingModalClose(play),
    });
  }
}

function openHintDialog(play: Play): void {
  if (!play.hintDialog || !play.lifecycle.canOpenHint(play.dom.statsEl.classList.contains('open'))) return;
  closeOtherModals(play, 'hint');
  play.hintDialog.open(play.session.snapshot());
}

function openMenuModal(play: Play): void {
  if (!play.menu) return;
  const statsOpen = play.dom.statsEl.classList.contains('open');
  if (!play.lifecycle.canOpenEscMenu(statsOpen) || play.codeEditor?.isOpen()) return;
  closeOtherModals(play, 'menu');
  play.menu.open(play.session.snapshot());
}

function openManualModal(play: Play, queryOrPage?: string | number): void {
  if (!play.manualBook || !play.lifecycle.canOpenManualOrMap()) return;
  if (!play.session.snapshot().inventory.items.includes('manual')) return;
  closeOtherModals(play, 'manual');
  play.manualBook.open(queryOrPage);
  play.events.emit({ kind: 'sync-pause' });
  syncPlayAudio(play);
}

function closeManualModal(play: Play): void {
  if (!play.manualBook?.isOpen()) return;
  play.manualBook.close();
  syncPlayAudio(play);
}

function openChapterMap(play: Play, queryOrIndex?: string | number): void {
  if (!play.chapterMap || !play.lifecycle.canOpenManualOrMap()) return;
  if (!play.session.snapshot().inventory.items.includes('map')) return;
  closeOtherModals(play, 'map');
  play.chapterMap.open(queryOrIndex);
  play.events.emit({ kind: 'sync-pause' });
  syncPlayAudio(play);
}

function closeChapterMap(play: Play): void {
  if (!play.chapterMap?.isOpen()) return;
  play.chapterMap.close();
  syncPlayAudio(play);
}

function playAgain(play: Play, skip: boolean): void {
  if (play.lifecycle.phase() !== 'stats') return;
  play.skipIntroPref = skip;
  writeSkipPref(skip);
  play.hud?.hideStats();
  window.clearTimeout(play.cardTimer);
  finishPlayLevelTransition(play, true);
  play.stashedFloorCard = null;
  play.lifecycle.resetForPlayAgain();
  const res = play.session.restart({ intro: true });
  play.activeBanner = isChapterSession(play.session)
    ? chapterBanner(play.session, getChapterPack(play.session.chapterId)?.manifest)
    : STORY;
  play.shell.reset();
  play.events.emit({ kind: 'apply-events', events: res.events, snap: res.snapshot });
  play.events.emit({ kind: 'run-start' });
}

export function mountPlayHud(play: Play): void {
  const chapter = isChapterSession(play.session) ? play.session : null;
  play.dialogs = mountDialogOrchestrator(play.dom.stageWrap, drawPortrait, {
    tutorial: play.tutorial,
    reducedMotion: () => play.stage.reducedMotion.on,
    onDialogOpen: (line) => play.session.bus?.emit({ kind: 'dialog', speaker: line.speaker }),
  });
  play.dialogBox = play.dialogs.box;
  play.hintDialog = mountHintDialog(play.dom.stageWrap, {
    onClose: (returnFocus) => {
      play.session.bus?.emit({ kind: 'menu', action: 'move' });
      window.setTimeout(() => {
        if (anyModalOpen(play, ['editor'])) return;
        if (play.codeEditor?.isOpen()) {
          const editorTarget = returnFocus?.isConnected && returnFocus.closest('#code-editor-pane')
            ? returnFocus
            : play.dom.editorPaneEl?.querySelector<HTMLElement>('#ce-textarea, textarea');
          editorTarget?.focus({ preventScroll: true });
          return;
        }
        if (play.lifecycle.phase() === 'play') play.shell.focus();
      }, 0);
    },
  });
  play.chapterMap = mountChapterMap(play.dom.stageWrap, {
    getManifest: () => (chapter ? getChapterPack(chapter.chapterId)?.manifest : undefined),
    getCurrentLevelId: () => (chapter ? chapter.getCurrentLevel().id : null),
    hasUnsavedLevelProgress: () => play.session.snapshot().commands > play.levelEntryCommands,
    onMove: () => play.session.bus?.emit({ kind: 'menu', action: 'move' }),
    onOpen: () => play.session.bus?.emit({ kind: 'menu', action: 'open' }),
    onDeploy: (level, chapterId) => {
      if (isChapterSession(play.session)) {
        const res = play.session.jumpToLevel(level.id);
        const arr = play.session.arriveLevel();
        play.activeBanner = chapterBanner(play.session, getChapterPack(play.session.chapterId)?.manifest);
        play.levelEntryCommands = arr.snapshot.commands;
        const printed = [res.output, arr.output].filter(Boolean).join('');
        if (printed) play.shell.printAbove(colourise(printed, arr.stderr ?? res.stderr));
        play.events.emit({ kind: 'apply-events', events: [...res.events, ...arr.events], snap: arr.snapshot, printed });
        const params = new URLSearchParams(location.search);
        const nextUrl = buildPlayUrl(play.session.chapterId, level.id, true, {
          chaos: params.get('chaos') === '1',
          seed: params.get('seed') ?? undefined,
          dev: params.get('dev') === '1',
        });
        window.history.replaceState(null, '', nextUrl);
        window.setTimeout(() => {
          if (play.lifecycle.phase() === 'play') play.shell.focus();
        }, 0);
      } else {
        window.location.assign(buildPlayUrl(chapterId, level.id, true));
      }
    },
    onClose: () => handleNonPausingModalClose(play),
  });
  play.hud = mountHud(play.dom.hudEl, play.dom.stageWrap, play.dom.statsEl, {
    drawPortrait,
    maxFloors: chapter ? chapter.getLevels().length : 5,
    onHint: () => play.events.emit({ kind: 'modal', modal: 'hint', action: 'toggle' }),
    onMap: () => play.events.emit({ kind: 'modal', modal: 'map', action: 'toggle' }),
    onManual: () => play.events.emit({ kind: 'modal', modal: 'manual', action: 'toggle' }),
    onLaptop: () => play.events.emit({ kind: 'modal', modal: 'laptop', action: 'toggle' }),
    onSkipDialog: () => {
      const statsOpen = play.dom.statsEl.classList.contains('open');
      if (!play.lifecycle.canOpenEscMenu(statsOpen) || !isChapterSession(play.session)) return;
      const res = play.session.skipOpeningDialog();
      if (!res) return;
      play.dialogs?.clear();
      play.events.emit({ kind: 'apply-tick', res });
    },
    onPlayAgain: (skip) => play.events.emit({ kind: 'play-again', skipIntro: skip }),
  });
  play.events.emit({ kind: 'paint', snap: play.session.snapshot() });
}

export function bindPlayInput(play: Play): void {
  const modalTarget = {
    openManual: (q?: string | number) => openManualModal(play, q),
    closeManual: () => closeManualModal(play),
    isManualOpen: () => Boolean(play.manualBook?.isOpen()),
    openMap: (q?: string | number) => openChapterMap(play, q),
    closeMap: () => closeChapterMap(play),
    isMapOpen: () => Boolean(play.chapterMap?.isOpen()),
    openHint: () => openHintDialog(play),
    closeHint: () => play.hintDialog?.close(),
    isHintOpen: () => Boolean(play.hintDialog?.isOpen()),
    openMenu: () => openMenuModal(play),
    closeMenu: () => play.menu?.close(),
    isMenuOpen: () => Boolean(play.menu?.isOpen()),
    openLaptop: () => openLaptop(play, () => handleNonPausingModalClose(play)),
    closeLaptop: () => closeLaptop(play),
    isLaptopOpen: () => isLaptopOpen(play),
  };
  play.events.subscribe((ev) => {
    if (ev.kind === 'session-swapped') {
      mountPlayHud(play);
    } else if (ev.kind === 'play-again') {
      playAgain(play, ev.skipIntro);
    } else if (ev.kind === 'modal') {
      routeModalAction(modalTarget, ev);
    }
  });

  play.lab = mountVisualLab({
    setPixel: (on, params) => {
      play.stage.pixelOn = on;
      play.stage.setPixelParams(params);
      play.stage.applyConfigVisuals();
    },
    setCrt: (on, params) => {
      play.stage.crtOn = on;
      play.stage.setCrtParams(params);
      play.stage.applyConfigVisuals();
    },
    setInk: (params) => play.stage.setInk(params),
    setStorm: (on, intensity) => play.stage.setStorm(on, intensity),
    setProjection: (zoom) => play.stage.setZoom(zoom),
    setLight: (mode) => play.stage.setLightMode(mode),
  });

  const toggleInspector = () => {
    play.dom.inspectorEl.classList.toggle('hidden');
    play.session.bus?.emit({ kind: 'menu', action: 'move' });
  };
  play.dom.toggleBtn.onclick = toggleInspector;
  play.dom.manualBtnEl?.addEventListener('click', () => play.events.emit({ kind: 'modal', modal: 'manual', action: 'toggle' }));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.repeat && play.lifecycle.hasReason('transition')) {
      e.preventDefault();
      e.stopPropagation();
      finishPlayLevelTransition(play, true);
      window.setTimeout(() => {
        if (play.lifecycle.phase() === 'play' && !anyModalOpen(play)) play.shell.focus();
      }, 0);
      return;
    }
    if (e.key === 'F1' || e.key === 'F2' || e.key === 'F3' || e.key === 'F4' || e.key === 'F8' || e.key === 'F9' || e.key === 'F10') {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
    }
    if (e.key === 'F1') play.events.emit({ kind: 'modal', modal: 'manual', action: 'toggle' });
    else if (e.key === 'F2') toggleInspector();
    else if (e.key === 'F3') play.events.emit({ kind: 'modal', modal: 'map', action: 'toggle' });
    else if (e.key === 'F4') play.events.emit({ kind: 'modal', modal: 'laptop', action: 'toggle' });
    else if (e.key === 'F8') {
      play.lab.toggle();
      play.session.bus?.emit({ kind: 'menu', action: 'move' });
    } else if (e.key === 'F9') {
      play.lab.toggleCrt();
      play.session.bus?.emit({ kind: 'menu', action: 'move' });
    } else if (e.key === 'F10') {
      play.lab.togglePixel();
      play.session.bus?.emit({ kind: 'menu', action: 'move' });
    }
  }, true);

  let fitFrame = 0;
  const refit = () => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      play.shell.fit();
      play.stage.resize();
    });
  };
  window.addEventListener('resize', refit);
  new ResizeObserver(refit).observe(play.dom.termEl);

  document.addEventListener('click', (e) => {
    const el = e.target as Element | null;
    if (!el?.closest('button, .item-slot.clickable') || el.closest('#outro, #cinematic, #code-editor-pane, #manual-book-modal, #esc-menu, #hint-dialog, #hud-hint, #chapter-map-dialog, #hud-map, .item-slot.item-map, .item-slot.item-manual, #laptop-overlay, .item-slot.item-laptop')) return;
    if (play.lifecycle.phase() === 'play' && !anyModalOpen(play)) {
      window.setTimeout(() => play.shell.focus(), 0);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) play.lifecycle.addReason('hidden');
    else play.lifecycle.deleteReason('hidden');
    play.events.emit({ kind: 'sync-pause' });
  });
  mountPlayMenu(play);
}

async function devCinematic(play: Play, role: ComixRole): Promise<void> {
  if (play.lifecycle.phase() !== 'play' || play.lifecycle.hasReason('cinematic')) return;
  const seq = findComixByRole(role);
  if (!seq) return;
  play.lifecycle.addReason('cinematic');
  play.events.emit({ kind: 'sync-pause' });
  const muted = play.session.snapshot().muted;
  if (role === 'ending') await powerOff();
  const stats = role === 'ending' ? statsFrom(play.session.snapshot()) : undefined;
  await runOverlay(play, () => {
    holdForComix(play, role);
    return playComix(seq.id, play.dom.cineEl, { muted, bus: play.session.bus }, stats);
  });
  syncPlayAudio(play);
  await powerOn(true);
  play.lifecycle.deleteReason('cinematic');
  play.events.emit({ kind: 'sync-pause' });
}

function emitKernelEvent(play: Play, ev: KernelEvent): void {
  play.events.emit({ kind: 'apply-events', events: [ev], snap: play.session.snapshot() });
  if (play.session.bus) publishKernel(play.session.bus, [ev]);
}

export function mountPlayDev(play: Play): void {
  mountDevInspector(play.dom.inspectorEl, play.stage, {
    onTeleport: (floor) => {
      if (play.lifecycle.phase() !== 'play') return;
      const res = play.session.debugTeleport(floor as 1 | 2 | 3 | 4 | 5);
      play.shell.printAbove(res.output);
      const entered = res.events.some((e) => e.type === 'FLOOR_ENTERED');
      const snap = res.snapshot;
      const events = entered
        ? res.events
        : [...res.events, { type: 'FLOOR_ENTERED' as const, floorId: snap.floor, title: FLOOR_NAMES[snap.floor] ?? '', path: snap.cwd }];
      play.events.emit({ kind: 'apply-events', events, snap });
    },
    onHeal: () => {
      play.events.emit({ kind: 'paint', snap: play.session.debugHeal() });
      play.shell.printAbove('\x1b[32mHP restored.\x1b[0m');
    },
    onDamage: (amount = 10) => {
      const res = play.session.debugDamage(amount);
      play.events.emit({ kind: 'apply-events', events: res.events, snap: res.snapshot });
      play.shell.printAbove(`\x1b[31m-${amount} HP (dev panel).\x1b[0m`);
    },
    onGive: (item) => {
      if (!play.debugGive) return;
      const r = play.debugGive(item);
      if ('snapshot' in r) {
        if (r.output) play.shell.printAbove(r.output);
        play.events.emit({ kind: 'apply-events', events: r.events, snap: r.snapshot });
      } else play.events.emit({ kind: 'paint', snap: r });
    },
    onGrantItem: play.session.debugGrantItem
      ? (item) => {
        const r = play.session.debugGrantItem?.(item);
        if (!r) return;
        if (r.output) play.shell.printAbove(r.output);
        play.events.emit({ kind: 'apply-events', events: r.events, snap: r.snapshot });
      }
      : undefined,
    onDialogue: () => {
      if (play.lifecycle.phase() === 'play') void play.shell.submit('cat intercom.sock');
    },
    onTerminalLog: (msg) => play.shell.printAbove(msg),
    onPlayIntro: () => void devCinematic(play, 'opening'),
    onPlayOutro: () => void devCinematic(play, 'ending'),
    onAssetsReloaded: () => play.events.emit({ kind: 'paint', snap: play.session.snapshot() }),
    emit: (ev) => emitKernelEvent(play, ev),
  });
}
