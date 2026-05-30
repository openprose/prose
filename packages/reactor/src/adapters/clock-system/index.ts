import type { ReactorClockAdapter } from "../types";

export interface FixedClockAdapter extends ReactorClockAdapter {
  readonly set: (instant: string) => void;
  readonly advanceByMs: (milliseconds: number) => string;
  readonly readings: () => readonly string[];
}

export function createSystemClockAdapter(): ReactorClockAdapter {
  return {
    now: () => new Date().toISOString(),
  };
}

export function createFixedClockAdapter(initialInstant: string): FixedClockAdapter {
  assertReplayableInstant(initialInstant, "initialInstant");

  let current = initialInstant;
  const emitted: string[] = [];

  return {
    now(): string {
      emitted.push(current);
      return current;
    },
    set(instant: string): void {
      assertReplayableInstant(instant, "instant");
      current = instant;
    },
    advanceByMs(milliseconds: number): string {
      if (!Number.isFinite(milliseconds)) {
        throw new Error("milliseconds must be finite");
      }
      current = new Date(Date.parse(current) + milliseconds).toISOString();
      return current;
    },
    readings(): readonly string[] {
      return [...emitted];
    },
  };
}

function assertReplayableInstant(value: string, name: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a replayable instant`);
  }
}
