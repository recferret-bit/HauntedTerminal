/**
 * Shared assembly for the two rooms that are NOT inside the machine: the desk at night (`room.intro`)
 * and the desk at dawn (`room.outro`). They share a shell, a window frame, a bookshelf and the door sockets;
 * only the zones, the sky and the furniture differ.
 */
import type { ZoneId } from '../../core/palette.js';
import type { Rng } from '../../core/rng.js';
import { ROOM, type RoomBuilder } from './frame.js';

/** Wall, wooden floor with five jittered board gaps, and the skirting. Draws five numbers from `rng`. */
export function realRoomShell(b: RoomBuilder, rng: Rng, wallZone: ZoneId, skirtingZone: ZoneId): void {
  const W = ROOM.width + ROOM.bleed * 2;
  b.box('wall', [W, ROOM.height, 0.1], wallZone, [0, ROOM.height / 2, ROOM.zWallFace + 0.05]);
  b.box('floor', [W, ROOM.apron, 1.5], 'hair', [0, -ROOM.apron / 2, 0.25]);
  for (let i = 0; i < 5; i++) {
    b.box('floorboard-gap', [0.04, ROOM.apron - 0.08, 0.02], 'ink', [-3.4 + i * 1.7 + rng.range(-0.2, 0.2), -ROOM.apron / 2, ROOM.zApron - 0.01], { outline: false });
  }
  b.plaque('skirting', [W, 0.16, 0.05], skirtingZone, [0, 0.08]);
}

/** Window trim around a pane centred at (wx, wy): head, sill, two jambs and the cross bars. */
export function windowFrame(b: RoomBuilder, wx: number, wy: number, ww: number, wh: number): void {
  b.plaque('window-frame', [ww + 0.24, 0.14, 0.14], 'plastic', [wx, wy + wh / 2 + 0.05]);
  b.plaque('window-sill', [ww + 0.4, 0.16, 0.22], 'plastic', [wx, wy - wh / 2 - 0.06]);
  b.plaque('window-jamb', [0.12, wh, 0.14], 'plastic', [wx + ww / 2 + 0.06, wy]);
  b.plaque('window-jamb', [0.12, wh, 0.14], 'plastic', [wx - ww / 2 - 0.06, wy]);
  b.plaque('window-bar', [0.07, wh, 0.1], 'plastic', [wx, wy]);
  b.plaque('window-bar', [ww, 0.07, 0.1], 'plastic', [wx, wy + 0.1]);
}

/** A row of books standing on a shelf at `shelfY`, starting at x and stepping screen-right by 0.2. */
export function shelfBooks(b: RoomBuilder, books: ReadonlyArray<readonly [ZoneId, number]>, x: number, shelfY: number): void {
  let bx = x;
  for (const [zoneId, h] of books) {
    b.plaque('book', [0.17, h, 0.22], zoneId, [bx, shelfY + h / 2]);
    bx -= 0.2;
  }
}

/** The three door sockets every room ends with. */
export function doorSockets(b: RoomBuilder): RoomBuilder {
  return b
    .socket('door.left', [3.3, 0, ROOM.zDressNear])
    .socket('door.right', [-3.55, 0, ROOM.zDressNear])
    .socket('door.down', [-2.4, 0, ROOM.zActor]);
}
