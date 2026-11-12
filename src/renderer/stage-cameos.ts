import { ModelCatalog, rasterizeModel } from '../procgen/index.js';
import { escHtml as esc } from './html-escape.js';
import { zoneCss, type StageOverlay } from './stage-overlay.js';

/**
 * Agent cameos: the four AI agents (the villains who pulled the dev in) pop into the page like a
 * video call, peeking down over the panel's top-right edge, mock or order the hero in a speech
 * balloon, then pull back up. All DOM (crisp, no pixel / CRT pass): the avatar is the agent's procgen
 * model drawn once by the software rasterizer (comic cel bands and ink) into a cached image.
 * One cameo at a time, queued; a newer tutorial prompt drops stale queued prompts and shortens the
 * one on screen. Timing runs on the stage clock with stepped poses.
 */

export type AgentName = 'clod' | 'gork' | 'codec' | 'antigravy' | 'kiro';
export type CameoMood = 'laugh' | 'order' | 'smug' | 'annoyed';

/** The agent models (src/procgen/archetypes/cinematic/agents.ts + npc.kiro_ghost). */
export const AGENT_MODELS: Record<AgentName, string> = {
  clod: 'agent.clod',
  gork: 'agent.gork',
  codec: 'agent.codec',
  antigravy: 'agent.antigravy',
  kiro: 'npc.kiro_ghost',
};

export interface CameoRequest {
  agent: string;
  model?: string;
  text: string;
  mood: CameoMood;
  /** A tutorial prompt: the command the player should type, shown under the text. */
  command?: string;
  /** e.g. `PROMPT 1/5` */
  tag?: string;
}

interface Active {
  req: CameoRequest;
  agent: AgentName;
  el: HTMLDivElement;
  avatar: HTMLImageElement;
  balloon: HTMLDivElement;
  word: HTMLDivElement | null;
  t: number;
  holdMs: number;
  phase: 'in' | 'hold' | 'out';
  laughAt: number;
}

const IN_MS = 300;
const OUT_MS = 260;

function agentOf(name: string): AgentName {
  return (name in AGENT_MODELS ? name : 'clod') as AgentName;
}

const avatarCache = new Map<string, string>();

/** The agent model rasterized once (software renderer: cel bands, ink, emissive), as a data URL. */
export function agentAvatar(modelId: string): string {
  const hit = avatarCache.get(modelId);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    if (ModelCatalog.has(modelId)) {
      const r = rasterizeModel(ModelCatalog.build(modelId, 1), { size: 220, background: null });
      const c = document.createElement('canvas');
      c.width = r.image.width;
      c.height = r.image.height;
      c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(r.image.data), r.image.width, r.image.height), 0, 0);
      url = c.toDataURL();
    }
  } catch {
    url = '';
  }
  avatarCache.set(modelId, url);
  return url;
}

export class CameoDirector {
  private queue: CameoRequest[] = [];
  private active: Active | null = null;
  /** Most cameos ever on screen at once (the self-check asserts it stays 1). */
  maxConcurrent = 0;
  shown = 0;

  constructor(private readonly overlay: StageOverlay) {}

  get visible(): number {
    return this.active ? 1 : 0;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Rasterize the four avatars ahead of time (a few ms each) so the first taunt does not hitch. */
  warm(): void {
    for (const id of Object.values(AGENT_MODELS)) agentAvatar(id);
  }

  enqueue(req: CameoRequest): void {
    const text = String(req.text ?? '').trim();
    if (!text && !req.command) return;
    const r = { ...req, text: text.slice(0, 220) };
    // The same line twice in a row (a taunt mirrored by a tutorial step): show it once.
    const last = this.queue[this.queue.length - 1] ?? this.active?.req;
    if (last && last.text === r.text && agentOf(last.agent) === agentOf(r.agent)) {
      if (r.command && !last.command) {
        Object.assign(last, { command: r.command, tag: r.tag });
        if (this.active?.req === last) this.fillBalloon(this.active);
      }
      return;
    }
    if (r.command) {
      // A newer tutorial prompt makes older prompts and queued chatter stale: the player has moved on.
      this.queue = this.queue.filter((q) => !q.command);
      // The window on screen is stale too: let it say its line briefly, then leave.
      if (this.active && this.active.phase !== 'out') this.active.holdMs = Math.min(this.active.holdMs, (this.active.phase === 'hold' ? this.active.t : 0) + 450);
    }
    this.queue.push(r);
    // Never let commentary pile up behind the player: keep the newest few (prompts first).
    while (this.queue.length > 4) {
      const drop = this.queue.findIndex((q) => !q.command);
      this.queue.splice(drop >= 0 ? drop : 0, 1);
    }
  }

  update(dt: number): void {
    const dtMs = dt * 1000;
    // Socket dialogue is game information; commentary waits while it is on screen, and a cameo already
    // showing leaves early (its line is in the terminal too).
    const yieldToDialogue = this.overlay.dialogueOpen;
    if (!this.active && this.queue.length && !yieldToDialogue) this.start(this.queue.shift()!);
    const a = this.active;
    if (!a) return;
    a.t += dtMs;
    if (yieldToDialogue && a.phase !== 'out') a.holdMs = Math.min(a.holdMs, (a.phase === 'hold' ? a.t : 0) + 200);
    const r = this.overlay.rect;
    const u = this.overlay.unit;
    // Top-right corner of the panel, under the HUD strip: the top-left belongs to the DOM prompt card.
    const right = r.x + r.w - 12;
    // Below whatever page chrome covers the top-right (HUD strip + its button row), measured live.
    let chromeBottom = 0;
    const base = this.overlay.root.getBoundingClientRect();
    for (const id of ['hud', 'topbar']) {
      const el = document.getElementById(id);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.right > base.left + r.x + r.w * 0.5) chromeBottom = Math.max(chromeBottom, b.bottom - base.top);
    }
    const top = Math.max(r.y + Math.max(64, u * 1.05), chromeBottom + 10);
    const h = a.el.offsetHeight || u * 1.6;
    const hidden = -(top - r.y) - h - 20;
    let dy = 0;
    if (a.phase === 'in') {
      const k = Math.min(1, Math.floor((a.t / IN_MS) * 4) / 4);
      dy = hidden * (1 - k) + (a.t >= IN_MS * 0.75 && a.t < IN_MS ? 5 : 0);
      a.balloon.style.visibility = 'hidden';
      if (a.t >= IN_MS) {
        a.phase = 'hold';
        a.t = 0;
        a.balloon.style.visibility = '';
        this.beat(a);
      }
    } else if (a.phase === 'hold') {
      this.act(a);
      const n = Math.floor(a.t / 83);
      a.balloon.style.transform = `scale(${n === 0 ? 0.6 : n === 1 ? 1.08 : 1})`;
      const hold = this.queue.length >= 2 ? Math.min(a.holdMs, 2000) : a.holdMs;
      if (a.t >= hold) {
        a.phase = 'out';
        a.t = 0;
        a.balloon.style.visibility = 'hidden';
        a.word?.remove();
        a.word = null;
      }
    } else {
      const k = Math.min(1, Math.floor((a.t / OUT_MS) * 3) / 3);
      dy = hidden * k;
      if (a.t >= OUT_MS) {
        this.finish();
        return;
      }
    }
    a.el.style.right = `${(this.overlay.root.clientWidth - right).toFixed(1)}px`;
    a.el.style.top = `${top.toFixed(1)}px`;
    a.el.style.transform = `translateY(${dy.toFixed(1)}px)`;
    if (a.word) this.wordPose(a);
  }

  clear(): void {
    this.queue.length = 0;
    if (this.active) this.finish();
  }

  private start(req: CameoRequest): void {
    const agent = agentOf(req.agent);
    const modelId = req.model && ModelCatalog.has(req.model) ? req.model : AGENT_MODELS[agent];
    const el = document.createElement('div');
    el.className = `st-cameo mood-${req.mood}`;
    const isKiro = agent === 'kiro';
    const lamp = isKiro ? '#4cc9f0' : req.mood === 'annoyed' || req.mood === 'order' ? '#ef476f' : '#06d6a0';
    const label = isKiro ? 'KIRO.D' : agent.toUpperCase();
    const badge = isKiro ? 'LOCAL' : 'LIVE';
    el.innerHTML = `<div class="win"><div class="screen"><img alt=""></div><div class="tag" style="--lamp:${lamp}">${esc(label)}<em>${badge}</em></div></div><div class="balloon"></div>`;
    const avatar = el.querySelector('img')!;
    const src = agentAvatar(modelId);
    if (src) avatar.src = src;
    else avatar.style.display = 'none';
    const balloon = el.querySelector('.balloon') as HTMLDivElement;
    this.overlay.cameoLayer.appendChild(el);
    const holdMs = 2600 + Math.min(900, req.text.length * 12);
    this.active = { req, agent, el, avatar, balloon, word: null, t: 0, holdMs, phase: 'in', laughAt: 0 };
    this.fillBalloon(this.active);
    this.shown++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.overlay.cameoLayer.childElementCount);
  }

  private fillBalloon(a: Active): void {
    const r = a.req;
    a.balloon.innerHTML = `${r.tag ? `<b>${esc(r.tag)}</b>` : ''}${esc(r.text)}${r.command ? `<br><code>$ ${esc(r.command)}</code>` : ''}`;
  }

  /** The mood's one beat on arrival: laugh lettering, the pointing jab, the annoyed TSK. */
  private beat(a: Active): void {
    const word = a.req.mood === 'laugh' ? (a.agent === 'gork' ? 'LOL!' : 'HA HA HA!') : a.req.mood === 'annoyed' ? 'TSK!' : null;
    if (!word) return;
    const w = document.createElement('div');
    w.className = `st-word ${a.req.mood === 'laugh' ? 'burst' : 'jagged'} cword`;
    w.textContent = word;
    w.style.setProperty('--c', a.req.mood === 'laugh' ? zoneCss('paper') : zoneCss('malwareEye'));
    w.style.setProperty('--fs', `${Math.max(16, this.overlay.unit * 0.36).toFixed(1)}px`);
    a.el.querySelector('.win')!.appendChild(w);
    a.word = w;
  }

  private wordPose(a: Active): void {
    const n = Math.floor(a.t / 83);
    const w = a.word!;
    if (a.req.mood === 'laugh') {
      const sc = n === 0 ? 1.3 : n === 1 ? 0.92 : 1;
      w.style.transform = `translate(calc(-60% + ${n % 2 ? 2 : -2}px), -100%) rotate(${n % 4 < 2 ? -7 : -3}deg) scale(${sc})`;
    } else {
      w.style.transform = `translate(calc(-60% + ${n % 2 ? 2 : -2}px), -100%) rotate(${n % 2 ? 2 : -4}deg)`;
    }
    if (a.t > 1200) {
      w.remove();
      a.word = null;
    }
  }

  /** Stepped acting on the avatar image (12 poses per second, like the 3D cast). */
  private act(a: Active): void {
    const n = Math.floor(a.t / 83);
    let tx = 0;
    let ty = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    switch (a.req.mood) {
      case 'laugh':
        // Shaking with laughter on twos, a hop every fourth pose, a fresh fit every 1.4 s.
        tx = n % 2 ? 3 : -3;
        ty = n % 4 === 0 ? -4 : 0;
        sy = n % 4 === 0 ? 1.04 : 0.98;
        if (a.t - a.laughAt > 1400 && a.t < a.holdMs - 600) a.laughAt = a.t;
        break;
      case 'order':
        // Leaning toward the hero (screen-left), jabbing out on the beat.
        tx = n % 6 < 2 ? -9 : -3;
        rot = n % 6 < 2 ? -9 : -3;
        break;
      case 'smug':
        rot = Math.floor(a.t / 500) % 2 ? 6 : 3;
        ty = Math.floor(a.t / 600) % 2 ? -2 : 0;
        break;
      default:
        tx = n % 3 === 0 ? 2 : -2;
        sx = 1.02;
        break;
    }
    a.avatar.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sx}, ${sy})`;
  }

  private finish(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.el.remove();
  }
}
