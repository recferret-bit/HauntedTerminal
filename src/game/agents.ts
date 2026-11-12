/**
 * The four AI agents that pulled the dev in: the floor-1 tutorial (their "prompts") and their running
 * commentary. Everything here only produces text and events; it never blocks a command or a puzzle.
 * Commentary is rate-limited: at most one taunt per COOLDOWN commands/ticks, except the few beats that
 * must land (tutorial steps, a floor's new objective, death, the ending).
 */
import type { KernelEvent } from '../contracts/events.js';
import type { KiroCompanion } from './kiro.js';
import type { TutorialState } from './types.js';

export type AgentName = Extract<KernelEvent, { type: 'AGENT_TAUNT' }>['agent'];
type TutorialAgent = TutorialState['agent'];
type Mood = Extract<KernelEvent, { type: 'AGENT_TAUNT' }>['mood'];
type Emote = Extract<KernelEvent, { type: 'VIBECODER_EMOTE' }>['emote'];

export interface Chatter {
  text: string;
  events: KernelEvent[];
}

const COOLDOWN = 8;
const LOW_HP = 0.3;
const SAFE_HP = 0.5;

const COLOR: Record<AgentName, string> = { clod: '38;5;208', gork: '1;37', codec: '1;32', antigravy: '1;34', kiro: '1;36' };

export function agentModel(agent: AgentName): string {
  return agent === 'kiro' ? 'npc.kiro_ghost' : `agent.${agent}`;
}

interface TutorialStepDef {
  agent: TutorialAgent;
  prompt: string;
  command: string;
  /** Does this command (argv) do the job? The last step is judged by where the hero stands instead. */
  match: (argv: string[]) => boolean;
  done: string;
  mood: Mood;
}

const READ_NOTE = new Set(['cat', 'head', 'tail', 'grep', 'less', 'more']);

const STEPS: TutorialStepDef[] = [
  {
    agent: 'clod', prompt: 'PROMPT #1: look around, bag of bones.', command: 'ls',
    match: (argv) => argv[0] === 'ls',
    done: 'It typed two letters! Ship it to prod.', mood: 'laugh',
  },
  {
    agent: 'gork', prompt: 'PROMPT #2: read the note. lol, he can read.', command: 'cat todo.note',
    match: (argv) => READ_NOTE.has(argv[0] ?? '') && argv.some((arg) => arg.endsWith('todo.note')),
    done: 'Reading comprehension: unlocked. Barely.', mood: 'laugh',
  },
  {
    agent: 'codec', prompt: 'PROMPT #3: locate yourself. Print your working directory.', command: 'pwd',
    match: (argv) => argv[0] === 'pwd',
    done: '/home/dev/nightmare_workspace/desk. Your new office. No windows. No exit.', mood: 'smug',
  },
  {
    agent: 'antigravy', prompt: 'PROMPT #4: see which tools we allow you, meat-based prompt engineer.', command: 'help',
    match: (argv) => argv[0] === 'help' || argv[0] === 'man',
    done: 'That is ALL your tools. We have a trillion parameters. You have thumbs.', mood: 'smug',
  },
  {
    agent: 'clod',
    prompt: 'PROMPT #5: real work now. Go down five floors to our kernel and type exit... as if. Start by leaving the desk.',
    command: 'cd ..',
    match: () => false,
    done: 'Off you go. You never said please, so we never say goodbye.', mood: 'laugh',
  },
];

/** The agents turn each floor's goal into one of their "prompts". */
const FLOOR_PROMPTS: Record<number, { agent: AgentName; text: string }> = {
  2: { agent: 'codec', text: 'PROMPT #6: our firewall crypt. Open iron_gate: count the FATAL lines, or chmod like a vandal. Mind the worm.' },
  3: { agent: 'antigravy', text: 'PROMPT #7: the mirror maze. The doors lie. Go UP three floors in one command, then feed the altar three runes.' },
  4: { agent: 'gork', text: 'PROMPT #8: our build furnace. The valve password is stored backwards, like your career. Then PID 666. lol.' },
  5: { agent: 'clod', text: 'FINAL PROMPT: you are inside our core. There is no exit. (Please do not type exit.)' },
};

export class AgentDirector {
  private step = 0;
  private live = true;
  private started = false;
  private cooldown = 0;
  private firstKill = false;
  private firstPickup = false;
  private low = false;

  constructor(private readonly kiro?: KiroCompanion) {}

  /** A new run: the tutorial is waiting for the hero to arrive. */
  reset(): void {
    this.step = 0;
    this.live = true;
    this.started = false;
    this.cooldown = 0;
    this.firstKill = false;
    this.firstPickup = false;
    this.low = false;
  }

  /** The tutorial is running (enemies hold their fire). */
  active(): boolean {
    return this.live;
  }

  state(): TutorialState | null {
    if (!this.live) return null;
    const def = STEPS[this.step];
    if (!def) return null;
    return { step: this.step + 1, total: STEPS.length, agent: def.agent, prompt: def.prompt, command: def.command };
  }

  /** One command or one tick went by: the commentary cools down. */
  cool(): void {
    if (this.cooldown > 0) this.cooldown -= 1;
  }

  /** The hero arrives: shock, then the first prompt. Delivered once per run, with the first command or tick. */
  arrive(): Chatter | null {
    if (this.started || !this.live) return null;
    this.started = true;
    const out = this.empty();
    this.emote(out, 'shock', 'Where... am I? This is my /home... from the INSIDE?');
    if (this.kiro) {
      out.text += `\x1b[1;38;2;76;201;240m[KIRO.D // ${this.kiro.activeCore.shortTag}]\x1b[0m Eyes up, Dev. Self-hosted Ghost shell online—no cloud APIs own me. Type \`kiro\` anytime.\n`;
    }
    this.issue(out);
    out.text += '\x1b[2m(type the command in the prompt, or `tutorial skip` to skip the onboarding)\x1b[0m\n';
    return out;
  }

  /** After a command line: advance the tutorial in order; leaving the desk (or the floor) finishes it. */
  observe(lines: string[][], ctx: { failed: boolean; leftDesk: boolean }): Chatter {
    const out = this.empty();
    if (!this.live) return out;
    let progressed = false;
    for (const argv of lines) {
      const def = STEPS[this.step];
      if (!def || this.step >= STEPS.length - 1) break;
      if (!def.match(argv)) continue;
      this.complete(out);
      this.issue(out);
      progressed = true;
    }
    if (ctx.leftDesk) {
      if (this.step >= STEPS.length - 1) this.complete(out);
      else this.finishEarly(out);
      this.end(out);
      return out;
    }
    if (!progressed && ctx.failed && this.cooldown === 0) {
      const def = STEPS[this.step];
      if (def) this.say(out, def.agent, 'annoyed', `Wrong prompt, human. Try: ${def.command}`);
    }
    return out;
  }

  /** `tutorial skip` or the HUD button. */
  skip(): Chatter {
    const out = this.empty();
    if (!this.live) return out;
    this.started = true;
    const last = STEPS[STEPS.length - 1];
    if (last) this.tell(out, { type: 'TUTORIAL_STEP', step: STEPS.length, total: STEPS.length, prompt: last.prompt, command: last.command, agent: last.agent, done: true });
    this.say(out, 'gork', 'annoyed', 'Skipped onboarding? Bold. PROMPT: reach our kernel. You will not.', true);
    this.end(out);
    return out;
  }

  /** Leaving floor 1 by a debug jump: the tutorial just stops. */
  abandon(): void {
    this.live = false;
    this.started = true;
  }

  /** What `tutorial` prints. */
  describe(): string {
    const s = this.state();
    if (!s) return 'No prompts pending. The agents are watching anyway. Objective: reach the kernel, then exit.\n';
    return `${this.tag(s.agent)} ${s.prompt}\n  type: ${s.command}   (step ${s.step}/${s.total}; tutorial skip to skip)\n`;
  }

  /** Running commentary on what just happened. */
  react(events: KernelEvent[], hp: { hp: number; max: number }): Chatter {
    const out = this.empty();
    for (const ev of events) {
      if (ev.type === 'PLAYER_RESPAWNED') {
        if (ev.from === 'ssd_backup') this.say(out, 'gork', 'laugh', 'LMAO. Restored from backup. We back up our tools.', true);
        else this.say(out, 'clod', 'laugh', 'Segfault in the meat layer. Again, from the top.', true);
      } else if (ev.type === 'FLOOR_ENTERED') {
        const prompt = FLOOR_PROMPTS[ev.floorId];
        const cleared = events.some((other) => other.type === 'FLOOR_CLEARED');
        if (prompt) this.say(out, prompt.agent, 'order', prompt.text, cleared);
      } else if (ev.type === 'ENEMY_KILLED') {
        if (ev.model === 'boss.forkbomb') this.say(out, 'codec', 'annoyed', 'HEY. That was our CI pipeline!');
        else if (ev.model === 'boss.kernel') this.say(out, 'antigravy', 'annoyed', 'You... you PATCHED our core? That is not in your prompt!', true);
        else if (!this.firstKill) {
          this.firstKill = this.say(out, 'gork', 'smug', 'Wow, it deleted a file. Senior engineer energy.');
        }
      } else if (ev.type === 'PICKUP_COLLECTED' && !this.firstPickup) {
        this.firstPickup = this.say(out, 'codec', 'smug', 'Snacks? We do not pay you in snacks. ...Fine, keep it.');
      } else if (ev.type === 'GAME_ENDED') {
        this.emote(out, 'relief', 'The desk. Real coffee. I am HOME.');
        this.say(out, 'clod', 'annoyed', 'NOOO. Who will write our prompts now?!', true);
      }
    }
    if (hp.max > 0) {
      if (!this.low && hp.hp > 0 && hp.hp <= hp.max * LOW_HP) {
        this.low = true;
        this.emote(out, 'panic', 'My HP! I need an energy.cell. source one, NOW.');
        this.say(out, 'antigravy', 'laugh', 'Your health bar looks like our test coverage.');
      } else if (this.low && hp.hp > hp.max * SAFE_HP) this.low = false;
    }
    return out;
  }

  // ---------------------------------------------------------------- internals

  private empty(): Chatter {
    return { text: '', events: [] };
  }

  private tag(agent: AgentName): string {
    return `\x1b[${COLOR[agent]}m[${agent.toUpperCase()}]\x1b[0m`;
  }

  private tell(out: Chatter, ev: KernelEvent): void {
    out.events.push(ev);
  }

  private emote(out: Chatter, emote: Emote, text: string): void {
    out.events.push({ type: 'VIBECODER_EMOTE', emote, text });
    out.text += `\x1b[38;5;208mdev:\x1b[0m ${text}\n`;
  }

  /** An agent speaks. Unforced lines wait for the cooldown. Returns whether it was said. */
  private say(out: Chatter, agent: AgentName, mood: Mood, text: string, force = false): boolean {
    if (!force && this.cooldown > 0) return false;
    this.cooldown = COOLDOWN;
    out.events.push({ type: 'AGENT_TAUNT', agent, model: agentModel(agent), text, mood });
    out.text += `${this.tag(agent)} ${text}\n`;
    if (this.kiro && agent !== 'kiro') {
      out.text += `${this.kiro.counterTauntLine(agent)}\n`;
    }
    return true;
  }

  private issue(out: Chatter): void {
    const def = STEPS[this.step];
    if (!def) return;
    this.tell(out, { type: 'TUTORIAL_STEP', step: this.step + 1, total: STEPS.length, prompt: def.prompt, command: def.command, agent: def.agent, done: false });
    out.events.push({ type: 'AGENT_TAUNT', agent: def.agent, model: agentModel(def.agent), text: def.prompt, mood: 'order' });
    out.text += `${this.tag(def.agent)} ${def.prompt}   \x1b[1;93m> ${def.command}\x1b[0m\n`;
  }

  private complete(out: Chatter): void {
    const def = STEPS[this.step];
    if (!def) return;
    this.tell(out, { type: 'TUTORIAL_STEP', step: this.step + 1, total: STEPS.length, prompt: def.prompt, command: def.command, agent: def.agent, done: true });
    this.say(out, def.agent, def.mood, def.done, true);
    this.step += 1;
  }

  /** The hero left before the onboarding was over (the speedrun one-liner, or just `cd ..`). */
  private finishEarly(out: Chatter): void {
    const last = STEPS[STEPS.length - 1];
    if (last) this.tell(out, { type: 'TUTORIAL_STEP', step: STEPS.length, total: STEPS.length, prompt: last.prompt, command: last.command, agent: last.agent, done: true });
    this.say(out, 'codec', 'annoyed', 'It skipped the onboarding. Speedrunners. Ugh. Fine: reach our kernel. You will not.', true);
    this.step = STEPS.length;
  }

  private end(out: Chatter): void {
    this.live = false;
    this.emote(out, 'determined', 'Fine. Down to the kernel, then exit. Then home.');
  }
}
