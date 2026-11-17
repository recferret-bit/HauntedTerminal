/**
 * The laptop's size in CSS pixels and the two camera framings, computed from it. One table: the view
 * writes these numbers into CSS custom properties, and `framing` places the camera from the same ones.
 *
 * Frame: the deck lies flat with its centre at the origin, front edge toward the viewer. The lid hinges
 * on the back edge, `HINGE_UP` above the deck, and opens to `LID_OPEN_DEG` (0 is folded flat on the deck).
 */
import type { StageLook } from './machine.js';

export const LAPTOP = {
  deckW: 720,
  deckD: 470,
  deckThick: 26,
  lidH: 520,
  /** The 640 x 480 panel sits in the lid with this bezel below it and above it. */
  screenW: 640,
  screenH: 480,
  bezelTop: 18,
  bezelBottom: 22,
  hingeUp: 8,
  /** Lid angle from the deck when open: 105 degrees, leaning back 15 from upright. */
  lidOpenDeg: 105,
} as const;

/** Camera tilt (looking down) per framing: from high above for the whole machine, nearly level for the screen. */
const TILT_DEG = { far: 36, near: 15 } as const;

export interface Framing {
  /** Degrees the camera looks down. */
  tilt: number;
  zoom: number;
  /** Screen-space shift (px) of the deck centre, after zoom. */
  shiftY: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Screen-space y (px, down positive, before zoom) of a point on the open lid `up` px above the hinge, for camera tilt `tilt`. */
function lidPointY(up: number, tilt: number): number {
  const L = LAPTOP;
  const back = rad(L.lidOpenDeg - 90);
  // The point in deck space: how far it is toward the viewer and how high above the deck.
  const toward = -L.deckD / 2 - up * Math.sin(back);
  const height = L.hingeUp + up * Math.cos(back);
  return -height * Math.cos(rad(tilt)) + toward * Math.sin(rad(tilt));
}

/** Screen-space y (px, before zoom) of the deck's front bottom edge. */
function frontY(tilt: number): number {
  const L = LAPTOP;
  return L.deckThick * Math.cos(rad(tilt)) + (L.deckD / 2) * Math.sin(rad(tilt));
}

/**
 * Share of the view the subject may fill, per framing: height (lid top to front edge) and width.
 * Perspective makes the near deck edge larger, hence the height margin; near may fill the width edge to edge.
 */
const FILL = { far: { h: 0.8, w: 0.82 }, near: { h: 0.86, w: 1 } } as const;

/**
 * Where the camera goes for a look, so the subject fills `vw` x `vh`. `far` frames the whole laptop
 * from above (the zoom is that of the open laptop, so opening the lid does not zoom; a shut laptop is
 * only re-centred); `near` puts the screen face-on and as big as it gets with the trackpad still in view.
 */
export function framing(look: Pick<StageLook, 'camera' | 'lid'>, vw: number, vh: number): Framing {
  const L = LAPTOP;
  const tilt = TILT_DEG[look.camera];
  const bottom = frontY(tilt);
  const openTop = lidPointY(L.lidH, tilt);
  const fill = FILL[look.camera];
  const zoom = Math.min((fill.h * vh) / (bottom - openTop), (fill.w * vw) / L.deckW);
  const top = look.lid === 'up' ? openTop : lidPointY(0, tilt);
  return { tilt, zoom, shiftY: -zoom * ((top + bottom) / 2) };
}

/** CSS custom properties for the laptop's size, from `LAPTOP`. */
export function geometryVars(): Record<string, string> {
  const L = LAPTOP;
  return {
    '--deck-w': `${L.deckW}px`,
    '--deck-d': `${L.deckD}px`,
    '--deck-thick': `${L.deckThick}px`,
    '--lid-h': `${L.lidH}px`,
    '--screen-w': `${L.screenW}px`,
    '--screen-h': `${L.screenH}px`,
    '--bezel-top': `${L.bezelTop}px`,
    '--bezel-bottom': `${L.bezelBottom}px`,
    '--hinge-up': `${L.hingeUp}px`,
    // CSS turns the lid about its hinge from lying flat behind the deck (0) to folded onto it (-180).
    '--lid-open': `${L.lidOpenDeg - 180}deg`,
  };
}
