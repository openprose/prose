/**
 * The ACROSS-reactor worker pool (CLI plan Phase 3 / §5.5).
 *
 * `serve` is a HOST that boots N reactors. `--concurrency N` bounds how many
 * reactors do work (a continuity poll / an ingress drain) in PARALLEL across the
 * host: the pool pulls ready reactor-level work units off a queue and runs them
 * up to the cap. WITHIN a single reactor, drains stay strictly serial — that is
 * the per-reactor serialization queue (correction #4), NOT this pool. Change B
 * (within-reactor render parallelism) is DEFERRED, so the SDK has no
 * `maxConcurrency` option and the pool NEVER parallelizes nodes inside a reactor;
 * it only overlaps DISTINCT reactors (each of which is internally serial).
 *
 * This is the across-reactor scheduler only. Determinism is preserved because
 * each reactor's own serialization queue guarantees its drains never overlap
 * (single-flight per reactor), and reactors are fully isolated (their own
 * substrate/schedule/cursors) — so running two reactors concurrently can never
 * interleave one reactor's reads/writes with another's.
 *
 * KEYLESS + zero-dependency: pure control flow over native promises.
 */

/** A unit of reactor-level work the pool runs (typically a poll or an ingress). */
export type PoolTask<T = void> = () => Promise<T>;

/** A bounded across-reactor worker pool: at most `concurrency` tasks in flight. */
export interface WorkerPool {
  /**
   * Submit `task`; resolves/rejects with its outcome once it has run. The pool
   * admits at most `concurrency` tasks concurrently; excess tasks wait FIFO for a
   * free slot. A task's rejection frees its slot (it never stalls the pool) and
   * is surfaced to that submitter.
   */
  readonly submit: <T>(task: PoolTask<T>) => Promise<T>;
  /** Resolves once every submitted task has settled (drain-to-idle). */
  readonly onIdle: () => Promise<void>;
  /** The number of tasks running + waiting. */
  readonly size: () => number;
  /** The configured concurrency cap. */
  readonly concurrency: number;
}

/**
 * Build an across-reactor worker pool with the given `concurrency` cap (clamped
 * to >= 1). The implementation keeps a FIFO queue of pending tasks and a count
 * of running ones; each completion pumps the next waiting task into the freed
 * slot. With `concurrency === 1` the pool degenerates to a serial executor (the
 * default single-reactor host behaves identically to the Phase-2 spine).
 */
export function createWorkerPool(concurrency: number): WorkerPool {
  const cap = Math.max(1, Math.floor(concurrency) || 1);
  let running = 0;
  const waiting: Array<() => void> = [];
  let total = 0;
  const idleWaiters: Array<() => void> = [];

  const settleIdleIfQuiet = (): void => {
    if (total === 0) {
      for (const resolve of idleWaiters.splice(0)) resolve();
    }
  };

  const acquire = (): Promise<void> => {
    if (running < cap) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiting.push(() => {
        running += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    running -= 1;
    const next = waiting.shift();
    if (next !== undefined) {
      next();
    }
  };

  const submit = async <T>(task: PoolTask<T>): Promise<T> => {
    total += 1;
    await acquire();
    try {
      return await task();
    } finally {
      release();
      total -= 1;
      settleIdleIfQuiet();
    }
  };

  const onIdle = (): Promise<void> => {
    if (total === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      idleWaiters.push(resolve);
    });
  };

  return {
    submit,
    onIdle,
    size: () => total,
    concurrency: cap,
  };
}
