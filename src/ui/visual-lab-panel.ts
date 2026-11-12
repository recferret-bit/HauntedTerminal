import type { CrtParams } from '../shaders/crt-pass.js';
import { DEFAULT_CRT_PARAMS } from '../shaders/crt-pass.js';
import type { PixelArtParams } from '../shaders/pixel-art.js';
import { DEFAULT_PIXEL_PARAMS } from '../shaders/pixel-art.js';
import { LIGHT_MODES, type LightMode } from '../renderer/stage-light.js';
import { ensureStyle, switchButton } from './visual-lab-style.js';
import {
  DEFAULT_INK, DEFAULT_STORM, DEFAULT_ZOOM, TAB_LABEL, TAB_STATUS, TABS,
  cloneCrt, cloneInk, clonePixel, formatSlider, isTab, readInkHold, readInitialShaderState,
  slidersFor, snap, storageGet, storageSet, writeCrt, writePixel,
  type ShaderHooks, type TabId,
} from './visual-lab-state.js';

interface Lab {
  hooks: ShaderHooks;
  pixelOn: boolean;
  crtOn: boolean;
  pixel: PixelArtParams;
  crt: CrtParams;
  ink: { outline: number; halftone: number };
  inkHold: number;
  stormOn: boolean;
  storm: number;
  zoom: number;
  tab: TabId;
  open: boolean;
  dead: boolean;
  armed: boolean;
  light: LightMode;
  strip: HTMLElement;
  dlg: HTMLElement;
}

export interface VisualLab {
  toggle(): void;
  togglePixel(): boolean;
  toggleCrt(): boolean;
  destroy(): void;
}

function pixelField(pixel: PixelArtParams, key: string): number {
  switch (key) {
    case 'pixelSize': return pixel.pixelSize;
    case 'colorLevels': return pixel.colorLevels;
    case 'dither': return pixel.dither;
    case 'edgeStrength': return pixel.edgeStrength;
    case 'saturation': return pixel.saturation;
    case 'contrast': return pixel.contrast;
    case 'gridStrength': return pixel.gridStrength;
    case 'paletteMode': return pixel.paletteMode;
    default: return 0;
  }
}

function crtField(crt: CrtParams, key: string): number {
  switch (key) {
    case 'scanlineIntensity': return crt.scanlineIntensity;
    case 'rollIntensity': return crt.rollIntensity;
    case 'noiseOpacity': return crt.noiseOpacity;
    case 'flickerStrength': return crt.flickerStrength;
    case 'vignetteStrength': return crt.vignetteStrength;
    case 'mix': return crt.mix;
    case 'distort': return crt.distort;
    default: return 0;
  }
}

function fieldValue(lab: Lab, key: string): number {
  if (lab.tab === 'crt') return crtField(lab.crt, key);
  if (lab.tab === 'pixel') return pixelField(lab.pixel, key);
  if (lab.tab === 'ink') return key === 'outline' ? lab.ink.outline : key === 'halftone' ? lab.ink.halftone : 0;
  if (lab.tab === 'storm') return lab.storm;
  return lab.zoom;
}

function inkIsOn(lab: Lab): boolean {
  return lab.ink.halftone > 0.05;
}

function tabIsOn(lab: Lab, active: TabId): boolean {
  if (active === 'crt') return lab.crtOn;
  if (active === 'pixel') return lab.pixelOn;
  if (active === 'ink') return inkIsOn(lab);
  if (active === 'storm') return lab.stormOn;
  return false;
}

function persist(lab: Lab): void {
  if (!lab.armed || lab.dead) return;
  storageSet('pixelOn', lab.pixelOn ? '1' : '0');
  storageSet('crtOn', lab.crtOn ? '1' : '0');
  storageSet('pixel', JSON.stringify(lab.pixel));
  storageSet('crt', JSON.stringify(lab.crt));
  storageSet('ink', JSON.stringify(lab.ink));
  storageSet('inkHold', String(lab.inkHold));
  storageSet('stormOn', lab.stormOn ? '1' : '0');
  storageSet('storm', String(lab.storm));
  storageSet('zoom', String(lab.zoom));
  storageSet('tab', lab.tab);
}

function renderSliders(lab: Lab): void {
  const host = lab.dlg.querySelector<HTMLElement>('#pd-sliders');
  if (!host) return;
  host.innerHTML = slidersFor(lab.tab).map((spec) => {
    const value = fieldValue(lab, spec.key);
    return `<label class="pd-row"><span class="pd-lbl"><span>${spec.label}</span><b data-val="${spec.key}">${formatSlider(spec, value)}</b></span><input type="range" data-key="${spec.key}" aria-label="${spec.label}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}" /></label>`;
  }).join('');
}

function sync(lab: Lab): void {
  if (lab.dead) return;
  const flags: Record<TabId, boolean> = {
    crt: lab.crtOn,
    pixel: lab.pixelOn,
    ink: inkIsOn(lab),
    storm: lab.stormOn,
    projection: false,
  };
  for (const id of TABS) {
    for (const root of [lab.strip, lab.dlg]) {
      root.querySelectorAll<HTMLElement>(`[data-dot="${id}"]`).forEach((dot) => {
        dot.classList.toggle('live', flags[id]);
      });
    }
    lab.strip.querySelector<HTMLButtonElement>(`[data-fx="${id}"]`)?.setAttribute('aria-pressed', String(flags[id]));
  }
  lab.dlg.querySelectorAll<HTMLElement>('.pd-tab').forEach((button) => {
    const selected = button.dataset.tab === lab.tab;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  const status = lab.dlg.querySelector<HTMLElement>('#pd-status-lbl');
  if (status) status.textContent = TAB_STATUS[lab.tab];
  const enable = lab.dlg.querySelector<HTMLButtonElement>('#pd-enable');
  if (enable) {
    if (lab.tab === 'projection') {
      enable.textContent = 'ZOOM 1';
      enable.setAttribute('aria-pressed', 'false');
    } else {
      const on = tabIsOn(lab, lab.tab);
      enable.textContent = on ? 'ON' : 'OFF';
      enable.setAttribute('aria-pressed', String(on));
    }
  }
  for (const spec of slidersFor(lab.tab)) {
    const value = fieldValue(lab, spec.key);
    const input = lab.dlg.querySelector<HTMLInputElement>(`input[data-key="${spec.key}"]`);
    const label = lab.dlg.querySelector<HTMLElement>(`[data-val="${spec.key}"]`);
    if (input && Math.abs(Number(input.value) - value) > 1e-6) input.value = String(value);
    if (label) label.textContent = formatSlider(spec, value);
  }
}

function pushPixel(lab: Lab): void {
  lab.hooks.setPixel(lab.pixelOn, clonePixel(lab.pixel));
  persist(lab);
  sync(lab);
}

function pushCrt(lab: Lab): void {
  lab.hooks.setCrt(lab.crtOn, cloneCrt(lab.crt));
  persist(lab);
  sync(lab);
}

function pushInk(lab: Lab): void {
  lab.hooks.setInk(cloneInk(lab.ink));
  persist(lab);
  sync(lab);
}

function pushStorm(lab: Lab): void {
  lab.hooks.setStorm(lab.stormOn, lab.storm);
  persist(lab);
  sync(lab);
}

function pushZoom(lab: Lab): void {
  lab.hooks.setProjection(lab.zoom);
  persist(lab);
  sync(lab);
}

function togglePixel(lab: Lab): boolean {
  if (lab.dead) return lab.pixelOn;
  lab.pixelOn = !lab.pixelOn;
  pushPixel(lab);
  return lab.pixelOn;
}

function toggleCrt(lab: Lab): boolean {
  if (lab.dead) return lab.crtOn;
  lab.crtOn = !lab.crtOn;
  pushCrt(lab);
  return lab.crtOn;
}

function toggleInk(lab: Lab): void {
  if (inkIsOn(lab)) {
    lab.inkHold = lab.ink.halftone;
    lab.ink = { outline: lab.ink.outline, halftone: 0 };
  } else {
    const restored = lab.inkHold > 0.05 ? lab.inkHold : DEFAULT_INK.halftone;
    lab.inkHold = restored;
    lab.ink = { outline: lab.ink.outline, halftone: restored };
  }
  pushInk(lab);
}

function toggleStorm(lab: Lab): void {
  lab.stormOn = !lab.stormOn;
  pushStorm(lab);
}

function resetZoom(lab: Lab): void {
  lab.zoom = DEFAULT_ZOOM;
  pushZoom(lab);
}

function applySlider(lab: Lab, key: string, raw: number): void {
  if (lab.dead) return;
  const spec = slidersFor(lab.tab).find((item) => item.key === key);
  if (!spec) return;
  const value = snap(raw, spec.min, spec.max, spec.step);
  if (lab.tab === 'crt') {
    const next = cloneCrt(lab.crt);
    if (!writeCrt(next, key, value)) return;
    lab.crt = next;
    lab.crtOn = true;
    pushCrt(lab);
    return;
  }
  if (lab.tab === 'pixel') {
    const next = clonePixel(lab.pixel);
    if (!writePixel(next, key, value)) return;
    lab.pixel = next;
    lab.pixelOn = true;
    pushPixel(lab);
    return;
  }
  if (lab.tab === 'ink') {
    // Off means halftone <= 0.05. Other sliders restore the held halftone first.
    if (key === 'halftone') {
      const nextHalftone = !inkIsOn(lab) && !(value > 0.05) ? 0.1 : value;
      lab.ink = { outline: lab.ink.outline, halftone: nextHalftone };
      if (nextHalftone > 0.05) lab.inkHold = nextHalftone;
    } else if (key === 'outline') {
      if (!inkIsOn(lab)) {
        const restored = lab.inkHold > 0.05 ? lab.inkHold : DEFAULT_INK.halftone;
        lab.inkHold = restored;
        lab.ink = { outline: value, halftone: restored };
      } else {
        lab.ink = { outline: value, halftone: lab.ink.halftone };
      }
    }
    pushInk(lab);
    return;
  }
  if (lab.tab === 'storm') {
    lab.storm = value;
    lab.stormOn = true;
    pushStorm(lab);
    return;
  }
  lab.zoom = value;
  pushZoom(lab);
}

function resetActive(lab: Lab): void {
  if (lab.dead) return;
  if (lab.tab === 'crt') {
    lab.crt = cloneCrt(DEFAULT_CRT_PARAMS);
    pushCrt(lab);
    return;
  }
  if (lab.tab === 'pixel') {
    lab.pixel = clonePixel(DEFAULT_PIXEL_PARAMS);
    pushPixel(lab);
    return;
  }
  if (lab.tab === 'ink') {
    lab.ink = cloneInk(DEFAULT_INK);
    lab.inkHold = DEFAULT_INK.halftone;
    pushInk(lab);
    return;
  }
  if (lab.tab === 'storm') {
    lab.storm = DEFAULT_STORM;
    pushStorm(lab);
    return;
  }
  resetZoom(lab);
}

function setOpen(lab: Lab, next: boolean): void {
  if (lab.dead) return;
  lab.open = next;
  lab.dlg.classList.toggle('open', lab.open);
  lab.dlg.setAttribute('aria-hidden', lab.open ? 'false' : 'true');
  if (lab.open) sync(lab);
}

function enableDragging(box: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let originX = 0;
  let originY = 0;
  handle.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element) || event.target.closest('button')) return;
    dragging = true;
    const rect = box.getBoundingClientRect();
    originX = event.clientX - rect.left;
    originY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const maxX = Math.max(8, window.innerWidth - box.offsetWidth - 8);
    const maxY = Math.max(8, window.innerHeight - box.offsetHeight - 8);
    const x = Math.max(8, Math.min(maxX, event.clientX - originX));
    const y = Math.max(8, Math.min(maxY, event.clientY - originY));
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.right = 'auto';
    box.style.bottom = 'auto';
  });
  const stop = () => { dragging = false; };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

function buildLabChrome(): { strip: HTMLElement; dlg: HTMLElement } {
  document.getElementById('shader-strip')?.remove();
  document.getElementById('pixel-dlg')?.remove();
  const strip = document.createElement('div');
  strip.id = 'shader-strip';
  strip.innerHTML = [
    switchButton('crt', 'CRT'),
    switchButton('pixel', 'PIXEL'),
    switchButton('ink', 'INK'),
    switchButton('storm', 'STORM'),
  ].join('');
  const dock = document.getElementById('shader-dock');
  if (dock) dock.appendChild(strip);
  else {
    strip.classList.add('hl-float');
    document.body.appendChild(strip);
  }
  const dlg = document.createElement('div');
  dlg.id = 'pixel-dlg';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', 'Visual shader lab');
  dlg.setAttribute('aria-hidden', 'true');
  const tabButtons = TABS.map((id) =>
    `<button type="button" class="pd-tab" role="tab" data-tab="${id}" aria-selected="false"><i class="pd-dot" data-dot="${id}"></i><span>${TAB_LABEL[id]}</span></button>`,
  ).join('');
  dlg.innerHTML = `
    <div class="pd-head" id="pd-drag">
      <span class="pd-title"><i></i>VISUAL SHADER LAB</span>
      <button type="button" class="pd-close" id="pd-close" aria-label="Close">✕</button>
    </div>
    <div class="pd-body">
      <div class="pd-light" role="radiogroup" aria-label="Light source">
        <span class="pd-sub">LIGHT SOURCE</span>
        <div class="pd-radios">${LIGHT_MODES.map((m) => `<label title="${m.hint}"><input type="radio" name="pd-light" value="${m.id}"><span>${m.label}</span></label>`).join('')}</div>
      </div>
      <div class="pd-tabs" role="tablist">${tabButtons}</div>
      <div class="pd-top">
        <span class="pd-sub" id="pd-status-lbl">CRT OVERLAY</span>
        <button type="button" class="pd-toggle" id="pd-enable" aria-pressed="false">OFF</button>
      </div>
      <div class="pd-sliders" id="pd-sliders"></div>
      <div class="pd-foot">
        <span class="pd-sub">LIVE</span>
        <button type="button" class="pd-reset" id="pd-reset">RESET</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  return { strip, dlg };
}

function bindLight(lab: Lab): void {
  // Light source: plain radio buttons, applied at once and remembered.
  const lightInputs = [...lab.dlg.querySelectorAll<HTMLInputElement>('input[name="pd-light"]')];
  const syncLight = (): void => lightInputs.forEach((input) => { input.checked = input.value === lab.light; });
  lightInputs.forEach((input) => input.addEventListener('change', () => {
    if (!input.checked) return;
    lab.light = input.value as LightMode;
    storageSet('light', lab.light);
    lab.hooks.setLight?.(lab.light);
  }));
  syncLight();
  lab.hooks.setLight?.(lab.light);
}

function bindLabUi(lab: Lab): void {
  const dragHandle = lab.dlg.querySelector<HTMLElement>('#pd-drag');
  if (dragHandle) enableDragging(lab.dlg, dragHandle);
  lab.strip.addEventListener('click', (event) => {
    if (lab.dead || !(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-fx]');
    const fx = button?.dataset.fx;
    if (fx === 'crt') toggleCrt(lab);
    else if (fx === 'pixel') togglePixel(lab);
    else if (fx === 'ink') toggleInk(lab);
    else if (fx === 'storm') toggleStorm(lab);
  });
  lab.dlg.addEventListener('click', (event) => {
    if (lab.dead || !(event.target instanceof Element)) return;
    const tabButton = event.target.closest<HTMLElement>('[data-tab]');
    if (tabButton && isTab(tabButton.dataset.tab)) {
      lab.tab = tabButton.dataset.tab;
      renderSliders(lab);
      persist(lab);
      sync(lab);
      return;
    }
    if (event.target.closest('#pd-close')) setOpen(lab, false);
    else if (event.target.closest('#pd-reset')) resetActive(lab);
    else if (event.target.closest('#pd-enable')) {
      if (lab.tab === 'crt') toggleCrt(lab);
      else if (lab.tab === 'pixel') togglePixel(lab);
      else if (lab.tab === 'ink') toggleInk(lab);
      else if (lab.tab === 'storm') toggleStorm(lab);
      else resetZoom(lab);
    }
  });
  lab.dlg.addEventListener('input', (event) => {
    if (lab.dead || !(event.target instanceof HTMLInputElement) || event.target.type !== 'range') return;
    const key = event.target.dataset.key;
    if (!key) return;
    applySlider(lab, key, Number(event.target.value));
  });
}

function destroyLab(lab: Lab): void {
  if (lab.dead) return;
  lab.dead = true;
  lab.strip.remove();
  lab.dlg.remove();
  if (!document.getElementById('pixel-dlg') && !document.getElementById('shader-strip')) {
    document.getElementById('haunted-lab-css')?.remove();
  }
}

export function mountVisualLab(hooks: ShaderHooks): VisualLab {
  ensureStyle();
  const boot = readInitialShaderState();
  const storedTab = storageGet('tab');
  const chrome = buildLabChrome();
  const lab: Lab = {
    hooks,
    pixelOn: boot.pixelOn,
    crtOn: boot.crtOn,
    pixel: clonePixel(boot.pixel),
    crt: cloneCrt(boot.crt),
    ink: cloneInk(boot.ink),
    inkHold: readInkHold(boot.ink.halftone),
    stormOn: boot.stormOn,
    storm: boot.storm,
    zoom: boot.zoom,
    tab: isTab(storedTab) ? storedTab : 'crt',
    open: false,
    dead: false,
    armed: false,
    light: boot.light,
    strip: chrome.strip,
    dlg: chrome.dlg,
  };
  bindLight(lab);
  bindLabUi(lab);
  renderSliders(lab);
  sync(lab);
  lab.armed = true;
  return {
    toggle: () => setOpen(lab, !lab.open),
    togglePixel: () => togglePixel(lab),
    toggleCrt: () => toggleCrt(lab),
    destroy: () => destroyLab(lab),
  };
}
