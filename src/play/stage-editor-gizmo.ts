import type { StageActorRef, StageRect } from '../contracts/stage-editor.js';

export interface GizmoHandlers {
  onScaleStart(ev: PointerEvent): void;
  onRotateStart(ev: PointerEvent): void;
}

export interface StageEditorGizmo {
  update(bounds: StageRect | null, ref: StageActorRef | null, mode?: string): void;
  destroy(): void;
}

function makeButton(cls: string, label: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = cls;
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  return btn;
}

function fmtNum(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '') || '0';
}

export function mountStageEditorGizmo(
  hostEl: HTMLElement,
  handlers: GizmoHandlers,
): StageEditorGizmo {
  hostEl.querySelector('.st-ed-layer')?.remove();

  const layer = document.createElement('div');
  layer.className = 'st-ed-layer';

  const box = document.createElement('div');
  box.className = 'st-ed-box';
  box.hidden = true;

  const pill = document.createElement('div');
  pill.className = 'st-ed-pill';

  const rotBtn = makeButton('st-ed-handle st-ed-rot', '⟳', 'Rotate actor (Shift = 15° snap)');
  const scaleBtn = makeButton('st-ed-handle st-ed-scale', '⤡', 'Scale actor proportionally');

  rotBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlers.onRotateStart(e);
  });
  scaleBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlers.onScaleStart(e);
  });

  box.append(pill, rotBtn, scaleBtn);
  layer.append(box);
  hostEl.append(layer);

  return {
    update(bounds, ref, mode) {
      if (!bounds || !ref) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      box.dataset.actorId = ref.actorId;
      box.dataset.mode = mode ?? 'idle';
      const hostW = hostEl.clientWidth || window.innerWidth;
      const hostH = hostEl.clientHeight || window.innerHeight;
      box.style.left = `${bounds.left.toFixed(1)}px`;
      box.style.top = `${bounds.top.toFixed(1)}px`;
      box.style.width = `${bounds.width.toFixed(1)}px`;
      box.style.height = `${bounds.height.toFixed(1)}px`;
      pill.style.top = bounds.top < 26 ? '4px' : '-22px';
      const rLeft = Math.min(hostW - 24, Math.max(2, bounds.left + bounds.width - 18)) - bounds.left;
      const rTop = Math.min(hostH - 24, Math.max(2, bounds.top - 32)) - bounds.top;
      rotBtn.style.left = `${rLeft.toFixed(1)}px`;
      rotBtn.style.right = 'auto';
      rotBtn.style.top = `${rTop.toFixed(1)}px`;
      const sLeft = Math.min(hostW - 24, Math.max(2, bounds.left + bounds.width - 11)) - bounds.left;
      const sTop = Math.min(hostH - 24, Math.max(2, bounds.top + bounds.height - 11)) - bounds.top;
      scaleBtn.style.left = `${sLeft.toFixed(1)}px`;
      scaleBtn.style.top = `${sTop.toFixed(1)}px`;
      scaleBtn.style.right = 'auto';
      scaleBtn.style.bottom = 'auto';
      const name = ref.label || ref.target || ref.actorId;
      pill.textContent = `${name} (${fmtNum(ref.x)}, ${fmtNum(ref.y)})`;
    },
    destroy() {
      layer.remove();
    },
  };
}
