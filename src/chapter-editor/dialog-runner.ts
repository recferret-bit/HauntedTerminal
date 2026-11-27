import { agentModel, stepOutput, type StepEnv } from '../chapters/script.js';
import { resolveTauntAgent } from '../chapters/session-state.js';
import type { ChapterPack, LevelSpec, ScriptStep } from '../chapters/types.js';
import type { KernelEvent } from '../contracts/events.js';
import type { StageEditorApi } from '../contracts/stage-editor.js';

export interface DialogBeatItem {
  id: string;
  group: string;
  label: string;
  delayMs: number;
  events: KernelEvent[];
  print?: string;
}

export interface DialogRunnerState {
  running: boolean;
  index: number;
  total: number;
  currentLabel: string;
}

function summarizeStep(s: ScriptStep): string {
  switch (s.kind) {
    case 'dialog_box':
      return `${s.speaker}: ${s.text.slice(0, 32)}`;
    case 'emote':
      return `${s.emote}: ${(s.text ?? '').slice(0, 32)}`;
    case 'say':
      return `${s.agent}: ${s.text.slice(0, 32)}`;
    case 'taunt':
      return `taunt (${s.mood})`;
    case 'tutorial_step':
      return `tutorial #${s.step}`;
    case 'print':
      return `print: ${s.text.trim().slice(0, 28)}`;
    case 'dialogue':
      return `${s.speaker}: ${s.text.slice(0, 28)}`;
    case 'fx':
      return `fx: ${s.preset}`;
    case 'kiro_action':
      return `kiro: ${s.action}`;
    default:
      return s.kind;
  }
}

function appendSteps(
  out: DialogBeatItem[],
  steps: readonly ScriptStep[] | undefined,
  prefix: string,
  group: string,
  env: StepEnv,
  delayMs = 850,
): void {
  if (!steps) return;
  let pendingWaitMs = 0;
  steps.forEach((step, i) => {
    if (step.kind === 'wait') {
      pendingWaitMs += Math.min(1800, Math.max(300, Math.round(step.sec * 160)));
      return;
    }
    const { events, print } = stepOutput(step, env);
    if (events.length === 0 && !print) return;
    out.push({
      id: `${prefix}:${i}`,
      group,
      label: `${group} · ${summarizeStep(step)}`,
      delayMs: delayMs + pendingWaitMs,
      events,
      ...(print ? { print } : {}),
    });
    pendingWaitMs = 0;
  });
}

function kiroBox(speaker: 'kiro' | 'vibecoder', text: string, holdMs = 4200): KernelEvent {
  return {
    type: 'DIALOG_BOX',
    speaker,
    name: speaker === 'kiro' ? 'KIRO.D' : 'VIBECODER',
    model: speaker === 'kiro' ? 'npc.kiro_ghost' : 'vibecoder.dev_terminal',
    text,
    holdMs,
  };
}

export function collectDialogCatalog(pack: ChapterPack, level: LevelSpec): DialogBeatItem[] {
  const out: DialogBeatItem[] = [];
  const d = pack.dialogs?.levels[level.id];
  const env: StepEnv = {
    taunt: d?.agentTaunt,
    anchorOf: () => 1,
    tutorial: level.script?.tutorial,
    heroModel: 'vibecoder.dev_terminal',
    itemHeld: true,
  };

  if (d?.banner) {
    out.push({
      id: 'dialogs:banner',
      group: 'dialogs.json',
      label: `banner · ${d.banner.slice(0, 34)}`,
      delayMs: 900,
      events: [{ type: 'VIBECODER_EMOTE', emote: 'shock', text: d.banner }],
      print: `[BANNER] ${d.banner}\n`,
    });
  }
  if (d?.agentTaunt) {
    const agent = resolveTauntAgent(d.agentTaunt);
    out.push({
      id: 'dialogs:agentTaunt',
      group: 'dialogs.json',
      label: `agentTaunt · ${d.agentTaunt.slice(0, 34)}`,
      delayMs: 1100,
      events: [{ type: 'AGENT_TAUNT', agent, model: agentModel(agent), text: d.agentTaunt, mood: 'smug' }],
      print: `${d.agentTaunt}\n`,
    });
  }
  (d?.hankRungs ?? []).forEach((rung: string, i: number) => {
    if (!rung) return;
    out.push({
      id: `dialogs:hankRungs:${i}`,
      group: 'dialogs.json',
      label: `hankRung #${i + 1} · ${rung.slice(0, 30)}`,
      delayMs: 1100,
      events: [kiroBox('kiro', rung)],
      print: `[HANK #${i + 1}] ${rung}\n`,
    });
  });
  if (d?.completion) {
    out.push({
      id: 'dialogs:completion',
      group: 'dialogs.json',
      label: `completion · ${d.completion.slice(0, 34)}`,
      delayMs: 1100,
      events: [kiroBox('kiro', d.completion)],
      print: `${d.completion}\n`,
    });
  }

  appendSteps(out, level.script?.arrival, 'arrival', 'arrival', env, 900);

  (level.script?.timed ?? []).forEach((entry, i) => {
    appendSteps(out, entry.steps, `timed:${i}`, `timed +${entry.afterSec}s`, env, 900);
  });

  (level.script?.triggers ?? []).forEach((tr, i) => {
    appendSteps(out, tr.steps, `trigger:${i}`, `trigger (${tr.when.kind})`, env, 900);
  });

  const tut = level.script?.tutorial;
  (tut?.steps ?? []).forEach((step, i) => {
    out.push({
      id: `tutorial:${i}`,
      group: 'tutorial',
      label: `tutorial step #${i + 1} · ${step.prompt.slice(0, 28)}`,
      delayMs: 1100,
      events: [{
        type: 'TUTORIAL_STEP',
        step: i + 1,
        total: tut!.steps.length,
        agent: tut?.agent ?? 'kiro',
        prompt: step.prompt,
        command: step.command,
        done: false,
      }],
    });
  });

  (level.riddles ?? []).forEach((r, ri) => {
    out.push({
      id: `riddle:${ri}:prompt`,
      group: `riddle:${r.id}`,
      label: `riddle ${r.id} prompt · ${r.prompt.slice(0, 28)}`,
      delayMs: 1000,
      events: [kiroBox('kiro', r.prompt)],
    });
    (r.hints ?? []).forEach((hint, hi) => {
      out.push({
        id: `riddle:${ri}:hint:${hi}`,
        group: `riddle:${r.id}`,
        label: `riddle ${r.id} hint #${hi + 1}`,
        delayMs: 900,
        events: [kiroBox('kiro', hint)],
      });
    });
    if (r.success) {
      out.push({
        id: `riddle:${ri}:success`,
        group: `riddle:${r.id}`,
        label: `riddle ${r.id} success`,
        delayMs: 900,
        events: [kiroBox('kiro', r.success)],
      });
    }
  });

  appendSteps(out, level.script?.onBossKill, 'bossKill', 'onBossKill', env, 950);

  (pack.manifest.onFirstPickup ?? []).forEach((entry, i) => {
    appendSteps(out, entry.steps, `pickup:${i}`, `onFirstPickup:${entry.pickup}`, env, 900);
  });

  appendSteps(out, pack.manifest.outro?.finale, 'outro', 'outro.finale', env, 950);
  return out;
}

/** Chronological level narrative replay sequence for `💬 All Dialogs`: banner -> arrival -> timed -> taunt -> tutorial -> completion. */
export function collectNarrativeSequence(pack: ChapterPack, level: LevelSpec): DialogBeatItem[] {
  const all = collectDialogCatalog(pack, level);
  const byGroup = (match: (id: string) => boolean) => all.filter((b) => match(b.id));
  return [
    ...byGroup((id) => id === 'dialogs:banner'),
    ...byGroup((id) => id.startsWith('arrival:')),
    ...byGroup((id) => id.startsWith('timed:')),
    ...byGroup((id) => id === 'dialogs:agentTaunt'),
    ...byGroup((id) => id.startsWith('tutorial:')),
    ...byGroup((id) => id === 'dialogs:completion'),
  ];
}

export interface DialogRunnerController {
  runAll(beats: DialogBeatItem[]): void;
  runSpecific(beats: DialogBeatItem[], id: string): boolean;
  nextBeat(): void;
  stop(): void;
  state(): DialogRunnerState;
  onState(cb: (state: DialogRunnerState) => void): void;
}

const OVERLAY_EVENT_TYPES = new Set([
  'DIALOG_BOX',
  'AGENT_TAUNT',
  'OBSTACLE_DIALOGUE_RENDERED',
  'TUTORIAL_STEP',
  'VIBECODER_EMOTE',
]);

export function createDialogRunner(
  getApi: () => StageEditorApi | null,
  onPlayBeat?: (beat: DialogBeatItem) => void,
): DialogRunnerController {
  let queue: DialogBeatItem[] = [];
  let index = 0;
  let running = false;
  let timer = 0;
  const listeners: Array<(st: DialogRunnerState) => void> = [];

  const snapshotState = (): DialogRunnerState => ({
    running,
    index,
    total: queue.length,
    currentLabel: queue[index - 1]?.label ?? '',
  });

  const emitState = (): void => {
    const st = snapshotState();
    for (const cb of listeners) cb(st);
  };

  const clearTimer = (): void => {
    if (timer) {
      globalThis.clearTimeout(timer);
      timer = 0;
    }
  };

  const playCurrent = (forceClear = false): void => {
    clearTimer();
    const beat = queue[index];
    if (!beat) {
      running = false;
      emitState();
      return;
    }
    const isFirst = index === 0;
    index += 1;
    const api = getApi();
    if (!isFirst && (forceClear || beat.events.some((ev) => OVERLAY_EVENT_TYPES.has(ev.type)))) {
      api?.clearDialogs();
    }
    api?.playBeat(beat.events, beat.print);
    onPlayBeat?.(beat);
    emitState();
    if (running && index < queue.length) {
      const baseWait = beat.events.length === 0 ? 550 : beat.delayMs;
      const wait = Math.min(1800, Math.max(450, baseWait));
      timer = globalThis.setTimeout(() => playCurrent(false), wait);
    } else if (index >= queue.length) {
      running = false;
      emitState();
    }
  };

  return {
    runAll(beats) {
      clearTimer();
      getApi()?.clearDialogs();
      queue = beats.slice();
      index = 0;
      running = queue.length > 0;
      emitState();
      if (running) playCurrent(false);
    },
    runSpecific(beats, id) {
      clearTimer();
      const beat = beats.find((b) => b.id === id);
      if (!beat) return false;
      getApi()?.clearDialogs();
      queue = [beat];
      index = 1;
      running = false;
      getApi()?.playBeat(beat.events, beat.print);
      onPlayBeat?.(beat);
      emitState();
      return true;
    },
    nextBeat() {
      clearTimer();
      if (index < queue.length) {
        playCurrent(true);
      }
    },
    stop() {
      clearTimer();
      running = false;
      queue = [];
      index = 0;
      getApi()?.clearDialogs();
      emitState();
    },
    state: snapshotState,
    onState(cb) {
      listeners.push(cb);
    },
  };
}
