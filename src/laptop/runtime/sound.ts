/**
 * Laptop noises are app events. The lab page subscribes with the SFX orchestrator.
 * `muted` still gates them, matching the lab's sound checkbox.
 */
export interface LaptopSound {
  muted: boolean;
  key(down: boolean): void;
  button(): void;
  beep(): void;
  disk(ms: number): void;
  /** A named laptop action (`open`, `run`, `fan-on`, ...). */
  note(action: string): void;
}

export function createLaptopSound(hear?: (action: string) => void): LaptopSound {
  const sound: LaptopSound = {
    muted: false,
    note(action) {
      if (!sound.muted) hear?.(action);
    },
    key(down) {
      if (down) sound.note('key');
    },
    button() {
      sound.note('trackpad');
    },
    beep() {
      sound.note('post');
    },
    disk(_ms) {
      sound.note('disk');
    },
  };
  return sound;
}
