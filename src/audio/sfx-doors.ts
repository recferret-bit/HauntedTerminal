import type { SfxId } from './catalog.js';

/** Directory basename -> door sample. The names are room directories, not level indexes. */
const DOOR_CUE: Record<string, SfxId> = {
  desk: 'door_usb',
  chronicles: 'door_usb',
  ram_slots: 'door_usb',
  pedestal: 'door_usb',
  vram_crate: 'door_usb',
  wires_and_chips: 'door_usb',
  cache_vault: 'door_usb',
  nightmare_workspace: 'door_usb',
  ui_dashboard: 'door_usb',
  port_445: 'door_serial',
  drive_bay: 'door_serial',
  entrance: 'door_serial',
  catwalk: 'door_serial',
  iron_gate: 'door_firewall',
  clod_kernel_core: 'door_firewall',
  clod_overlord_core: 'door_firewall',
  panic_chamber: 'door_firewall',
  chasm: 'door_hdmi',
  hidden_wing: 'door_hdmi',
  furnace_hall: 'door_hdmi',
  boiler_room: 'door_hdmi',
  docker_forge: 'door_hdmi',
  cellar_hatch: 'door_ethernet',
  crypt_stairs: 'door_ethernet',
  boiler_shaft: 'door_ethernet',
  core_elevator: 'door_ethernet',
  hub_uplink: 'door_ethernet',
  gpu_alley: 'door_ethernet',
  server_hub_1: 'door_ethernet',
  server_hub_2: 'door_ethernet',
  server_hub_3: 'door_ethernet',
  logic_cell: 'door_ethernet',
  compose_furnace: 'door_ethernet',
  sector_ui_grid: 'door_ethernet',
  sector_docker_forge: 'door_ethernet',
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

export function doorCue(path: string): SfxId | null {
  const base = path.split('/').filter(Boolean).pop() ?? '';
  if (base.includes('null')) return 'door_null';
  return DOOR_CUE[base] ?? null;
}
