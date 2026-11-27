import type { SfxId } from './catalog.js';

/** Classic floor directory basename -> door sample. Chapter levels declare `sfx` on each dir/stage directly. */
const DOOR_CUE: Record<string, SfxId> = {
  desk: 'door_usb',
  nightmare_workspace: 'door_usb',
  chronicles: 'door_usb',
  ram_slots: 'door_usb',
  pedestal: 'door_usb',
  drive_bay: 'door_serial',
  entrance: 'door_serial',
  port_445: 'door_serial',
  catwalk: 'door_serial',
  iron_gate: 'door_firewall',
  panic_chamber: 'door_firewall',
  chasm: 'door_hdmi',
  hidden_wing: 'door_hdmi',
  furnace_hall: 'door_hdmi',
  boiler_room: 'door_hdmi',
  cellar_hatch: 'door_ethernet',
  crypt_stairs: 'door_ethernet',
  boiler_shaft: 'door_ethernet',
  core_elevator: 'door_ethernet',
  north_exit: 'door_loopback',
  east_exit: 'door_loopback',
  south_exit: 'door_loopback',
  wing_a: 'door_loopback',
  floor_3: 'door_loopback',
  cell_9: 'door_loopback',
  labyrinth: 'door_loopback',
  null: 'door_null',
  devnull: 'door_null',
};

const DOOR_MODEL_CUE: Record<string, SfxId> = {
  'door.usb': 'door_usb',
  'door.serial': 'door_serial',
  'door.ethernet': 'door_ethernet',
  'door.firewall': 'door_firewall',
  'door.hdmi': 'door_hdmi',
  'door.loopback': 'door_loopback',
  'door.devnull': 'door_null',
};

export function doorModelCue(model?: string): SfxId | null {
  return model ? (DOOR_MODEL_CUE[model] ?? null) : null;
}

export function doorCue(path: string): SfxId | null {
  const base = path.split('/').filter(Boolean).pop() ?? '';
  if (base.includes('null')) return 'door_null';
  return DOOR_CUE[base] ?? null;
}
