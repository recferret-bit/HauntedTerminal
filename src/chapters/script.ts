import type { KernelEvent } from '../contracts/events.js';
import { pickTransform } from '../contracts/room-view.js';
import type { PickupType } from '../game/bestiary.js';
import { dialogueEvent } from '../game/dialogue.js';
import { consumeItem, giveItem, heroModel, holdItem, ITEMS } from '../game/inventory.js';
import { absPath, lookup, type VNode } from '../game/tree.js';
import type { TutorialState } from '../game/types.js';
import {
  findMatchingLock,
  invocationMatches,
  pendingLaptopTasksForSpec,
  recordDialogHoldTicks,
  scriptDialogActive,
  syncConditionalSpawns,
} from './script-locks.js';
import { resolveTauntAgent, type ChapterState } from './session-state.js';
import type { LevelScript, ScriptAgent, ScriptBullying, ScriptCond, ScriptCoreReaction, ScriptLock, ScriptStep, ScriptTutorial } from './types.js';

/**
 * The one interpreter for `level.spec.json -> script`. It knows nothing about any chapter or level:
 * every line, condition and label it uses comes from the spec.
 */
/** What `ps` shows for Kiro while the level marks it weak. */
export const WEAK_GGUF = 'kiro-tiny-1b-q4.gguf [weak]';

export function levelScript(g: ChapterState): LevelScript {
  return g.rt.spec.script ?? {};
}

export function agentModel(agent: ScriptAgent): string {
  return agent === 'kiro' ? 'npc.kiro_ghost' : `agent.${agent}`;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}

export function evalCond(g: ChapterState, c: ScriptCond): boolean {
  switch (c.kind) {
    case 'ran_command': {
      if (!c.flags && !c.args) return g.rt.commandsRun.has(c.name);
      const want = c.name === 'kiro.d' ? 'kiro' : c.name;
      return g.rt.commandLog.some((entry) => entry.name === want && invocationMatches(entry.args, c.flags, c.args));
    }
    case 'file_absent':
      return lookup(g.rt.root, c.path) === null;
    case 'file_read':
      return g.rt.filesRead.has(c.path);
    case 'enemy_dead': {
      const e = g.rt.world.get(c.enemyId);
      return !e || e.dead || g.rt.world.petrified(e);
    }
    case 'any_enemy_dead':
      return g.rt.world.enemies.some((e) => e.dead);
    case 'core_loaded':
      return g.rt.loadedCores.has(c.core);
    case 'has_item':
      return g.inventory.items.includes(c.item);
    case 'room_swept':
      return g.rt.roomSwept;
    case 'tutorial_skipped':
      return g.rt.tutorialSkipped;
    case 'dialog_done':
      return !scriptDialogActive(g, openingActive(g));
    case 'flag':
      return g.rt.flags.has(c.name);
    case 'laptop_tasks_done':
      return c.tasks.every((id) => g.laptopDone.has(id));
    case 'not':
      return !evalCond(g, c.of);
    case 'any':
      return c.of.some((x) => evalCond(g, x));
    case 'all':
      return c.of.every((x) => evalCond(g, x));
  }
}

/** Default flight time of a `fly_to` step, in ms. */
const FLY_TO_MS = 2400;

/** What a step needs from its surroundings. The game fills it from live state, the chapter editor from the draft. */
export interface StepEnv {
  /** The level's dialog `agentTaunt`. */
  taunt?: string;
  /** Inode id of a socket in the room (the speech bubble anchors there). */
  anchorOf: (socket: string) => number;
  tutorial?: ScriptTutorial;
  vars?: Record<string, string>;
  /** Avatar of the vibecoder in a `dialog_box` (the hero model for what he holds). */
  heroModel?: string;
  /** For `give_item`: whether the hero took the item in hand (the interpreter sets it; the editor preview assumes true). */
  itemHeld?: boolean;
}

/** The events and terminal text of one step. Pure: no game state, so the editor can play a single step. */
export function stepOutput(s: ScriptStep, env: StepEnv): { events: KernelEvent[]; print: string } {
  const vars = env.vars ?? {};
  switch (s.kind) {
    case 'print':
      return { events: [], print: fill(s.text, vars) };
    case 'emote':
      return { events: [{ type: 'VIBECODER_EMOTE', emote: s.emote, text: s.text }], print: '' };
    case 'spawn':
      return { events: [{ type: 'ENTITY_SPAWNED', entityId: s.entityId, model: s.model, reason: 'script', entrance: s.entrance ?? 'appear' }], print: '' };
    case 'despawn':
      return { events: [], print: '' };
    case 'kiro_action':
      return { events: [{ type: 'KIRO_ACTION', action: s.action, core: s.core, message: s.message }], print: '' };
    case 'say':
      return {
        events: [{ type: 'AGENT_TAUNT', agent: s.agent, model: s.model, text: s.text, mood: s.mood }],
        print: s.print ? fill(s.print, { ...vars, text: s.text }) : '',
      };
    case 'taunt': {
      const text = env.taunt ?? s.fallback;
      if (!text) return { events: [], print: '' };
      const agent = resolveTauntAgent(text);
      return {
        events: [{ type: 'AGENT_TAUNT', agent, model: agentModel(agent), text, mood: s.mood }],
        print: s.print ? fill(s.print, { ...vars, text }) : '',
      };
    }
    case 'dialogue':
      return {
        events: [
          dialogueEvent({
            obstacleId: s.obstacleId,
            speaker: s.speaker,
            portrait: s.portrait,
            style: 'COMIX_CLASSIC',
            mood: s.mood,
            text: s.text,
            tokens: s.highlight,
            anchor: env.anchorOf(s.anchorSocket),
            banner: s.banner,
          }),
        ],
        print: '',
      };
    case 'dialog_box': {
      const name = s.speaker === 'dad' ? 'OLD CODER (DAD.TTY)' : s.speaker === 'kiro' ? 'KIRO.D' : s.speaker.toUpperCase();
      const model =
        s.speaker === 'vibecoder'
          ? (env.heroModel ?? 'vibecoder.dev_terminal')
          : s.speaker === 'dad'
            ? 'npc.greybeard_rig'
            : agentModel(s.speaker);
      // Subtract exit duration (EXIT_MS = 180 ms + timer margin) so back-to-back timed beats open without queue drift.
      const holdMs = Math.max(400, Math.round((s.holdSec ?? 12) * 1000) - 220);
      return {
        events: [{ type: 'DIALOG_BOX', speaker: s.speaker, name, model, text: s.text, holdMs }],
        print: `[${name}] ${fill(s.text, vars)}\n`,
      };
    }
    case 'tutorial_step':
      return tutorialCard(env.tutorial, s.step, false);
    case 'carry_item':
      return { events: [{ type: 'ITEM_CARRIED', entityId: s.entityId, item: s.item, model: ITEMS[s.item].model }], print: '' };
    case 'take_item':
      return { events: [], print: `[ITEM USED] ${ITEMS[s.item].label.toUpperCase()} leaves your inventory.\n` };
    case 'fly_to':
      return { events: [{ type: 'ACTOR_FLY_TO', entityId: s.entityId, target: s.target, hold: s.hold ?? false, ms: s.ms ?? FLY_TO_MS }], print: '' };
    case 'wait':
      return { events: [], print: '' };
    case 'sfx':
      return { events: [{ type: 'SOUND_CUE', cue: s.cue }], print: '' };
    case 'fx':
      return {
        events: [{
          type: 'FX_CUE',
          preset: s.preset,
          ...(s.x !== undefined ? { x: s.x } : {}),
          ...(s.y !== undefined ? { y: s.y } : {}),
          ...(s.text !== undefined ? { text: s.text } : {}),
        }],
        print: '',
      };
    case 'music':
      return { events: [], print: '' };
    case 'set_flag':
      return { events: [], print: '' };
    case 'give_item': {
      const def = ITEMS[s.item];
      return {
        events: [{ type: 'ITEM_GIVEN', item: s.item, model: def.model, from: s.from, held: env.itemHeld ?? true }],
        print: `[ITEM RECEIVED] Obtained ${def.label.toUpperCase()} — ${def.use}\n`,
      };
    }
  }
}

/** The tutorial card event for step `n` (1-based) and the terminal line announcing it. */
function tutorialCard(tut: ScriptTutorial | undefined, n: number, done: boolean): { events: KernelEvent[]; print: string } {
  const def = tut?.steps[n - 1];
  if (!tut || !def) return { events: [], print: '' };
  const event: KernelEvent = {
    type: 'TUTORIAL_STEP',
    step: n,
    total: tut.steps.length,
    prompt: def.prompt,
    command: def.command,
    agent: tut.agent,
    done,
  };
  if (done) return { events: [event], print: '' };
  const clean = def.prompt.replace(/^.*?TUTORIAL #\d+:\s*/i, '');
  return { events: [event], print: `[${tut.label ?? 'TUTORIAL'} ${n}/${tut.steps.length}] ${clean} -> Type: \`${def.command}\`\n` };
}

/** Run steps in order. Returns the terminal text they print. `vars` fills `{name}` in printed text. */
export function runSteps(g: ChapterState, steps: ScriptStep[], events: KernelEvent[], vars: Record<string, string> = {}): string {
  const env: StepEnv = {
    taunt: g.rt.dialog?.agentTaunt,
    anchorOf: (socket) => g.rt.cwd.children.get(socket)?.id ?? g.rt.cwd.id,
    tutorial: levelScript(g).tutorial,
    vars,
    heroModel: heroModel(g.inventory.held),
  };
  let out = '';
  const startEvIdx = events.length;
  for (const [i, s] of steps.entries()) {
    if (s.kind === 'wait') {
      // The rest of the beat runs `sec` level seconds from now, in order (`runTimed`).
      const rest = steps.slice(i + 1);
      if (rest.length > 0) g.rt.deferred.push({ dueTick: g.rt.levelTicks + Math.max(1, Math.round(s.sec)), steps: rest, vars });
      break;
    }
    if (s.kind === 'take_item') g.inventory = consumeItem(g.inventory, s.item);
    if (s.kind === 'music') g.rt.musicOverride = s.cue === null ? '' : s.cue;
    if (s.kind === 'set_flag') g.rt.flags.add(s.name);
    if (s.kind === 'give_item') {
      const wasEmpty = g.inventory.held === null;
      g.inventory = giveItem(g.inventory, s.item);
      if (wasEmpty) g.inventory = holdItem(g.inventory, s.item);
      env.itemHeld = wasEmpty;
      env.heroModel = heroModel(g.inventory.held);
    }
    const r = stepOutput(s, env);
    if (s.kind === 'spawn') {
      g.rt.spawned.add(s.entityId);
      if (s.entityId !== 'kiro') {
        g.rt.spawnedActors.set(s.entityId, {
          model: s.model,
          x: s.x ?? 1.6,
          ...(s.y !== undefined ? { y: s.y } : {}),
          ...(s.label ? { label: s.label } : {}),
          ...pickTransform(s),
        });
      }
    }
    if (s.kind === 'despawn') {
      g.rt.spawned.delete(s.entityId);
      g.rt.spawnedActors.delete(s.entityId);
    }
    events.push(...r.events);
    out += r.print;
  }
  recordDialogHoldTicks(g, events.slice(startEvIdx));
  return out;
}

/** First arrival in a level: its `arrival` script, or (when no `openingSec` gates the taunt) the dialog taunt as a smug cameo. */
export function arrivalScript(g: ChapterState, events: KernelEvent[]): string {
  const sc = levelScript(g);
  const steps = sc.arrival ?? ((sc.openingSec ?? 0) > 0 ? [] : [{ kind: 'taunt', mood: 'smug' } satisfies ScriptStep]);
  return runSteps(g, steps, events);
}

/** Whether this level declares an opening conversation gate (`openingSec > 0`). */
export function hasOpeningGate(g: ChapterState): boolean {
  return (levelScript(g).openingSec ?? 0) > 0;
}

/** True while the opening Vibecoder + Kiro conversation is still running and locking the terminal. */
export function openingActive(g: ChapterState): boolean {
  return !g.rt.openingDone && !g.ended && hasOpeningGate(g);
}

const OPENING_KEEP = new Set<ScriptStep['kind']>(['spawn', 'despawn', 'carry_item', 'give_item', 'take_item', 'fly_to', 'kiro_action', 'tutorial_step', 'set_flag']);

/** Marks the opening dialog finished and fast-forwards any unfired state-changing beats up to `openingSec`. */
export function completeOpeningBeats(g: ChapterState, events: KernelEvent[]): string {
  if (g.rt.openingDone) return '';
  g.rt.openingDone = true;
  const maxSec = levelScript(g).openingSec ?? 0;
  let out = '';
  (levelScript(g).timed ?? []).forEach((entry, i) => {
    if (g.rt.timedFired.has(i) || entry.afterSec > maxSec) return;
    g.rt.timedFired.add(i);
    if (entry.unless && evalCond(g, entry.unless)) return;
    const steps = entry.steps.filter((s) => OPENING_KEEP.has(s.kind));
    if (steps.length > 0) out += runSteps(g, steps, events);
  });
  out += flushPendingBeats(g, events, OPENING_KEEP);
  g.rt.dialogBusyUntilTick = g.rt.levelTicks;
  return out;
}

function fireUnfiredTriggers(g: ChapterState, run: (steps: ScriptStep[]) => string): string {
  let out = '';
  (levelScript(g).triggers ?? []).forEach((tr, i) => {
    if (g.rt.triggersFired.has(i) || !evalCond(g, tr.when)) return;
    g.rt.triggersFired.add(i);
    out += run(tr.steps);
  });
  return out;
}

/**
 * Skip Dialog for beats that start from a trigger: the unfired `script.triggers` whose condition already holds fire now,
 * and every deferred (`wait`) beat runs at once. Only the `keep` kinds run, so items, flights and Kiro's magic still happen
 * while the dialogs are dropped. Order is kept.
 */
function flushPendingBeats(g: ChapterState, events: KernelEvent[], keep: ReadonlySet<ScriptStep['kind']>): string {
  let out = fireUnfiredTriggers(g, (steps) => runKept(g, steps, events, keep));
  // A kept step list never holds a `wait` (it is not kept), so one pass empties the queue.
  const pending = g.rt.deferred.splice(0);
  for (const d of pending) out += runKept(g, d.steps, events, keep, d.vars);
  return out;
}

function runKept(g: ChapterState, steps: ScriptStep[], events: KernelEvent[], keep: ReadonlySet<ScriptStep['kind']>, vars: Record<string, string> = {}): string {
  const kept = steps.filter((s) => keep.has(s.kind));
  return kept.length > 0 ? runSteps(g, kept, events, vars) : '';
}

/** Emits the level's Big Four `agentTaunt` with prompt priority when no battle intro took over the taunt slot. */
export function emitLevelTaunt(g: ChapterState, events: KernelEvent[]): string {
  if (!g.rt.dialog?.agentTaunt) return '';
  return runSteps(g, [{ kind: 'taunt', mood: 'order', print: '\n{text}\n' }], events);
}

// ---- timed entries and command locks -------------------------------------------------------------------------

/** One level tick (a second): fires every `script.timed` entry whose `afterSec` is reached. Returns the terminal text. */
export function runTimed(g: ChapterState, events: KernelEvent[]): string {
  g.rt.levelTicks += 1;
  let out = '';
  const due = g.rt.deferred.filter((d) => d.dueTick <= g.rt.levelTicks);
  if (due.length > 0) {
    g.rt.deferred = g.rt.deferred.filter((d) => d.dueTick > g.rt.levelTicks);
    for (const d of due) out += runSteps(g, d.steps, events, d.vars);
  }
  (levelScript(g).timed ?? []).forEach((t, i) => {
    if (g.rt.timedFired.has(i) || g.rt.levelTicks < t.afterSec) return;
    g.rt.timedFired.add(i);
    if (t.unless && evalCond(g, t.unless)) return;
    out += runSteps(g, t.steps, events);
  });
  return out;
}

/** True when any skippable scripted dialog (opening or mid-level trigger/timed) is currently running. */
export function hasSkippableDialog(g: ChapterState): boolean {
  return scriptDialogActive(g, openingActive(g));
}

/** Fast-forwards active mid-level scripted dialogs, running kept deferred/trigger state beats and clearing the dialog timer. */
export function skipMidLevelDialog(g: ChapterState, events: KernelEvent[]): string {
  g.rt.dialogBusyUntilTick = g.rt.levelTicks;
  return flushPendingBeats(g, events, OPENING_KEEP);
}

/** The matching `script.locks` entry when command + args match and its `until` condition does not hold, else undefined. */
export function findCommandLock(g: ChapterState, command: string, args: readonly string[]): ScriptLock | undefined {
  return findMatchingLock(levelScript(g).locks, command, args, (c) => evalCond(g, c));
}

// ---- tutorial ----------------------------------------------------------------------------------------------

/** Emits the card for step `n` (1-based). Returns the terminal line announcing it. */
function announceTutorialStep(g: ChapterState, n: number, done: boolean, events: KernelEvent[]): string {
  const r = tutorialCard(levelScript(g).tutorial, n, done);
  events.push(...r.events);
  return r.print;
}

/** Current step (1-based): the first one whose `doneWhen` does not hold. */
function tutorialStepNumber(g: ChapterState): number {
  const steps = levelScript(g).tutorial?.steps ?? [];
  for (let i = 0; i < steps.length; i++) {
    const done = steps[i]!.doneWhen;
    if (!done || !done.some((c) => evalCond(g, c))) return i + 1;
  }
  return steps.length;
}

export function tutorialState(g: ChapterState): TutorialState | null {
  const tut = levelScript(g).tutorial;
  if (!tut || g.intro || g.rt.tutorialSkipped || g.ended || openingActive(g)) return null;
  // The card asks the player to type: it waits until he carries a terminal (level 1 starts bare-handed).
  if (!g.inventory.items.includes('terminal')) return null;
  const def = tut.steps[tutorialStepNumber(g) - 1];
  if (!def) return null;
  return { step: tutorialStepNumber(g), total: tut.steps.length, agent: tut.agent, prompt: def.prompt, command: def.command };
}

/** Called after every command: reveals the hidden enemy and moves the tutorial card forward. */
export function syncTutorial(g: ChapterState, events: KernelEvent[]): string {
  const tut = levelScript(g).tutorial;
  if (!tut || g.rt.tutorialSkipped || g.ended) return '';
  let out = '';
  if (isHiddenRevealed(g) && !g.rt.hiddenRevealed) revealHidden(g, events);
  const next = tutorialStepNumber(g);
  if (next <= g.rt.tutorialLastStep) return out;
  const completed = tut.steps[next - 2] ?? tut.steps[g.rt.tutorialLastStep - 1];
  if (completed) {
    out += announceTutorialStep(g, next - 1, true, events);
    events.push({ type: 'AGENT_TAUNT', agent: tut.agent, model: tut.model, text: completed.doneText, mood: 'order' });
    out += `\n[${completed.doneText}]\n`;
  }
  out += announceTutorialStep(g, next, false, events);
  g.rt.tutorialLastStep = next;
  return out;
}

/** Marks the last card done (level cleared or tutorial skipped). */
export function finishTutorial(g: ChapterState, events: KernelEvent[]): void {
  const tut = levelScript(g).tutorial;
  if (tut) announceTutorialStep(g, tut.steps.length, true, events);
}

const SKIP_KEEP = new Set<ScriptStep['kind']>(['spawn', 'despawn', 'carry_item', 'give_item', 'take_item', 'fly_to', 'set_flag']);

/**
 * Drops every tutorial beat that has not played yet. Dialogs, emotes and prompts
 * are discarded. A spawn or an item hand-off still runs, so the sector stays playable.
 */
function fastForwardSkippedBeats(g: ChapterState, events: KernelEvent[]): string {
  const timed = levelScript(g).timed ?? [];
  let out = '';
  timed.forEach((entry, i) => {
    if (g.rt.timedFired.has(i)) return;
    g.rt.timedFired.add(i);
    if (entry.unless && evalCond(g, entry.unless)) return;
    const steps = entry.steps.filter((step) => SKIP_KEEP.has(step.kind));
    if (steps.length > 0) out += runSteps(g, steps, events);
  });
  return out;
}

/** Skips any running tutorial on the current level and returns its skip text (or ''). */
export function applySkipTutorial(g: ChapterState, events: KernelEvent[]): string {
  const tut = levelScript(g).tutorial;
  g.rt.tutorialSkipped = true;
  g.rt.openingDone = true;
  g.rt.dialogBusyUntilTick = g.rt.levelTicks;
  const skippedOut = fastForwardSkippedBeats(g, events);
  if (tut) {
    if (!g.rt.hiddenRevealed) revealHidden(g, events);
    finishTutorial(g, events);
  }
  return skippedOut + (tut?.skipText ?? '');
}

// ---- hidden enemy ------------------------------------------------------------------------------------------

function isHiddenRevealed(g: ChapterState): boolean {
  const hide = levelScript(g).tutorial?.hide;
  return !hide || g.rt.hiddenRevealed || evalCond(g, hide.revealWhen);
}

/** True when an enemy (`tutorial.hide` or `appearWhen`) has not appeared yet. */
export function isEnemyHidden(g: ChapterState, enemyId: string): boolean {
  const hide = levelScript(g).tutorial?.hide;
  if (hide && !isHiddenRevealed(g) && hide.enemyId === enemyId) return true;
  const spec = g.rt.spec.enemies.find((x) => x.id === enemyId);
  return Boolean(spec?.appearWhen && !g.rt.spawnedEnemies.has(enemyId) && !evalCond(g, spec.appearWhen));
}

export function pendingLaptopTasks(g: ChapterState): string[] {
  return pendingLaptopTasksForSpec(g.rt.spec, g.laptopDone, g.inventory.items.includes('laptop'));
}

export function isPickupHidden(g: ChapterState, pickupId: string): boolean {
  const p = g.rt.spec.pickups.find((x) => x.id === pickupId);
  return Boolean(p?.appearWhen && !g.rt.droppedPickups.has(pickupId) && !evalCond(g, p.appearWhen));
}

export function isNodeHidden(g: ChapterState, node: VNode): boolean {
  const hide = levelScript(g).tutorial?.hide;
  if (hide && node.name === hide.node && !isHiddenRevealed(g)) return true;
  const pickup = g.rt.world?.pickupByInode(node.id);
  if (pickup && isPickupHidden(g, pickup.id)) return true;
  for (let cur: VNode | null = node; cur; cur = cur.parent) {
    const f = g.rt.filesByPath?.get(absPath(cur));
    if (f?.appearWhen && !g.rt.spawnedFiles.has(f.path) && !evalCond(g, f.appearWhen)) return true;
  }
  return false;
}

/** Drops any `appearWhen` files/pickups/enemies whose condition now holds and runs unfired `script.triggers`. */
export function syncScriptTriggers(g: ChapterState, events: KernelEvent[]): string {
  if (g.ended) return '';
  syncConditionalSpawns(g, (c) => evalCond(g, c), events);
  return fireUnfiredTriggers(g, (steps) => runSteps(g, steps, events));
}

/** Runs `manifest.onFirstPickup` steps once per session the very first time `pickupType` is collected. */
export function firstPickupScript(g: ChapterState, pickupType: PickupType, events: KernelEvent[]): string {
  if (g.lab || g.seenPickups.has(pickupType)) return '';
  g.seenPickups.add(pickupType);
  const entry = g.pack.manifest.onFirstPickup?.find((e) => e.pickup === pickupType);
  return entry ? runSteps(g, entry.steps, events) : '';
}

function revealHidden(g: ChapterState, events: KernelEvent[]): void {
  const hide = levelScript(g).tutorial?.hide;
  if (!hide) return;
  g.rt.hiddenRevealed = true;
  if (evalCond(g, { kind: 'enemy_dead', enemyId: hide.enemyId })) return;
  events.push({ type: 'ENTITY_SPAWNED', entityId: hide.enemyId, model: hide.model, reason: 'script' });
}

// ---- taunts, Kiro, signals -----------------------------------------------------------------------------------

export function bullyingNote(g: ChapterState, solved: boolean, events: KernelEvent[]): string {
  const b: ScriptBullying | undefined = levelScript(g).bullying;
  if (!b || b.lines.length === 0 || g.ended || solved) return '';
  const n = g.rt.levelCommands;
  if (n < b.after || n % b.every !== 0) return '';
  const pick = b.lines[(g.commands + g.rt.spec.index) % b.lines.length]!;
  events.push({ type: 'AGENT_TAUNT', agent: pick.agent, model: agentModel(pick.agent), text: pick.text, mood: b.mood });
  return fill(b.print, { text: pick.text });
}

/** Kiro still runs the tiny core here. */
export function kiroIsWeak(g: ChapterState): boolean {
  const k = levelScript(g).kiro;
  if (!k?.weak) return false;
  return !(k.weakUntilCore && g.rt.loadedCores.has(k.weakUntilCore));
}

/** The stage id of the companion (what a `spawn` step names to bring him in). */
const KIRO_ENTITY = 'kiro';

/** Where Kiro stands in the room: `undefined` = not on stage. */
export function kiroStage<T extends object>(g: ChapterState, base: T, cwdPath: string, exitOpen: boolean): (T & { alpha?: number }) | undefined {
  const k = levelScript(g).kiro;
  const stK = g.rt.spec.stage?.kiro;
  const withStage = stK
    ? {
        ...base,
        ...(stK.x !== undefined ? { x: stK.x } : {}),
        ...(stK.y !== undefined ? { y: stK.y } : {}),
        ...(stK.target !== undefined ? { target: stK.target } : {}),
        ...(stK.zOrder !== undefined ? { zOrder: stK.zOrder } : {}),
        ...(stK.scale !== undefined ? { scale: stK.scale } : {}),
        ...(stK.rotation !== undefined ? { rotation: stK.rotation } : {}),
        ...(stK.label !== undefined ? { label: stK.label } : {}),
      }
    : base;
  if (!k) return withStage;
  const stage = k.stage ?? 'show';
  const hiddenByScript =
    stage === 'hidden' ||
    (stage === 'crack_only' && g.kiro.activeCrack?.dirPath !== cwdPath) ||
    Boolean(k.hideWhen?.includes('intro') && g.intro) ||
    Boolean(k.hideWhen?.includes('exit_open') && exitOpen) ||
    Boolean(k.hideWhen?.includes('before_spawn') && !g.rt.spawned.has(KIRO_ENTITY));
  if (hiddenByScript && !g.editorShowHidden) return undefined;
  const loaded = k.labelLoaded?.cores.some((c) => g.rt.loadedCores.has(c));
  const label = loaded && k.labelLoaded ? k.labelLoaded.label : k.label;
  const resolved = label ? { ...withStage, label } : withStage;
  return hiddenByScript ? { ...resolved, alpha: 0.55 } : resolved;
}

/** Does the core the player typed (or now runs) satisfy the hub's wanted core? */
export function coreMatches(g: ChapterState, typed: string, want: string): boolean {
  const names = [want, ...(levelScript(g).kiro?.coreAliases?.[want] ?? [])];
  const t = typed.toLowerCase();
  return names.some((n) => t.includes(n));
}

export function coreReaction(g: ChapterState, want: string): ScriptCoreReaction | undefined {
  return levelScript(g).kiro?.reactions?.[want];
}

export { fill as fillTemplate };
