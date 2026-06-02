// The oblique-weave TIER-3 LIVE check (OPTIONAL, key-gated) — a reliability smoke
// that drives a masked-viewport slice (a Viewport Policy + two adversarial roles)
// with a REAL model at the `asyncMounts` seam (createAgentRender), instead of the
// deterministic fake.
//
// It honors REACTOR_OFFLINE and is gated `{ skip: hasOpenRouterKey() ? false :
// "…" }` exactly like every other live test in the repo: a keyless /
// REACTOR_OFFLINE=1 run reports a PASSING SKIPPED body and never touches the
// network — the offline commit gate is unaffected by this file.
//
// The reliability property (the live half of the tenet): with a real render, a
// cold start renders the Viewport Policy and propagates to BOTH role lanes, and a
// NO-CHANGE re-wake memo-SKIPS the viewport at ZERO model calls (cost scales with
// surprise, even live). The deterministic sibling (oblique-weave.test.ts) is the
// green bar that gates the commit; this only kicks the tires with a model.

import { strict as assert } from "node:assert";
import { describe, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  ATOMIC_FACET,
} from "@openprose/reactor";
import type {
  ReconcilerTopology,
} from "@openprose/reactor/internals";
import {
  createFileSystemStorageAdapter,
} from "@openprose/reactor";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
  isOfflineForced,
} from "@openprose/reactor/agents";

const VIEWPORT = "responsibility.viewport-policy";
const ANALOGIST = "responsibility.analogist";
const ADVERSARY = "responsibility.adversary";

const VIEW_ANALOGIST = "view:analogist";
const VIEW_ADVERSARY = "view:adversary";

// The single gate: a key present AND not offline-forced. Otherwise the body is a
// passing skipped no-op.
const LIVE = hasOpenRouterKey() && !isOfflineForced();
const skip = LIVE ? false : "no OPENROUTER_API_KEY (or REACTOR_OFFLINE=1) — live render skipped";

describe("oblique-weave — LIVE reliability (key-gated)", () => {
  it(
    "cold render fans masked views to both roles; a no-change re-wake memo-skips at zero model calls",
    { skip },
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "oblique-weave-live-"));
      try {
        const storage = createFileSystemStorageAdapter({ directory: dir });
        const ledger = createFileSystemReceiptLedger({ storage });

        const topology: ReconcilerTopology = {
          topology: {
            nodes: [
              { node: VIEWPORT, contract_fingerprint: "fp-viewport", wake_source: "external" },
              { node: ANALOGIST, contract_fingerprint: "fp-analogist", wake_source: "input" },
              { node: ADVERSARY, contract_fingerprint: "fp-adversary", wake_source: "input" },
            ],
            edges: [
              { subscriber: ANALOGIST, producer: VIEWPORT, facet: VIEW_ANALOGIST },
              { subscriber: ADVERSARY, producer: VIEWPORT, facet: VIEW_ADVERSARY },
            ],
            entry_points: [VIEWPORT],
            acyclic: true,
          },
          contract_fingerprints: {
            [VIEWPORT]: "fp-viewport",
            [ANALOGIST]: "fp-analogist",
            [ADVERSARY]: "fp-adversary",
          },
        };

        const provider = createOpenRouterProvider();
        const liveRender = (instructions: string) => createAgentRender({ provider, instructions });

        // The viewport canonicalizer exposes one masked facet per role (so a cold
        // start lights both lanes). ATOMIC_FACET for the role producers.
        const viewportCanon = (fm: Record<string, Uint8Array>) => {
          const text = fm["truth.json"] ? new TextDecoder().decode(fm["truth.json"]!) : "";
          return {
            [ATOMIC_FACET]: `sha:${text}`,
            [VIEW_ANALOGIST]: `sha:analogist:${text}`,
            [VIEW_ADVERSARY]: `sha:adversary:${text}`,
          };
        };

        const zero = (cause: "external" | "input") => ({
          world_model: {},
          cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: cause },
        });

        const dag = mountDag({
          topology,
          mounts: {
            [VIEWPORT]: { render: () => zero("external"), canonicalizer: viewportCanon },
            [ANALOGIST]: { render: () => zero("input") },
            [ADVERSARY]: { render: () => zero("input") },
          },
          asyncMounts: {
            [VIEWPORT]: {
              render: liveRender(
                "You are the Viewport Policy. Maintain a tiny JSON truth with two masked anomaly views, `analogist` and `adversary`, each a one-line note. Keep it short and deterministic.",
              ),
              canonicalizer: viewportCanon,
            },
            [ANALOGIST]: {
              render: liveRender(
                "You are the Analogist. Read ONLY your masked anomaly view and maintain a one-line analogy-driven oblique thread. Keep it short.",
              ),
            },
            [ADVERSARY]: {
              render: liveRender(
                "You are the Adversary. Read ONLY your masked anomaly view and maintain a one-line inversion/attack. Keep it short.",
              ),
            },
          },
          ledger,
        });

        const cold = await dag.ingestAsync(VIEWPORT);
        assert.ok(
          cold.some((r) => r.node === VIEWPORT && r.disposition === "rendered"),
          "the viewport rendered cold",
        );
        assert.ok(
          cold.some((r) => r.node === ANALOGIST && r.disposition === "rendered"),
          "the analogist masked view propagated",
        );
        assert.ok(
          cold.some((r) => r.node === ADVERSARY && r.disposition === "rendered"),
          "the adversary masked view propagated",
        );

        const freshAfterCold = createReplaySession({ ledger }).costRollup.total.fresh;

        const quiet = await dag.ingestAsync(VIEWPORT);
        assert.deepEqual(
          quiet.map((r) => `${r.node}:${r.disposition}`),
          [`${VIEWPORT}:skipped`],
          "a no-change re-wake memo-skips the viewport (no propagation, zero model calls)",
        );
        assert.equal(
          createReplaySession({ ledger }).costRollup.total.fresh,
          freshAfterCold,
          "the quiet re-wake spent zero additional fresh — cost scales with surprise, even live",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
