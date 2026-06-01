// Runs the EVALS.md "Drive the reconciler yourself" + "A worked epoch" snippets
// VERBATIM against the public surface, so the guide can never silently drift from
// the real API again (blind-onboarding cycle-4 shipped an EVALS.md broken three
// ways: facet:"*" never propagated, replay.cost was undefined, surprise_cause was
// hardcoded). If this test breaks, EVALS.md is wrong — fix both together.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileSystemStorageAdapter } from "./index";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  files,
  textFile,
  ATOMIC_FACET,
  type ReconcilerTopology,
  type RenderContext,
} from "./sdk";

test("EVALS.md: quiet wakes skip, a contract edit renders + propagates", () => {
  const dir = mkdtempSync(join(tmpdir(), "evals-guide-"));
  try {
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = createFileSystemReceiptLedger({ storage });

    const render = (text: string) => (ctx: RenderContext) => ({
      world_model: files({ "out.txt": textFile(text) }),
      cost: {
        provider: "none",
        model: "fake",
        tokens: { fresh: 1, reused: 0 },
        surprise_cause: ctx.wake.source,
      },
    });

    const topology: ReconcilerTopology = {
      topology: {
        nodes: [
          { node: "source", contract_fingerprint: "fp-source", wake_source: "external" },
          { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
        ],
        edges: [{ subscriber: "digest", producer: "source", facet: ATOMIC_FACET }],
        entry_points: ["source"],
        acyclic: true,
      },
      contract_fingerprints: { source: "fp-source", digest: "fp-digest" },
    };
    const dag = mountDag({
      topology,
      mounts: {
        source: { render: render("v1") },
        digest: { render: render("digest of v1") },
      },
      ledger,
    });

    const first = dag.ingest("source");
    assert.deepEqual(
      first.map((r) => `${r.node}:${r.disposition}`).sort(),
      ["digest:rendered", "source:rendered"],
      "cold-start renders both",
    );

    const second = dag.ingest("source");
    assert.deepEqual(
      second.map((r) => `${r.node}:${r.disposition}`),
      ["source:skipped"],
      "nothing moved -> source skips, digest is not woken",
    );
    assert.equal(
      createReplaySession({ ledger }).costRollup.total.fresh,
      2,
      "the skip cost 0 fresh — total stays at the two cold renders",
    );

    // The worked epoch: a contract edit moves the memo key -> render + propagate.
    const topology2: ReconcilerTopology = {
      topology: {
        nodes: [
          { node: "source", contract_fingerprint: "fp-source-v2", wake_source: "external" },
          { node: "digest", contract_fingerprint: "fp-digest", wake_source: "input" },
        ],
        edges: [{ subscriber: "digest", producer: "source", facet: ATOMIC_FACET }],
        entry_points: ["source"],
        acyclic: true,
      },
      contract_fingerprints: { source: "fp-source-v2", digest: "fp-digest" },
    };
    const dag2 = mountDag({
      topology: topology2,
      mounts: {
        source: { render: render("v2") },
        digest: { render: render("digest of v2") },
      },
      ledger,
    });
    const third = dag2.ingest("source");
    assert.deepEqual(
      third.map((r) => `${r.node}:${r.disposition}`).sort(),
      ["digest:rendered", "source:rendered"],
      "a moved contract_fingerprint renders source and wakes digest",
    );
    assert.equal(
      createReplaySession({ ledger }).costRollup.total.fresh,
      4,
      "two more renders -> fresh moves 2 -> 4",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
