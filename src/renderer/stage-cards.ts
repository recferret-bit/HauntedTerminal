import * as THREE from 'three';
import { TextureCatalog } from '../procgen/index.js';
import { stepped, type TweenManager } from './tween.js';

/** The main panel in world units (world +x is screen-left, so `left > right`). */
export interface PanelBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const INK = '#110e1b';
const PAPER = '#efe6d2';
const YELLOW = '#ffd166';

function freshCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

function canvasTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.ephemeral = true;
  return tex;
}

/** A procgen texture (TextureCatalog PixelBuffer) as a canvas, scaled up with hard pixels. */
function procCanvas(id: string, scale: number): HTMLCanvasElement | null {
  if (!TextureCatalog.has(id)) return null;
  const buf = TextureCatalog.build(id, 1);
  const src = document.createElement('canvas');
  src.width = buf.width;
  src.height = buf.height;
  src.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), 0, 0);
  const out = document.createElement('canvas');
  out.width = buf.width * scale;
  out.height = buf.height * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

function fillPattern(ctx: CanvasRenderingContext2D, id: string, scale: number, alpha: number, x: number, y: number, w: number, h: number): void {
  const tile = procCanvas(id, scale);
  const pattern = tile ? ctx.createPattern(tile, 'repeat') : null;
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function halftone(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, step = 18, r = 3): void {
  ctx.fillStyle = color;
  for (let y = 0; y < h; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800): number {
  let s = size;
  for (; s > 18; s -= 4) {
    ctx.font = `${weight} ${s}px Menlo, monospace`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return s;
}

/** A Comix Zone title page: paper, halftone, a black panel with a yellow caption box and big lettering. */
export function floorCardTexture(kicker: string, title: string, path: string, accent: string): THREE.CanvasTexture {
  const w = 1600;
  const h = 900;
  const { canvas, ctx } = freshCanvas(w, h);
  if (!ctx) return canvasTex(canvas);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  fillPattern(ctx, 'tex.halftone', 3, 0.18, 0, 0, w, h);
  // Inner panel, ink frame.
  ctx.fillStyle = '#1b1528';
  ctx.fillRect(60, 60, w - 120, h - 120);
  halftone(ctx, w, h, 'rgba(255,255,255,0.035)', 22, 4);
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.strokeRect(60, 60, w - 120, h - 120);
  // Speed burst behind the title.
  ctx.save();
  ctx.translate(w / 2, h / 2 + 20);
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 28; i++) {
    ctx.rotate((Math.PI * 2) / 28);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(900, -36);
    ctx.lineTo(900, 36);
    ctx.fill();
  }
  ctx.restore();
  // Yellow caption box, centred under the page's masthead strip.
  const ks = fitText(ctx, kicker, w - 360, 58);
  ctx.font = `800 ${ks}px Menlo, monospace`;
  const kw = Math.min(w - 260, ctx.measureText(kicker).width + 70);
  const ky = 230;
  ctx.fillStyle = YELLOW;
  ctx.fillRect(w / 2 - kw / 2, ky - 52, kw, 104);
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.strokeRect(w / 2 - kw / 2, ky - 52, kw, 104);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(kicker, w / 2, ky + 2);
  // The power mark stamped on both ends of the caption (tex.decal.bolt).
  const bolt = procCanvas('tex.decal.bolt', 3);
  if (bolt) {
    ctx.drawImage(bolt, w / 2 - kw / 2 - bolt.width - 10, ky - bolt.height / 2);
    ctx.drawImage(bolt, w / 2 + kw / 2 + 10, ky - bolt.height / 2);
  }
  // Big title with ink stroke.
  fitText(ctx, title, w - 300, 150);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 22;
  ctx.strokeStyle = INK;
  ctx.strokeText(title, w / 2, h / 2 + 70);
  ctx.fillStyle = accent;
  ctx.fillText(title, w / 2, h / 2 + 70);
  // Path in a paper strip.
  const ps = fitText(ctx, path, w - 420, 64, 700);
  ctx.font = `700 ${ps}px Menlo, monospace`;
  const pw = Math.min(w - 300, ctx.measureText(path).width + 70);
  ctx.fillStyle = PAPER;
  ctx.fillRect(w / 2 - pw / 2, h - 230, pw, 100);
  ctx.lineWidth = 8;
  ctx.strokeRect(w / 2 - pw / 2, h - 230, pw, 100);
  ctx.fillStyle = INK;
  ctx.fillText(path, w / 2, h - 180);
  return canvasTex(canvas);
}

/** One half of a torn page: paper with a jagged tear on its inner edge and glitch lettering. */
export function tearHalfTexture(side: 'left' | 'right', text: string, seed: number): THREE.CanvasTexture {
  const w = 800;
  const h = 900;
  const { canvas, ctx } = freshCanvas(w, h);
  if (!ctx) return canvasTex(canvas);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Jagged edge: shared by both halves when seeded the same.
  const pts: number[] = [];
  for (let y = 0; y <= h; y += 45) pts.push(w - 30 - rnd() * 70);
  ctx.beginPath();
  if (side === 'left') {
    ctx.moveTo(0, 0);
    pts.forEach((x, i) => ctx.lineTo(x, i * 45));
    ctx.lineTo(0, h);
  } else {
    ctx.moveTo(w, 0);
    pts.forEach((x, i) => ctx.lineTo(w - x, i * 45));
    ctx.lineTo(w, h);
  }
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#2a0f1e';
  ctx.fillRect(0, 0, w, h);
  fillPattern(ctx, 'tex.hex-dump', 4, 0.45, 0, 0, w, h);
  halftone(ctx, w, h, 'rgba(239,71,111,0.18)', 20, 4);
  ctx.fillStyle = '#ef476f';
  for (let i = 0; i < 9; i++) ctx.fillRect(rnd() * w, rnd() * h, 80 + rnd() * 240, 8 + rnd() * 18);
  ctx.font = '800 120px Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  const x = side === 'left' ? w : 0;
  ctx.strokeText(text, x, h / 2);
  ctx.fillStyle = PAPER;
  ctx.fillText(text, x, h / 2);
  ctx.restore();
  // Paper fibre along the tear.
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 14;
  ctx.beginPath();
  pts.forEach((px, i) => {
    const xx = side === 'left' ? px : w - px;
    if (i === 0) ctx.moveTo(xx, 0);
    else ctx.lineTo(xx, i * 45);
  });
  ctx.stroke();
  return canvasTex(canvas);
}

function overlayMesh(tex: THREE.Texture, w: number, h: number, pivot: 'left' | 'center' | 'right'): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  // Geometry is authored camera-facing after rotation.y = PI; local +x then points to world -x (screen-right).
  if (pivot === 'left') geo.translate(0.5, 0, 0);
  if (pivot === 'right') geo.translate(-0.5, 0, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(w, h, 1);
  mesh.renderOrder = 20;
  return mesh;
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.removeFromParent();
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
}

/**
 * Page-turn title card: the page swings in around the spine (screen-left edge) in 6 held poses,
 * holds, then turns away. All in-canvas, over the panel. Returns a cancel function.
 */
export function playPageCard(
  layer: THREE.Group, tweens: TweenManager, bounds: PanelBounds, tex: THREE.Texture,
  timing = { inMs: 420, holdMs: 1300, outMs: 380 },
): () => void {
  const w = bounds.left - bounds.right;
  const h = bounds.top - bounds.bottom;
  const card = overlayMesh(tex, w, h, 'left');
  const pivot = new THREE.Group();
  pivot.name = 'page-card';
  pivot.position.set(bounds.left, (bounds.top + bounds.bottom) / 2, -2);
  pivot.add(card);
  layer.add(pivot);
  let alive = true;
  const turn = (a: number) => {
    pivot.rotation.y = Math.PI + a;
  };
  turn(Math.PI / 2 - 0.01);
  const kill = () => {
    if (!alive) return;
    alive = false;
    disposeMesh(card);
    pivot.removeFromParent();
  };
  tweens.add(timing.inMs, (t) => alive && turn((Math.PI / 2) * (1 - stepped(t, 6)) - 0.0001), () => {
    if (!alive) return;
    turn(0);
    tweens.add(timing.holdMs, () => {}, () => {
      if (!alive) return;
      tweens.add(timing.outMs, (t) => alive && turn((Math.PI / 2) * stepped(t, 5)), kill);
    });
  });
  return kill;
}

/** Coredump: two torn halves slam shut over the panel, hold, then rip apart. */
export function playPageTear(layer: THREE.Group, tweens: TweenManager, bounds: PanelBounds, text = 'CORE DUMPED', holdMs = 520): () => void {
  const w = bounds.left - bounds.right;
  const h = bounds.top - bounds.bottom;
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  const seed = 7;
  // Screen-left half pivots on the screen-left edge (world +x).
  const left = overlayMesh(tearHalfTexture('left', text, seed), w / 2 + 0.25, h, 'left');
  const right = overlayMesh(tearHalfTexture('right', text, seed), w / 2 + 0.25, h, 'right');
  const g = new THREE.Group();
  g.name = 'page-tear';
  g.position.z = -2.2;
  left.rotation.y = Math.PI;
  right.rotation.y = Math.PI;
  g.add(left, right);
  layer.add(g);
  let alive = true;
  const place = (open: number, tilt: number) => {
    left.position.set(bounds.left + open, cy - open * 0.15, 0);
    right.position.set(bounds.right - open, cy + open * 0.12, 0);
    left.rotation.z = tilt;
    right.rotation.z = -tilt;
  };
  const kill = () => {
    if (!alive) return;
    alive = false;
    disposeMesh(left);
    disposeMesh(right);
    g.removeFromParent();
  };
  const far = w / 2 + 0.6;
  place(far, 0);
  void cx;
  tweens.add(220, (t) => alive && place(far * (1 - stepped(t, 3)), 0), () => {
    if (!alive) return;
    place(0, 0);
    tweens.add(holdMs, () => {}, () => {
      if (!alive) return;
      tweens.add(420, (t) => alive && place(far * stepped(t, 5), 0.12 * stepped(t, 5)), kill);
    });
  });
  return kill;
}
