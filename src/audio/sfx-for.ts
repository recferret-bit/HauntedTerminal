import type { AppEvent } from '../contracts/app-bus.js';
import type { SfxId } from './catalog.js';
import { appCues } from './sfx-app.js';
import { kernelCues } from './sfx-kernel.js';

/** Sample ids for one app event. Empty when the event is analytics-only or a loop/scene. */
export function sfxFor(event: AppEvent): SfxId[] {
  if (event.kind === 'kernel') return kernelCues(event.event);
  return appCues(event);
}

/** HP band of 20. The orchestrator plays `hp_tier_drop` when the band falls. */
export function hpBand(hp: number): number {
  return Math.max(0, Math.ceil(hp / 20));
}
