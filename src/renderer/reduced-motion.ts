/** The player's "reduce motion" setting, read from the OS and overridable for tests and the stage self-check. */
export interface ReducedMotion {
  /** True while motion should be reduced; read per event, so a change applies to the next command. */
  readonly on: boolean;
  /** Override the OS value (self-check, tests). A later change of the OS query overwrites it again. */
  set(on: boolean): void;
}

const QUERY = '(prefers-reduced-motion: reduce)';

/** Follows `prefers-reduced-motion`; off where `matchMedia` does not exist. The listener lives as long as the page. */
export function watchReducedMotion(): ReducedMotion {
  let on = false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const query = window.matchMedia(QUERY);
    on = query.matches;
    query.addEventListener?.('change', (e) => {
      on = e.matches;
    });
  }
  return {
    get on() {
      return on;
    },
    set(next: boolean) {
      on = next;
    },
  };
}
