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
/** Bundled lettering stack for canvas text (public/fonts via styles/fonts.css); never a system font. */
const CARD_FONT = '"Chakra Petch", "IBM Plex Mono", monospace';

// Canvas text does not trigger @font-face loading by itself: ask for the faces up front.
if (typeof document !== 'undefined' && document.fonts) {
  for (const w of [600, 700]) void document.fonts.load(`${w} 40px "Chakra Petch"`).catch(() => undefined);
}

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

/** One half of a torn page: paper with a jagged tear on its inner edge and glitch lettering. */
function tearHalfTexture(side: 'left' | 'right', text: string, seed: number): THREE.CanvasTexture {
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
  ctx.font = `700 120px ${CARD_FONT}`;
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
