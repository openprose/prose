// OPTIONAL tier-3 live reliability check for monorepo-ci (key-gated).
//
// The offline sibling (monorepo-ci.test.ts) is the green bar: it drives the REAL
// reconciler with DETERMINISTIC fake renders and asserts the whole validity
// contract at ZERO spend. THIS file is the key-gated LIVE smoke: it boots the
// same hub→dependent memo mechanic but swaps the fake render for the live
// `createAgentRender` adapter via the `asyncMounts` seam + `dag.ingestAsync`, and
// asserts the reliability property that matters for a CI merge gate:
//
//   a NO-CHANGE re-wake SKIPS with ZERO model calls (memo-skip holds live).
//
// It is gated `{ skip: hasOpenRouterKey() && !isOfflineForced() ? false : "…" }`
// exactly like every other live test, so a keyless / REACTOR_OFFLINE=1 run reports
// a PASSING (skipped-body) subtest and NEVER touches the network — the offline gate
// stays green and is unaffected by this file.

import { describe, it, expect } from "vitest";

import {
  hasOpenRouterKey,
  isOfflineForced,
} from "@openprose/reactor/adapters/agent-render";

const live = hasOpenRouterKey() && !isOfflineForced();
const skip = live ? false : "no OPENROUTER_API_KEY (or REACTOR_OFFLINE=1) — live tier skipped";

describe("monorepo-ci — live reliability (tier-3, key-gated)", () => {
  it.skipIf(!!skip)(
    "a no-change re-wake memo-skips with zero live model calls",
    async () => {
      // Imported lazily so a keyless run never loads the live adapter / SDK render
      // path at all.
      const { mkdtempSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { createFileSystemStorageAdapter } = await import("@openprose/reactor");
      const {
        mountDag,
        createFileSystemReceiptLedger,
        createReplaySession,
        ATOMIC_FACET,
      } = await import("@openprose/reactor/sdk");
      const { createAgentRender } = await import("@openprose/reactor/adapters/agent-render");

      const dir = mkdtempSync(join(tmpdir(), "mci-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology = {
          topology: {
            nodes: [
              { node: "build.pkg-core", contract_fingerprint: "fp-core", wake_source: "external" as const },
              { node: "build.pkg-ui", contract_fingerprint: "fp-ui", wake_source: "input" as const },
            ],
            edges: [{ subscriber: "build.pkg-ui", producer: "build.pkg-core", facet: ATOMIC_FACET }],
            entry_points: ["build.pkg-core"],
            acyclic: true,
          },
          contract_fingerprints: { "build.pkg-core": "fp-core", "build.pkg-ui": "fp-ui" },
        };

        const agent = (instruction: string) =>
          createAgentRender({
            instructions: instruction,
            // deterministic-ish: temperature 0 so the reliability property holds.
            temperature: 0,
          });

        const dag = mountDag({
          topology,
          asyncMounts: {
            "build.pkg-core": { render: agent("Compile pkg-core. Emit a one-line build summary.") },
            "build.pkg-ui": { render: agent("Compile pkg-ui against the core build. One-line summary.") },
          },
          ledger,
        });

        await dag.ingestAsync("build.pkg-core"); // cold: both render (real model)
        const before = createReplaySession({ ledger }).costRollup.total.fresh;

        const second = await dag.ingestAsync("build.pkg-core"); // no change: skip
        expect(second.map((r) => r.disposition)).toEqual(["skipped"]);
        const after = createReplaySession({ ledger }).costRollup.total.fresh;
        expect(after).toBe(before); // fresh did NOT move: zero live spend on the re-wake
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
