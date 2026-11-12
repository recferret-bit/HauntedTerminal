/**
 * Room sets: one shallow stage per RoomKind, registered as `room.<kind>`.
 * How to design one: .kiro/skills/procedural-rooms-3d/SKILL.md
 *
 * The stage (src/renderer/comic-stage.ts) still draws a flat backdrop plane; these are ready for it to
 * adopt through `roomIdForKind(view.kind)` and the frame constants re-exported below.
 */
import type { RoomKind } from '../../contracts/room-view.js';
import { ModelCatalog } from '../core/catalog.js';
import type { ModelSpec } from '../core/types.js';
import { buildAttic, buildDesk } from './rooms/floor1.js';
import { buildChasm, buildCryptEntrance, buildCryptHall } from './rooms/floor2.js';
import { buildCell, buildLabHall } from './rooms/floor3.js';
import { buildCatwalk, buildFurnace } from './rooms/floor4.js';
import { buildCore } from './rooms/floor5.js';
import { buildOutro } from './rooms/outro.js';
import { roomIdForKind } from './rooms/frame.js';

export {
  ACTOR_BAND, BAND_ZONES, DESIGN_LEFT, DESIGN_RIGHT, ROOM, ROOM_KINDS, RoomBuilder,
  designToRoomX, floorForKind, roomIdForKind, type RoomId,
} from './rooms/frame.js';

interface RoomDef {
  label: string;
  lore: string;
  build: (seed: number) => ModelSpec;
}

export const ROOM_DEFS: Record<RoomKind, RoomDef> = {
  desk: {
    label: 'Desk nook',
    lore: 'Floor 1 start: the desk he fell asleep at, rebuilt by the machine out of drive bays and a dead CRT.',
    build: buildDesk,
  },
  attic: {
    label: 'Storage attic',
    lore: 'Floor 1: the storage attic. Drive-bay tower, platters, ribbon-cable cobwebs, the relay above the cellar hatch.',
    build: buildAttic,
  },
  crypt_entrance: {
    label: 'Firewall crypt entrance',
    lore: 'Floor 2: port-shell vaults and log tombstones in front of the permission gate.',
    build: buildCryptEntrance,
  },
  crypt_hall: {
    label: 'Crypt hall',
    lore: 'Floor 2: the hall behind the gate. Burial niches for dead packets, where the trojan perches.',
    build: buildCryptHall,
  },
  chasm: {
    label: 'Bus chasm',
    lore: 'Floor 2: a gap in the bus. The traces stop at both lips; a .tar crate bridges it.',
    build: buildChasm,
  },
  cell: {
    label: 'Loopback cell',
    lore: 'Floor 3: cell_9 of the bus maze. Three loopback frames that lead back here, and rising black water.',
    build: buildCell,
  },
  lab_hall: {
    label: 'Bus maze hall',
    lore: 'Floor 3: the dry central hall. A RAM-stick colonnade, mirrored traces, the pedestal niche.',
    build: buildLabHall,
  },
  catwalk: {
    label: 'Cooling catwalk',
    lore: 'Floor 4: a grating over the cooling loop, heat pipes and the valve that guards the furnace hall.',
    build: buildCatwalk,
  },
  furnace: {
    label: 'CPU furnace hall',
    lore: 'Floor 4: heatsink organ, fan tower and the glowing die. The fork bomb lives here.',
    build: buildFurnace,
  },
  core: {
    label: 'Kernel core',
    lore: 'Floor 5: the cracked CPU die in its socket, lightning in the cracks. The last room.',
    build: buildCore,
  },
  outro: {
    label: 'The desk at dawn',
    lore: 'The real world after `exit`: his actual desk, a window, morning. The only warm room in the game.',
    build: buildOutro,
  },
};

for (const kind of Object.keys(ROOM_DEFS) as RoomKind[]) {
  const def = ROOM_DEFS[kind];
  const id = roomIdForKind(kind);
  ModelCatalog.register({ id, category: 'room', label: def.label, lore: def.lore, build: def.build });
}
