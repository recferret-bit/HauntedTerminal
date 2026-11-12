import type { ModelSpec, Vec2 } from '../../core/types.js';
import { makeRng } from '../../core/rng.js';
import { designToRoomX, onWall, round, RoomBuilder, ROOM } from './frame.js';
import { doorSockets, realRoomShell, shelfBooks, windowFrame } from './real-world.js';

/**
 * The outro: the real desk at dawn. This is the one room that is NOT inside the machine, so it is the
 * one place set dressing may use the `human` family (wood, denim-blue wall, warm window light).
 * Same frame, same actor band rule; the layout echoes `room.desk` so the player recognises it.
 * Tagged `real-world` so validators and the stage can treat it as the exception it is.
 */
export function buildOutro(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const b = new RoomBuilder('outro', 'The desk at dawn');

  realRoomShell(b, rng, 'denim', 'plastic');

  // The window: dawn. Above head height, over the screen-right half where he stands.
  const wx = -1.6, wy = 3.55, ww = 2.3, wh = 1.7;
  b.plaque('window-sky', [ww, wh, 0.04], 'lantern', [wx, wy]);
  const sun: Vec2[] = [];
  for (let i = 0; i <= 10; i++) sun.push([round(Math.cos((i / 10) * Math.PI) * 0.55), round(Math.sin((i / 10) * Math.PI) * 0.55)]);
  b.relief('sun', sun, 0.06, 'hoodie', [wx - 0.45, wy - wh / 2], {
    outline: false,
    anim: { type: 'bob', axis: 'y', speed: 0.03, amp: 0.06 },
  });
  windowFrame(b, wx, wy, ww, wh);

  // The real desk: wood, a monitor with a prompt, a keyboard, a mug. Left wing, as in room.desk.
  const z = 0.56;
  b.box('desk-leg', [0.14, 0.96, 0.44], 'hair', [1.85, 0.48, z]);
  b.box('desk-drawers', [0.6, 0.96, 0.44], 'hair', [3.65, 0.48, z]);
  for (let i = 0; i < 3; i++) b.box('drawer-pull', [0.2, 0.05, 0.04], 'plastic', [3.65, 0.24 + i * 0.28, z - 0.23]);
  b.box('desk-top', [2.5, 0.13, 0.52], 'hair', [2.85, 1.02, z]);
  b.box('monitor-stand', [0.3, 0.2, 0.2], 'rubber', [3.0, 1.18, z]);
  b.box('monitor', [1.05, 0.72, 0.12], 'plastic', [3.0, 1.62, z]);
  b.box('monitor-screen', [0.88, 0.55, 0.03], 'silicon', [3.0, 1.64, z - 0.07]);
  b.box('prompt', [0.3, 0.05, 0.02], 'phosphor', [3.24, 1.78, z - 0.09], { outline: false });
  b.box('cursor', [0.07, 0.09, 0.02], 'phosphor', [2.98, 1.78, z - 0.09], { outline: false, anim: { type: 'blink', speed: 1 } });
  b.box('keyboard', [0.8, 0.06, 0.3], 'plastic', [2.25, 1.115, z - 0.06]);
  b.add('mug', { kind: 'cylinder', rTop: 0.1, rBottom: 0.09, height: 0.2, sides: 10 }, 'paper', [3.8, 1.185, z - 0.1]);

  // A bookshelf high on the left: the only clutter that is his, not the machine's.
  b.plaque('bookshelf', [1.9, 0.09, 0.3], 'hair', [2.9, 3.2]);
  const books: ['denim' | 'hoodie' | 'paper' | 'plastic' | 'skin', number][] = [['hoodie', 0.5], ['paper', 0.42], ['plastic', 0.56], ['skin', 0.4], ['hoodie', 0.46], ['paper', 0.52]];
  shelfBooks(b, books, 3.7, 3.245);
  // A sticky note by the window: the todo.note, done.
  b.plaque('sticky-note', [0.3, 0.3, 0.03], 'lantern', [0.25, 3.1], { rot: [0, 0, 0.08] });

  b.socket('vibecoder', [designToRoomX(0.4), 0, ROOM.zActor])
    .socket('caption', [3.75, 4.55, ROOM.zDressNear])
    .socket('window', [wx, wy, onWall(0.04)])
    .socket('desk', [2.85, 1.085, z]);
  doorSockets(b);
  return b.spec(['real-world']);
}
