// agent-observatory — the OPTIONAL tier-3 live / async-render reliability check.
//
// This tier is ADDITIVE and KEY-GATED. With no key (or REACTOR_OFFLINE=1) it is
// a PASSING-SKIPPED no-op that never touches the network — the hermetic CI gate
// (`REACTOR_OFFLINE=1`) runs tiers 1–2 green and reports this body as skipped.
//
// The reliability question is "is the responsibility's `### Maintains`
// postcondition actually met by a REAL render?". Unlike a stub that only asserts
// the gate flipped, this WIRES the live adapter for real: it mounts the two
// load-bearing observatory nodes — the Concept Clusterer (the expensive batched
// synthesis) and the Agent Dashboard (HTML) terminal artifact — through
// `createAgentRender` at the `asyncMounts` seam, drives the async reconcile path
// with `dag.ingestAsync`, then reads the committed truth with
// `store.read(node, "published")` and scores it against each node's
// `### Maintains` clause:
//
//   * concept-clusterer  →  truth.json carries `clusters: Cluster[]` and a
//                           numeric `cluster_count` (one cluster per workstream);
//   * agent-dashboard-html → truth.json carries `path: agent-dashboard.html`,
//                            a self-contained `html` string, and a `content_hash`.
//
// IMPORTS: this routes through `@openprose/reactor/adapters/agent-render`, which
// exports `createAgentRender` / `createOpenRouterProvider` / `hasOpenRouterKey`.
// Note: that barrel does NOT currently export `isOfflineForced` (a shared-file
// gap, out of scope for this example), so the offline gate here reads
// `process.env.REACTOR_OFFLINE` directly — the same pattern the package's own
// research-tree live test uses. All model calls route through
// `createOpenRouterProvider`; nothing here hits the network unless a key is
// present and REACTOR_OFFLINE is unset.
//
// Run live with a key:
//   OPENROUTER_API_KEY=… npx vitest run --config \
//     skills/open-prose/examples/agent-observatory/vitest.local.config.ts

import { mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Storage/store/fingerprint live on the bare `@openprose/reactor` barrel; the
// reconciler primitives + receipt helpers live on `/sdk`. Both are public.
import {
  FileSystemWorldModelStore,
  createFileSystemStorageAdapter,
  fingerprintArtifact,
} from "@openprose/reactor";
import {
  mountDag,
  FileSystemReceiptLedger,
  files,
  jsonFile,
  readTextFile,
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  ATOMIC_FACET,
  type WorldModelStore,
  type WorldModelFiles,
  type Fingerprint,
  type Wake,
  type ReconcilerTopology,
  type AsyncMountedRender,
} from "@openprose/reactor/sdk";
import {
  createAgentRender,
  createOpenRouterProvider,
  hasOpenRouterKey,
} from "@openprose/reactor/adapters/agent-render";

// Honor REACTOR_OFFLINE and require a real key — otherwise this is a no-op.
const offline = process.env.REACTOR_OFFLINE === "1" || process.env.REACTOR_OFFLINE === "true";
const live = hasOpenRouterKey() && !offline;
const skipReason = offline
  ? "REACTOR_OFFLINE=1 — live tier disabled"
  : "no OPENROUTER_API_KEY — live tier skipped";

// --- Node identities for the live slice (a sub-graph of the full observatory).
const SOURCE = "ingress.workstreams";
const WORKSTREAM_INDEX = "responsibility.workstream-index";
const CONCEPT_CLUSTERER = "responsibility.concept-clusterer";
const DASHBOARD_HTML = "responsibility.dashboard-html";

const fp = (value: unknown): Fingerprint =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const atomic = (fm: WorldModelFiles) => ({ [ATOMIC_FACET]: fingerprintArtifact(fm) });

// The Workstream Index exposes the `rollup` (cheap, every render) and the gating
// `cluster-gate` (moves only when the distinct workstream set moves) facets —
// the same two-facet contract the deterministic generator uses.
const ROLLUP_FACET = "rollup";
const CLUSTER_GATE_FACET = "cluster-gate";
const workstreamIndexCanon = (fm: WorldModelFiles) => {
  const bytes = fm["truth.json"];
  const t = bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ROLLUP_FACET]: fp(t["rollup"] ?? null),
    [CLUSTER_GATE_FACET]: fp(t["workstreams"] ?? []),
  };
};

// The compiled-contract view per node (the `### Requires` / `### Maintains` /
// `### Continuity` + an `### Execution` body the render follows). The two
// scored nodes mirror their committed `.prose.md` postconditions verbatim.
function liveContractFor(node: string) {
  if (node === CONCEPT_CLUSTERER) {
    return {
      name: "Concept Clusterer",
      requires: ["the `cluster-gate` facet of `workstream-index` — the gate"],
      maintains: [
        "`clusters`: `Cluster[]`, each `{ cluster_id, workstream, concepts }`",
        "`cluster_count`: the number of clusters",
      ],
      continuity: "Wake when the distinct workstream set changes (a major new project).",
      execution:
        "Read your upstream producer BY REFERENCE via `wm_list_upstream` + " +
        "`wm_read_upstream` (path `truth.json`). Read its `workstreams` (a string[] of " +
        "distinct workstream names). Cluster the concept space: produce ONE cluster per " +
        "workstream. Write `truth.json` to your workspace, valid JSON of EXACTLY: " +
        '{ "clusters": [ { "cluster_id": "C0", "workstream": <name>, ' +
        '"concepts": ["concept:<name>:a","concept:<name>:b"] }, … ], ' +
        '"cluster_count": <the number of clusters> }. Then report status "done".',
    };
  }
  if (node === DASHBOARD_HTML) {
    return {
      name: "Agent Dashboard (HTML)",
      requires: [
        "the `rollup` facet of `workstream-index` — the cheap incremental rollup",
        "`concept-clusterer` (via `@atomic`) — the cluster graph",
      ],
      maintains: [
        "`path`: `agent-dashboard.html`",
        "`html`: a self-contained static HTML document (no server, no external assets)",
        "`content_hash`: a stable digest so an unchanged render is a memo hit",
      ],
      continuity: "Input-driven: a moved `rollup` facet or a changed cluster graph wakes the dashboard.",
      execution:
        "Read BOTH upstream producers BY REFERENCE via `wm_list_upstream` + " +
        "`wm_read_upstream` (path `truth.json`): the workstream-index `rollup` (with " +
        "`total_sessions`) and the concept-clusterer (`cluster_count`). Render a SINGLE " +
        "self-contained static HTML document — a `<!doctype html>` page with the session " +
        "and cluster counts, no external assets. Write `truth.json` to your workspace, " +
        'valid JSON of EXACTLY: { "path": "agent-dashboard.html", "html": <the HTML string>, ' +
        '"content_hash": "sha256:<a hex digest of the html>" }. Then report status "done".',
    };
  }
  // The Workstream Index (the upstream the two scored nodes read).
  return {
    name: "Workstream Index",
    requires: ["the per-session summaries"],
    maintains: ["`rollup`: the cheap incremental rollup", "`workstreams`: the distinct workstream set"],
    continuity: "Input-driven, convergent diamond fan-in.",
    execution:
      "Read your upstream producer BY REFERENCE via `wm_list_upstream` + " +
      "`wm_read_upstream` (path `truth.json`); read its `workstreams` (a string[]) and " +
      "`session_count`. Write `truth.json` to your workspace, valid JSON of EXACTLY: " +
      '{ "rollup": { "total_sessions": <session_count> }, "workstreams": <the string[]>, ' +
      '"workstream_count": <its length> }. Then report status "done".',
  };
}

function topology(): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        { node: SOURCE, contract_fingerprint: "fp-src", wake_source: "external" },
        { node: WORKSTREAM_INDEX, contract_fingerprint: "fp-wi", wake_source: "input" },
        { node: CONCEPT_CLUSTERER, contract_fingerprint: "fp-cl", wake_source: "input" },
        { node: DASHBOARD_HTML, contract_fingerprint: "fp-db", wake_source: "input" },
      ],
      edges: [
        { subscriber: WORKSTREAM_INDEX, producer: SOURCE, facet: ATOMIC_FACET },
        // The Clusterer reads ONLY the gating facet (the batch gate).
        { subscriber: CONCEPT_CLUSTERER, producer: WORKSTREAM_INDEX, facet: CLUSTER_GATE_FACET },
        // The Dashboard reads the cheap rollup + the cluster graph (atomic).
        { subscriber: DASHBOARD_HTML, producer: WORKSTREAM_INDEX, facet: ROLLUP_FACET },
        { subscriber: DASHBOARD_HTML, producer: CONCEPT_CLUSTERER, facet: ATOMIC_FACET },
      ],
      entry_points: [SOURCE],
      acyclic: true,
    },
    contract_fingerprints: {
      [SOURCE]: "fp-src",
      [WORKSTREAM_INDEX]: "fp-wi",
      [CONCEPT_CLUSTERER]: "fp-cl",
      [DASHBOARD_HTML]: "fp-db",
    },
  };
}

function readTruth(store: WorldModelStore, node: string): Record<string, unknown> | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const b = read.files["truth.json"];
  return b === undefined ? null : (JSON.parse(readTextFile(b)) as Record<string, unknown>);
}

describe("agent-observatory — live reliability (tier 3, key-gated)", () => {
  it.skipIf(!live)(
    "renders the observatory with live agent renders and meets the ### Maintains postconditions",
    async () => {
      const wmDir = mkdtempSync(join(tmpdir(), "agent-obs-live-wm-"));
      const ledgerDir = mkdtempSync(join(tmpdir(), "agent-obs-live-ledger-"));
      try {
        const store = new FileSystemWorldModelStore({ directory: wmDir });
        const storage = createFileSystemStorageAdapter({ directory: ledgerDir });
        const ledger = new FileSystemReceiptLedger({ storage });
        const provider = createOpenRouterProvider();

        // Seed the ingress: three distinct workstreams across three sessions.
        const WORKSTREAMS = ["observatory-launch", "growth-loops", "infra-migration"];
        const fm = files({
          "truth.json": jsonFile({ workstreams: WORKSTREAMS, session_count: WORKSTREAMS.length }),
        });
        const commitRes = store.commitPublished(SOURCE, fm, atomic);
        const prev = ledger.lastReceipt(SOURCE);
        const wake: Wake = { source: "external", refs: [] };
        ledger.append({
          node: SOURCE,
          contract_fingerprint: `contract:${SOURCE}`,
          wake,
          input_fingerprints: [],
          fingerprints: commitRes.fingerprints,
          semantic_diff: EMPTY_SEMANTIC_DIFF,
          prev: prev !== null ? ledger.addressOf(prev) : null,
          status: "rendered",
          cost: zeroCost("external"),
          sig: createNullSignature(),
        });

        // The REAL live render at the asyncMounts seam (createAgentRender over
        // OpenRouter), one factory for the whole sub-graph.
        const baseRender = createAgentRender({
          store,
          contractFor: liveContractFor,
          provider,
          temperature: 0,
          seed: 7,
          maxTurns: 16,
        });
        const live3: AsyncMountedRender = { render: baseRender };
        const asyncMounts = {
          [WORKSTREAM_INDEX]: { render: baseRender, canonicalizer: workstreamIndexCanon },
          [CONCEPT_CLUSTERER]: { render: baseRender, canonicalizer: atomic },
          [DASHBOARD_HTML]: { render: baseRender, canonicalizer: atomic },
        };

        const dag = mountDag({
          topology: topology(),
          // The source has no live body — a zero-cost sync fallback.
          mounts: {
            [SOURCE]: {
              render: () => ({
                world_model: files({}),
                cost: { provider: "none", model: "fake", tokens: { fresh: 0, reused: 0 }, surprise_cause: "external" },
              }),
            },
          },
          asyncMounts,
          store,
          ledger,
        });

        // Drive the async reconcile path from the gateway: the index, the
        // clusterer, then the dashboard render bottom-up.
        await dag.ingestAsync(SOURCE);
        void live3;

        // POSTCONDITION 1 — concept-clusterer `### Maintains`.
        const cl = readTruth(store, CONCEPT_CLUSTERER);
        expect(cl, "concept-clusterer published truth").not.toBeNull();
        expect(Array.isArray(cl!["clusters"]), "clusters is an array").toBe(true);
        expect(typeof cl!["cluster_count"]).toBe("number");
        const clusters = cl!["clusters"] as Array<Record<string, unknown>>;
        expect(clusters.length).toBeGreaterThanOrEqual(1);
        // every cluster names one of the seeded workstreams (no invented lane)
        for (const c of clusters) {
          expect(WORKSTREAMS).toContain(c["workstream"]);
        }

        // POSTCONDITION 2 — agent-dashboard-html `### Maintains`.
        const db = readTruth(store, DASHBOARD_HTML);
        expect(db, "dashboard-html published truth").not.toBeNull();
        expect(db!["path"]).toBe("agent-dashboard.html");
        expect(typeof db!["html"]).toBe("string");
        expect((db!["html"] as string).toLowerCase()).toContain("<html");
        expect(typeof db!["content_hash"]).toBe("string");
        expect(db!["content_hash"] as string).toMatch(/^sha256:/);
      } finally {
        rmSync(wmDir, { recursive: true, force: true });
        rmSync(ledgerDir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it("is a passing-skipped no-op when keyless / offline (hermetic CI)", () => {
    if (live) {
      expect(hasOpenRouterKey()).toBe(true);
      return;
    }
    // Offline / keyless: assert the gate short-circuited and nothing ran.
    expect(skipReason).toMatch(/REACTOR_OFFLINE|no OPENROUTER_API_KEY/);
  });
});
