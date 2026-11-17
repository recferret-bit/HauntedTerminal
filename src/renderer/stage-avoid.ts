/**
 * Keep-out for the stage lettering: a caption slides the smallest distance that clears the page chrome
 * (title block, HUD, tutorial card, shader dock), the agent cameo and the captions already placed this
 * frame, while staying inside the panel. Pure box math; stage-overlay.ts feeds it pixel boxes.
 */

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** DOM elements of the page that paint over the stage. */
export const CHROME_IDS = ['titleblock', 'hud', 'tutorial-card', 'shader-dock'];

const hits = (a: Box, o: Box): boolean => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t;

const shift = (a: Box, dx: number, dy: number): Box => ({ l: a.l + dx, r: a.r + dx, t: a.t + dy, b: a.b + dy });

const inside = (a: Box, w: Box): boolean => a.l >= w.l && a.r <= w.r && a.t >= w.t && a.b <= w.b;

/** The offset that moves `box` off every obstacle with the least travel; {0,0} when it is already clear. */
export function avoidOffset(box: Box, obstacles: Box[], bounds: Box): { dx: number; dy: number } {
  let cur = box;
  let dx = 0;
  let dy = 0;
  for (let pass = 0; pass < 6; pass++) {
    const o = obstacles.find((x) => hits(cur, x));
    if (!o) break;
    const options = [
      { x: o.l - cur.r, y: 0 },
      { x: o.r - cur.l, y: 0 },
      { x: 0, y: o.t - cur.b },
      { x: 0, y: o.b - cur.t },
    ]
      .map((d) => ({ ...d, box: shift(cur, d.x, d.y) }))
      .filter((d) => inside(d.box, bounds))
      .map((d) => ({ ...d, clash: obstacles.filter((x) => hits(d.box, x)).length, dist: Math.abs(d.x) + Math.abs(d.y) }))
      .sort((p, q) => p.clash - q.clash || p.dist - q.dist);
    const best = options[0];
    if (!best) break;
    dx += best.x;
    dy += best.y;
    cur = best.box;
  }
  return { dx, dy };
}
