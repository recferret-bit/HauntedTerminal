/**
 * Laptop noises are app events. The lab page subscribes with the SFX orchestrator.
 * `muted` still gates them, matching the lab's sound checkbox.
 */
export type LaptopKeyAction = 'key' | 'key-enter' | 'key-backspace' | 'key-tab';

export interface LaptopSound {
  muted: boolean;
  key(down: boolean, code?: string): void;
  button(): void;
  beep(): void;
  disk(ms: number): void;
  /** A named laptop action (`open`, `run`, `fan-on`, ...). */
  note(action: string): void;
}

export function keyActionFor(code?: string): LaptopKeyAction {
  if (code === 'Enter' || code === 'NumpadEnter') return 'key-enter';
  if (code === 'Backspace' || code === 'Delete') return 'key-backspace';
  if (code === 'Tab') return 'key-tab';
  return 'key';
}

export function createLaptopSound(hear?: (action: string) => void): LaptopSound {
  const sound: LaptopSound = {
    muted: false,
    note(action) {
      if (!sound.muted) hear?.(action);
    },
    key(down, code) {
      if (down) sound.note(keyActionFor(code));
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
