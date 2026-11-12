import type { RoomKind } from '../../../contracts/room-view.js';
import { ModelCatalog } from '../../core/catalog.js';
import { makeRng } from '../../core/rng.js';
import type { ModelSpec, Vec2 } from '../../core/types.js';
import { onWall, round, RoomBuilder, ROOM } from '../rooms/frame.js';
import { doorSockets, realRoomShell, shelfBooks, windowFrame } from '../rooms/real-world.js';

/**
 * `room.intro`: the developer's real room, at night, before the lightning. Like `room.outro` (the same
 * desk at dawn) it is NOT inside the machine, so set dressing may use the `human` family (wood, the
 * desk lamp). Tagged `real-world`. The light is the monitor, the lamp and the storm in the window.
 *
 * Layout (room frame, +x is screen-left): the desk and its monitor in the left wing, the PC tower on
 * the desk beside the monitor (the lightning hits it), the office chair just screen-right of the desk
 * (the vibecoder sits there, socket `vibecoder`), the storm window above and behind him.
 */
export const INTRO_LAYOUT = {
  deskX: 2.7,
  deskTop: 0.8,
  monitor: { x: 2.55, y: 1.36, w: 1.12, h: 0.84 },
  tower: { x: 3.72, w: 0.46, h: 0.86 },
  keyboard: { x: 2.05, y: 0.83 },
  chairX: 1.3,
  window: { x: -0.7, y: 3.0, w: 2.4, h: 1.7 },
} as const;

export function buildIntroRoom(seed: number): ModelSpec {
  const rng = makeRng(seed);
  // RoomBuilder is typed to the game's RoomKinds; the intro is a cinematic-only set, so the id is set below.
  const b = new RoomBuilder('intro' as RoomKind, 'The desk at night');
  const L = INTRO_LAYOUT;

  realRoomShell(b, rng, 'rubber', 'silicon');
  // Wallpaper stripes: dark on dark, they only catch the lightning flash.
  for (let i = 0; i < 6; i++) b.plaque('wall-stripe', [0.08, ROOM.height - 0.3, 0.02], 'silicon', [-3.6 + i * 1.45, ROOM.height / 2 + 0.1]);

  // The storm window: night sky, a cloud bank and a bolt that blinks with the storm.
  const { x: wx, y: wy, w: ww, h: wh } = L.window;
  b.plaque('window-sky', [ww, wh, 0.04], 'silicon', [wx, wy]);
  const cloud: Vec2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const bump = 0.1 + 0.08 * Math.abs(Math.sin(t * Math.PI * 4 + rng.range(0, 0.6)));
    cloud.push([round(-ww / 2 + t * ww), round(bump)]);
  }
  cloud.push([ww / 2, -0.18], [-ww / 2, -0.18]);
  b.relief('window-cloud', cloud, 0.06, 'heatsink', [wx, wy + wh / 2 - 0.22], { outline: false });
  const bolt: Vec2[] = [[0, 0], [0.16, -0.32], [0.06, -0.34], [0.2, -0.72], [-0.04, -0.3], [0.06, -0.28], [-0.08, 0]];
  b.relief('window-bolt', bolt, 0.07, 'dataCyan', [wx + 0.55, wy + wh / 2 - 0.3], { outline: false, anim: { type: 'blink', speed: 0.23, phase: 0.1 } });
  windowFrame(b, wx, wy, ww, wh);
  // Curtains, pulled back.
  b.relief('curtain', [[0, 0], [0.34, 0], [0.22, -0.9], [0.3, -1.9], [0, -1.9]], 0.06, 'denim', [wx + ww / 2 + 0.06, wy + wh / 2 + 0.1]);
  b.relief('curtain', [[0, 0], [-0.34, 0], [-0.22, -0.9], [-0.3, -1.9], [0, -1.9]], 0.06, 'denim', [wx - ww / 2 - 0.06, wy + wh / 2 + 0.1]);

  // The desk: wood, a little lower than the dawn one so the seated developer can reach the keys.
  const z = 0.56;
  const top = L.deskTop;
  b.box('desk-top', [2.6, 0.12, 0.52], 'hair', [L.deskX, top - 0.06, z]);
  b.box('desk-leg', [0.14, top - 0.12, 0.44], 'hair', [L.deskX - 1.18, (top - 0.12) / 2, z]);
  b.box('desk-leg', [0.14, top - 0.12, 0.44], 'hair', [L.deskX + 1.18, (top - 0.12) / 2, z]);

  // The monitor: the one bright thing in the room, code on it, a blinking cursor.
  const m = L.monitor;
  b.box('monitor-stand', [0.26, 0.18, 0.2], 'rubber', [m.x, top + 0.09, z]);
  b.box('monitor-foot', [0.5, 0.05, 0.26], 'rubber', [m.x, top + 0.025, z]);
  b.box('monitor', [m.w, m.h, 0.14], 'rubber', [m.x, m.y, z]);
  b.box('monitor-screen', [m.w - 0.14, m.h - 0.14, 0.03], 'glass', [m.x, m.y + 0.01, z - 0.08]);
  const lines = [0.42, 0.62, 0.3, 0.5, 0.36];
  lines.forEach((len, i) => {
    const indent = i === 2 || i === 3 ? 0.12 : 0;
    b.box('code-line', [len, 0.045, 0.02], 'phosphor', [m.x + (m.w - 0.3) / 2 - indent - len / 2, m.y + m.h / 2 - 0.17 - i * 0.11, z - 0.1], { outline: false });
  });
  b.box('cursor', [0.06, 0.08, 0.02], 'phosphor', [m.x + (m.w - 0.3) / 2 - 0.42, m.y + m.h / 2 - 0.17 - 5 * 0.11, z - 0.1], { outline: false, anim: { type: 'blink', speed: 1.4 } });
  b.box('monitor-led', [0.05, 0.05, 0.02], 'phosphor', [m.x - m.w / 2 + 0.1, m.y - m.h / 2 + 0.035, z - 0.08], { outline: false });

  // The PC tower, on the desk beside the monitor. The lightning comes down on it.
  const t = L.tower;
  b.box('tower', [t.w, t.h, 0.5], 'plastic', [t.x, top + t.h / 2, z]);
  b.box('tower-face', [t.w - 0.1, t.h - 0.1, 0.03], 'rubber', [t.x, top + t.h / 2, z - 0.26]);
  for (let i = 0; i < 2; i++) b.box('tower-bay', [t.w - 0.18, 0.08, 0.02], 'heatsink', [t.x, top + t.h - 0.16 - i * 0.13, z - 0.28]);
  b.box('tower-led', [0.06, 0.06, 0.02], 'powerAmber', [t.x - 0.1, top + 0.18, z - 0.29], { outline: false, anim: { type: 'blink', speed: 0.8 } });
  b.box('tower-button', [0.1, 0.1, 0.02], 'phosphor', [t.x + 0.06, top + 0.18, z - 0.29], { outline: false });
  b.add('power-cable', { kind: 'tube', path: [[t.x - 0.1, top + 0.1, z + 0.2], [t.x - 0.2, top - 0.3, z + 0.3], [t.x + 0.1, 0.2, z + 0.32], [t.x + 0.35, 0.3, onWall(0.04)]], radius: 0.03 }, 'rubber', [0, 0, 0]);
  b.plaque('wall-socket', [0.18, 0.24, 0.04], 'plastic', [t.x + 0.35, 0.32]);

  // Keyboard, mug, a lamp with its warm cone.
  const k = L.keyboard;
  b.box('keyboard', [0.7, 0.05, 0.26], 'plastic', [k.x, top + 0.025, z - 0.1]);
  b.add('mug', { kind: 'cylinder', rTop: 0.09, rBottom: 0.08, height: 0.18, sides: 10 }, 'paper', [m.x + 0.75, top + 0.09, z - 0.12]);
  b.add('lamp-arm', { kind: 'tube', path: [[L.deskX + 1.2, top, z + 0.05], [L.deskX + 1.15, top + 0.7, z], [L.deskX + 0.95, top + 0.95, z - 0.02]], radius: 0.03 }, 'silicon', [0, 0, 0]);
  b.add('lamp-shade', { kind: 'cone', radius: 0.17, height: 0.2, sides: 8 }, 'silicon', [L.deskX + 0.92, top + 0.9, z - 0.02], { rot: [0, 0, -0.5] });
  b.add('lamp-bulb', { kind: 'sphere', radius: 0.06 }, 'lantern', [L.deskX + 0.84, top + 0.74, z - 0.12], { outline: false });

  // The office chair the developer sits on: seat, back, gas lift, star base.
  const cx = L.chairX;
  b.box('chair-back', [0.84, 0.9, 0.08], 'silicon', [cx, 1.12, 0.42]);
  b.box('chair-trim', [0.7, 0.07, 0.04], 'heatsink', [cx, 1.5, 0.37]);
  b.box('chair-seat', [0.86, 0.1, 0.5], 'silicon', [cx, 0.5, 0.2]);
  b.box('chair-arm', [0.08, 0.3, 0.3], 'heatsink', [cx + 0.42, 0.66, 0.15]);
  b.box('chair-arm', [0.08, 0.3, 0.3], 'heatsink', [cx - 0.42, 0.66, 0.15]);
  b.box('chair-post', [0.07, 0.4, 0.07], 'heatsink', [cx, 0.27, 0.2]);
  b.box('chair-base', [0.7, 0.06, 0.08], 'heatsink', [cx, 0.06, 0.2]);
  b.box('chair-spine', [0.07, 0.5, 0.06], 'heatsink', [cx, 0.62, 0.42]);

  // A poster and a shelf: whose room this is.
  b.plaque('poster', [0.8, 1.05, 0.03], 'paper', [3.35, 3.0], { rot: [0, 0, -0.04] });
  b.plaque('poster-art', [0.52, 0.52, 0.06], 'denim', [3.35, 3.12], { rot: [0, 0, -0.04] });
  b.plaque('shelf', [1.6, 0.09, 0.3], 'hair', [1.25, 3.6]);
  const books: ['denim' | 'hoodie' | 'paper' | 'plastic', number][] = [['hoodie', 0.46], ['paper', 0.4], ['denim', 0.52], ['plastic', 0.38], ['hoodie', 0.44]];
  shelfBooks(b, books, 1.85, 3.645);

  b.socket('vibecoder', [cx, 0, ROOM.zActor])
    .socket('monitor', [m.x, m.y, z - 0.1])
    .socket('screen', [m.x, m.y + 0.01, z - 0.1])
    .socket('tower', [t.x, top + t.h, z - 0.1])
    .socket('keyboard', [k.x, top + 0.05, z - 0.1])
    .socket('window', [wx, wy, onWall(0.04)])
    .socket('caption', [3.75, 4.55, ROOM.zDressNear]);
  doorSockets(b);
  const spec = b.spec();
  return { ...spec, id: 'room.intro', label: 'The desk at night', tags: ['room', 'real-world', 'night'] };
}

ModelCatalog.register({
  id: 'room.intro',
  category: 'room',
  label: 'The desk at night',
  lore: 'The opening cinematic: his real desk at night, a storm in the window, the monitor glowing, the PC tower the lightning hits. Real world, like room.outro.',
  build: buildIntroRoom,
});
