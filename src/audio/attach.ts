import type { AppBus, SoundSink } from '../contracts/app-bus.js';
import { createGraph } from './engine.js';
import { SOUND_SOURCES } from './limits.js';
import { attachOrchestrators } from './orchestrators.js';

export interface AudioOptions {
  /** One-shot voices. Default `SOUND_SOURCES` (10). */
  sources?: number;
  muted?: boolean;
  volume?: number;
}

export interface AudioHandle extends SoundSink {
  dispose(): void;
}

/** Subscribe both orchestrators to `bus`. No-ops when the browser has no audio device. */
export function attachAudio(bus: AppBus, opts: AudioOptions = {}): AudioHandle {
  const graph = createGraph(opts.sources ?? SOUND_SOURCES);
  if (opts.volume !== undefined) graph.setVolume(opts.volume);
  if (opts.muted) graph.setMuted(true);
  const unsubscribe = attachOrchestrators(bus, graph);
  return {
    setMuted(muted) { graph.setMuted(muted); },
    setVolume(volume) { graph.setVolume(volume); },
    dispose() {
      unsubscribe();
      graph.dispose();
    },
  };
}
