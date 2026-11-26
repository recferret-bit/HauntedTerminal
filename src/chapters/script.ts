import type { KernelEvent } from '../contracts/events.js';
import { dialogueEvent } from '../game/dialogue.js';
import { giveItem, heroModel, holdItem, ITEMS } from '../game/inventory.js';
import { lookup, type VNode } from '../game/tree.js';
import type { TutorialState } from '../game/types.js';
import { resolveTauntAgent, type ChapterState } from './session-state.js';
import type { LevelScript, ScriptAgent, ScriptBullying, ScriptCond, ScriptCoreReaction, ScriptStep, ScriptTutorial } from './types.js';

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
    case 'ran_command':
      return g.rt.commandsRun.has(c.name);
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
    case 'tutorial_skipped':
      return g.rt.tutorialSkipped;
    case 'any':
      return c.of.some((x) => evalCond(g, x));
    case 'all':
      return c.of.every((x) => evalCond(g, x));
  }
}

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
      const name = s.speaker.toUpperCase();
      const model = s.speaker === 'vibecoder' ? (env.heroModel ?? 'vibecoder.dev_terminal') : agentModel(s.speaker);
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
    case 'give_item':
      return { events: [{ type: 'ITEM_GIVEN', item: s.item, model: ITEMS[s.item].model, from: s.from, held: env.itemHeld ?? true }], print: '' };
  }
}

/** The tutorial card event for step `n` (1-based) and the terminal line announcing it. */
export function tutorialCard(tut: ScriptTutorial | undefined, n: number, done: boolean): { events: KernelEvent[]; print: string } {
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
  for (const s of steps) {
    if (s.kind === 'give_item') {
      const wasEmpty = g.inventory.held === null;
      g.inventory = giveItem(g.inventory, s.item);
      if (wasEmpty) g.inventory = holdItem(g.inventory, s.item);
      env.itemHeld = wasEmpty;
      env.heroModel = heroModel(g.inventory.held);
    }
    const r = stepOutput(s, env);
    if (s.kind === 'spawn') g.rt.spawned.add(s.entityId);
    events.push(...r.events);
    out += r.print;
  }
  return out;
}

/** First arrival in a level: its `arrival` script, or the dialog taunt as a smug cameo. */
export function arrivalScript(g: ChapterState, events: KernelEvent[]): string {
  const steps = levelScript(g).arrival ?? [{ kind: 'taunt', mood: 'smug' } satisfies ScriptStep];
  return runSteps(g, steps, events);
}

// ---- timed entries and command locks -------------------------------------------------------------------------

/** One level tick (a second): fires every `script.timed` entry whose `afterSec` is reached. Returns the terminal text. */
export function runTimed(g: ChapterState, events: KernelEvent[]): string {
  g.rt.levelTicks += 1;
  let out = '';
  (levelScript(g).timed ?? []).forEach((t, i) => {
    if (g.rt.timedFired.has(i) || g.rt.levelTicks < t.afterSec) return;
    g.rt.timedFired.add(i);
    if (t.unless && evalCond(g, t.unless)) return;
    out += runSteps(g, t.steps, events);
  });
  return out;
}

/** The refusal text when a `script.locks` entry blocks this command word, else undefined. */
export function lockMessage(g: ChapterState, command: string): string | undefined {
  const lock = levelScript(g).locks?.find((l) => l.command === command && !evalCond(g, l.until));
  return lock?.message;
}

// ---- tutorial ----------------------------------------------------------------------------------------------

/** Emits the card for step `n` (1-based). Returns the terminal line announcing it. */
function announceTutorialStep(g: ChapterState, n: number, done: boolean, events: KernelEvent[]): string {
  const r = tutorialCard(levelScript(g).tutorial, n, done);
  events.push(...r.events);
  return r.print;
}

/** Current step (1-based): the first one whose `doneWhen` does not hold. */
export function tutorialStepNumber(g: ChapterState): number {
  const steps = levelScript(g).tutorial?.steps ?? [];
  for (let i = 0; i < steps.length; i++) {
    const done = steps[i]!.doneWhen;
    if (!done || !done.some((c) => evalCond(g, c))) return i + 1;
  }
  return steps.length;
}

export function tutorialState(g: ChapterState): TutorialState | null {
  const tut = levelScript(g).tutorial;
  if (!tut || g.intro || g.rt.tutorialSkipped || g.ended) return null;
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

const SKIP_KEEP = new Set<ScriptStep['kind']>(['spawn', 'carry_item', 'give_item']);

/**
 * Drops every tutorial beat that has not played yet. Dialogs, emotes and prompts
 * are discarded. A spawn or an item hand-off still runs, so the sector stays playable.
 */
function fastForwardSkippedBeats(g: ChapterState, events: KernelEvent[]): void {
  const timed = levelScript(g).timed ?? [];
  timed.forEach((entry, i) => {
    if (g.rt.timedFired.has(i)) return;
    g.rt.timedFired.add(i);
    if (entry.unless && evalCond(g, entry.unless)) return;
    const steps = entry.steps.filter((step) => SKIP_KEEP.has(step.kind));
    if (steps.length > 0) runSteps(g, steps, events);
  });
}

/** Skips any running tutorial on the current level and returns its skip text (or ''). */
export function applySkipTutorial(g: ChapterState, events: KernelEvent[]): string {
  const tut = levelScript(g).tutorial;
  g.rt.tutorialSkipped = true;
  fastForwardSkippedBeats(g, events);
  if (tut) {
    if (!g.rt.hiddenRevealed) revealHidden(g, events);
    finishTutorial(g, events);
  }
  return tut?.skipText ?? '';
}

// ---- hidden enemy ------------------------------------------------------------------------------------------

export function isHiddenRevealed(g: ChapterState): boolean {
  const hide = levelScript(g).tutorial?.hide;
  return !hide || g.rt.hiddenRevealed || evalCond(g, hide.revealWhen);
}

/** Id of the enemy that must not be shown yet, or ''. */
export function hiddenEnemyId(g: ChapterState): string {
  const hide = levelScript(g).tutorial?.hide;
  return hide && !isHiddenRevealed(g) ? hide.enemyId : '';
}

export function isNodeHidden(g: ChapterState, node: VNode): boolean {
  const hide = levelScript(g).tutorial?.hide;
  return Boolean(hide && node.name === hide.node && !isHiddenRevealed(g));
}

export function revealHidden(g: ChapterState, events: KernelEvent[]): void {
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
export function kiroStage<T extends object>(g: ChapterState, base: T, cwdPath: string, exitOpen: boolean): T | undefined {
  const k = levelScript(g).kiro;
  if (!k) return base;
  const stage = k.stage ?? 'show';
  if (stage === 'hidden') return undefined;
  if (stage === 'crack_only') return g.kiro.activeCrack?.dirPath === cwdPath ? base : undefined;
  if ((k.hideWhen?.includes('intro') && g.intro) || (k.hideWhen?.includes('exit_open') && exitOpen)) return undefined;
  if (k.hideWhen?.includes('before_spawn') && !g.rt.spawned.has(KIRO_ENTITY)) return undefined;
  const loaded = k.labelLoaded?.cores.some((c) => g.rt.loadedCores.has(c));
  const label = loaded && k.labelLoaded ? k.labelLoaded.label : k.label;
  return label ? { ...base, label } : base;
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
