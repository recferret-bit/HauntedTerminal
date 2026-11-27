/**
 * Laptop actions (`open`, `key`, `fan-on`, ...) to app events, so the laptop sounds play wherever it is
 * mounted: the Laptop Lab and the in-game overlay on /play share this one mapping.
 */
import type { AppBus, LaptopAction } from '../contracts/app-bus.js';

const LAPTOP_ACTIONS: readonly LaptopAction[] = [
  'open', 'close', 'post', 'disk', 'ready', 'trackpad', 'run', 'loop-guard', 'shutdown', 'key',
  'solved', 'check-fail', 'win-open', 'win-min', 'win-close',
];

const KEY_ACTIONS: Readonly<Record<string, 'press' | 'enter' | 'backspace' | 'tab'>> = {
  key: 'press',
  'key-enter': 'enter',
  'key-backspace': 'backspace',
  'key-tab': 'tab',
};

function laptopAction(action: string): LaptopAction | null {
  return LAPTOP_ACTIONS.some((name) => name === action) ? action as LaptopAction : null;
}

/** The `hear` option of `mountLaptop`: turns each laptop action into an app event on `bus`. */
export function laptopHear(bus: AppBus): (action: string) => void {
  return (action) => {
    if (action === 'fan-on') bus.emit({ kind: 'loop', cue: 'lap_fan', on: true });
    else if (action === 'fan-off') bus.emit({ kind: 'loop', cue: 'lap_fan', on: false });
    else if (KEY_ACTIONS[action]) bus.emit({ kind: 'key', key: KEY_ACTIONS[action] });
    else {
      const name = laptopAction(action);
      if (name) bus.emit({ kind: 'laptop', action: name });
    }
  };
}
