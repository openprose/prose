/**
 * A per-reactor async-serial executor (CLI plan Phase 2, correction #4).
 *
 * The SDK's `drainAsync` single-flight atomicity is only safe with AT MOST ONE
 * drain in flight per reactor. The `serve` driver loop has multiple ingress
 * sources — the continuity poll, every gateway poll (Phase 4), and every
 * HTTP/`trigger` ingest — and they must NOT overlap a `drainAsync`. This is the
 * ONE place that ordering is enforced: every ingress `enqueue`s its async unit of
 * work onto a single FIFO executor per reactor, and the executor runs them
 * strictly one-at-a-time (the next starts only after the previous settles).
 *
 * KEYLESS + zero-dependency: this is pure control flow over native promises; it
 * never touches the model surface, so it lives on the offline path.
 */

/** A unit of work the queue serializes (typically a `drainAsync` wrapper). */
export type SerialTask<T> = () => Promise<T>;

/** A per-reactor serial executor: at most one task runs at a time, FIFO. */
export interface SerialQueue {
  /**
   * Enqueue `task`; resolves/rejects with the task's outcome once it has run to
   * completion in FIFO order. A task's rejection does NOT stall the queue — the
   * next task still runs (each `enqueue` caller sees its own task's result).
   */
  readonly enqueue: <T>(task: SerialTask<T>) => Promise<T>;
  /** Resolves once every currently-enqueued task has settled (drain-to-idle). */
  readonly onIdle: () => Promise<void>;
  /** The number of tasks waiting + the one (if any) currently running. */
  readonly size: () => number;
}

/**
 * Build a per-reactor serial queue. The implementation chains every task onto a
 * single `tail` promise, so the Nth task awaits the (N-1)th's settlement before
 * starting — guaranteeing at most one in flight. The chain swallows each task's
 * rejection at the chaining layer (so one failure never breaks serialization)
 * while still surfacing it to that task's own `enqueue` caller.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;

  const enqueue = <T>(task: SerialTask<T>): Promise<T> => {
    pending += 1;
    // The result the caller awaits — runs `task` only AFTER `tail` settles.
    const run = tail.then(
      () => task(),
      // Even if a prior task rejected, this one still runs (serialization, not
      // dependency): the prior rejection was surfaced to ITS caller already.
      () => task(),
    );
    // Advance the tail to this task's settlement (success OR failure), so the
    // next enqueue waits for it; never let a rejection escape the chain itself.
    tail = run.then(
      () => {
        pending -= 1;
      },
      () => {
        pending -= 1;
      },
    );
    return run;
  };

  const onIdle = async (): Promise<void> => {
    // Await the current tail; if more was enqueued meanwhile, await again until
    // the queue is genuinely empty.
    while (pending > 0) {
      await tail;
    }
  };

  return {
    enqueue,
    onIdle,
    size: () => pending,
  };
}
