/**
 * Doors: ports and interfaces stood upright. Every door has a metal or plastic shell, visible
 * contacts, a status LED part named `led` and a `lock` socket. Width 0.7 to 1.1, height 1.4 to 1.9.
 * The game recolours the `led` zone at runtime: lockRed locked, powerAmber busy, phosphor open.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { makeRng } from '../core/rng.js';
import type { ModelSpec, PartSpec, Vec2, Vec3 } from '../core/types.js';
import {
  greebleContactTeeth, greebleLabelPlate, greebleLed, greeblePadlock, greeblePinRow, greeblePortCavityZ, greeblePortShell,
  greebleScrew, greebleSpeakerGrille, kitBox, kitDisc, kitPlate, kitRing, outlineArch, outlineRoundRect, outlineStroke,
  outlineSymmetric, outlineTransform, SCREEN_LEFT, SCREEN_RIGHT,
} from '../kit/greebles.js';

const SILL_H = 0.08;

/** The strip of board every port is soldered to. It grounds the door at y = 0. */
function sill(width: number, depth = 0.34): PartSpec {
  return kitBox('sill', [width, SILL_H, depth], 'pcbDark', [0, SILL_H / 2, 0], { bevel: 0.015, texture: 'tex.pcb-traces' });
}

/** The `lock`, `label` and `fx` sockets nearly every door has; `labelY` is the height of the label above the sill. */
function doorSockets(lock: Vec3, labelY: number, fx: Vec3): Record<string, Vec3> {
  return { lock, label: [0, labelY, 0], fx };
}

function doorSpec(id: string, label: string, parts: PartSpec[], sockets: Record<string, Vec3>): ModelSpec {
  return { id, category: 'door', label, parts, sockets };
}

// ---------------------------------------------------------------- door.usb

function buildUsb(_seed: number): ModelSpec {
  const W = 0.8, H = 1.56, D = 0.26;
  const cy = SILL_H + H / 2;
  const back = D / 2;
  const cavityY = -0.07;
  const inside = greeblePortCavityZ(back, D);
  const tongueX = 0.14 * SCREEN_LEFT;
  const parts: PartSpec[] = [
    sill(0.94),
    kitBox('lug.l', [0.1, 0.16, 0.2], 'solder', [0.42, SILL_H + 0.06, 0], { bevel: 0.01 }),
    kitBox('lug.r', [0.1, 0.16, 0.2], 'solder', [-0.42, SILL_H + 0.06, 0], { bevel: 0.01 }),
    ...greeblePortShell({
      name: 'port', pos: [0, cy, back], width: W, height: H, depth: D, radius: 0.05,
      cavityOutline: outlineTransform(outlineRoundRect(0.6, 1.26, 0.03, 2), { move: [0, cavityY] }),
    }),
    // The tongue fills one half of the mouth, as in a real USB-A receptacle.
    kitPlate('tongue', outlineRoundRect(0.25, 1.12, 0.02, 1), 0.05, 'plastic', [tongueX, cy + cavityY, inside - 0.02]),
    ...greeblePinRow({ name: 'contact', pos: [tongueX, cy + cavityY, inside - 0.045], count: 4, pitch: 0.26, size: [0.13, 0.15], depth: 0.02, axis: 'y' }),
    ...greebleLed({ name: 'led', pos: [0, cy + H / 2 - 0.12, -back], radius: 0.04, zone: 'phosphor' }),
  ];
  return doorSpec('door.usb', 'USB door', parts, doorSockets([0, cy + cavityY, -0.2], SILL_H + H + 0.14, [0, cy, -0.2]));
}

// ---------------------------------------------------------------- door.ethernet

function buildEthernet(_seed: number): ModelSpec {
  const W = 1.0, H = 1.56, D = 0.28;
  const cy = SILL_H + H / 2;
  const back = D / 2;
  const inside = greeblePortCavityZ(back, D);
  // The RJ45 mouth, clip slot up: a stepped arch.
  const mouth = outlineSymmetric([[0.36, -0.68], [0.36, 0.2], [0.22, 0.2], [0.22, 0.4], [0.1, 0.4], [0.1, 0.52]]);
  // Eight contact pins hang in the mouth like a portcullis.
  const barY = 0.2, tw = 0.042, len = 0.46, pitch = 0.084;
  const gate: Vec2[] = [[-0.36, barY], [-0.36, barY - 0.05]];
  for (let i = 0; i < 8; i++) {
    const cx = (i - 3.5) * pitch;
    gate.push([cx - tw / 2, barY - 0.05], [cx - tw / 2, barY - len + 0.05], [cx, barY - len], [cx + tw / 2, barY - len + 0.05], [cx + tw / 2, barY - 0.05]);
  }
  gate.push([0.36, barY - 0.05], [0.36, barY]);
  const ledY = cy + 0.63;
  const parts: PartSpec[] = [
    sill(1.1),
    ...greeblePortShell({ name: 'port', pos: [0, cy, back], width: W, height: H, depth: D, radius: 0.04, cavityOutline: mouth }),
    kitPlate('portcullis.pins', gate, 0.04, 'gold', [0, cy, inside - 0.03]),
    kitBox('threshold', [0.72, 0.05, 0.03], 'plastic', [0, cy - 0.655, inside - 0.01]),
    ...greebleLed({ name: 'led', pos: [0.32 * SCREEN_LEFT, ledY, -back], radius: 0.045, zone: 'phosphor', square: true }),
    ...greebleLed({ name: 'link.led', pos: [0.32 * SCREEN_RIGHT, ledY, -back], radius: 0.045, zone: 'powerAmber', square: true, blink: 3 }),
  ];
  return doorSpec('door.ethernet', 'Ethernet door', parts, doorSockets([0, cy - 0.3, -0.2], SILL_H + H + 0.14, [0, cy - 0.2, -0.2]));
}

// ---------------------------------------------------------------- door.hdmi

function buildHdmi(_seed: number): ModelSpec {
  const D = 0.26;
  const H = 1.44;
  const cy = SILL_H + H / 2;
  const back = D / 2;
  const inside = greeblePortCavityZ(back, D);
  const shell = outlineSymmetric([[0.55, -0.72], [0.55, 0.3], [0.34, 0.72]]);
  const mouth = outlineSymmetric([[0.44, -0.63], [0.44, 0.25], [0.3, 0.5]]);
  const tongueY = cy - 0.1;
  const parts: PartSpec[] = [
    sill(1.1),
    ...greeblePortShell({ name: 'port', pos: [0, cy, back], width: 1.1, height: H, depth: D, outline: shell, cavityOutline: mouth }),
    // The contact blade, stood on end, teeth to both sides.
    ...greebleContactTeeth({ name: 'blade.a', pos: [0.15, tongueY, inside], width: 0.8, count: 9, toothLength: 0.1, bar: 0.04, depth: 0.03, dir: 'left' }),
    ...greebleContactTeeth({ name: 'blade.b', pos: [-0.15, tongueY, inside], width: 0.8, count: 9, toothLength: 0.1, bar: 0.04, depth: 0.03, dir: 'right' }),
    kitPlate('tongue', outlineRoundRect(0.22, 0.9, 0.03, 1), 0.06, 'plastic', [0, tongueY, inside - 0.025]),
    ...greebleLed({ name: 'led', pos: [0, cy + 0.61, -back], radius: 0.04, zone: 'phosphor' }),
  ];
  return doorSpec('door.hdmi', 'HDMI door', parts, doorSockets([0, tongueY, -0.2], SILL_H + H + 0.14, [0, cy, -0.2]));
}

// ---------------------------------------------------------------- door.serial

function buildSerial(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const H = 1.66;
  const cy = SILL_H + H / 2;
  const dShape: Vec2[] = [[0.24, -0.56], [0.24, 0.56], [-0.24, 0.43], [-0.24, -0.43]];
  const parts: PartSpec[] = [
    sill(0.9, 0.3),
    kitPlate('flange', outlineRoundRect(0.74, H, 0.12, 3), 0.1, 'solder', [0, cy, 0.03], { bevel: 0.012 }),
    kitPlate('dshell', dShape, 0.16, 'heatsink', [0, cy, -0.02], { bevel: 0.03 }),
    kitPlate('insert', outlineTransform(dShape, { scale: [0.74, 0.86] }), 0.03, 'plastic', [0, cy, -0.105], { bevel: 0.01 }),
  ];
  // Nine pin holes: five on the long side, four on the short side.
  const hole = (i: number, x: number, y: number): PartSpec => kitDisc(`hole${i}`, 0.04, 0.012, 'ink', [x, cy + y, -0.124], { outline: false, sides: 8 });
  for (let i = 0; i < 5; i++) parts.push(hole(i, 0.085, (i - 2) * 0.185));
  for (let i = 0; i < 4; i++) parts.push(hole(5 + i, -0.085, (i - 1.5) * 0.185));
  parts.push(
    ...greebleScrew({ name: 'thumb.top', pos: [0, cy + 0.69, -0.02], radius: 0.085, zone: 'heatsink', style: 'thumb', angle: rng.range(0, 3) }),
    ...greebleScrew({ name: 'thumb.bottom', pos: [0, cy - 0.69, -0.02], radius: 0.085, zone: 'heatsink', style: 'thumb', angle: rng.range(0, 3) }),
    ...greebleLed({ name: 'led', pos: [0.24 * SCREEN_LEFT, cy + 0.7, -0.02], radius: 0.035, zone: 'powerAmber' }),
  );
  return doorSpec('door.serial', 'Serial door', parts, doorSockets([0, cy, -0.2], SILL_H + H + 0.14, [0, cy, -0.2]));
}

// ---------------------------------------------------------------- door.firewall

function buildFirewall(_seed: number): ModelSpec {
  const parts: PartSpec[] = [kitBox('sill', [1.08, SILL_H, 0.3], 'pcbDark', [0, SILL_H / 2, 0], { bevel: 0.015, texture: 'tex.pcb-traces' })];
  // Posts with spire finials.
  for (const [side, sx] of [['l', 1], ['r', -1]] as const) {
    parts.push(kitPlate(`post.${side}`, outlineSymmetric([[0.065, 0], [0.065, 1.42], [0.09, 1.42], [0.09, 1.47], [0.05, 1.5], [0, 1.66]]), 0.2, 'heatsink', [0.45 * sx, SILL_H - 0.01, 0], { bevel: 0.012 }));
  }
  // Rails behind the bars.
  parts.push(
    kitBox('rail.top', [0.82, 0.07, 0.07], 'heatsink', [0, 1.22, 0.02]),
    kitBox('rail.bottom', [0.82, 0.07, 0.07], 'heatsink', [0, 0.3, 0.02]),
  );
  // Six spear-tipped bars, tallest in the middle: a pointed arch drawn with iron.
  const bars = 6;
  for (let i = 0; i < bars; i++) {
    const x = (i - (bars - 1) / 2) * 0.125;
    const top = 1.6 - Math.abs(i - (bars - 1) / 2) * 0.1;
    parts.push(kitPlate(`bar${i}`, outlineSymmetric([[0.027, 0], [0.027, top - 0.13], [0.055, top - 0.1], [0, top]]), 0.06, 'solder', [x, SILL_H - 0.01, -0.035]));
  }
  // The lock plate and the padlock. Its three lights are the permission bits r, w, x.
  const lockY = 0.76;
  parts.push(
    kitPlate('plate', outlineRoundRect(0.46, 0.42, 0.04, 2), 0.05, 'heatsink', [0, lockY + 0.02, -0.08], { bevel: 0.01 }),
    ...greeblePadlock({ name: 'padlock', pos: [0, lockY - 0.03, -0.1], width: 0.34, height: 0.26, depth: 0.09 }),
  );
  const bitY = lockY - 0.115;
  parts.push(
    ...greebleLed({ name: 'led', pos: [0.095, bitY, -0.185], radius: 0.026, zone: 'lockRed', bezelZone: null, square: true }),
    ...greebleLed({ name: 'bit.w.led', pos: [0, bitY, -0.185], radius: 0.026, zone: 'lockRed', bezelZone: null, square: true }),
    ...greebleLed({ name: 'bit.x.led', pos: [-0.095, bitY, -0.185], radius: 0.026, zone: 'lockRed', bezelZone: null, square: true }),
  );
  return doorSpec('door.firewall', 'Firewall gate', parts, doorSockets([0, lockY, -0.22], 1.85, [0, lockY, -0.22]));
}

// ---------------------------------------------------------------- door.loopback

function buildLoopback(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const H = 1.66;
  const cy = SILL_H + H / 2;
  const glassH = 1.36;
  const glassY = cy - 0.07;
  // A crack running down from the upper screen-left.
  const crack: Vec2[] = [[0.3, 0.42], [0.17, 0.3], [0.2, 0.18], [0.05, 0.02], [0.1, -0.1], [-0.04, -0.3]];
  const jitter = crack.map(([x, y], i) => [x + (i > 0 ? rng.range(-0.03, 0.03) : 0), y] as Vec2);
  // The symlink sign: a trace that loops back on itself and ends in an arrowhead.
  const loopR = 0.15;
  const loop: Vec2[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * 0.35 + (i / 12) * Math.PI * 1.55;
    loop.push([Math.cos(a) * loopR, Math.sin(a) * loopR]);
  }
  const tip = loop[loop.length - 1]!;
  const loopY = glassY - 0.36;
  const parts: PartSpec[] = [
    sill(1.0, 0.26),
    kitPlate('frame', outlineArch(0.92, H, 10, 0.12), 0.16, 'pcb', [0, cy, 0], { bevel: 0.02, texture: 'tex.pcb-traces' }),
    kitPlate('liner', outlineArch(0.74, glassH + 0.08, 10, 0.1), 0.04, 'gold', [0, glassY, -0.09]),
    kitPlate('glass', outlineArch(0.66, glassH, 10, 0.09), 0.03, 'glass', [0, glassY, -0.12]),
    kitPlate('crack', outlineStroke(jitter, 0.026), 0.01, 'ink', [0, glassY + 0.12, -0.14], { outline: false }),
    kitPlate('crack.branch', outlineStroke([[0.2, 0.18], [0.28, 0.08]], 0.022), 0.01, 'ink', [0, glassY + 0.12, -0.14], { outline: false }),
    kitPlate('loop.trace', outlineStroke(loop, 0.05), 0.02, 'gold', [0, loopY, -0.145]),
    kitPlate('loop.arrow', outlineTransform([[-0.075, 0], [0.075, 0], [0, -0.11]], { rot: 0.5, move: tip }), 0.02, 'gold', [0, loopY, -0.146]),
    ...greebleLed({ name: 'led', pos: [0, cy + H / 2 - 0.105, -0.08], radius: 0.035, zone: 'powerAmber' }),
  ];
  return doorSpec('door.loopback', 'Loopback mirror', parts, doorSockets([0, glassY, -0.2], SILL_H + H + 0.14, [0, glassY, -0.2]));
}

// ---------------------------------------------------------------- door.devnull

function buildDevNull(_seed: number): ModelSpec {
  const ringY = 0.95;
  const R = 0.54;
  const parts: PartSpec[] = [
    kitPlate('foot', outlineSymmetric([[0.34, 0], [0.34, 0.05], [0.22, 0.1]]), 0.3, 'heatsink', [0, 0.01, 0], { bevel: 0.01 }),
    kitBox('pipe', [0.26, 0.4, 0.2], 'heatsink', [0, 0.26, 0.01]),
    kitBox('collar', [0.34, 0.07, 0.24], 'solder', [0, 0.4, 0.01], { bevel: 0.01 }),
    // The hole. In game the vortex shader sits at the `vortex` socket in front of this disc.
    kitDisc('void', R - 0.1, 0.04, 'ink', [0, ringY, 0.03], { outline: false, sides: 20 }),
    kitRing('lip', R - 0.09, R - 0.17, 0.08, 'heatsink', [0, ringY, 0], { sides: 20 }),
    kitRing('ring', R, R - 0.13, 0.2, 'solder', [0, ringY, -0.02], { sides: 20 }),
    ...greebleLabelPlate({ name: 'tag', pos: [0, 0.22, -0.09], width: 0.2, height: 0.13, lines: 2, zone: 'plastic' }),
  ];
  // Flange bolts; the top one is the status light.
  for (let i = 1; i < 6; i++) {
    const a = Math.PI / 2 + (i / 6) * Math.PI * 2;
    parts.push(...greebleScrew({ name: `bolt${i}`, pos: [Math.cos(a) * (R - 0.065), ringY + Math.sin(a) * (R - 0.065), -0.12], radius: 0.04, zone: 'heatsink', angle: a }));
  }
  parts.push(...greebleLed({ name: 'led', pos: [0, ringY + R - 0.065, -0.12], radius: 0.036, zone: 'lockRed' }));
  const centre: Vec3 = [0, ringY, -0.05];
  return doorSpec('door.devnull', '/dev/null', parts, { lock: centre, vortex: centre, label: [0, ringY + R + 0.14, 0], fx: [0, ringY, -0.2] });
}

// ---------------------------------------------------------------- door.socket

function buildSocket(_seed: number): ModelSpec {
  const faceY = 1.1;
  const eyeY = faceY + 0.14;
  const eye = (name: string, x: number): PartSpec[] => [
    kitPlate(`${name === 'led' ? 'slot.l' : 'slot.r'}`, outlineRoundRect(0.1, 0.24, 0.03, 2), 0.02, 'ink', [x, eyeY, -0.085], { outline: false }),
    kitPlate(name, outlineRoundRect(0.056, 0.16, 0.02, 2), 0.02, 'powerAmber', [x, eyeY - 0.01, -0.1], { outline: false, anim: { type: 'blink', speed: 0.25 } }),
  ];
  const parts: PartSpec[] = [
    kitPlate('box', outlineRoundRect(0.5, 0.22, 0.03, 2), 0.3, 'heatsink', [0, 0.122, 0], { bevel: 0.012 }),
    kitBox('conduit', [0.18, 0.56, 0.18], 'heatsink', [0, 0.48, 0.02]),
    kitBox('collar.low', [0.25, 0.06, 0.22], 'solder', [0, 0.27, 0.02], { bevel: 0.01 }),
    kitBox('collar.high', [0.25, 0.06, 0.22], 'solder', [0, 0.68, 0.02], { bevel: 0.01 }),
    kitPlate('face', outlineRoundRect(0.74, 0.82, 0.1, 3), 0.1, 'plastic', [0, faceY, -0.03], { bevel: 0.02 }),
    ...eye('led', 0.16 * SCREEN_LEFT),
    ...eye('twin.led', 0.16 * SCREEN_RIGHT),
    ...greebleSpeakerGrille({ name: 'mouth', pos: [0, faceY - 0.17, -0.08], radius: 0.17, aspect: 0.62, slats: 4, zone: 'solder' }).map((p) => (p.name === 'mouth.plate' ? { ...p, texture: 'tex.grille' } : p)),
    ...greebleScrew({ name: 'screw.top', pos: [0, faceY + 0.34, -0.08], radius: 0.03, zone: 'solder', angle: 0.3 }),
    ...greebleScrew({ name: 'screw.bottom', pos: [0, faceY - 0.355, -0.08], radius: 0.03, zone: 'solder', angle: 1.2 }),
  ];
  return doorSpec('door.socket', 'Socket guardian', parts, {
    lock: [0, faceY, -0.2], bubble: [0, faceY + 0.56, 0], eye: [0, eyeY, -0.12], label: [0, faceY + 0.56, 0], fx: [0, faceY, -0.2],
  });
}

ModelCatalog.register({
  id: 'door.usb', category: 'door', label: 'USB door',
  lore: 'A giant USB-A receptacle stood upright. The ordinary door between directories.',
  build: buildUsb,
});
ModelCatalog.register({
  id: 'door.ethernet', category: 'door', label: 'Ethernet door',
  lore: 'An RJ45 jack as an archway, its eight pins a portcullis. Leads to another host: the floor exit.',
  build: buildEthernet,
});
ModelCatalog.register({
  id: 'door.hdmi', category: 'door', label: 'HDMI door',
  lore: 'A wide trapezoid HDMI mouth. The door into vista rooms.',
  build: buildHdmi,
});
ModelCatalog.register({
  id: 'door.serial', category: 'door', label: 'Serial door',
  lore: 'A DB9 shell with nine pin holes and two thumbscrews. Old and creaky.',
  build: buildSerial,
});
ModelCatalog.register({
  id: 'door.firewall', category: 'door', label: 'Firewall gate', gameKey: 'locked_gate',
  lore: 'The permission gate (iron_gate, mode 000): a wrought-iron grille whose padlock shows rwx. chmod +rx lifts it.',
  build: buildFirewall,
});
ModelCatalog.register({
  id: 'door.loopback', category: 'door', label: 'Loopback mirror', gameKey: 'mirror_door',
  lore: 'A symlink: a cracked mirror with a loop arrow of trace. It leads back to you.',
  build: buildLoopback,
});
ModelCatalog.register({
  id: 'door.devnull', category: 'door', label: '/dev/null', gameKey: 'black_hole',
  lore: 'A drain ring around nothing. Whatever goes in is gone; the vortex itself is a shader.',
  build: buildDevNull,
});
ModelCatalog.register({
  id: 'door.socket', category: 'door', label: 'Socket guardian', gameKey: 'socket_guardian',
  lore: 'A talking *.sock: a wall socket with LED eyes and a speaker-grille mouth. Neutral hardware, not malware.',
  build: buildSocket,
});
