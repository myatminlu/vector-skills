/**
 * Token-bucket request scheduler. A screen that mounts five queries at once trips a low per-second limit on the
 * backend; queuing here is cheaper than retrying 429s. Long-lived streams bypass it (`unscheduled`).
 */
export type Scheduler = {
  schedule<T>(task: () => Promise<T>): Promise<T>;
  readonly pending: number;
};

export function createScheduler(options: { perSecond?: number; now?: () => number; wait?: (ms: number) => Promise<void> } = {}): Scheduler {
  const perSecond = options.perSecond ?? 3;
  const now = options.now ?? (() => Date.now());
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interval = 1000 / perSecond;
  let tokens = perSecond;
  let lastRefill = now();
  const queue: (() => void)[] = [];
  let draining = false;

  function refill() {
    const current = now();
    const elapsed = current - lastRefill;
    // The wall clock can move backwards (the user changes the time); resync instead of waiting for it to catch up.
    if (elapsed < 0) {
      lastRefill = current;
      return;
    }
    if (elapsed === 0) return;
    tokens = Math.min(perSecond, tokens + elapsed / interval);
    lastRefill = current;
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        refill();
        if (tokens >= 1) {
          tokens -= 1;
          queue.shift()?.();
        } else {
          await wait(Math.max(5, Math.ceil((1 - tokens) * interval)));
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    get pending() {
      return queue.length;
    },
    schedule<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          task().then(resolve, reject);
        });
        void drain();
      });
    },
  };
}
