/**
 * The laptop's lifecycle as one state machine: a transition table plus the length of every timed phase.
 * Pure data and pure functions; `createMachine` drives it with an injected clock so Node tests can step it.
 *
 *   closed --OPEN--> opening --DONE--> open --POWER--> diving --DONE--> booting --DONE--> desktop
 *   desktop --POWER--> shutting --DONE--> surfacing --DONE--> open --CLOSE--> closing --DONE--> closed
 */
export const LAPTOP_STATES = ['closed', 'opening', 'open', 'diving', 'booting', 'desktop', 'shutting', 'surfacing', 'closing'] as const;
export type LaptopState = (typeof LAPTOP_STATES)[number];

export type LaptopEvent = 'OPEN' | 'CLOSE' | 'POWER' | 'DONE';

export const TRANSITIONS: Readonly<Record<LaptopState, Partial<Record<LaptopEvent, LaptopState>>>> = {
  closed: { OPEN: 'opening' },
  opening: { DONE: 'open' },
  open: { POWER: 'diving', CLOSE: 'closing' },
  diving: { DONE: 'booting' },
  booting: { DONE: 'desktop', POWER: 'shutting' },
  desktop: { POWER: 'shutting' },
  shutting: { DONE: 'surfacing' },
  surfacing: { DONE: 'open' },
  closing: { DONE: 'closed' },
};

/** How long each timed phase lasts (ms). A state listed here leaves on DONE when its time is up. */
export const PHASE_MS: Readonly<Partial<Record<LaptopState, number>>> = {
  opening: 1500,
  diving: 1300,
  booting: 5200,
  shutting: 1100,
  surfacing: 1100,
  closing: 1100,
};

/** What the player sees of each state: the camera framing, whether the lid is up and the screen lit. */
export interface StageLook {
  camera: 'far' | 'near';
  lid: 'shut' | 'up';
  screen: 'off' | 'boot' | 'desktop' | 'bye';
}

export const LOOKS: Readonly<Record<LaptopState, StageLook>> = {
  closed: { camera: 'far', lid: 'shut', screen: 'off' },
  opening: { camera: 'far', lid: 'up', screen: 'off' },
  open: { camera: 'far', lid: 'up', screen: 'off' },
  diving: { camera: 'near', lid: 'up', screen: 'boot' },
  booting: { camera: 'near', lid: 'up', screen: 'boot' },
  desktop: { camera: 'near', lid: 'up', screen: 'desktop' },
  shutting: { camera: 'near', lid: 'up', screen: 'bye' },
  surfacing: { camera: 'far', lid: 'up', screen: 'off' },
  closing: { camera: 'far', lid: 'shut', screen: 'off' },
};

/** The state after `event`, or null when the event means nothing in `state`. */
export function nextState(state: LaptopState, event: LaptopEvent): LaptopState | null {
  return TRANSITIONS[state][event] ?? null;
}

/** Events a user can send from `state` (DONE belongs to the clock). */
export function userEvents(state: LaptopState): LaptopEvent[] {
  return (Object.keys(TRANSITIONS[state]) as LaptopEvent[]).filter((e) => e !== 'DONE');
}

/** The shortest list of events that leads from `from` to `to` (DONE included), or null when there is none. */
export function pathTo(from: LaptopState, to: LaptopState): LaptopEvent[] | null {
  const seen = new Map<LaptopState, LaptopEvent[]>([[from, []]]);
  const queue: LaptopState[] = [from];
  while (queue.length) {
    const at = queue.shift()!;
    if (at === to) return seen.get(at)!;
    for (const [ev, dest] of Object.entries(TRANSITIONS[at]) as [LaptopEvent, LaptopState][]) {
      if (!seen.has(dest)) {
        seen.set(dest, [...seen.get(at)!, ev]);
        queue.push(dest);
      }
    }
  }
  return null;
}

export interface Clock {
  after(ms: number, fn: () => void): () => void;
}

export interface Machine {
  readonly state: LaptopState;
  /** Applies an event; returns false when the current state ignores it. */
  send(event: LaptopEvent): boolean;
  /** Walks the table to `to` at once, skipping the timed phases. */
  jump(to: LaptopState): boolean;
  /** Time scale for phase lengths: 0 makes every timed phase finish on the next tick. */
  speed: number;
  dispose(): void;
}

/** Runs the table. Entering a timed state arms its DONE; leaving it early cancels the timer. */
export function createMachine(clock: Clock, onChange: (state: LaptopState, from: LaptopState, event: LaptopEvent) => void, start: LaptopState = 'closed'): Machine {
  let state = start;
  let cancel: (() => void) | null = null;
  const machine: Machine = {
    get state() { return state; },
    speed: 1,
    send(event) {
      const to = nextState(state, event);
      if (!to) return false;
      cancel?.();
      cancel = null;
      const from = state;
      state = to;
      const ms = PHASE_MS[to];
      if (ms !== undefined) cancel = clock.after(ms * machine.speed, () => { cancel = null; machine.send('DONE'); });
      onChange(to, from, event);
      return true;
    },
    jump(to) {
      const path = pathTo(state, to);
      if (!path) return false;
      for (const ev of path) machine.send(ev);
      return true;
    },
    dispose() {
      cancel?.();
      cancel = null;
    },
  };
  return machine;
}
