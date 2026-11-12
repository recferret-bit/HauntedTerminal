import { bgColor } from '../domain/backgrounds.js';
import { VIBECODER_HEIGHT, inspectFraming, type Framing } from '../domain/framing.js';
import type { LabOptions } from '../domain/options.js';
import type { LabStage } from '../stage/lab-stage.js';
import { ACTOR_Z, LANTERN_RADIUS } from '../stage/stage-constants.js';
import type { Subject } from '../subjects/index.js';
import type { ClockMode } from '../subjects/part-animator.js';
import { el, fmt } from './dom.js';
import { buildInfoPanel } from './inspect-info.js';

/** One subject, large, in a single comic panel with the stage's own canvas mounted in it. */
export class InspectView {
  readonly root = el('div', 'lab-inspect');
  framing: Framing | null = null;
  private readonly host = el('div', 'lab-canvas-host');
  private readonly overlay = el('div', 'lab-overlay');
  private readonly caption = el('div', 'lab-caption');
  private readonly stamp = el('div', 'lab-stamp');
  private readonly scaleTag = el('div', 'lab-scale-tag');
  private readonly ground = el('div', 'lab-guide lab-guide-ground');
  private readonly vibecoder = el('div', 'lab-guide lab-guide-vibecoder');
  private readonly cone = el('div', 'lab-cone');
  private lastLantern: [number, number] = [0, 0];
  private readonly socketEls = new Map<string, HTMLElement>();
  private subject: Subject | null = null;
  private lanternAt: [number, number] | null = null;

  constructor(private readonly stage: LabStage) {
    const panel = el('div', 'lab-panel');
    this.vibecoder.append(el('span', '', `vibecoder ${VIBECODER_HEIGHT}`));
    this.ground.append(el('span', '', 'y = 0'));
    this.overlay.append(this.ground, this.vibecoder, this.cone);
    panel.append(this.host, this.overlay, this.caption, this.stamp, this.scaleTag);
    this.root.append(panel);
    this.host.addEventListener('pointermove', (ev) => {
      const box = this.host.getBoundingClientRect();
      this.lanternAt = this.stage.unproject(ev.clientX - box.left, ev.clientY - box.top);
    });
  }

  /** Show a subject, or an error card when the id is unknown or its spec threw. */
  mount(subject: Subject | null, error: string | null, id: string): void {
    this.subject = subject;
    this.lanternAt = null;
    this.socketEls.forEach((node) => node.remove());
    this.socketEls.clear();
    this.caption.replaceChildren(el('b', '', subject?.id ?? id), el('span', '', subject?.label ?? 'cannot be shown'));
    if (subject?.lore) this.caption.append(el('small', '', subject.lore));
    if (error) this.caption.append(el('small', 'lab-error', error));
    this.host.replaceChildren(...(subject ? [this.stage.canvas] : []));
    this.stamp.hidden = true;
    this.cone.hidden = true;
    this.ground.hidden = this.vibecoder.hidden = true;
    this.scaleTag.textContent = '';
    if (subject) {
      for (const name of Object.keys(subject.sockets)) {
        const node = el('div', 'lab-socket');
        node.append(el('i'), el('span', '', name));
        this.overlay.append(node);
        this.socketEls.set(name, node);
      }
    }
  }

  get mounted(): Subject | null {
    return this.subject;
  }

  /** Where a strike lands: on the floor just screen-right of the subject, slightly behind it. */
  strikePoint(): [number, number, number] {
    const b = this.subject?.bounds;
    return [b ? b.min[0] - 0.35 : 0, 0.02, ACTOR_Z + 0.4];
  }

  info(): HTMLElement {
    return buildInfoPanel(this.subject, this.framing, this.stage.drawStats());
  }

  render(opts: LabOptions, time: number, mode: ClockMode): void {
    const subject = this.subject;
    if (!subject) return;
    const width = this.host.clientWidth || 640;
    const height = this.host.clientHeight || 480;
    this.stage.setSize(width, height);
    const framing = inspectFraming(subject, opts.scale, width, height);
    this.framing = framing;

    subject.animator?.apply(time, opts.state, mode);

    const b = subject.bounds;
    // Default: the vibecoder's lantern, held to the screen-left of the subject so the cone edge crosses it.
    this.lastLantern = this.lanternAt ?? [b.max[0] + 0.9, 0.95];
    this.stage.render({
      subject,
      centerX: framing.centerX,
      centerY: framing.centerY,
      ppu: framing.ppu,
      yaw: opts.yaw,
      bg: bgColor(opts.bg),
      silhouette: opts.silhouette,
      lantern: opts.lantern,
      lanternAt: this.lastLantern,
      plinth: opts.plinth,
      flashHold: opts.flash,
      time,
    });
    this.updateOverlay(opts, framing);
  }

  private updateOverlay(opts: LabOptions, framing: Framing): void {
    const subject = this.subject;
    if (!subject) return;
    const actor = subject.kind !== 'texture';
    const z = actor ? ACTOR_Z : 0;
    const showGuides = opts.guides && actor && opts.yaw === 0;
    this.ground.hidden = !showGuides;
    this.vibecoder.hidden = !showGuides;
    if (showGuides) {
      this.ground.style.top = `${this.stage.project(0, 0, z)[1]}px`;
      this.vibecoder.style.top = `${this.stage.project(0, VIBECODER_HEIGHT, z)[1]}px`;
    }
    for (const [name, node] of this.socketEls) {
      node.hidden = !opts.sockets;
      if (!opts.sockets) continue;
      const s = subject.sockets[name]!;
      const [x, y] = this.stage.project(s[0], s[1], s[2] + z);
      node.style.transform = `translate(${x}px, ${y}px)`;
    }
    // The cone outline is a guide: the default pixel palette crushes the backdrop, so the edge is hard to see on it.
    const showCone = opts.lantern && opts.guides && !opts.silhouette && opts.yaw === 0;
    this.cone.hidden = !showCone;
    if (showCone) {
      const [cx, cy] = this.stage.project(this.lastLantern[0], this.lastLantern[1], z);
      const r = LANTERN_RADIUS * framing.ppu;
      this.cone.style.width = this.cone.style.height = `${r * 2}px`;
      this.cone.style.transform = `translate(${cx - r}px, ${cy - r}px)`;
    }
    this.stamp.hidden = opts.yaw === 0;
    if (opts.yaw !== 0) this.stamp.textContent = `DEBUG YAW ${opts.yaw > 0 ? '+' : ''}${opts.yaw}° // NOT HOW THE GAME SEES IT`;
    const tall = (subject.bounds.max[1] - subject.bounds.min[1]) * framing.ppu;
    this.scaleTag.textContent = `${fmt(framing.ppu, 1)} px/unit · ${Math.round(tall)} px tall${opts.scale === 'fit' ? ' · fit' : ''}`;
  }
}
