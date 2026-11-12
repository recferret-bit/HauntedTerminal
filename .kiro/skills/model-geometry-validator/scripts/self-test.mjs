#!/usr/bin/env node
// Self-test of the model validator: tiny synthetic ModelSpecs with known answers.
// Proves that clean models pass with zero issues and that every check fires on the defect it is for.
// Run from the project root:
//
//   node .kiro/skills/model-geometry-validator/scripts/self-test.mjs [--verbose]
//
// A case passes when the reported issue codes are exactly `expect` (any severity), ignoring codes in `allow`.
// Exit code 1 if any case fails.
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

const verbose = process.argv.includes('--verbose');
const box = (w, h, d) => ({ kind: 'box', size: [w, h, d] });
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------- clean models

/** A 1.6-unit humanoid: two legs, torso, two arms, head, hair, lantern. */
function vibecoder() {
  return {
    id: 'vibecoder.dev', category: 'vibecoder', label: 'self-test vibecoder',
    parts: [
      { name: 'leg_l', shape: box(0.16, 0.6, 0.16), zone: 'denim', pos: [0.11, 0.3, 0], anim: { type: 'legWalk', phase: 0, pivot: [0.11, 0.6, 0] } },
      { name: 'leg_r', shape: box(0.16, 0.6, 0.16), zone: 'denim', pos: [-0.11, 0.3, 0], anim: { type: 'legWalk', phase: 0.5, pivot: [-0.11, 0.6, 0] } },
      { name: 'torso', shape: box(0.5, 0.6, 0.26), zone: 'hoodie', pos: [0, 0.88, 0] },
      { name: 'arm_l', shape: box(0.12, 0.5, 0.14), zone: 'hoodie', pos: [0.31, 0.9, 0], anim: { type: 'armSwing', phase: 0.5, pivot: [0.31, 1.15, 0] } },
      { name: 'arm_r', shape: box(0.12, 0.5, 0.14), zone: 'hoodie', pos: [-0.31, 0.9, 0], anim: { type: 'armSwing', phase: 0, pivot: [-0.31, 1.15, 0] } },
      { name: 'head', shape: { kind: 'sphere', radius: 0.22 }, zone: 'skin', pos: [0, 1.38, 0] },
      { name: 'hair', shape: box(0.42, 0.12, 0.2), zone: 'hair', pos: [0, 1.5, 0] },
      { name: 'lantern', shape: box(0.12, 0.16, 0.1), zone: 'lantern', pos: [-0.31, 0.57, 0] },
    ],
    sockets: { bubble: [0, 1.8, 0], hand: [-0.31, 0.6, -0.1] },
  };
}

/** A RAM-stick-like pickup hovering around y = 0.5. */
function pickup() {
  const bob = { type: 'bob', speed: 0.8, amp: 0.05 };
  return {
    id: 'pickup.selftest', category: 'pickup', label: 'self-test pickup', tags: ['hover'],
    parts: [
      { name: 'board', shape: box(0.4, 0.24, 0.1), zone: 'pcb', pos: [0, 0.5, 0], anim: bob },
      { name: 'chip', shape: box(0.24, 0.12, 0.06), zone: 'silicon', pos: [0, 0.52, -0.05], anim: bob },
      { name: 'contacts', shape: box(0.32, 0.05, 0.06), zone: 'gold', pos: [0, 0.37, 0], anim: bob },
      { name: 'light', shape: { kind: 'sphere', radius: 0.03 }, zone: 'dataCyan', pos: [0.15, 0.57, -0.05], outline: false, anim: { type: 'pulse' } },
    ],
  };
}

/** A port door: shell, tongue, two contacts, status LED, lock socket. */
function door() {
  return {
    id: 'door.selftest', category: 'door', label: 'self-test door',
    parts: [
      { name: 'shell', shape: box(0.9, 1.6, 0.2), zone: 'solder', pos: [0, 0.8, 0] },
      { name: 'tongue', shape: box(0.6, 1.2, 0.1), zone: 'plastic', pos: [0, 0.75, -0.08] },
      { name: 'contact_0', shape: box(0.12, 0.5, 0.06), zone: 'gold', pos: [0.15, 0.8, -0.13] },
      { name: 'contact_1', shape: box(0.12, 0.5, 0.06), zone: 'gold', pos: [-0.15, 0.8, -0.13] },
      { name: 'led', shape: { kind: 'sphere', radius: 0.04 }, zone: 'lockRed', pos: [0.36, 1.48, -0.1], outline: false },
    ],
    sockets: { lock: [0, 0.8, -0.16] },
  };
}

/** A chip body with two horns, two claws and one eye. */
function malware() {
  return {
    id: 'malware.selftest', category: 'malware', label: 'self-test malware',
    parts: [
      { name: 'body', shape: { kind: 'extrude', outline: [[-0.3, 0], [0.3, 0], [0.4, 0.5], [0.2, 0.8], [-0.2, 0.8], [-0.4, 0.5]], depth: 0.3 }, zone: 'silicon', pos: [0, 0, 0] },
      { name: 'horn_l', shape: { kind: 'extrude', outline: [[0, 0], [0.14, 0], [0.2, 0.45]], depth: 0.12 }, zone: 'corruptMagenta', pos: [0.12, 0.75, 0], anim: { type: 'jitter' } },
      { name: 'horn_r', shape: { kind: 'extrude', outline: [[0, 0], [-0.2, 0.45], [-0.14, 0]], depth: 0.12 }, zone: 'corruptMagenta', pos: [-0.12, 0.75, 0] },
      { name: 'claw_l', shape: { kind: 'extrude', outline: [[0, 0], [0.45, 0.1], [0, 0.2]], depth: 0.12 }, zone: 'corruptViolet', pos: [0.33, 0.3, 0] },
      { name: 'claw_r', shape: { kind: 'extrude', outline: [[0, 0], [0, 0.2], [-0.45, 0.1]], depth: 0.12 }, zone: 'corruptViolet', pos: [-0.33, 0.3, 0] },
      { name: 'eye', shape: { kind: 'sphere', radius: 0.1 }, zone: 'malwareEye', pos: [0, 0.5, -0.15] },
    ],
    sockets: { bubble: [0, 1.35, 0], eye: [0, 0.5, -0.26], fx: [0, 0.45, 0] },
  };
}

/** A chip on a board with a capacitor. */
function prop() {
  return {
    id: 'prop.selftest', category: 'prop', label: 'self-test prop',
    parts: [
      { name: 'board', shape: box(0.8, 0.1, 0.4), zone: 'pcb', pos: [0, 0.05, 0] },
      { name: 'chip', shape: box(0.4, 0.3, 0.3), zone: 'silicon', pos: [0, 0.24, 0] },
      { name: 'cap', shape: { kind: 'cylinder', rTop: 0.08, rBottom: 0.08, height: 0.3 }, zone: 'gold', pos: [0.28, 0.24, 0] },
    ],
  };
}

/** A back wall, a floor strip and two props. */
function room() {
  return {
    id: 'room.selftest', category: 'room', label: 'self-test room',
    parts: [
      { name: 'wall', shape: box(8, 4.5, 0.2), zone: 'silicon', pos: [0, 2.25, 1] },
      { name: 'floor', shape: box(8, 0.4, 1.4), zone: 'rubber', pos: [0, -0.2, 0.4] },
      { name: 'rack', shape: box(0.8, 2, 0.5), zone: 'pcbDark', pos: [3.4, 1, 0.7] },
      { name: 'rack_light', shape: box(0.3, 0.1, 0.1), zone: 'phosphor', pos: [3.4, 1.6, 0.42], outline: false },
    ],
  };
}

const edit = (base, fn) => { const spec = clone(base()); fn(spec); return spec; };
const part = (spec, name) => spec.parts.find((p) => p.name === name);

// ---------------------------------------------------------------- cases

const CASES = [
  // Clean models: zero issues of any severity.
  { name: 'clean vibecoder', spec: vibecoder(), expect: [] },
  { name: 'clean pickup', spec: pickup(), expect: [] },
  { name: 'clean door', spec: door(), expect: [] },
  { name: 'clean malware', spec: malware(), expect: [] },
  { name: 'clean prop', spec: prop(), expect: [] },
  { name: 'clean room', spec: room(), expect: [] },
  { name: 'clean boss (scaled malware)', expect: [], spec: edit(malware, (s) => {
    s.id = 'boss.selftest'; s.category = 'boss';
    for (const p of s.parts) { p.scale = [1.6, 1.6, 1.6]; p.pos = p.pos.map((v) => v * 1.6); }
    for (const k of Object.keys(s.sockets)) s.sockets[k] = s.sockets[k].map((v) => v * 1.6);
  }) },

  // Structure
  { name: 'duplicate part names', expect: ['DUPLICATE_PART_NAME'], spec: edit(door, (s) => { part(s, 'contact_1').name = 'contact_0'; }) },
  { name: 'id does not match category', expect: ['BAD_ID'], spec: edit(prop, (s) => { s.id = 'door.selftest'; }) },
  { name: 'empty model', expect: ['EMPTY_MODEL'], spec: edit(prop, (s) => { s.parts = []; }) },
  { name: 'NaN position', expect: ['NON_FINITE'], spec: edit(prop, (s) => { part(s, 'cap').pos = [0.28, NaN, 0]; }) },
  { name: 'zero-size box', expect: ['DEGENERATE_SHAPE'], spec: edit(prop, (s) => { part(s, 'chip').shape = box(0.4, 0, 0.3); }) },
  { name: 'extrude outline with no area', expect: ['DEGENERATE_SHAPE'], spec: edit(malware, (s) => { part(s, 'horn_r').shape.outline = [[0, 0], [0.1, 0.1], [0.2, 0.2]]; }) },
  { name: 'unknown zone', expect: ['UNKNOWN_ZONE'], spec: edit(prop, (s) => { part(s, 'cap').zone = 'hullPrimary'; }) },
  { name: 'unknown texture', expect: ['UNKNOWN_TEXTURE'], spec: edit(prop, (s) => { part(s, 'board').texture = 'tex.does-not-exist'; }) },
  { name: 'too few parts', expect: ['PART_BUDGET'], spec: edit(door, (s) => { s.parts = s.parts.filter((p) => p.name !== 'contact_1'); }) },
  { name: 'over part budget', expect: ['PART_BUDGET'], spec: edit(door, (s) => {
    for (let i = 0; i < 36; i++) s.parts.push({ name: `rivet_${i}`, shape: box(0.05, 0.05, 0.05), zone: 'solder', pos: [-0.4 + (i % 2) * 0.8, 0.1 + Math.floor(i / 2) * 0.08, -0.1] });
  }) },
  { name: 'over triangle budget', expect: ['TRI_BUDGET'], spec: edit(vibecoder, (s) => {
    for (let i = 0; i < 10; i++) s.parts.push({ name: `button_${i}`, shape: { kind: 'sphere', radius: 0.04 }, zone: 'paper', pos: [-0.2 + (i % 5) * 0.1, 0.8 + Math.floor(i / 5) * 0.2, -0.13] });
  }) },

  // Grounding, size, depth
  { name: 'not grounded (floats)', expect: ['NOT_GROUNDED'], spec: edit(malware, (s) => { for (const p of s.parts) p.pos[1] += 0.2; }) },
  { name: 'not grounded (sunk)', expect: ['NOT_GROUNDED'], spec: edit(prop, (s) => { for (const p of s.parts) p.pos[1] -= 0.1; }) },
  { name: 'wall tag frees grounding', expect: [], spec: edit(prop, (s) => { s.tags = ['wall']; for (const p of s.parts) p.pos[1] += 1; }) },
  { name: 'room without a floor', expect: ['NOT_GROUNDED'], spec: edit(room, (s) => { for (const p of s.parts) p.pos[1] += 0.5; }) },
  { name: 'pickup not hovering', expect: ['PICKUP_NOT_HOVER', 'NOT_GROUNDED'], spec: edit(pickup, (s) => { s.tags = []; }) },
  { name: 'pickup resting on the floor', expect: ['HOVER_BAND'], spec: edit(pickup, (s) => { for (const p of s.parts) p.pos[1] -= 0.345; }) },
  { name: 'pickup too big', expect: ['SIZE_RANGE'], spec: edit(pickup, (s) => {
    for (const p of s.parts) { p.scale = [2, 2, 2]; p.pos = [p.pos[0] * 2, 0.5 + (p.pos[1] - 0.5) * 2, p.pos[2] * 2]; }
  }) },
  { name: 'door too short', expect: ['SIZE_RANGE'], spec: edit(door, (s) => {
    for (const p of s.parts) { p.scale = [1, 0.7, 1]; p.pos[1] *= 0.7; }
    s.sockets.lock[1] *= 0.7;
  }) },
  { name: 'too deep', expect: ['TOO_DEEP'], spec: edit(vibecoder, (s) => { s.parts.push({ name: 'backpack', shape: box(0.9, 0.2, 1.1), zone: 'hoodie', pos: [0, 0.9, 0.5] }); }) },

  // Contacts
  { name: 'floating part', expect: ['FLOATING_PART'], spec: edit(vibecoder, (s) => { s.parts.push({ name: 'drone', shape: box(0.15, 0.15, 0.1), zone: 'hoodie', pos: [0.8, 1.2, 0] }); }) },
  { name: 'floating part far away in depth', expect: ['FLOATING_PART'], allow: ['TOO_DEEP'], spec: edit(door, (s) => { part(s, 'contact_0').pos[2] = -0.6; }) },
  { name: 'orbiting satellite opts out', expect: [], spec: edit(vibecoder, (s) => {
    s.parts.push({ name: 'orbit_moth', shape: box(0.1, 0.1, 0.06), zone: 'paper', pos: [-0.31, 0.3, 0], anim: { type: 'orbit', amp: 0.08, pivot: [-0.31, 0.57, 0] } });
  }) },
  { name: 'bobbing part without the opt-in name still floats', expect: ['FLOATING_PART'], spec: edit(vibecoder, (s) => {
    s.parts.push({ name: 'moth', shape: box(0.1, 0.1, 0.06), zone: 'paper', pos: [-0.31, 0.3, 0], anim: { type: 'bob' } });
  }) },
  { name: 'detached model tag opts out', expect: [], spec: edit(vibecoder, (s) => {
    s.tags = ['detached'];
    s.parts.push({ name: 'moth', shape: box(0.1, 0.1, 0.06), zone: 'paper', pos: [-0.31, 0.3, 0], anim: { type: 'bob' } });
  }) },
  { name: 'hairline gap', expect: ['HAIRLINE_GAP'], spec: edit(malware, (s) => { part(s, 'claw_l').pos[0] = 0.43; }) },
  { name: 'gap in depth only', expect: ['DEPTH_GAP'], spec: edit(pickup, (s) => { part(s, 'chip').pos[2] = -0.15; }) },
  { name: 'decal 0.01 in front of a surface is touching', expect: [], spec: edit(pickup, (s) => { part(s, 'chip').pos[2] = -0.09; }) },
  { name: 'part held only by a tube', expect: ['TUBE_ONLY_SUPPORT'], spec: edit(prop, (s) => {
    s.parts.push({ name: 'cable', shape: { kind: 'tube', path: [[-0.2, 0.3, 0], [-0.5, 0.5, 0], [-0.7, 0.3, 0]], radius: 0.03 }, zone: 'rubber', pos: [0, 0, 0] });
    s.parts.push({ name: 'plug', shape: box(0.1, 0.12, 0.1), zone: 'solder', pos: [-0.7, 0.25, 0] });
  }) },
  { name: 'buried part', expect: ['BURIED_PART'], spec: edit(door, (s) => { s.parts.push({ name: 'spring', shape: box(0.06, 0.2, 0.05), zone: 'copper', pos: [0.38, 0.3, 0] }); }) },
  { name: 'part inside glass is not buried', expect: [], spec: edit(door, (s) => {
    part(s, 'tongue').zone = 'glass';
    s.parts.push({ name: 'filament', shape: box(0.1, 0.3, 0.02), zone: 'copper', pos: [0, 0.3, -0.115] });
  }) },
  { name: 'coplanar z-fight', expect: ['COPLANAR_ZFIGHT'], spec: edit(door, (s) => { s.parts.push({ name: 'plate', shape: box(0.3, 0.16, 0.2), zone: 'gold', pos: [0, 1.48, 0] }); }) },
  { name: 'coplanar faces in the same zone are harmless', expect: [], spec: edit(door, (s) => { s.parts.push({ name: 'plate', shape: box(0.3, 0.16, 0.2), zone: 'solder', pos: [0, 1.48, 0] }); }) },
  { name: 'coplanar faces on the back are harmless', expect: [], spec: edit(door, (s) => { s.parts.push({ name: 'plate', shape: box(1.0, 0.16, 0.1), zone: 'gold', pos: [0, 1.48, 0.05] }); }) },

  // 2D read
  { name: 'hidden part', expect: ['HIDDEN_PART'], spec: edit(vibecoder, (s) => { s.parts.push({ name: 'tag', shape: box(0.2, 0.2, 0.1), zone: 'paper', pos: [0, 0.9, 0.15] }); }) },
  { name: 'thin feature', expect: ['THIN_FEATURE'], spec: edit(door, (s) => { s.parts.push({ name: 'whisker', shape: box(0.2, 0.02, 0.02), zone: 'gold', pos: [0.5, 0.8, 0] }); }) },
  { name: 'thin decal without outline is allowed', expect: [], spec: edit(door, (s) => { s.parts.push({ name: 'whisker', shape: box(0.2, 0.02, 0.02), zone: 'gold', pos: [0.5, 0.8, 0], outline: false }); }) },
  { name: 'box silhouette', expect: ['SILHOUETTE_BOX'], spec: edit(malware, (s) => {
    part(s, 'body').shape = box(1.2, 0.9, 0.3); part(s, 'body').pos = [0, 0.45, 0];
    for (const n of ['horn_l', 'horn_r']) { part(s, n).shape = box(0.2, 0.3, 0.12); part(s, n).pos = [n === 'horn_l' ? 0.3 : -0.3, 0.6, -0.12]; }
    for (const n of ['claw_l', 'claw_r']) { part(s, n).shape = box(0.2, 0.3, 0.12); part(s, n).pos = [n === 'claw_l' ? 0.3 : -0.3, 0.25, -0.12]; }
    s.sockets.bubble = [0, 1.1, 0];
  }) },
  { name: 'blob silhouette', expect: ['SILHOUETTE_BLOB'], spec: edit(malware, (s) => {
    part(s, 'body').shape = { kind: 'cylinder', rTop: 0.5, rBottom: 0.5, height: 0.3, sides: 24 };
    part(s, 'body').rot = [Math.PI / 2, 0, 0]; part(s, 'body').pos = [0, 0.5, 0];
    for (const n of ['horn_l', 'horn_r']) { part(s, n).shape = box(0.2, 0.3, 0.12); part(s, n).pos = [n === 'horn_l' ? 0.2 : -0.2, 0.75, -0.12]; }
    for (const n of ['claw_l', 'claw_r']) { part(s, n).shape = box(0.2, 0.3, 0.12); part(s, n).pos = [n === 'claw_l' ? 0.2 : -0.2, 0.25, -0.12]; }
    s.sockets.bubble = [0, 1.2, 0];
  }) },
  { name: 'too many zones', expect: ['TOO_MANY_ZONES'], spec: edit(door, (s) => {
    part(s, 'contact_0').zone = 'copper'; part(s, 'contact_1').zone = 'gold';
    s.parts.push({ name: 'label', shape: box(0.3, 0.1, 0.04), zone: 'pcb', pos: [0, 1.48, -0.1] });
    s.parts.push({ name: 'foot_l', shape: box(0.2, 0.1, 0.24), zone: 'rubber', pos: [0.3, 0.05, 0] });
    s.parts.push({ name: 'foot_r', shape: box(0.2, 0.1, 0.24), zone: 'heatsink', pos: [-0.3, 0.05, 0] });
  }) },
  { name: 'flat palette', expect: ['PALETTE_FLAT'], spec: edit(door, (s) => { part(s, 'tongue').zone = 'solder'; part(s, 'tongue').texture = undefined; }), allow: ['NO_ACCENT'] },
  { name: 'patchwork palette', expect: ['PALETTE_PATCHWORK'], spec: edit(prop, (s) => {
    s.parts = [
      { name: 'a', shape: box(0.3, 0.3, 0.2), zone: 'pcb', pos: [0.45, 0.15, 0] },
      { name: 'b', shape: box(0.3, 0.3, 0.2), zone: 'silicon', pos: [0.15, 0.15, 0] },
      { name: 'c', shape: box(0.3, 0.3, 0.2), zone: 'gold', pos: [-0.15, 0.15, 0] },
      { name: 'd', shape: box(0.3, 0.3, 0.2), zone: 'plastic', pos: [-0.45, 0.15, 0] },
    ];
  }) },
  { name: 'no accent', expect: ['NO_ACCENT'], spec: edit(door, (s) => { for (const n of ['contact_0', 'contact_1']) part(s, n).zone = 'plastic'; }), allow: ['LIGHT_NOT_VISIBLE'] },
  { name: 'too much glow', expect: ['TOO_MUCH_GLOW'], spec: edit(door, (s) => { part(s, 'tongue').zone = 'phosphor'; }) },
  { name: 'eye hidden behind the body', expect: ['LIGHT_NOT_VISIBLE', 'HIDDEN_PART'], allow: ['PALETTE_FLAT'], spec: edit(malware, (s) => { part(s, 'eye').pos[2] = 0.15; s.sockets.eye[2] = 0.2; }) },

  // Palette and category rules
  { name: 'human zone on a prop', expect: ['HUMAN_ZONE_MISUSE'], spec: edit(prop, (s) => { part(s, 'cap').zone = 'skin'; }) },
  { name: 'malware zone on a door', expect: ['MALWARE_ZONE_MISUSE'], spec: edit(door, (s) => { for (const n of ['contact_0', 'contact_1']) part(s, n).zone = 'corruptMagenta'; }) },
  { name: 'malware without corruption', expect: ['MALWARE_NO_CORRUPTION'], spec: edit(malware, (s) => {
    for (const n of ['horn_l', 'horn_r']) part(s, n).zone = 'solder';
    for (const n of ['claw_l', 'claw_r']) part(s, n).zone = 'gold';
  }) },
  { name: 'malware without eye', expect: ['MALWARE_NO_EYE'], spec: edit(malware, (s) => { part(s, 'eye').zone = 'toxicGreen'; }) },
  { name: 'malware with a pair of eyes is fine', expect: [], spec: edit(malware, (s) => {
    part(s, 'eye').pos[0] = 0.15; part(s, 'eye').name = 'eye_l';
    s.parts.push({ name: 'eye_r', shape: { kind: 'sphere', radius: 0.1 }, zone: 'malwareEye', pos: [-0.15, 0.5, -0.15] });
  }) },
  { name: 'malware with three eyes', expect: ['MALWARE_EYE_COUNT'], spec: edit(malware, (s) => {
    part(s, 'eye').pos[0] = 0.2; part(s, 'eye').name = 'eye_l';
    s.parts.push({ name: 'eye_r', shape: { kind: 'sphere', radius: 0.08 }, zone: 'malwareEye', pos: [-0.2, 0.5, -0.15] });
    s.parts.push({ name: 'eye_low', shape: { kind: 'sphere', radius: 0.08 }, zone: 'malwareEye', pos: [0, 0.2, -0.15] });
  }) },
  { name: 'malware eye with an anonymous name', expect: ['MALWARE_EYE_NAME'], spec: edit(malware, (s) => { part(s, 'eye').name = 'bulb'; }) },
  { name: 'malware without jitter', expect: ['MALWARE_NO_JITTER'], spec: edit(malware, (s) => { delete part(s, 'horn_l').anim; }) },
  { name: 'malware without sockets', expect: ['MISSING_SOCKET'], spec: edit(malware, (s) => { delete s.sockets.fx; delete s.sockets.bubble; }) },
  { name: 'pickup not emissive', expect: ['PICKUP_NO_SIGNAL'], spec: edit(pickup, (s) => { part(s, 'light').zone = 'plastic'; }) },
  { name: 'pickup not animated', expect: ['PICKUP_NOT_ANIMATED'], spec: edit(pickup, (s) => { for (const p of s.parts) delete p.anim; }) },
  { name: 'door without led', expect: ['DOOR_NO_LED'], spec: edit(door, (s) => { part(s, 'led').name = 'dot'; }) },
  { name: 'door led not in a signal zone', expect: ['DOOR_NO_LED'], spec: edit(door, (s) => { part(s, 'led').zone = 'gold'; }) },
  { name: 'door without lock socket', expect: ['MISSING_SOCKET'], spec: edit(door, (s) => { delete s.sockets; }) },
  { name: 'vibecoder without walk tags', expect: ['VIBECODER_NO_WALK_TAGS'], spec: edit(vibecoder, (s) => { delete part(s, 'arm_l').anim; delete part(s, 'arm_r').anim; }) },
  { name: 'vibecoder without lantern', expect: ['VIBECODER_NO_LANTERN'], spec: edit(vibecoder, (s) => { part(s, 'lantern').zone = 'paper'; }) },
  { name: 'socket far outside the model', expect: ['SOCKET_OUT_OF_BOUNDS'], spec: edit(door, (s) => { s.sockets.lock = [0, 8, 0]; }) },
  { name: 'unknown anim type', expect: ['ANIM_INVALID'], spec: edit(pickup, (s) => { part(s, 'light').anim = { type: 'wobble' }; }) },
  { name: 'anim out of range', expect: ['ANIM_RANGE'], spec: edit(pickup, (s) => { part(s, 'light').anim = { type: 'pulse', speed: 40, amp: 3 }; }) },
  { name: 'anim pivot outside the model', expect: ['ANIM_PIVOT_OUTSIDE'], spec: edit(vibecoder, (s) => { part(s, 'leg_l').anim.pivot = [0.11, 6, 0]; }) },

  // Options
  { name: 'geometryOnly skips palette and read checks', expect: [], opts: { geometryOnly: true }, spec: edit(door, (s) => { part(s, 'led').name = 'dot'; part(s, 'tongue').zone = 'skin'; }) },
  { name: 'geometryOnly still finds floating parts', expect: ['FLOATING_PART'], opts: { geometryOnly: true }, spec: edit(vibecoder, (s) => { s.parts.push({ name: 'drone', shape: box(0.15, 0.15, 0.1), zone: 'hoodie', pos: [0.8, 1.2, 0] }); }) },
  { name: 'disable drops a code', expect: [], opts: { disable: ['THIN_FEATURE'] }, spec: edit(door, (s) => { s.parts.push({ name: 'whisker', shape: box(0.2, 0.02, 0.02), zone: 'gold', pos: [0.5, 0.8, 0] }); }) },
  { name: 'warnings pass by default', expect: ['THIN_FEATURE'], ok: true, spec: edit(door, (s) => { s.parts.push({ name: 'whisker', shape: box(0.2, 0.02, 0.02), zone: 'gold', pos: [0.5, 0.8, 0] }); }) },
  { name: 'strict fails on warnings', expect: ['THIN_FEATURE'], ok: false, opts: { strict: true }, spec: edit(door, (s) => { s.parts.push({ name: 'whisker', shape: box(0.2, 0.02, 0.02), zone: 'gold', pos: [0.5, 0.8, 0] }); }) },
];

const failures = await withProcgen(async (p) => {
  let failed = 0;
  const seenCodes = new Set();
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n     ${detail}`}`);
    if (!ok) failed++;
  };

  for (const c of CASES) {
    let report;
    try {
      report = p.validateModelSpec(c.spec, c.opts ?? {});
    } catch (err) {
      check(c.name, false, `validateModelSpec threw: ${err.stack ?? err}`);
      continue;
    }
    const got = [...new Set(report.issues.map((i) => i.code))];
    got.forEach((code) => seenCodes.add(code));
    const allowed = new Set([...(c.expect ?? []), ...(c.allow ?? [])]);
    const missing = c.expect.filter((code) => !got.includes(code));
    const extra = got.filter((code) => !allowed.has(code));
    const wellFormed = report.issues.every((i) => i.code && i.message && i.fix && ['error', 'warning', 'info'].includes(i.severity));
    const okFlag = c.ok === undefined || report.ok === c.ok;
    const pass = !missing.length && !extra.length && wellFormed && okFlag;
    check(c.name, pass,
      `expected [${c.expect.join(', ')}], got [${got.join(', ')}]` +
        (okFlag ? '' : `; report.ok is ${report.ok}, expected ${c.ok}`) +
        (wellFormed ? '' : '; an issue lacks code / message / fix') +
        `\n${p.formatModelReport(report).replace(/^/gm, '     ')}`);
    if (verbose && pass) console.log(p.formatModelReport(report).replace(/^/gm, '     '));
  }

  // validateModel on the catalog: a builder that throws, and a registered clean model.
  p.ModelCatalog.register({ id: 'fx.selftest_throws', category: 'fx', label: 'throws', lore: 'self-test', build: () => { throw new Error('boom'); } });
  p.ModelCatalog.register({ id: 'prop.selftest', category: 'prop', label: 'self-test prop', lore: 'self-test', build: () => prop() });
  const thrown = p.validateModel('fx.selftest_throws');
  thrown.issues.forEach((i) => seenCodes.add(i.code));
  check('validateModel reports a builder that throws', !thrown.ok && thrown.issues[0]?.code === 'BUILD_FAILED', JSON.stringify(thrown.issues));
  const registered = p.validateModel('prop.selftest', { seed: 3 });
  check('validateModel passes a registered clean model', registered.ok && registered.issues.length === 0 && registered.seed === 3, JSON.stringify(registered.issues));
  const text = p.formatModelReport(p.validateModelSpec(edit(vibecoder, (s) => { s.parts.push({ name: 'drone', shape: box(0.15, 0.15, 0.1), zone: 'hoodie', pos: [0.8, 1.2, 0] }); })));
  check('formatModelReport names the code, the part and the fix', /^FAIL vibecoder\.dev/.test(text) && text.includes('FLOATING_PART') && text.includes('"drone"') && text.includes('fix:'), text);

  // Every code in the reference must have fired at least once above (BAKE_FAILED is a safety net with no synthetic trigger).
  const documented = [
    'BAD_ID', 'EMPTY_MODEL', 'DUPLICATE_PART_NAME', 'NON_FINITE', 'DEGENERATE_SHAPE', 'UNKNOWN_ZONE', 'UNKNOWN_TEXTURE', 'PART_BUDGET', 'TRI_BUDGET', 'BUILD_FAILED',
    'NOT_GROUNDED', 'HOVER_BAND', 'SIZE_RANGE', 'TOO_DEEP', 'FLOATING_PART', 'HAIRLINE_GAP', 'DEPTH_GAP', 'TUBE_ONLY_SUPPORT', 'BURIED_PART', 'COPLANAR_ZFIGHT',
    'HIDDEN_PART', 'THIN_FEATURE', 'SILHOUETTE_BOX', 'SILHOUETTE_BLOB', 'TOO_MANY_ZONES', 'PALETTE_FLAT', 'PALETTE_PATCHWORK', 'NO_ACCENT', 'TOO_MUCH_GLOW', 'LIGHT_NOT_VISIBLE',
    'HUMAN_ZONE_MISUSE', 'MALWARE_ZONE_MISUSE', 'MALWARE_NO_CORRUPTION', 'MALWARE_NO_EYE', 'MALWARE_EYE_COUNT', 'MALWARE_EYE_NAME', 'MALWARE_NO_JITTER', 'MISSING_SOCKET',
    'PICKUP_NOT_HOVER', 'PICKUP_NO_SIGNAL', 'PICKUP_NOT_ANIMATED', 'DOOR_NO_LED', 'VIBECODER_NO_WALK_TAGS', 'VIBECODER_NO_LANTERN', 'SOCKET_OUT_OF_BOUNDS', 'ANIM_INVALID', 'ANIM_RANGE', 'ANIM_PIVOT_OUTSIDE',
  ];
  const never = documented.filter((code) => !seenCodes.has(code));
  check('every documented issue code fired at least once', never.length === 0, `never fired: ${never.join(', ')}`);

  console.log(`\n${failed ? 'FAIL' : 'PASS'} model validator self-test: ${CASES.length + 4 - failed}/${CASES.length + 4} cases`);
  return failed;
});
process.exit(failures ? 1 : 0);
