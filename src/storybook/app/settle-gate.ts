/** Frames in a row that must be complete before the lab reports "ready" (the IntersectionObserver has reported and nothing is left to build). */
const SETTLE_FRAMES = 2;

/** Tells automation when a frame is final: `ready` once, and `afterPaint()` after every change. */
export class SettleGate {
  readonly ready: Promise<void>;
  private resolveReady: () => void = () => {};
  private waiters: (() => void)[] = [];
  private settled = 0;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
  }

  /** Something changed on screen: count clean frames again. */
  invalidate(): void {
    this.settled = 0;
  }

  /** Resolves once the next frames are clean. */
  afterPaint(): Promise<void> {
    this.settled = 0;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** The frame just drawn; `complete` is false while cells are still waiting to be built. */
  frameDrawn(complete: boolean): void {
    this.settled = complete ? this.settled + 1 : 0;
    if (this.settled < SETTLE_FRAMES) return;
    this.resolveReady();
    const done = this.waiters;
    this.waiters = [];
    done.forEach((resolve) => resolve());
  }

  /** Nothing will ever draw (no WebGL): release everyone. */
  releaseAll(): void {
    this.resolveReady();
  }
}
