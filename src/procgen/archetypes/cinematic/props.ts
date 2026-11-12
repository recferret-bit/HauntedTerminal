import { ModelCatalog } from '../../core/catalog.js';
import type { ModelSpec, PartSpec } from '../../core/types.js';

/**
 * `prop.office_chair`: the developer's chair, for the outro (he lands back in it at dawn; `room.outro`
 * has no chair of its own). Seen from the front: back, seat, gas lift, star base. Hardware zones only.
 * The seat top is at y = 0.55, just under the vibecoder's hip line (0.62), so he reads as seated in it.
 */
function buildOfficeChair(_seed: number): ModelSpec {
  const parts: PartSpec[] = [
    { name: 'back', shape: { kind: 'box', size: [0.84, 0.9, 0.08], bevel: 0.03 }, zone: 'silicon', pos: [0, 1.12, 0.24] },
    { name: 'back-trim', shape: { kind: 'box', size: [0.7, 0.07, 0.04] }, zone: 'heatsink', pos: [0, 1.5, 0.19] },
    { name: 'spine', shape: { kind: 'box', size: [0.08, 0.5, 0.06] }, zone: 'heatsink', pos: [0, 0.62, 0.27] },
    { name: 'seat', shape: { kind: 'box', size: [0.86, 0.1, 0.48], bevel: 0.03 }, zone: 'rubber', pos: [0, 0.5, 0.02] },
    { name: 'arm.l', shape: { kind: 'box', size: [0.08, 0.3, 0.3] }, zone: 'heatsink', pos: [0.42, 0.66, 0.0] },
    { name: 'arm.r', shape: { kind: 'box', size: [0.08, 0.3, 0.3] }, zone: 'heatsink', pos: [-0.42, 0.66, 0.0] },
    { name: 'post', shape: { kind: 'box', size: [0.08, 0.4, 0.08] }, zone: 'heatsink', pos: [0, 0.26, 0.02] },
    { name: 'base', shape: { kind: 'box', size: [0.72, 0.06, 0.1] }, zone: 'heatsink', pos: [0, 0.09, 0.02] },
    { name: 'wheel.l', shape: { kind: 'cylinder', rTop: 0.05, rBottom: 0.05, height: 0.08, sides: 8 }, zone: 'rubber', pos: [0.32, 0.05, 0.02], rot: [0, 0, Math.PI / 2] },
    { name: 'wheel.r', shape: { kind: 'cylinder', rTop: 0.05, rBottom: 0.05, height: 0.08, sides: 8 }, zone: 'rubber', pos: [-0.32, 0.05, 0.02], rot: [0, 0, Math.PI / 2] },
  ];
  return { id: 'prop.office_chair', category: 'prop', label: 'Office chair', parts, sockets: { seat: [0, 0.55, 0] } };
}

ModelCatalog.register({
  id: 'prop.office_chair',
  category: 'prop',
  label: 'Office chair',
  lore: 'The real-world chair at his desk. Cinematic set dressing: the outro drops him back into it.',
  build: buildOfficeChair,
});
