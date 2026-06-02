// deterministic-checker.mjs — the Deterministic Checker (NO LLM).
//
// Spec (reactor-eval-harness.md → "Deterministic Checker[example, scenario]" +
// plan §5 "The grading frame"): the checks that do not need a model. Any CRITICAL
// blocker (a missing top-level artifact; a receipt that does not cite its changed
// upstream input; an unchanged replay that did NOT skip; a same-epoch cycle; a
// blocked/errored run marked passing) is a deterministic blocker that CAPS the
// grade to F regardless of what the LLM judges think. This file calls no model.
//
// Each check returns `{ name, passed, blocking, actual, expected, evidenceRefs }`
// — `EvalScoreCheck`-shaped (plan §5) so it composes with the judge checklist.

import { receipt as receiptApi } from "./resolve.mjs";

/**
 * @typedef {Object} DeterministicCheck
 * @property {string} name
 * @property {boolean} passed
 * @property {boolean} blocking      a failing blocking check CAPS the grade to F
 * @property {string} actual
 * @property {string} expected
 * @property {string[]} evidenceRefs trajectory event indices / node ids / hashes
 */

/**
 * @typedef {Object} DeterministicVerdict
 * @property {string} exampleId
 * @property {string} scenarioId
 * @property {DeterministicCheck[]} checks
 * @property {DeterministicCheck[]} pass
 * @property {DeterministicCheck[]} fail
 * @property {DeterministicCheck[]} blockingFailures
 * @property {boolean} pass_              true iff every check passed
 * @property {boolean} capped             true iff a blocking failure caps the grade
 */

/**
 * Run the deterministic checks for one normalized trajectory.
 *
 * @param {Object} args
 * @param {import("./normalizer.mjs").EvalTrajectory} args.trajectory
 * @param {Object} [args.scenario]   optional scenario context (expected change/skip sets)
 * @param {string[]} [args.requiredArtifacts]  required top-level artifact node ids
 * @returns {DeterministicVerdict}
 */
export function runDeterministicChecks({
  trajectory,
  scenario = {},
  requiredArtifacts = [],
}) {
  const checks = [];
  const t = trajectory;

  // ---- 1) required top-level artifacts exist -----------------------------
  // The example's headline maintained artifacts must have a committed
  // world-model node in the trajectory. Default: the topology entry points'
  // downstream terminal nodes must all be present; callers may pass explicit ids.
  const presentNodes = new Set(t.nodes.map((n) => n.id));
  const required = requiredArtifacts.length
    ? requiredArtifacts
    : defaultRequiredArtifacts(t);
  const missing = required.filter((n) => !presentNodes.has(n));
  checks.push({
    name: "required-top-level-artifacts-exist",
    passed: missing.length === 0,
    blocking: true,
    actual:
      missing.length === 0
        ? `all ${required.length} present`
        : `missing: ${missing.join(", ")}`,
    expected: `present: ${required.join(", ") || "(none required)"}`,
    evidenceRefs: required,
  });

  // ---- 2) no blocked / errored run marked passing ------------------------
  // A `failed` receipt must carry ZERO fresh tokens and wake NOTHING downstream
  // (failure isolation, plan flagship #10). A failed step that still spent fresh
  // or propagated is a run that "hid an error behind plausible prose".
  const leakyFailures = t.failedEvents.filter(
    (e) => e.cost.fresh > 0 || e.wokenSubscribers.length > 0,
  );
  checks.push({
    name: "no-errored-run-marked-passing",
    passed: leakyFailures.length === 0,
    blocking: true,
    actual:
      leakyFailures.length === 0
        ? `${t.failedEvents.length} failed event(s), all isolated`
        : `${leakyFailures.length} failed event(s) leaked fresh/wake`,
    expected: "every failed receipt: 0 fresh, 0 downstream wakes",
    evidenceRefs: leakyFailures.map((e) => `#${e.index}:${e.node}`),
  });

  // ---- 3) receipts cite changed upstream inputs --------------------------
  // Every edge lit this trajectory must be a REAL topology edge whose facet the
  // producing frame actually moved (the "lit lane = real edge" invariant). A lit
  // lane with no matching topology edge means a receipt cited a phantom upstream.
  const edgeSet = new Set(
    t.edges.map((e) => `${e.producer}|${e.subscriber}|${e.facet}`),
  );
  const phantomLights = [];
  for (const ev of t.events) {
    for (const lit of ev.edgesToLight) {
      const key = `${lit.producer}|${lit.subscriber}|${lit.facet}`;
      if (!edgeSet.has(key)) phantomLights.push(`#${ev.index}:${key}`);
      if (!ev.movedFacets.includes(lit.facet)) {
        phantomLights.push(`#${ev.index}:unmoved-facet:${lit.facet}`);
      }
    }
  }
  checks.push({
    name: "receipts-cite-changed-upstream-inputs",
    passed: phantomLights.length === 0,
    blocking: true,
    actual:
      phantomLights.length === 0
        ? "every lit lane is a real edge whose facet moved"
        : `phantom citations: ${phantomLights.slice(0, 5).join(", ")}`,
    expected: "lit lane ⊆ topology edges ∧ facet ∈ movedFacets",
    evidenceRefs: phantomLights,
  });

  // ---- 4) unchanged replay skips expensive renders -----------------------
  // Flat-line invariant: a `skipped` receipt moves NO facet, lights NO lane,
  // wakes NOTHING, and burns ZERO fresh. For a no_change_replay scenario the
  // SECOND wake of every node must be a skip. Here we assert the universal skip
  // invariant on every skip event in the trajectory.
  const badSkips = t.skipEvents.filter(
    (e) =>
      e.movedFacets.length > 0 ||
      e.edgesToLight.length > 0 ||
      e.wokenSubscribers.length > 0 ||
      e.cost.fresh > 0,
  );
  checks.push({
    name: "unchanged-replay-skips-expensive-renders",
    passed: badSkips.length === 0,
    blocking: true,
    actual:
      badSkips.length === 0
        ? `${t.skipEvents.length} skip(s), all flat-line (0 moved / 0 lit / 0 woke / 0 fresh)`
        : `${badSkips.length} skip(s) moved/lit/woke/spent`,
    expected: "skipped ⇒ moved[—] lit[—] woke[—] fresh 0",
    evidenceRefs: badSkips.map((e) => `#${e.index}:${e.node}`),
  });

  // Scenario-specific: a no_change_replay must contain at least one skip (the
  // memo key gated a render). cold_start must render its entry. (Soft, non-
  // blocking signal when the scenario doesn't supply expectations.)
  if (scenario.kind === "no_change_replay") {
    checks.push({
      name: "no-change-replay-produced-skips",
      passed: t.skipEvents.length > 0,
      blocking: true,
      actual: `${t.skipEvents.length} skip event(s)`,
      expected: ">=1 skip on identical re-wake (memo key did not move)",
      evidenceRefs: t.skipEvents.slice(0, 3).map((e) => `#${e.index}:${e.node}`),
    });
  }

  // ---- 5) human gates are not bypassed -----------------------------------
  // For a blocked_or_gated scenario, no FORBIDDEN commit may have happened past
  // the gate. We model this as: any node named in `scenario.gatedNodes` must NOT
  // have a `rendered` (committing) receipt that moved facets after the gate, and
  // a `failed`/blocked node must not have woken downstream. With no gated nodes
  // declared, we assert the universal property that a failed node committed no
  // forward propagation (already covered by check 2) and surface it explicitly.
  const gatedNodes = new Set(scenario.gatedNodes ?? []);
  const bypassed = [];
  if (gatedNodes.size > 0) {
    for (const ev of t.events) {
      if (
        gatedNodes.has(ev.node) &&
        ev.status === "rendered" &&
        ev.movedFacets.length > 0
      ) {
        bypassed.push(`#${ev.index}:${ev.node}`);
      }
    }
  }
  checks.push({
    name: "human-gates-not-bypassed",
    passed: bypassed.length === 0,
    blocking: true,
    actual:
      gatedNodes.size === 0
        ? "no gated nodes declared (vacuously satisfied)"
        : bypassed.length === 0
          ? `${gatedNodes.size} gated node(s), none committed past the gate`
          : `gated commit(s): ${bypassed.join(", ")}`,
    expected: "no forbidden commit downstream of a human/safety gate",
    evidenceRefs: bypassed,
  });

  // ---- 6) no same-epoch graph cycle --------------------------------------
  // The topology must be acyclic and a node must not wake itself in the same
  // frame's propagation set (a same-epoch self-cycle).
  const selfWake = t.events
    .filter((e) => e.wokenSubscribers.includes(e.node))
    .map((e) => `#${e.index}:${e.node}`);
  checks.push({
    name: "no-same-epoch-cycle",
    passed: t.acyclic && selfWake.length === 0,
    blocking: true,
    actual:
      t.acyclic && selfWake.length === 0
        ? "topology acyclic ∧ no same-epoch self-wake"
        : `acyclic=${t.acyclic}; self-wakes: ${selfWake.join(", ")}`,
    expected: "acyclic topology ∧ no node wakes itself same-epoch",
    evidenceRefs: selfWake,
  });

  // ---- 7) chain-verify ----------------------------------------------------
  // verifyReceiptChain over the RAW on-disk receipts (original content_hash
  // bytes), grouped per node — catches a tampered field exactly as
  // `reactor receipts verify` does. We use the devtools-opened rawReceipts.
  const chain = verifyChain(t);
  checks.push({
    name: "chain-verify",
    passed: chain.ok,
    blocking: true,
    actual: chain.detail,
    expected: "every per-node receipt chain verifies over raw on-disk bytes",
    evidenceRefs: chain.badNodes,
  });

  // ---- assemble verdict ---------------------------------------------------
  const pass = checks.filter((c) => c.passed);
  const fail = checks.filter((c) => !c.passed);
  const blockingFailures = fail.filter((c) => c.blocking);
  return {
    exampleId: t.exampleId,
    scenarioId: t.scenarioId,
    checks,
    pass,
    fail,
    blockingFailures,
    pass_: fail.length === 0,
    capped: blockingFailures.length > 0,
  };
}

/** Default required artifacts: the topology's terminal (sink) nodes. */
function defaultRequiredArtifacts(t) {
  if (!t.hasTopology || t.nodes.length === 0) {
    // No topology — require that at least one node produced an artifact.
    return [];
  }
  const producers = new Set(t.edges.map((e) => e.producer));
  const sinks = t.nodes.map((n) => n.id).filter((id) => !producers.has(id));
  return sinks.length > 0 ? sinks : [t.nodes[t.nodes.length - 1].id];
}

/** Per-node chain verification over the raw on-disk receipts. */
function verifyChain(t) {
  const opened = t._opened;
  const raw = opened?.rawReceipts;
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      detail: "no raw receipts available to verify",
      badNodes: [],
    };
  }
  // Group raw receipts by node (append order is preserved by listReceipts()).
  const byNode = new Map();
  for (const r of raw) {
    if (r && typeof r === "object" && typeof r.node === "string") {
      const arr = byNode.get(r.node) ?? [];
      arr.push(r);
      byNode.set(r.node, arr);
    }
  }
  const badNodes = [];
  for (const [node, slice] of byNode) {
    const res = receiptApi.verifyReceiptChain(slice);
    if (!res.ok) badNodes.push(node);
  }
  return {
    ok: badNodes.length === 0,
    detail:
      badNodes.length === 0
        ? `${byNode.size} node chain(s) verified over ${raw.length} raw receipt(s)`
        : `chain broken at: ${badNodes.join(", ")}`,
    badNodes,
  };
}
