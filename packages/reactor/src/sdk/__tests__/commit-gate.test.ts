// EXPERIMENT C — the commit gate on the LIVE run path, offline. `runProject`'s
// opt-in `commitGate` threads the COMPILED postcondition validators
// (`gateCommit`, until now zero non-test callers) onto the commit path as a
// render wrapper (`withCommitGate`), with a Workflow-style bounded
// validate-and-retry. This file proves, keyless (REACTOR_OFFLINE-safe, no
// network — fake compile providers + a fake AsyncMountedRender, exactly the
// run-project.test.ts idiom):
//
//   1. VIOLATE-THEN-VALID: a render whose first candidate trips the compiled
//      predicate is re-rendered ONCE with the deterministic failures fed back
//      (`ctx.commit_gate_retry`), commits on the retry, and its ONE receipt's
//      cost honestly sums BOTH attempts. Propagation then wakes the subscriber.
//   2. ALWAYS-INVALID: retries exhausted ⇒ failed receipt, NOTHING commits,
//      the fingerprint never moves, downstream never wakes (fail closed).
//   3. OPTION OFF: without `commitGate`, the same violating render commits in
//      one attempt — byte-identical to today (the gate never evaluates).
//   4. SKIPS STAY FREE: a restart boot memo-skips PRE-spawn — the wrapper (and
//      the caller's factsFor) is never reached; the skip stays zero-token.
//   5. BOOT GUARD: enforcement over deterministic validators without a
//      `factsFor`, over a coarsened (ref-only) IR shape, or with a malformed
//      retry budget is a LOUD pre-boot refusal, never silent non-enforcement.
//
// Per-node receipt chains verify (`verifyReceiptChain`) in every scenario.

import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ATOMIC_FACET } from "../../shapes";
import { readTextFile, type WorldModelFiles } from "../../world-model";
import { FileSystemWorldModelStore } from "../../world-model/fs-store";
import { createMemoryStorageAdapter } from "../../adapters/storage-memory";
import { createSystemClockAdapter } from "../../adapters/clock-system";
import { verifyReceiptChain } from "../../receipt";
import type { CommitGateRetry, RenderContext, TruthProjection } from "../render-atom";
import type { AsyncMountedRender, MutableReceiptLedger } from "../mounted-dag";
import { dispositionOf } from "../../scenario/trace";
import { fakeStructuredProvider } from "../../adapters/agent-compile/__tests__/fake-provider";
import type { WorldModelStore } from "../../world-model";
import {
  compileProject,
  runProject,
  type CompiledProject,
  type FactsProjection,
} from "../run-project";

// The `.prose.md` fixtures live in the SOURCE tree (they are not copied into
// `dist/`). At run time this test executes from `dist/sdk/__tests__/`, so
// resolve the fixture dir against the package root's `src/` tree.
const PACKAGE_ROOT = join(__dirname, "../../..");
const FIXTURE_DIR = join(
  PACKAGE_ROOT,
  "src/adapters/agent-compile/__fixtures__/smallest-project",
);

const MONITOR = "competitor-monitor";
const BRIEF = "weekly-brief";
const FUNDING_PATH = "state/funding.json";
const BRIEF_PATH = "state/brief.md";

// ---------------------------------------------------------------------------
// The canned compile-session outputs (run-project.test.ts's proven shapes).
// MONITOR_PC_OUTPUT is the load-bearing one here: the deterministic validator
// `has-funding` trips when the fact `has_funding` equals false (the predicate
// encodes the VIOLATION condition).
// ---------------------------------------------------------------------------

const FORME_OUTPUT = JSON.stringify({
  nodes: [
    {
      id: MONITOR,
      kind: "responsibility",
      wake_source: "self",
      requires: [],
      maintains: ["funding"],
    },
    {
      id: BRIEF,
      kind: "responsibility",
      wake_source: "input",
      requires: [{ facet: "competitor fundraising activity" }],
      maintains: [],
    },
  ],
  matches: [
    {
      subscriber: BRIEF,
      requirement: "competitor fundraising activity",
      producer: MONITOR,
      facet: "funding",
    },
  ],
});

const MONITOR_CANON_OUTPUT = JSON.stringify({
  fields: [
    { path: "funding", material: true },
    { path: "fetched_at", material: false },
  ],
  default_material: true,
  facets: [{ facet: "funding", paths: ["funding"] }],
});

const BRIEF_CANON_OUTPUT = JSON.stringify({
  fields: [{ path: "brief", material: true }],
  default_material: true,
  facets: [],
});

const MONITOR_PC_OUTPUT = JSON.stringify({
  postconditions: [
    {
      id: "has-funding",
      mode: "deterministic",
      facet: ATOMIC_FACET,
      // flat encoding (Defect-A $ref-free schema): single leaf node, root = 0
      predicate: {
        nodes: [{ kind: "equals", fact: "has_funding", value: false }],
        root: 0,
      },
      source: "every competitor view must carry at least one funding event",
    },
  ],
});

const BRIEF_PC_OUTPUT = JSON.stringify({ postconditions: [] });

async function compileSmallestProject(): Promise<CompiledProject> {
  return compileProject({
    contractsDir: FIXTURE_DIR,
    options: { skill: "TEST SKILL" },
    perStep: {
      forme: { provider: fakeStructuredProvider(FORME_OUTPUT) },
      canonicalizer: {
        byNode: {
          [MONITOR]: { provider: fakeStructuredProvider(MONITOR_CANON_OUTPUT) },
          [BRIEF]: { provider: fakeStructuredProvider(BRIEF_CANON_OUTPUT) },
        },
      },
      postcondition: {
        byNode: {
          [MONITOR]: { provider: fakeStructuredProvider(MONITOR_PC_OUTPUT) },
          [BRIEF]: { provider: fakeStructuredProvider(BRIEF_PC_OUTPUT) },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// The caller's facts projection: the monitor's CANDIDATE funding file → the
// `has_funding` fact its compiled predicate reads. The brief has no
// deterministic validators (empty set), so its projection is empty.
// ---------------------------------------------------------------------------

function factsFor(node: string): FactsProjection {
  if (node !== MONITOR) {
    return () => ({});
  }
  return (files: WorldModelFiles) => {
    const bytes = files[FUNDING_PATH];
    if (bytes === undefined) {
      return {};
    }
    const parsed = JSON.parse(readTextFile(bytes)) as { funding: unknown[] };
    return { has_funding: parsed.funding.length > 0 };
  };
}

// GOTCHA 1's other half (identical to run-project.test.ts): project the
// producer's funding file into the structured value its canonicalizer reduces.
function projectTruthFor(node: string): TruthProjection {
  if (node !== MONITOR) {
    return () => ({});
  }
  return (files: WorldModelFiles) => {
    const bytes = files[FUNDING_PATH];
    return bytes === undefined ? {} : JSON.parse(readTextFile(bytes));
  };
}

// ---------------------------------------------------------------------------
// The FAKE renders. Each attempt reports cost tokens fresh:1, so a receipt's
// fresh-token total counts ATTEMPTS — the honest multi-attempt sum is exact.
// ---------------------------------------------------------------------------

interface StubObservations {
  monitorInvocations: number;
  briefInvocations: number;
  /** Every `commit_gate_retry` the monitor stub observed (undefined = absent). */
  monitorRetryFields: (CommitGateRetry | undefined)[];
}

function newObservations(): StubObservations {
  return { monitorInvocations: 0, briefInvocations: 0, monitorRetryFields: [] };
}

/**
 * The stub render: the monitor writes EMPTY funding (`has_funding` false → the
 * compiled predicate trips) unless `fixOnRetry` and the commit-gate retry field
 * is present, in which case it writes real funding. The brief always writes its
 * brief body. Workspace-write + harvest, the same seam a live render hits.
 */
function buildStubRender(
  store: WorldModelStore,
  obs: StubObservations,
  opts: { fixOnRetry: boolean; alwaysValid?: boolean },
): AsyncMountedRender {
  return async (ctx: RenderContext) => {
    if (ctx.node === MONITOR) {
      obs.monitorInvocations += 1;
      obs.monitorRetryFields.push(ctx.commit_gate_retry);
      const valid =
        opts.alwaysValid === true ||
        (opts.fixOnRetry && ctx.commit_gate_retry !== undefined);
      const funding = valid ? ["acme:series-a"] : [];
      store.writeWorkspace(ctx.node, {
        [FUNDING_PATH]: new TextEncoder().encode(
          JSON.stringify({ funding, fetched_at: "t1" }),
        ),
      });
    } else {
      obs.briefInvocations += 1;
      store.writeWorkspace(ctx.node, {
        [BRIEF_PATH]: new TextEncoder().encode("brief derived from funding"),
      });
    }
    return {
      world_model: store.read(ctx.node, "workspace").files,
      cost: {
        provider: "fake",
        model: "fake",
        tokens: { fresh: 1, reused: 0 },
        surprise_cause: ctx.wake.source,
      },
    };
  };
}

function dirs(): { wm: string; storage: string } {
  return {
    wm: mkdtempSync(join(tmpdir(), "opgate-wm-")),
    storage: mkdtempSync(join(tmpdir(), "opgate-st-")),
  };
}

function chainOk(ledger: MutableReceiptLedger, node: string): void {
  const chain = ledger.all().filter((r) => r.node === node);
  const result = verifyReceiptChain(chain);
  ok(result.ok, `receipt chain for ${node} must verify`);
}

// ===========================================================================

test("commit gate: a postcondition-violating render is re-rendered with the failures fed back, commits on retry, and its ONE receipt sums both attempts", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();
    const obs = newObservations();

    const { reactor, bootResults } = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: {
        buildRender: (store) =>
          buildStubRender(store, obs, { fixOnRetry: true }),
        projectTruthFor,
      },
      commitGate: { enforcePostconditions: true, maxCommitRetries: 1, factsFor },
    });

    // The monitor RENDERED (the retry passed the gate) and committed real,
    // valid funding truth.
    equal(dispositionOf(bootResults, MONITOR), "rendered");
    const monitorRead = reactor.store.read(MONITOR, "published");
    ok(monitorRead.ref.version !== null);
    const committed = JSON.parse(
      readTextFile(monitorRead.files[FUNDING_PATH] as Uint8Array),
    ) as { funding: string[] };
    deepEqual(committed.funding, ["acme:series-a"]);

    // The render body ran TWICE (violate, then fix) but exactly ONE receipt
    // landed — and its cost HONESTLY sums both attempts (fresh 1 + 1 = 2).
    equal(obs.monitorInvocations, 2);
    const monitorReceipts = reactor.ledger
      .all()
      .filter((r) => r.node === MONITOR);
    equal(monitorReceipts.length, 1);
    equal(monitorReceipts[0]?.status, "rendered");
    equal(monitorReceipts[0]?.cost.tokens.fresh, 2);

    // Attempt 1 carried NO retry field; attempt 2 carried the deterministic
    // failure feedback (the tripped `has-funding` validator, 2/2).
    equal(obs.monitorRetryFields[0], undefined);
    const retry = obs.monitorRetryFields[1];
    ok(retry !== undefined);
    equal(retry?.attempt, 2);
    equal(retry?.max_attempts, 2);
    equal(retry?.failures.length, 1);
    equal(retry?.failures[0]?.id, "has-funding");
    equal(retry?.failures[0]?.kind, "deterministic");

    // The committed (valid) truth PROPAGATED: the brief woke and rendered once,
    // unwrapped semantics (its compiled validator set is EMPTY — gate pass-through).
    equal(dispositionOf(bootResults, BRIEF), "rendered");
    equal(obs.briefInvocations, 1);
    const briefReceipts = reactor.ledger.all().filter((r) => r.node === BRIEF);
    equal(briefReceipts.length, 1);
    equal(briefReceipts[0]?.cost.tokens.fresh, 1);

    // Per-node chains verify.
    chainOk(reactor.ledger, MONITOR);
    chainOk(reactor.ledger, BRIEF);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("commit gate: an always-invalid render fails CLOSED — failed receipt, nothing commits, downstream never wakes", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();
    const obs = newObservations();

    const { reactor, bootResults } = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: {
        buildRender: (store) =>
          buildStubRender(store, obs, { fixOnRetry: false }),
        projectTruthFor,
      },
      commitGate: { enforcePostconditions: true, maxCommitRetries: 1, factsFor },
    });

    // The gate refused every attempt: disposition `failed`, one FAILED receipt
    // whose cost still honestly sums both attempts (the spend was real).
    equal(dispositionOf(bootResults, MONITOR), "failed");
    equal(obs.monitorInvocations, 2);
    const monitorReceipts = reactor.ledger
      .all()
      .filter((r) => r.node === MONITOR);
    equal(monitorReceipts.length, 1);
    equal(monitorReceipts[0]?.status, "failed");
    equal(monitorReceipts[0]?.cost.tokens.fresh, 2);

    // NOTHING committed — cold boot, so the published version is still null
    // (the prior truth — here, "no truth yet" — stands).
    equal(reactor.store.read(MONITOR, "published").ref.version, null);

    // Downstream NEVER woke: a failed render propagates nothing. No brief
    // receipt, no brief boot result, no brief render invocation.
    equal(obs.briefInvocations, 0);
    equal(
      bootResults.find((r) => r.node === BRIEF),
      undefined,
    );
    equal(reactor.ledger.all().filter((r) => r.node === BRIEF).length, 0);

    // The failed receipt still chain-verifies.
    chainOk(reactor.ledger, MONITOR);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("commit gate OFF (default): the same violating render commits in ONE attempt — behavior identical to today", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();
    const obs = newObservations();

    const { reactor, bootResults } = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: {
        buildRender: (store) =>
          buildStubRender(store, obs, { fixOnRetry: false }),
        projectTruthFor,
      },
      // NO commitGate — the experiment is opt-in; default off.
    });

    // Today's behavior exactly: one render, one `rendered` receipt, fresh 1,
    // the (postcondition-violating!) empty-funding truth commits unchecked,
    // and the render context never carried the retry field.
    equal(dispositionOf(bootResults, MONITOR), "rendered");
    equal(obs.monitorInvocations, 1);
    deepEqual(obs.monitorRetryFields, [undefined]);
    const monitorReceipts = reactor.ledger
      .all()
      .filter((r) => r.node === MONITOR);
    equal(monitorReceipts.length, 1);
    equal(monitorReceipts[0]?.status, "rendered");
    equal(monitorReceipts[0]?.cost.tokens.fresh, 1);
    ok(reactor.store.read(MONITOR, "published").ref.version !== null);

    chainOk(reactor.ledger, MONITOR);
    chainOk(reactor.ledger, BRIEF);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("commit gate: zero-token memo-skips stay FREE — a restart boot never reaches the gate or the factsFor", async () => {
  const d = dirs();
  // The SAME durable storage adapter instance stands in for the on-disk receipt
  // trail across both boots (the restart-survival idiom).
  const storage = createMemoryStorageAdapter();
  try {
    const compiled = await compileSmallestProject();

    // --- process 1: boot once with VALID output, enforcement ON.
    const obs1 = newObservations();
    const first = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage,
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: {
        buildRender: (store) =>
          buildStubRender(store, obs1, { fixOnRetry: false, alwaysValid: true }),
        projectTruthFor,
      },
      commitGate: { enforcePostconditions: true, maxCommitRetries: 1, factsFor },
    });
    equal(dispositionOf(first.bootResults, MONITOR), "rendered");
    equal(dispositionOf(first.bootResults, BRIEF), "rendered");
    equal(obs1.monitorInvocations, 1);
    const receiptsBefore = first.reactor.ledger.all().length;
    const monitorFpBefore = first.reactor.store.publishedFingerprints(MONITOR);

    // --- process 2: a BRAND NEW reactor over the SAME dirs, enforcement still
    // ON, with a factsFor that THROWS if the gate ever evaluates. The boot
    // memo-skips PRE-spawn, so the wrapper (and this projection) is never
    // reached — the skip is structurally zero-token and zero-gate.
    const obs2 = newObservations();
    let factsForCalls = 0;
    const throwingFactsFor = (node: string): FactsProjection => {
      factsForCalls += 1;
      throw new Error(
        `factsFor must never be called on a memo-skip (node ${node})`,
      );
    };

    const second = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage,
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: {
        buildRender: (store) =>
          buildStubRender(store, obs2, { fixOnRetry: false }),
        projectTruthFor,
      },
      commitGate: {
        enforcePostconditions: true,
        maxCommitRetries: 1,
        factsFor: throwingFactsFor,
      },
    });

    // All-skips: no render ran, the gate never evaluated, the trail grew by
    // exactly ONE cheap `skipped` receipt, fingerprints unchanged.
    equal(obs2.monitorInvocations, 0);
    equal(obs2.briefInvocations, 0);
    equal(factsForCalls, 0);
    equal(dispositionOf(second.bootResults, MONITOR), "skipped");
    equal(
      second.bootResults.find((r) => r.node === BRIEF),
      undefined,
    );
    deepEqual(
      second.reactor.store.publishedFingerprints(MONITOR),
      monitorFpBefore,
    );
    equal(second.reactor.ledger.all().length, receiptsBefore + 1);
    equal(second.reactor.ledger.all().at(-1)?.status, "skipped");
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("commit gate: a THROWING facts projection (malformed candidate bytes) fails closed as indeterminate — retry-eligible, cost kept honest", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();
    const obs = newObservations();

    // The stub writes MALFORMED JSON on attempt 1 (the projection's JSON.parse
    // throws) and valid funding on the retry.
    const malformedThenValid = (store: WorldModelStore): AsyncMountedRender => {
      return async (ctx: RenderContext) => {
        if (ctx.node === MONITOR) {
          obs.monitorInvocations += 1;
          obs.monitorRetryFields.push(ctx.commit_gate_retry);
          const body =
            ctx.commit_gate_retry === undefined
              ? "{not json"
              : JSON.stringify({ funding: ["acme:series-a"], fetched_at: "t1" });
          store.writeWorkspace(ctx.node, {
            [FUNDING_PATH]: new TextEncoder().encode(body),
          });
        } else {
          obs.briefInvocations += 1;
          store.writeWorkspace(ctx.node, {
            [BRIEF_PATH]: new TextEncoder().encode("brief derived from funding"),
          });
        }
        return {
          world_model: store.read(ctx.node, "workspace").files,
          cost: {
            provider: "fake",
            model: "fake",
            tokens: { fresh: 1, reused: 0 },
            surprise_cause: ctx.wake.source,
          },
        };
      };
    };

    const { reactor, bootResults } = await runProject({
      compiled,
      adapters: {
        clock: createSystemClockAdapter(),
        storage: createMemoryStorageAdapter(),
        worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
      },
      render: { buildRender: malformedThenValid, projectTruthFor },
      commitGate: { enforcePostconditions: true, maxCommitRetries: 1, factsFor },
    });

    // The projection throw did NOT escape the wrapper: it degraded to a
    // synthetic `indeterminate` gate failure, the retry got the feedback, and
    // the valid retry committed — one receipt summing both attempts.
    equal(dispositionOf(bootResults, MONITOR), "rendered");
    equal(obs.monitorInvocations, 2);
    const retry = obs.monitorRetryFields[1];
    ok(retry !== undefined);
    equal(retry?.failures[0]?.id, "facts-projection");
    equal(retry?.failures[0]?.kind, "indeterminate");
    const monitorReceipts = reactor.ledger
      .all()
      .filter((r) => r.node === MONITOR);
    equal(monitorReceipts.length, 1);
    equal(monitorReceipts[0]?.status, "rendered");
    equal(monitorReceipts[0]?.cost.tokens.fresh, 2);

    chainOk(reactor.ledger, MONITOR);
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("commit gate BOOT GUARD: enforcement without factsFor over deterministic validators refuses LOUDLY before boot", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();

    await rejects(
      () =>
        runProject({
          compiled,
          adapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
          },
          render: {
            buildRender: (store) =>
              buildStubRender(store, newObservations(), { fixOnRetry: true }),
            projectTruthFor,
          },
          // Enforcement ON, but NO factsFor — the monitor carries a
          // deterministic validator, so this is the permanent-fail-closed
          // footgun the guard refuses.
          commitGate: { enforcePostconditions: true, maxCommitRetries: 1 },
        }),
      (err: unknown) => {
        ok(err instanceof Error);
        ok(err.message.includes(MONITOR));
        ok(err.message.includes("factsFor"));
        return true;
      },
    );

    // The guard fired BEFORE boot: nothing ever rendered or committed.
    equal(
      new FileSystemWorldModelStore({ directory: d.wm })
        .read(MONITOR, "published")
        .ref.version,
      null,
    );
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});

test("commit gate BOOT GUARD: a coarsened (ref-only) postcondition shape and a malformed retry budget refuse legibly", async () => {
  const d = dirs();
  try {
    const compiled = await compileSmallestProject();

    // (b) Hand-coarsen the monitor's postconditions to the persisted REF only —
    // the reactor-cli IR-cache shape. Under enforcement that must be a loud
    // refusal (silent non-enforcement is the failure mode the guard kills).
    const monitorNode = compiled.perNode[MONITOR];
    ok(monitorNode);
    const coarsened = {
      ...compiled,
      perNode: {
        ...compiled.perNode,
        [MONITOR]: {
          ...monitorNode,
          postconditions: { ref: monitorNode?.postconditions.ref },
        },
      },
    } as unknown as CompiledProject;

    await rejects(
      () =>
        runProject({
          compiled: coarsened,
          adapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
          },
          render: {
            buildRender: (store) =>
              buildStubRender(store, newObservations(), { fixOnRetry: true }),
            projectTruthFor,
          },
          commitGate: { enforcePostconditions: true, factsFor },
        }),
      (err: unknown) => {
        ok(err instanceof Error);
        ok(err.message.includes(MONITOR));
        ok(err.message.includes("postcondition"));
        return true;
      },
    );

    // (c) A malformed retry budget refuses with a TypeError before boot.
    await rejects(
      () =>
        runProject({
          compiled,
          adapters: {
            clock: createSystemClockAdapter(),
            storage: createMemoryStorageAdapter(),
            worldModel: new FileSystemWorldModelStore({ directory: d.wm }),
          },
          render: {
            buildRender: (store) =>
              buildStubRender(store, newObservations(), { fixOnRetry: true }),
            projectTruthFor,
          },
          commitGate: {
            enforcePostconditions: true,
            maxCommitRetries: -1,
            factsFor,
          },
        }),
      (err: unknown) => {
        ok(err instanceof TypeError);
        ok(err.message.includes("maxCommitRetries"));
        return true;
      },
    );

    // Nothing committed in either refusal.
    equal(
      new FileSystemWorldModelStore({ directory: d.wm })
        .read(MONITOR, "published")
        .ref.version,
      null,
    );
  } finally {
    rmSync(d.wm, { recursive: true, force: true });
    rmSync(d.storage, { recursive: true, force: true });
  }
});
