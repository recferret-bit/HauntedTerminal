import type { RoomKind } from '../../../contracts/room-view.js';
import type { FloorId, ZoneId } from '../../core/palette.js';
import type { AnimTag, ModelSpec, PartSpec, ShapeSpec, Vec2, Vec3 } from '../../core/types.js';

/**
 * The room frame. Every `room.<kind>` model is authored in it, and every actor is placed in it.
 * Full write-up: .kiro/skills/procedural-rooms-3d/references/room-frame.md
 *
 *   y   0 is the floor top (actors' feet). The wall runs up to `height`, the floor apron down to −`apron`.
 *   x   the room is `width` wide, centred on 0. World +x is SCREEN-LEFT. The shell bleeds `bleed` past each side.
 *   z   the camera is on −z. Smaller z is nearer. Layers, far to near:
 *         wall (front face at `zWallFace`) > wall relief > floor-standing dressing (`zDressFar`..`zDressNear`)
 *         > actors at `zActor` > foreground silhouettes at `zFront` (edges only).
 */
export const ROOM = {
  width: 8,
  halfWidth: 4,
  /** 5.0 because the stage shows 4.85 units above the feet line at zoom 1. */
  height: 5,
  apron: 0.6,
  bleed: 0.2,
  /** z of the wall's camera-facing surface. Relief is glued onto it. */
  zWallFace: 0.9,
  zDressFar: 0.8,
  zDressNear: 0.25,
  zActor: 0,
  zFront: -0.35,
  /** z of the floor's front (apron) face. */
  zApron: -0.5,
} as const;

/**
 * Where actors stand and what must stay quiet behind them.
 * Inside the band (x from −halfWidth to `xLeft`, y from 0 to `top`) only dark, low-contrast wall relief is allowed.
 * The left wing (x > `xLeft`, screen-left of the vibecoder's spawn) may hold tall floor-standing dressing.
 * Above `top` is the upper wall: free for motifs and the few signal accents.
 */
export const ACTOR_BAND = {
  xLeft: 1.7,
  xRight: -ROOM.halfWidth,
  top: 2.4,
} as const;

/** Zones dark enough to sit behind actors inside the band. */
export const BAND_ZONES: readonly ZoneId[] = ['silicon', 'pcbDark', 'rubber', 'ink'];

/** The design-space x range `src/game/view.ts` places actors in (copies of DESIGN_LEFT / DESIGN_RIGHT in comic-stage.ts). */
export const DESIGN_LEFT = 4.9;
export const DESIGN_RIGHT = -1.15;

/** A `RoomActor.x` from src/game/view.ts as a room-frame x. Same linear map as ComicStage.placeX, onto the room width. */
export function designToRoomX(designX: number): number {
  const t = Math.min(1, Math.max(0, (DESIGN_LEFT - designX) / (DESIGN_LEFT - DESIGN_RIGHT)));
  return round(ROOM.halfWidth - t * ROOM.width);
}

export const ROOM_KINDS = [
  'desk', 'attic', 'crypt_entrance', 'crypt_hall', 'chasm', 'cell', 'lab_hall', 'catwalk', 'furnace', 'core', 'outro',
] as const satisfies readonly RoomKind[];

export type RoomId = `room.${RoomKind}`;

export function roomIdForKind(kind: RoomKind): RoomId {
  return `room.${kind}`;
}

/** Which floor's palette and motifs a room belongs to. `outro` is the real world and reports floor 5's slot. */
export function floorForKind(kind: RoomKind): FloorId {
  if (kind === 'desk' || kind === 'attic') return 1;
  if (kind === 'crypt_entrance' || kind === 'crypt_hall' || kind === 'chasm') return 2;
  if (kind === 'cell' || kind === 'lab_hall') return 3;
  if (kind === 'catwalk' || kind === 'furnace') return 4;
  return 5;
}

export function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

type PartExtra = Partial<Pick<PartSpec, 'rot' | 'scale' | 'outline' | 'texture' | 'anim'>>;

/** Collects parts with unique names and sockets, then emits the ModelSpec. */
export class RoomBuilder {
  readonly parts: PartSpec[] = [];
  readonly sockets: Record<string, Vec3> = {};
  private readonly used = new Map<string, number>();

  constructor(
    readonly kind: RoomKind,
    readonly label: string,
  ) {}

  add(name: string, shape: ShapeSpec, zone: ZoneId, pos: Vec3, extra: PartExtra = {}): this {
    const n = (this.used.get(name) ?? 0) + 1;
    this.used.set(name, n);
    this.parts.push({
      name: n === 1 ? name : `${name}.${n}`,
      shape,
      zone,
      pos: [round(pos[0]), round(pos[1]), round(pos[2])],
      ...extra,
    });
    return this;
  }

  box(name: string, size: Vec3, zone: ZoneId, pos: Vec3, extra: PartExtra = {}): this {
    return this.add(name, { kind: 'box', size }, zone, pos, extra);
  }

  /** A flat relief glued to the wall: `depth` thick, its back on the wall face. `pos` is [x, y] of the shape origin. */
  relief(name: string, outline: Vec2[], depth: number, zone: ZoneId, at: Vec2, extra: PartExtra = {}): this {
    return this.add(name, { kind: 'extrude', outline, depth }, zone, [at[0], at[1], onWall(depth)], extra);
  }

  /** A box glued to the wall. `at` is the centre. */
  plaque(name: string, size: Vec3, zone: ZoneId, at: Vec2, extra: PartExtra = {}): this {
    return this.box(name, size, zone, [at[0], at[1], onWall(size[2])], extra);
  }

  socket(name: string, pos: Vec3): this {
    this.sockets[name] = [round(pos[0]), round(pos[1]), round(pos[2])];
    return this;
  }

  /** Sockets every room has. Rooms override the door ones when their layout differs. */
  standardSockets(vibecoderDesignX: number): this {
    return this
      .socket('vibecoder', [designToRoomX(vibecoderDesignX), 0, ROOM.zActor])
      .socket('door.left', [3.3, 0, ROOM.zDressNear])
      .socket('door.right', [-3.55, 0, ROOM.zDressNear])
      .socket('door.down', [-2.4, 0, ROOM.zActor])
      .socket('caption', [3.75, 4.55, ROOM.zDressNear]);
  }

  spec(tags: string[] = []): ModelSpec {
    return {
      id: roomIdForKind(this.kind),
      category: 'room',
      label: this.label,
      parts: this.parts,
      sockets: this.sockets,
      inkWeight: 0.02,
      tags: ['room', `floor${floorForKind(this.kind)}`, ...tags],
    };
  }
}

/** Centre z for something `depth` thick whose back sits just inside the wall face. */
export function onWall(depth: number): number {
  return round(ROOM.zWallFace - depth / 2 + 0.004);
}

export function blink(speed: number, phase = 0): AnimTag {
  return { type: 'blink', speed, phase };
}
