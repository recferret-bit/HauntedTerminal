/**
 * item.tube_transistor: glowing vacuum-tube transistor the developer carries. `ls -a` / `ls -la`
 * lights its warm amber filament so hidden dotfiles and cloaked malware show.
 * Stands upright on its three gold emitter/base/collector pins at y = 0; `grip` sits on the dark
 * bakelite collar so the hand holds the glowing glass tube upright like a relic torch.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import type { ModelSpec } from '../../core/types.js';
import { kitPlate, outlineRoundRect, outlineSymmetric } from '../../kit/greebles.js';

export function buildTubeTransistor(_seed: number): ModelSpec {
  const pin = (name: string, x: number) =>
    kitPlate(name, outlineRoundRect(0.038, 0.095, 0.01, 1), 0.055, 'gold', [x, 0.0475, 0]);

  return {
    id: 'item.tube_transistor',
    category: 'item',
    label: 'Tube Transistor',
    parts: [
      // Three bottom transistor leads (E, B, C) standing on y = 0.
      pin('pin.l', -0.062),
      pin('pin.c', 0),
      pin('pin.r', 0.062),
      // Hands close over `handle`: dark bakelite socket base behind hand.r.
      kitPlate('handle', outlineRoundRect(0.21, 0.1, 0.025, 2), 0.14, 'hair', [0, 0.13, 0]),
      // Brass flange ring separating the bakelite base from the glass tube envelope.
      kitPlate('collar', outlineRoundRect(0.24, 0.042, 0.015, 2), 0.15, 'gold', [0, 0.195, 0]),
      // Glowing warm-amber vacuum-tube envelope (uses `lantern` zone so stage glow & light cone pulse it).
      kitPlate(
        'bulb',
        outlineSymmetric([
          [0.09, 0],
          [0.092, 0.125],
          [0.082, 0.175],
          [0.054, 0.208],
          [0.026, 0.22],
        ]),
        0.12,
        'lantern',
        [0, 0.205, 0],
      ),
      // Top vacuum exhaust tip on the dome crown.
      kitPlate(
        'pip',
        outlineSymmetric([
          [0.042, 0],
          [0.034, 0.032],
          [0.016, 0.062],
        ]),
        0.064,
        'glass',
        [0, 0.418, 0],
      ),
      // Internal dark triode anode plate + central glowing filament + specular glass gleam on the -z face.
      kitPlate('anode', outlineRoundRect(0.078, 0.115, 0.012, 1), 0.02, 'hair', [0, 0.295, -0.055], { outline: false }),
      kitPlate('filament', outlineRoundRect(0.036, 0.09, 0.01, 1), 0.018, 'lantern', [0, 0.295, -0.066], { outline: false }),
      kitPlate('glint', outlineRoundRect(0.022, 0.075, 0.01, 1), 0.016, 'paper', [-0.055, 0.34, -0.065], {
        rot: [0, 0, -0.14],
        outline: false,
      }),
    ],
    sockets: {
      grip: [0, 0.075, 0],
      light: [0, 0.31, -0.07],
      label: [0, 0.56, 0],
      fx: [0, 0.28, -0.1],
    },
  };
}
