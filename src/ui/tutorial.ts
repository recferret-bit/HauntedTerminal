import type { KernelEvent } from '../contracts/events.js';
import type { TutorialState } from '../game/types.js';
import { dom, replayClass } from './dom-lite.js';

export type AgentId = TutorialState['agent'];
type TauntSpeakerId = Extract<KernelEvent, { type: 'AGENT_TAUNT' }>['agent'];

/** One colour per AI agent (plus local Kiro Ghost), shared by the prompt card and terminal lines. */
export const AGENTS: Record<TauntSpeakerId, { name: string; colour: string; ink: string; rgb: [number, number, number] }> = {
  clod: { name: 'CLOD', colour: '#ff8a3d', ink: '#140f12', rgb: [255, 138, 61] },
  gork: { name: 'GORK', colour: '#ef476f', ink: '#ffffff', rgb: [255, 92, 122] },
  codec: { name: 'CODEC', colour: '#06d6a0', ink: '#140f12', rgb: [6, 214, 160] },
  antigravy: { name: 'ANTI-GRAVY', colour: '#5b8cff', ink: '#ffffff', rgb: [127, 165, 255] },
  kiro: { name: 'KIRO.D', colour: '#4cc9f0', ink: '#110e1b', rgb: [76, 201, 240] },
};

/** `[GORK] text` in the agent's colour, for the terminal. */
export function taunt(ev: Extract<KernelEvent, { type: 'AGENT_TAUNT' }>): string {
  const a = AGENTS[ev.agent];
  const [r, g, b] = a.rgb;
  return `\x1b[1;38;2;${r};${g};${b}m[${a.name}]\x1b[0;38;2;${r};${g};${b}m ${ev.text}\x1b[0m`;
}

export interface TutorialCard {
  /** The snapshot's tutorial state (source of truth). */
  sync(state: TutorialState | null): void;
  /** A TUTORIAL_STEP event: `done` stamps the card before the next prompt replaces it. */
  step(ev: Extract<KernelEvent, { type: 'TUTORIAL_STEP' }>): void;
  hide(): void;
}

const STAMP_MS = 1100;

export function mountTutorial(parent: HTMLElement, onSkip?: () => void): TutorialCard {
  const agentEl = dom('span', { class: 'tut-agent' });
  const stepEl = dom('span', { class: 'tut-step' });
  const textEl = dom('p', { class: 'tut-text' });
  const cmdEl = dom('code');
  const skip = onSkip ? dom('button', { type: 'button', class: 'tut-skip' }, ['skip tutorial »']) : null;
  if (skip && onSkip) skip.onclick = () => onSkip();

  const card = dom(
    'section',
    { id: 'tutorial-card', 'aria-live': 'polite' },
    [
      dom('header', {}, [agentEl, dom('span', { class: 'tut-kind' }, ['AGENT PROMPT']), stepEl]),
      textEl,
      dom('div', { class: 'tut-cmd' }, [dom('span', { class: 'tut-label' }, ['TYPE']), cmdEl]),
      dom('div', { class: 'tut-stamp', 'aria-hidden': 'true' }, [dom('i', {}, ['OK']), ' DONE']),
      skip,
    ],
  );
  parent.appendChild(card);

  let shownKey = '';
  let stampUntil = 0;
  let stampTimer = 0;
  let pending: TutorialState | null = null;

  const render = (s: { step: number; total: number; agent: AgentId; prompt: string; command: string }) => {
    const a = AGENTS[s.agent];
    card.style.setProperty('--agent', a.colour);
    card.style.setProperty('--agent-ink', a.ink);
    agentEl.textContent = a.name;
    stepEl.textContent = `${s.step}/${s.total}`;
    textEl.textContent = s.prompt;
    cmdEl.textContent = s.command;
  };

  const show = (s: TutorialState | null) => {
    if (!s) {
      card.classList.remove('open', 'done');
      shownKey = '';
      return;
    }
    const key = `${s.step}|${s.prompt}|${s.command}`;
    if (key === shownKey && card.classList.contains('open')) return;
    const fresh = key !== shownKey;
    shownKey = key;
    card.classList.remove('done');
    render(s);
    card.classList.add('open');
    if (fresh) replayClass(card, 'enter');
  };

  return {
    sync(state) {
      if (performance.now() < stampUntil) {
        pending = state;
        return;
      }
      show(state);
    },
    step(ev) {
      if (!ev.done) {
        if (performance.now() >= stampUntil) show({ step: ev.step, total: ev.total, agent: ev.agent, prompt: ev.prompt, command: ev.command });
        return;
      }
      // Stamp the finished step, then move on to whatever the snapshot says.
      render(ev);
      shownKey = `${ev.step}|${ev.prompt}|${ev.command}`;
      card.classList.add('open');
      card.classList.remove('done');
      void card.offsetWidth;
      card.classList.add('done');
      stampUntil = performance.now() + STAMP_MS;
      window.clearTimeout(stampTimer);
      stampTimer = window.setTimeout(() => {
        stampUntil = 0;
        show(pending);
        pending = null;
      }, STAMP_MS);
    },
    hide() {
      window.clearTimeout(stampTimer);
      stampUntil = 0;
      pending = null;
      show(null);
    },
  };
}
