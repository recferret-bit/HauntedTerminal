import {
  buildMapSparkFragmentShader,
  buildMapSparkVertexShader,
  MAP_SPARK_STATES,
  MAP_SPARK_TIME_WRAP_S,
} from '../shaders/map-sparks.js';
import { compileWebGlShader } from './term-boot-pixel.js';

export type MapSparkState = 'off' | 'standby' | 'powered' | 'active';

export interface MapSparkSpan {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly state: MapSparkState;
  readonly seed: number;
}

export interface SparkSpanRange {
  readonly start: number;
  readonly count: number;
}

export interface SparkRibbonData {
  readonly geom: Float32Array;
  readonly wire: Float32Array;
  readonly indices: Uint16Array;
  readonly ranges: readonly SparkSpanRange[];
}

export interface MapSparkOverlay {
  readonly canvas: HTMLCanvasElement;
  start(): void;
  stop(): void;
  syncWires(): void;
  syncStates(): void;
  dispose(): void;
}

const STATE_CODE: Readonly<Record<MapSparkState, number>> = {
  off: 0,
  standby: MAP_SPARK_STATES.standby.code,
  powered: MAP_SPARK_STATES.powered.code,
  active: MAP_SPARK_STATES.active.code,
};

const PX_PER_SEG = 2.5;
const MIN_SEGS = 8;
const MAX_SEGS = 240;
const FLOATS_PER_GEOM_VERT = 5;

function spanSegments(lenPx: number): number {
  return Math.max(MIN_SEGS, Math.min(MAX_SEGS, Math.ceil(lenPx / PX_PER_SEG)));
}

/**
 * Pure geometry builder for 2D PCB wire spark ribbons (Node-testable, zero DOM/WebGL).
 * Packs static geometry (`aPos.xy, aPerp.xy, aCross`) separately from `aWire` (`t, len, seed, state`)
 * so selection/status updates can patch states in place without rebuilding geometry.
 */
export function buildSparkRibbonData(spans: readonly MapSparkSpan[]): SparkRibbonData {
  let totalVerts = 0;
  let totalIdx = 0;
  const segCounts: number[] = [];
  const lengths: number[] = [];

  for (const s of spans) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const segs = len >= 1 ? spanSegments(len) : 0;
    segCounts.push(segs);
    lengths.push(len);
    if (segs > 0) {
      totalVerts += (segs + 1) * 2;
      totalIdx += segs * 6;
    }
  }

  const geom = new Float32Array(totalVerts * FLOATS_PER_GEOM_VERT);
  const wire = new Float32Array(totalVerts * 4);
  const indices = new Uint16Array(totalIdx);
  const ranges: SparkSpanRange[] = [];

  let v = 0;
  let idxPos = 0;
  for (let sIdx = 0; sIdx < spans.length; sIdx++) {
    const span = spans[sIdx]!;
    const segs = segCounts[sIdx]!;
    const len = lengths[sIdx]!;
    if (segs === 0) {
      ranges.push({ start: v, count: 0 });
      continue;
    }
    const dx = (span.x2 - span.x1) / len;
    const dy = (span.y2 - span.y1) / len;
    const px = -dy || 0;
    const py = dx || 0;
    const stateCode = STATE_CODE[span.state];
    const start = v;

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = span.x1 + (span.x2 - span.x1) * t;
      const y = span.y1 + (span.y2 - span.y1) * t;
      for (const cross of [-1, 1] as const) {
        const gOff = v * FLOATS_PER_GEOM_VERT;
        geom[gOff] = x;
        geom[gOff + 1] = y;
        geom[gOff + 2] = px;
        geom[gOff + 3] = py;
        geom[gOff + 4] = cross;
        const wOff = v * 4;
        wire[wOff] = t;
        wire[wOff + 1] = len;
        wire[wOff + 2] = span.seed;
        wire[wOff + 3] = stateCode;
        v++;
      }
      if (i > 0) {
        const r0 = start + (i - 1) * 2;
        const r1 = start + i * 2;
        indices[idxPos++] = r0;
        indices[idxPos++] = r1;
        indices[idxPos++] = r1 + 1;
        indices[idxPos++] = r0;
        indices[idxPos++] = r1 + 1;
        indices[idxPos++] = r0 + 1;
      }
    }
    ranges.push({ start, count: v - start });
  }
  return { geom, wire, indices, ranges };
}

/** Patches per-span spark states in place inside `wire`; returns true when at least one span changed. */
export function patchSparkRibbonStates(
  wire: Float32Array,
  ranges: readonly SparkSpanRange[],
  states: readonly MapSparkState[],
): boolean {
  let changed = false;
  const n = Math.min(ranges.length, states.length);
  for (let i = 0; i < n; i++) {
    const { start, count } = ranges[i]!;
    if (count <= 0) continue;
    const code = STATE_CODE[states[i]!];
    if (wire[start * 4 + 3] === code) continue;
    for (let v = start; v < start + count; v++) wire[v * 4 + 3] = code;
    changed = true;
  }
  return changed;
}

function parseState(raw: string | undefined): MapSparkState {
  if (raw === 'active' || raw === 'powered' || raw === 'standby' || raw === 'off') return raw;
  return 'standby';
}

function wireSeed(index: number): number {
  return ((index * 0.61803398875) % 1 + 1) % 1;
}

export interface LocalBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Converts viewport-space bounding rects into unscaled `#cm-board` padding-box CSS pixels.
 * Uses border-box `offsetW`/`offsetH` for scale normalization (matching `getBoundingClientRect()`)
 * and `clientLeft`/`clientTop` for padding-box offsets so sparks stay pixel-locked even with borders.
 */
export function toBoardLocalBox(
  wireRect: { left: number; right: number; top: number; bottom: number },
  boardRect: { left: number; top: number; width: number; height: number },
  offsetW: number,
  offsetH: number,
  clientLeft = 0,
  clientTop = 0,
): LocalBox {
  const scaleX = boardRect.width > 0 && offsetW > 0 ? boardRect.width / offsetW : 1;
  const scaleY = boardRect.height > 0 && offsetH > 0 ? boardRect.height / offsetH : 1;
  return {
    left: (wireRect.left - boardRect.left) / scaleX - clientLeft,
    right: (wireRect.right - boardRect.left) / scaleX - clientLeft,
    top: (wireRect.top - boardRect.top) / scaleY - clientTop,
    bottom: (wireRect.bottom - boardRect.top) / scaleY - clientTop,
  };
}

interface MeasuredWire {
  readonly spans: readonly MapSparkSpan[];
  readonly elements: readonly { el: HTMLElement; count: number }[];
}

function measureBoardWires(board: HTMLElement): MeasuredWire {
  const bRect = board.getBoundingClientRect();
  const oW = board.offsetWidth || board.clientWidth;
  const oH = board.offsetHeight || board.clientHeight;
  const cL = board.clientLeft;
  const cT = board.clientTop;
  const els = [...board.querySelectorAll<HTMLElement>('[data-spark-wire]')];
  const spans: MapSparkSpan[] = [];
  const elements: { el: HTMLElement; count: number }[] = [];

  for (const wireEl of els) {
    const r = wireEl.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) continue;
    const { left, right, top, bottom } = toBoardLocalBox(r, bRect, oW, oH, cL, cT);
    const boxW = Math.max(0, right - left);
    const boxH = Math.max(0, bottom - top);
    const midX = (left + right) * 0.5;
    const midY = (top + bottom) * 0.5;
    const rawMode = wireEl.dataset.sparkWire;
    const mode =
      (rawMode === 'h' || rawMode === 'h-rev') && boxH > boxW * 1.5
        ? rawMode === 'h-rev'
          ? 'v-rev'
          : 'v'
        : (rawMode === 'v' || rawMode === 'v-rev') && boxW > boxH * 1.5
          ? rawMode === 'v-rev'
            ? 'h-rev'
            : 'h'
          : rawMode;
    const state = parseState(wireEl.dataset.sparkState);
    const before = spans.length;

    if (mode === 'split-out') {
      spans.push(
        { x1: midX, y1: midY, x2: left, y2: midY, state, seed: wireSeed(spans.length) },
        { x1: midX, y1: midY, x2: right, y2: midY, state, seed: wireSeed(spans.length + 1) },
      );
    } else if (mode === 'split-in') {
      spans.push(
        { x1: left, y1: midY, x2: midX, y2: midY, state, seed: wireSeed(spans.length) },
        { x1: right, y1: midY, x2: midX, y2: midY, state, seed: wireSeed(spans.length + 1) },
      );
    } else if (mode === 'v') {
      spans.push({ x1: midX, y1: top, x2: midX, y2: bottom, state, seed: wireSeed(spans.length) });
    } else if (mode === 'v-rev') {
      spans.push({ x1: midX, y1: bottom, x2: midX, y2: top, state, seed: wireSeed(spans.length) });
    } else if (mode === 'h-rev') {
      spans.push({ x1: right, y1: midY, x2: left, y2: midY, state, seed: wireSeed(spans.length) });
    } else {
      spans.push({ x1: left, y1: midY, x2: right, y2: midY, state, seed: wireSeed(spans.length) });
    }
    elements.push({ el: wireEl, count: spans.length - before });
  }
  return { spans, elements };
}

function shapeKey(spans: readonly MapSparkSpan[]): string {
  const r = (n: number) => Math.round(n * 2);
  let out = '';
  for (const s of spans) out += `${r(s.x1)},${r(s.y1)}>${r(s.x2)},${r(s.y2)};`;
  return out;
}

interface SparkGlState {
  readonly gl: WebGLRenderingContext;
  readonly prog: WebGLProgram;
  readonly geomBuf: WebGLBuffer;
  readonly wireBuf: WebGLBuffer;
  readonly idxBuf: WebGLBuffer;
  readonly uResolution: WebGLUniformLocation | null;
  readonly uTime: WebGLUniformLocation | null;
}

function initSparkGl(canvas: HTMLCanvasElement): SparkGlState | null {
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  if (!gl) return null;
  const vs = compileWebGlShader(gl, gl.VERTEX_SHADER, buildMapSparkVertexShader());
  const fs = compileWebGlShader(gl, gl.FRAGMENT_SHADER, buildMapSparkFragmentShader());
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    if (prog) gl.deleteProgram(prog);
    return null;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.bindAttribLocation(prog, 1, 'aPerp');
  gl.bindAttribLocation(prog, 2, 'aCross');
  gl.bindAttribLocation(prog, 3, 'aWire');
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  const geomBuf = gl.createBuffer();
  const wireBuf = gl.createBuffer();
  const idxBuf = gl.createBuffer();
  if (!geomBuf || !wireBuf || !idxBuf) {
    if (geomBuf) gl.deleteBuffer(geomBuf);
    if (wireBuf) gl.deleteBuffer(wireBuf);
    if (idxBuf) gl.deleteBuffer(idxBuf);
    gl.deleteProgram(prog);
    return null;
  }
  return {
    gl, prog, geomBuf, wireBuf, idxBuf,
    uResolution: gl.getUniformLocation(prog, 'uResolution'),
    uTime: gl.getUniformLocation(prog, 'uTime'),
  };
}

function uploadRibbonData(state: SparkGlState, data: SparkRibbonData): void {
  const { gl, geomBuf, wireBuf, idxBuf } = state;
  gl.bindBuffer(gl.ARRAY_BUFFER, geomBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.geom, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, wireBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.wire, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
}

function drawSparkPass(
  state: SparkGlState,
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  elapsed: number,
  indexCount: number,
): void {
  const { gl, prog, geomBuf, wireBuf, idxBuf, uResolution, uTime } = state;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(prog);
  gl.uniform2f(uResolution, cssW, cssH);
  gl.uniform1f(uTime, elapsed);

  const stride = FLOATS_PER_GEOM_VERT * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, geomBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);

  gl.bindBuffer(gl.ARRAY_BUFFER, wireBuf);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
}

function noopOverlay(canvas: HTMLCanvasElement): MapSparkOverlay {
  return { canvas, start() {}, stop() {}, syncWires() {}, syncStates() {}, dispose() { canvas.remove(); } };
}

function disposeSparkGl(state: SparkGlState): void {
  const { gl, geomBuf, wireBuf, idxBuf, prog } = state;
  gl.deleteBuffer(geomBuf);
  gl.deleteBuffer(wireBuf);
  gl.deleteBuffer(idxBuf);
  gl.deleteProgram(prog);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

function observeBoardLayout(board: HTMLElement, onChange: () => void): () => void {
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (board.clientWidth > 0) onChange();
        })
      : null;
  ro?.observe(board);
  if (board.firstElementChild) ro?.observe(board.firstElementChild);
  const dialog = board.closest('dialog');
  const onAnimEnd = (ev: AnimationEvent): void => {
    if (ev.target === dialog) onChange();
  };
  dialog?.addEventListener('animationend', onAnimEnd);
  let disposed = false;
  void document.fonts?.ready?.then(() => {
    if (!disposed && board.clientWidth > 0) onChange();
  });
  return () => {
    disposed = true;
    ro?.disconnect();
    dialog?.removeEventListener('animationend', onAnimEnd);
  };
}

interface OverlayState {
  gl: SparkGlState | null;
  running: boolean;
  contextLost: boolean;
  rafId: number;
  lastNow: number;
  elapsed: number;
  cssW: number;
  cssH: number;
  lastDpr: number;
  lastKey: string;
  ribbon: SparkRibbonData | null;
  trackedEls: readonly { el: HTMLElement; count: number }[];
}

function renderOverlayFrame(s: OverlayState, canvas: HTMLCanvasElement): void {
  if (s.contextLost || !s.gl || s.cssW < 2 || s.cssH < 2 || !s.ribbon || s.ribbon.indices.length === 0) return;
  drawSparkPass(s.gl, canvas, s.cssW, s.cssH, s.elapsed, s.ribbon.indices.length);
}

function syncOverlayWires(s: OverlayState, board: HTMLElement, canvas: HTMLCanvasElement): void {
  if (s.contextLost || !s.gl) return;
  const w = board.clientWidth;
  const h = board.clientHeight;
  if (w < 2 || h < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  s.cssW = w;
  s.cssH = h;
  s.lastDpr = dpr;
  const measured = measureBoardWires(board);
  s.trackedEls = measured.elements;
  const key = `${w}x${h}|${shapeKey(measured.spans)}`;
  if (key !== s.lastKey || !s.ribbon) {
    s.lastKey = key;
    s.ribbon = buildSparkRibbonData(measured.spans);
    uploadRibbonData(s.gl, s.ribbon);
  } else if (patchSparkRibbonStates(s.ribbon.wire, s.ribbon.ranges, measured.spans.map((sp) => sp.state))) {
    s.gl.gl.bindBuffer(s.gl.gl.ARRAY_BUFFER, s.gl.wireBuf);
    s.gl.gl.bufferSubData(s.gl.gl.ARRAY_BUFFER, 0, s.ribbon.wire);
  }
  renderOverlayFrame(s, canvas);
}

function syncOverlayStates(s: OverlayState, board: HTMLElement, canvas: HTMLCanvasElement): void {
  if (s.contextLost || !s.gl) return;
  if (!s.ribbon || s.trackedEls.length === 0) {
    syncOverlayWires(s, board, canvas);
    return;
  }
  const nextStates: MapSparkState[] = [];
  for (const item of s.trackedEls) {
    const st = parseState(item.el.dataset.sparkState);
    for (let k = 0; k < item.count; k++) nextStates.push(st);
  }
  if (patchSparkRibbonStates(s.ribbon.wire, s.ribbon.ranges, nextStates)) {
    s.gl.gl.bindBuffer(s.gl.gl.ARRAY_BUFFER, s.gl.wireBuf);
    s.gl.gl.bufferSubData(s.gl.gl.ARRAY_BUFFER, 0, s.ribbon.wire);
    renderOverlayFrame(s, canvas);
  }
}

/**
 * Mounts the transparent WebGL electricity-spark shader overlay onto `#cm-board`.
 * Runs `requestAnimationFrame` only while open; recovers from WebGL context loss and degrades if WebGL is unavailable.
 */
export function mountMapSparkOverlay(board: HTMLElement): MapSparkOverlay {
  const canvas = document.createElement('canvas');
  canvas.className = 'cm-spark-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  board.appendChild(canvas);

  const glState = initSparkGl(canvas);
  if (!glState) {
    board.classList.add('cm-no-webgl');
    return noopOverlay(canvas);
  }

  const s: OverlayState = {
    gl: glState,
    running: false,
    contextLost: false,
    rafId: 0,
    lastNow: 0,
    elapsed: 0,
    cssW: 0,
    cssH: 0,
    lastDpr: 1,
    lastKey: '',
    ribbon: null,
    trackedEls: [],
  };

  const syncWires = (): void => syncOverlayWires(s, board, canvas);
  const syncStates = (): void => syncOverlayStates(s, board, canvas);

  const tick = (now: number): void => {
    if (!s.running || s.contextLost) return;
    const dt = s.lastNow > 0 ? Math.min(0.05, Math.max(0, (now - s.lastNow) / 1000)) : 0.016;
    s.lastNow = now;
    s.elapsed = (s.elapsed + dt) % MAP_SPARK_TIME_WRAP_S;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (s.cssW !== board.clientWidth || s.cssH !== board.clientHeight || dpr !== s.lastDpr) syncWires();
    else renderOverlayFrame(s, canvas);
    s.rafId = window.requestAnimationFrame(tick);
  };

  const onContextLost = (ev: Event): void => {
    ev.preventDefault();
    s.contextLost = true;
    if (s.rafId) {
      window.cancelAnimationFrame(s.rafId);
      s.rafId = 0;
    }
  };
  const onContextRestored = (): void => {
    s.contextLost = false;
    s.gl = initSparkGl(canvas);
    if (!s.gl) {
      board.classList.add('cm-no-webgl');
      return;
    }
    board.classList.remove('cm-no-webgl');
    s.lastKey = '';
    syncWires();
    if (s.running && !s.rafId) {
      s.lastNow = 0;
      s.rafId = window.requestAnimationFrame(tick);
    }
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  const stopObserving = observeBoardLayout(board, () => {
    if (s.running || board.clientWidth > 0) syncWires();
  });

  return {
    canvas,
    start() {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        s.running = false;
        s.elapsed = 0.42;
        syncWires();
        return;
      }
      syncWires();
      if (s.running) return;
      s.running = true;
      if (s.contextLost) return;
      s.lastNow = 0;
      s.rafId = window.requestAnimationFrame(tick);
    },
    stop() {
      s.running = false;
      if (s.rafId) {
        window.cancelAnimationFrame(s.rafId);
        s.rafId = 0;
      }
    },
    syncWires,
    syncStates,
    dispose() {
      s.running = false;
      if (s.rafId) window.cancelAnimationFrame(s.rafId);
      stopObserving();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (s.gl) disposeSparkGl(s.gl);
      canvas.remove();
    },
  };
}
