import { isChapterSession } from '../chapters/chapter-session.js';
import { findComixByRole, playComix, type ComixRole } from '../cinematic/index.js';
import { mountDevInspector } from '../sandbox/dev-inspector.js';
import { mountCodeEditor } from '../ui/code-editor.js';
import { mountDialogOrchestrator } from '../ui/dialog-orchestrator.js';
import { drawPortrait } from '../renderer/portrait.js';
import { mountHud } from '../ui/hud.js';
import { powerOff, powerOn } from '../ui/screen.js';
import { colourise, mountShell } from '../ui/terminal.js';
import { mountVisualLab } from '../ui/visual-lab.js';
import { recordExec } from './lab.js';
import { statsFrom } from './outro.js';
import { FLOOR_NAMES, writeSkipPref, type Play } from './state.js';

/** Enter during the battle intro skips it; the typed line stays on the prompt and does not run (Req 12). */
function skipBattleIntroOnEnter(play: Play): boolean {
  if (play.phase !== 'play' || !isChapterSession(play.session)) return false;
  const res = play.session.skipBattleIntro();
  if (!res) return false;
  play.applyTick(res);
  return true;
}

function runShellLine(play: Play, line: string): { output: string; clear?: boolean; stderr?: string } {
  if (play.phase !== 'play') return { output: '' };
  const session = play.session;
  const res = session.exec(line);
  recordExec(play, line, res);
  play.execTaunts = [];
  try {
    play.apply(res.events, res.snapshot, res.output);
    if (isChapterSession(session) && play.codeEditor) {
      const edReq = session.consumeEditorRequest();
      if (edReq) {
        // The battle turn timer waits while he writes code (turn-based-battles Req 17).
        session.holdTurnTimer('editor', true);
        play.codeEditor.open(edReq);
      }
    }
  } finally {
    const extra = play.execTaunts ?? [];
    play.execTaunts = null;
    if (extra.length) {
      const sep = res.output && !res.output.endsWith('\n') ? '\n' : '';
      // Taunts carry their own colour, so colourise() leaves them alone.
      return { output: `${res.output}${sep}${extra.join('\n')}\n`, clear: res.clear, stderr: res.stderr };
    }
  }
  return { output: res.output, clear: res.clear, stderr: res.stderr };
}

export function mountPlayShell(play: Play): void {
  play.shell = mountShell(play.dom.termEl, {
    run: (line) => runShellLine(play, line),
    complete: (before) => play.session.complete(before),
    prompt() {
      const snap = play.session.snapshot();
      return { cwd: snap.cwd, gold: snap.promptGold };
    },
    onEnter: () => skipBattleIntroOnEnter(play),
  });
  play.shell.setBlocked(true);
  const pane = play.dom.editorPaneEl;
  const dock = play.dom.termDockEl;
  if (pane && dock) {
    play.codeEditor = mountCodeEditor(pane, dock, {
      onSave: (fileName, content) => {
        if (!isChapterSession(play.session)) return;
        const res = play.session.saveEditableFile(fileName, content);
        if (res.output) play.shell.printAbove(colourise(res.output, res.stderr));
        play.apply(res.events, res.snapshot, res.output);
      },
      onClose: () => {
        if (isChapterSession(play.session)) play.session.holdTurnTimer('editor', false);
        if (play.phase === 'play') window.setTimeout(() => play.shell.focus(), 0);
      },
      onLayoutChange: () => {
        window.requestAnimationFrame(() => {
          play.shell.fit();
          play.stage.resize();
        });
      },
    });
  }
}

function playAgain(play: Play, skip: boolean): void {
  if (play.phase !== 'stats') return;
  play.skipIntroPref = skip;
  writeSkipPref(skip);
  play.hud?.hideStats();
  const res = play.session.restart();
  play.endingStarted = false;
  play.reasons.delete('ended');
  play.reasons.add('intro');
  play.phase = 'intro';
  play.shell.reset();
  play.apply(res.events, res.snapshot);
  void play.startRun();
}

export function mountPlayHud(play: Play): void {
  const chapter = isChapterSession(play.session) ? play.session : null;
  play.dialogs = mountDialogOrchestrator(play.dom.stageWrap, drawPortrait, {
    tutorial: play.tutorial,
    onRightDialogOpen: () => play.hud?.hideHint(),
    onClear: () => play.hud?.hideHint(),
  });
  play.dialogBox = play.dialogs.box;
  play.hud = mountHud(play.dom.hudEl, play.dom.stageWrap, play.dom.statsEl, {
    drawPortrait,
    maxFloors: chapter ? chapter.getLevels().length : 5,
    onHintShow: () => play.dialogs?.onHintOpened(),
    onHint: () => {
      if (play.phase === 'play') play.hud?.showHint(play.session.hint());
    },
    onMute: () => {
      play.session.toggleMute();
      play.hud?.update(play.session.snapshot());
    },
    onRestartFloor: () => {
      if (play.phase !== 'play' || play.reasons.has('card')) return;
      const res = play.session.restartFloor();
      play.shell.printAbove(colourise(res.output));
      play.apply(res.events, res.snapshot);
    },
    onPlayAgain: (skip) => playAgain(play, skip),
  });
  play.paint(play.session.snapshot());
}

export function bindPlayInput(play: Play): void {
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

  const toggleInspector = () => play.dom.inspectorEl.classList.toggle('hidden');
  play.dom.toggleBtn.onclick = toggleInspector;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F2' || e.key === 'F8' || e.key === 'F9' || e.key === 'F10') {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === 'F2') toggleInspector();
    else if (e.key === 'F8') play.lab.toggle();
    else if (e.key === 'F9') play.lab.toggleCrt();
    else if (e.key === 'F10') play.lab.togglePixel();
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

  // A clicked HUD / dev-panel button takes keyboard focus; hand it back to the shell so typing keeps working.
  document.addEventListener('click', (e) => {
    const el = e.target as Element | null;
    if (!el?.closest('button, .hint-note') || el.closest('#outro, #cinematic, #code-editor-pane')) return;
    if (play.phase === 'play' && !play.codeEditor?.isOpen()) window.setTimeout(() => play.shell.focus(), 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) play.reasons.add('hidden');
    else play.reasons.delete('hidden');
    play.syncPause();
  });
}

async function devCinematic(play: Play, role: ComixRole): Promise<void> {
  if (play.phase !== 'play' || play.reasons.has('cinematic')) return;
  const seq = findComixByRole(role);
  if (!seq) return;
  play.reasons.add('cinematic');
  play.syncPause();
  const muted = play.session.snapshot().muted;
  if (role === 'ending') await powerOff();
  const stats = role === 'ending' ? statsFrom(play.session.snapshot()) : undefined;
  await play.runCinematic(() => playComix(seq.id, play.dom.cineEl, { muted }, stats));
  await powerOn(true);
  play.reasons.delete('cinematic');
  play.syncPause();
}

export function mountPlayDev(play: Play): void {
  mountDevInspector(play.dom.inspectorEl, play.stage, {
    onTeleport: (floor) => {
      if (play.phase !== 'play') return;
      const res = play.session.debugTeleport(floor as 1 | 2 | 3 | 4 | 5);
      play.shell.printAbove(res.output);
      const entered = res.events.some((e) => e.type === 'FLOOR_ENTERED');
      const snap = res.snapshot;
      const events = entered
        ? res.events
        : [...res.events, { type: 'FLOOR_ENTERED' as const, floorId: snap.floor, title: FLOOR_NAMES[snap.floor] ?? '', path: snap.cwd }];
      play.apply(events, snap);
    },
    onHeal: () => {
      play.paint(play.session.debugHeal());
      play.shell.printAbove('\x1b[32mHP restored.\x1b[0m');
    },
    onDamage: (amount = 10) => {
      const res = play.session.debugDamage(amount);
      play.apply(res.events, res.snapshot);
      play.shell.printAbove(`\x1b[31m-${amount} HP (dev panel).\x1b[0m`);
    },
    onGive: (item) => {
      if (!play.debugGive) return;
      const r = play.debugGive(item);
      if ('snapshot' in r) {
        if (r.output) play.shell.printAbove(r.output);
        play.apply(r.events, r.snapshot);
      } else play.paint(r);
    },
    onDialogue: () => {
      if (play.phase === 'play') void play.shell.submit('cat intercom.sock');
    },
    onTerminalLog: (msg) => play.shell.printAbove(msg),
    onPlayIntro: () => void devCinematic(play, 'opening'),
    onPlayOutro: () => void devCinematic(play, 'ending'),
    onAssetsReloaded: () => play.paint(play.session.snapshot()),
    emit: (ev) => play.apply([ev], play.session.snapshot()),
  });
}
