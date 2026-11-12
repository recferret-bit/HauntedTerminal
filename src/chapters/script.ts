import type { KernelEvent } from '../contracts/events.js';
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
      return { events: [{ type: 'ENTITY_SPAWNED', entityId: s.entityId, model: s.model, reason: 'script' }], print: '' };
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
          {
            type: 'OBSTACLE_DIALOGUE_RENDERED',
            payload: {
              obstacleId: s.obstacleId,
              speakerName: s.speaker,
              portraitSprite: s.portrait ?? 'socket_guardian',
              mood: s.mood,
              bubbleStyle: 'COMIX_CLASSIC',
              anchorInodeId: env.anchorOf(s.anchorSocket),
              pages: [{ text: s.text, highlightedUnixTokens: s.highlight }],
              ansiTerminalBanner: s.banner,
            },
          },
        ],
        print: '',
      };
    case 'tutorial_step':
      return tutorialCard(env.tutorial, s.step, false);
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
    taunt: g.pack.dialogs?.levels[g.rt.spec.id]?.agentTaunt,
    anchorOf: (socket) => g.rt.cwd.children.get(socket)?.id ?? g.rt.cwd.id,
    tutorial: levelScript(g).tutorial,
    vars,
  };
  let out = '';
  for (const s of steps) {
    const r = stepOutput(s, env);
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

/** Where Kiro stands in the room: `undefined` = not on stage. */
export function kiroStage<T extends object>(g: ChapterState, base: T, cwdPath: string, exitOpen: boolean): T | undefined {
  const k = levelScript(g).kiro;
  if (!k) return base;
  const stage = k.stage ?? 'show';
  if (stage === 'hidden') return undefined;
  if (stage === 'crack_only') return g.kiro.activeCrack?.dirPath === cwdPath ? base : undefined;
  if ((k.hideWhen?.includes('intro') && g.intro) || (k.hideWhen?.includes('exit_open') && exitOpen)) return undefined;
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
