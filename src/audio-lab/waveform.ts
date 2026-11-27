import { sampleUrl } from '../audio/catalog.js';
import type { SfxTrimWindow } from '../audio/config.js';
import { h } from '../editor-core/dom.js';
import { defaultTrimFor, formatTrimSnippet, type AudioCueItem } from './catalog-meta.js';

export interface WaveformHandle {
  el: HTMLElement;
  loadCue(item: AudioCueItem): Promise<void>;
  playBuffer(raw: boolean): Promise<void>;
  setTrim(id: string, trim: SfxTrimWindow): void;
  getTrim(id: string): SfxTrimWindow;
  currentDuration(): number | null;
  peakSamples(): number;
  dispose(): void;
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: Float32Array | null, duration: number, trim: SfxTrimWindow): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = '#0e0b14';
  ctx.fillRect(0, 0, w, height);

  if (!peaks || !peaks.length || duration <= 0) {
    ctx.strokeStyle = '#3a344c';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(w, height / 2);
    ctx.stroke();
    return;
  }

  const startFrac = Math.max(0, Math.min(1, trim.offset / duration));
  const endSec = trim.duration && trim.duration > 0 ? Math.min(duration, trim.offset + trim.duration) : duration;
  const endFrac = Math.max(startFrac, Math.min(1, endSec / duration));
  const x0 = Math.round(startFrac * w);
  const x1 = Math.max(x0 + 1, Math.round(endFrac * w));
  ctx.fillStyle = 'rgba(61, 220, 132, 0.16)';
  ctx.fillRect(x0, 0, x1 - x0, height);

  ctx.fillStyle = '#ffd166';
  const mid = height / 2;
  for (let x = 0; x < peaks.length; x += 1) {
    const amp = Math.max(1, peaks[x]! * (mid - 8));
    ctx.fillRect(x, mid - amp, 1, amp * 2);
  }

  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, height);
  ctx.moveTo(x1, 0);
  ctx.lineTo(x1, height);
  ctx.stroke();
}

function samplePeaks(buf: AudioBuffer, bins: number): Float32Array {
  const ch = buf.getChannelData(0);
  const out = new Float32Array(bins);
  const step = Math.max(1, Math.floor(ch.length / bins));
  for (let i = 0; i < bins; i += 1) {
    let peak = 0;
    const base = i * step;
    for (let j = 0; j < step && base + j < ch.length; j += 1) {
      const a = Math.abs(ch[base + j]!);
      if (a > peak) peak = a;
    }
    out[i] = peak;
  }
  return out;
}

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

function createWaveformControls(onApply: (offset: number, duration?: number) => void) {
  const offRange = h('input', { type: 'range', min: '0', max: '2', step: '0.005', 'aria-label': 'Trim offset seconds' }) as HTMLInputElement;
  const offNum = h('input', { type: 'number', min: '0', max: '10', step: '0.005', 'aria-label': 'Trim offset input' }) as HTMLInputElement;
  const durRange = h('input', { type: 'range', min: '0', max: '5', step: '0.01', 'aria-label': 'Trim duration seconds' }) as HTMLInputElement;
  const durNum = h('input', { type: 'number', min: '0', max: '10', step: '0.01', 'aria-label': 'Trim duration input' }) as HTMLInputElement;
  offRange.oninput = () => onApply(Number(offRange.value), Number(durNum.value) || undefined);
  offNum.onchange = () => onApply(Number(offNum.value), Number(durNum.value) || undefined);
  durRange.oninput = () => onApply(Number(offNum.value), Number(durRange.value) || undefined);
  durNum.onchange = () => onApply(Number(offNum.value), Number(durNum.value) || undefined);
  return { offRange, offNum, durRange, durNum };
}

function makeAudioBufferLoader(getCtx: () => AudioContext | null) {
  const cache = new Map<string, Promise<AudioBuffer | null>>();
  return (item: AudioCueItem): Promise<AudioBuffer | null> => {
    const audio = getCtx();
    const url = sampleUrl(item.group, item.id);
    if (!audio || !url) return Promise.resolve(null);
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((raw) => (raw ? audio.decodeAudioData(raw) : null))
          .catch(() => null),
      );
    }
    return cache.get(url)!;
  };
}

export function createWaveformPanel(onPlayCue: (id: string, raw: boolean) => void): WaveformHandle {
  const trimOverrides = new Map<string, SfxTrimWindow>();
  let ctx: AudioContext | null = null;
  let activeSource: AudioBufferSourceNode | null = null;
  let currentItem: AudioCueItem | null = null;
  let currentBuf: AudioBuffer | null = null;
  let currentPeaks: Float32Array | null = null;
  let loadSeq = 0;

  const title = h('div', { class: 'al-kv' }, 'Select any cue from the soundboard');
  const canvas = h('canvas', { class: 'al-wave-canvas', width: '560', height: '140' }) as HTMLCanvasElement;
  const snippet = h('pre', { class: 'al-code' }, '');
  const copyStatus = h('span', { class: 'al-note' }, '');

  const getCtx = (): AudioContext | null => {
    if (!ctx) {
      const Ctor = audioCtor();
      if (Ctor) {
        try { ctx = new Ctor(); } catch { ctx = null; }
      }
    }
    return ctx;
  };
  const loadBuffer = makeAudioBufferLoader(getCtx);
  const trimFor = (id: string): SfxTrimWindow => trimOverrides.get(id) ?? defaultTrimFor(id);

  const controls = createWaveformControls((offset, duration) => {
    if (!currentItem) return;
    const cleanOff = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const cleanDur = duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : undefined;
    trimOverrides.set(currentItem.id, { offset: cleanOff, ...(cleanDur ? { duration: cleanDur } : {}) });
    repaint();
  });

  function repaint(): void {
    if (!currentItem) return;
    const t = trimFor(currentItem.id);
    const dur = currentBuf?.duration ?? 0;
    const maxSec = String(Math.max(0.5, Math.ceil(dur * 10) / 10));
    controls.offRange.max = maxSec;
    controls.durRange.max = maxSec;
    controls.offRange.value = String(t.offset);
    controls.offNum.value = t.offset.toFixed(3);
    const dVal = t.duration ?? 0;
    controls.durRange.value = String(dVal);
    controls.durNum.value = dVal.toFixed(3);
    snippet.textContent = formatTrimSnippet(currentItem.id, t);
    title.textContent = `${currentItem.id} (${currentItem.group}) · ${dur > 0 ? `${dur.toFixed(3)}s @ ${currentBuf!.sampleRate}Hz` : 'unloaded/stub'}`;
    drawWaveform(canvas, currentPeaks, dur, t);
  }

  const playBuffer = async (raw: boolean): Promise<void> => {
    if (!currentItem) return;
    onPlayCue(currentItem.id, raw);
    const audio = getCtx();
    const buf = currentBuf ?? (await loadBuffer(currentItem));
    if (!audio || !buf) return;
    try {
      if (audio.state === 'suspended') await audio.resume();
      activeSource?.stop();
    } catch { /* ignore */ }
    const src = audio.createBufferSource();
    src.buffer = buf;
    src.connect(audio.destination);
    const t = raw ? { offset: 0 } : trimFor(currentItem.id);
    const off = Math.max(0, Math.min(buf.duration, t.offset));
    if (t.duration && t.duration > 0) src.start(0, off, t.duration);
    else src.start(0, off);
    activeSource = src;
  };

  const copyBtn = h('button', { type: 'button', class: 'btn small' }, 'Copy SFX_TRIM');
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(snippet.textContent ?? '');
      copyStatus.textContent = 'copied';
    } catch {
      copyStatus.textContent = 'copy failed';
    }
  };

  const el = h(
    'section',
    { class: 'al-card', 'aria-label': 'Waveform and SFX_TRIM scrubber' },
    h('h3', {}, 'Waveform & SFX_TRIM Scrubber'),
    title,
    canvas,
    h(
      'div',
      { class: 'al-btn-row' },
      h('button', { type: 'button', class: 'btn small primary', id: 'al-play-trimmed', onclick: () => void playBuffer(false) }, 'Play Trimmed'),
      h('button', { type: 'button', class: 'btn small', id: 'al-play-raw', onclick: () => void playBuffer(true) }, 'Play Raw'),
      h('button', { type: 'button', class: 'btn small', id: 'al-reset-trim', onclick: () => { if (currentItem) { trimOverrides.delete(currentItem.id); repaint(); } } }, 'Reset Trim'),
      copyBtn,
      copyStatus,
    ),
    h(
      'div',
      { class: 'al-trim-grid' },
      h('div', { class: 'al-field' }, h('span', {}, 'Offset (s)'), controls.offRange, controls.offNum),
      h('div', { class: 'al-field' }, h('span', {}, 'Duration (s, 0 = full)'), controls.durRange, controls.durNum),
    ),
    snippet,
  );

  return {
    el,
    async loadCue(item) {
      const seq = ++loadSeq;
      currentItem = item;
      const buf = await loadBuffer(item);
      if (seq !== loadSeq) return;
      currentBuf = buf;
      currentPeaks = buf ? samplePeaks(buf, canvas.width) : null;
      repaint();
    },
    playBuffer,
    setTrim(id, trim) {
      trimOverrides.set(id, { offset: Math.max(0, trim.offset), ...(trim.duration && trim.duration > 0 ? { duration: trim.duration } : {}) });
      if (currentItem?.id === id) repaint();
    },
    getTrim: trimFor,
    currentDuration: () => currentBuf?.duration ?? null,
    peakSamples: () => currentPeaks?.length ?? 0,
    dispose() {
      try { activeSource?.stop(); } catch { /* ignore */ }
      if (ctx && ctx.state !== 'closed') void ctx.close();
    },
  };
}
