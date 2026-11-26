/**
 * Pure, generic finite state machine engine for gameplay, companion, UI, and lifecycle workflows.
 * Keeps transitions declarative as plain data tables so every reachable state and edge is Node-testable.
 */
export type TransitionTable<S extends string, E extends string> = Readonly<Record<S, Partial<Record<E, S>>>>;

export interface StateMachine<S extends string, E extends string> {
  readonly state: S;
  can(event: E): boolean;
  send(event: E): boolean;
  reset(next?: S): void;
  subscribe(listener: (to: S, from: S, event: E) => void): () => void;
}

export function nextMachineState<S extends string, E extends string>(
  table: TransitionTable<S, E>,
  state: S,
  event: E,
): S | null {
  return table[state][event] ?? null;
}

export function reachableStates<S extends string, E extends string>(
  table: TransitionTable<S, E>,
  start: S,
): Set<S> {
  const seen = new Set<S>([start]);
  const queue: S[] = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dest of Object.values(table[cur]) as Array<S | undefined>) {
      if (dest !== undefined && !seen.has(dest)) {
        seen.add(dest);
        queue.push(dest);
      }
    }
  }
  return seen;
}

export function createStateMachine<S extends string, E extends string>(config: {
  initial: S;
  transitions: TransitionTable<S, E>;
  onTransition?: (to: S, from: S, event: E) => void;
}): StateMachine<S, E> {
  let current = config.initial;
  const listeners = new Set<(to: S, from: S, event: E) => void>();
  return {
    get state() {
      return current;
    },
    can(event) {
      return nextMachineState(config.transitions, current, event) !== null;
    },
    send(event) {
      const to = nextMachineState(config.transitions, current, event);
      if (to === null) return false;
      const from = current;
      current = to;
      config.onTransition?.(to, from, event);
      for (const fn of listeners) fn(to, from, event);
      return true;
    },
    reset(next = config.initial) {
      current = next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
