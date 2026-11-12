import type { FxMoment, FxPreset } from './types.js';

/**
 * Every game moment that must have an effect, and the word the design doc gives it
 * (haunted_terminal.md, sections 2 and 4.2). `null`: a word is optional.
 */
export const FX_MOMENT_WORDS: Record<FxMoment, string | null> = {
  hop: 'HOP!',
  'panel-smash': 'PANEL SMASH x3!',
  'permission-denied': 'PERMISSION DENIED!',
  'gate-open': 'CLANK!',
  reveal: 'REVEAL!',
  'rm-ash': null,
  'touch-materialize': null,
  'mv-dust': null,
  sigkill: 'SIGKILL!',
  'sigstop-ice': null,
  'sigterm-rage': 'SIGTERM IGNORED!',
  'fork-spawn': null,
  'pickup-energy': null,
  'pickup-ram': null,
  'pickup-ssd': null,
  'hit-vibecoder': null,
  'malware-hit': null,
  'malware-death': null,
  'devnull-suck': null,
  'lightning-strike': 'KRAKOOM!',
  'flood-splash': null,
  'door-unlock': null,
  coredump: null,
};

export const FX_MOMENTS = Object.keys(FX_MOMENT_WORDS) as FxMoment[];

class FxCatalogImpl {
  private readonly entries = new Map<string, FxPreset>();

  register(preset: FxPreset): FxPreset {
    if (this.entries.has(preset.id)) throw new Error(`fx preset "${preset.id}" is registered twice`);
    this.entries.set(preset.id, preset);
    return preset;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): FxPreset {
    const preset = this.entries.get(id);
    if (!preset) throw new Error(`unknown fx preset "${id}"`);
    return preset;
  }

  list(): FxPreset[] {
    return [...this.entries.values()];
  }

  /** The preset that answers a game moment, if one is registered. */
  forMoment(moment: FxMoment): FxPreset | undefined {
    return this.list().find((p) => p.trigger.moment === moment);
  }
}

export const FxCatalog = new FxCatalogImpl();
