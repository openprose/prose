// The github-star-enricher GENERATOR — produces a deterministic, replayable
// `replay/` state-dir for the OpenProse growth loop: new GitHub stars become a
// per-stargazer intelligence fan-out, company enrichment is memoized and SHARED
// across stargazers, expensive external calls are cost-gated, and the terminal
// artifact is a human-reviewed outreach packet that NEVER auto-sends.
//
// It is a sibling of the devtools fixtures and the `surprise-cost` example: it
// drives the REAL `@openprose/reactor` reconciler with deterministic fake renders
// (NO model key, NO network — a DRY-RUN/synthetic-safe GitHub + Exa adapter) over
// the FileSystem store + ledger, then writes the same full state-dir shape so
// reactor-devtools can replay it unchanged.
//
// THE FIVE LESSONS (each a load-bearing, asserted property):
//
//   1. LIVE EXTERNAL SIGNAL → STABLE RECEIPTS. The `star-events` gateway turns a
//      batch of new stars into normalized truth, exposing ONE facet per starring
//      user (`user:<login>`). It is the single external-driven entry point.
//
//   2. PER-PERSON FAN-OUT. Each eligible stargazer gets an INDEPENDENT footprint
//      mapper → person resolver → intent scorer lane. A new star on one user
//      perturbs only that user's facet; the sibling lanes stay dark.
//
//   3. SHARED COMPANY RECEIPTS. Company enrichment is keyed by COMPANY identity,
//      not by person. Two stargazers (alice, bob) who both work at `acme`
//      subscribe to ONE shared `company.acme` receipt — a DIAMOND fan-in. The
//      company resolver renders ONCE; both downstream intent lanes consume the
//      same receipt. A third stargazer (casey) at a different company has her own.
//
//   4. COST-GATED EXTERNAL CALLS. Expensive Exa People enrichment runs ONLY for
//      users whose cheap GitHub signal clears the configured threshold. A
//      low-signal user (casey) lands in `watch`/`defer`: her person resolver
//      memo-SKIPS the Exa call (fresh 0), and no sample is ever built for her.
//
//   5. A HARD HUMAN GATE. The high-fit user (alice) produces pain hypotheses, a
//      selected OpenProse sample program, and an execution-backed sample result;
//      the outreach packet reaches `ready_for_review` and STOPS. The system
//      drafts and packages — it NEVER auto-sends. The human-review gateway is the
//      only thing that can advance a packet past review.
//
// THE TENET: a node renders IFF its memo key (contract_fingerprint,
// input_fingerprints) actually moved. A quiet re-poll (the same stars, no new
// evidence) memo-skips the whole graph: cost scales with surprise, not with how
// often you poll GitHub.
//
// `cost.surprise_cause` is ALWAYS read off `ctx.wake.source` (the reconciler
// verifies this invariant on commit) — never hardcoded.
//
// State-dir shape (identical to the devtools fixtures):
//   replay/receipts.json              (durable append-only ledger trail, FLAT root)
//   replay/world-models/<hexNodeId>/… (per-node published truth + version history)
//   replay/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   replay/compile/labels.json        (nodeId → friendly label for the SPA)
//   replay/beats.json                 (the scripted beat map, self-written so a
//                                       regen is LOSSLESS)

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  createFileSystemStorageAdapter,
  files,
  jsonFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
  type Wake,
} from "@openprose/reactor";
import {
  FileSystemWorldModelStore,
  FileSystemReceiptLedger,
  readTextFile,
  fingerprintArtifact,
  type WorldModelStore,
  type WorldModelFiles,
} from "@openprose/reactor/adapters";
import {
  zeroCost,
  createNullSignature,
  EMPTY_SEMANTIC_DIFF,
  type Fingerprint,
  type Facet,
  type TopologyWorldModel,
  type TopologyNode,
  type TopologyEdge,
} from "@openprose/reactor/internals";

import type {
  RenderContext,
  RenderProduct,
  RenderFailure,
} from "@openprose/reactor";
import type {
  ReconcilerTopology,
} from "@openprose/reactor/internals";

// ---------------------------------------------------------------------------
// The synthetic-safe world. THREE stargazers from a single batch of new stars.
// alice + bob both work at `acme` (the shared-company diamond); casey is a
// low-signal stargazer at `solo` whose Exa enrichment is cost-gated OFF.
// No network, no key — this is the dry-run GitHub/Exa adapter, baked in.
// ---------------------------------------------------------------------------

const USERS = ["alice", "bob", "casey"] as const;
type User = (typeof USERS)[number];

// The cheap GitHub footprint signal each user carries (the dry-run GitHub
// adapter's output). `signal` is the 0..1 fit score the Intent & Safety Scorer
// reads; `company` is the company identity the footprint resolves to (the SHARED
// enrichment key). alice is high-fit at acme; bob is mid-fit at acme (shared
// company, different person); casey is low-fit at her own solo project.
const FOOTPRINTS: Record<User, { signal: number; company: string; headline: string }> = {
  alice: { signal: 0.86, company: "acme", headline: "maintains a 40-repo monorepo; hand-rolls release notes weekly" },
  bob: { signal: 0.61, company: "acme", headline: "runs the acme support rotation; triages issues by hand" },
  casey: { signal: 0.22, company: "solo", headline: "occasional weekend hacker; one tiny starred gist" },
};

// The enrichment config (the EnrichmentConfig gateway, baked as a constant for
// the dry run). The Exa People/Company threshold is the cost gate: a user below
// it never triggers the expensive external call.
const ENRICH_THRESHOLD = 0.5;
// The sample-build gate: only a user at/above this fit gets a sample program.
const SAMPLE_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Node identities. The phantom ingress source (the raw GitHub star webhook /
// poll cursor) is NOT a topology node — it is the edge of the world the gateway
// watches (mirrors the devtools fixtures + the surprise-cost example).
// ---------------------------------------------------------------------------

const SOURCE = "ingress.star-events"; // the phantom edge of the world the gateway watches
const GATEWAY = "gateway.star-events"; // entry point; external-driven
const REGISTRY = "responsibility.registry"; // dedupes events, gates eligibility
const FOOTPRINT = (u: User) => `responsibility.footprint-${u}`;
const PERSON = (u: User) => `responsibility.person-${u}`;
const COMPANY = (key: string) => `responsibility.company-${key}`;
const INTENT = (u: User) => `responsibility.intent-${u}`;
const SAMPLE = (u: User) => `responsibility.sample-${u}`;
const OUTREACH = (u: User) => `responsibility.outreach-${u}`;
const HUMAN_REVIEW = "gateway.human-review"; // external-driven; the human gate

// The distinct companies in this episode (alice+bob → acme [shared]; casey → solo).
const COMPANIES = ["acme", "solo"] as const;
const COMPANY_OF: Record<User, string> = {
  alice: "acme",
  bob: "acme",
  casey: "solo",
};
// Which users map to each company (the diamond fan-in members).
const USERS_OF_COMPANY: Record<string, User[]> = {
  acme: ["alice", "bob"],
  solo: ["casey"],
};

const LABELS: Record<string, string> = {
  [GATEWAY]: "GitHub Star Events",
  [REGISTRY]: "Stargazer Registry",
  [HUMAN_REVIEW]: "Human Review Events",
  ...Object.fromEntries(USERS.map((u) => [FOOTPRINT(u), `Footprint [${cap(u)}]`])),
  ...Object.fromEntries(USERS.map((u) => [PERSON(u), `Person Resolver [${cap(u)}]`])),
  ...Object.fromEntries(COMPANIES.map((c) => [COMPANY(c), `Company Resolver [${cap(c)}]`])),
  ...Object.fromEntries(USERS.map((u) => [INTENT(u), `Intent & Safety [${cap(u)}]`])),
  ...Object.fromEntries(USERS.map((u) => [SAMPLE(u), `Sample Program [${cap(u)}]`])),
  ...Object.fromEntries(USERS.map((u) => [OUTREACH(u), `Outreach Packet [${cap(u)}]`])),
};

function cap(s: string): string {
  return s.length === 0 ? s : `${s[0]!.toUpperCase()}${s.slice(1)}`;
}

// ---------------------------------------------------------------------------
// The cost model. Fresh tokens scale with how much NEW material a render had to
// digest; reused tokens are the prior frame + contract carried for free. The
// reconciler stamps skipped/failed receipts with zero fresh automatically, so a
// quiet re-poll is a flat line and real surprise is a spike off it. The Exa
// enrichment + sample-build are the EXPENSIVE nodes (the cost the gate protects).
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 150;
const REUSED_FLOOR = 120;
const EXA_FRESH_MULTIPLIER = 6; // an Exa People/Company call is ~6× a local render
const SAMPLE_FRESH_MULTIPLIER = 9; // building + running a sample program is the heaviest

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
  freshPerUnit = FRESH_PER_UNIT,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * freshPerUnit)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    // THE INVARIANT: the cause of the spend IS the wake that drove it. Read it
    // off the context — never hardcode it.
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// Reading upstream truth by reference (what a fake render does).
// ---------------------------------------------------------------------------

function readJson<T = Record<string, unknown>>(
  store: WorldModelStore,
  node: string,
  path = "truth.json",
): T | null {
  const read = store.read(node, "published");
  if (read.ref.version === null) return null;
  const bytes = read.files[path];
  if (bytes === undefined) return null;
  return JSON.parse(readTextFile(bytes)) as T;
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// A DEBUGGABLE render failure. The default thrown-render path stamps the failed
// receipt with `provider/model = "none"` and `fresh 0`, a bare `failed`
// disposition with no clue WHICH external call broke. We make the failure
// legible on two durable surfaces of the on-disk receipt: the reconciler
// persists this `reason` onto the failed receipt (under
// `semantic_diff.failure_reason`, secret-scrubbed before it is written), and we
// also name the failing adapter on the `cost` (`provider`/`model`) so the spend
// attribution records WHICH expensive external call failed. The cost is
// attributed to the real wake source (NEVER hardcoded). A real failure is now
// debuggable rather than an anonymous red node.
function failedRender(
  ctx: RenderContext,
  failure: { provider: string; model: string; reason: string },
): RenderFailure {
  return {
    failed: true,
    reason: failure.reason,
    cost: {
      provider: failure.provider,
      model: failure.model,
      tokens: { fresh: 0, reused: 0 },
      // THE INVARIANT holds on failures too: the cause of the (zero) spend is the
      // wake that drove the attempt. Read it off the context — never hardcode it.
      surprise_cause: ctx.wake.source,
    },
  };
}

// A facet-less producer exposes its whole truth as the atomic facet — the
// canonicalizer maps the artifact's fingerprint onto ATOMIC_FACET (never "*").
const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// The gateway exposes ONE facet per starring user — the per-person fan-out
// boundary. A new star on `alice` perturbs ONLY the `user:alice` facet; the
// sibling lanes stay dark.
const USER_FACET = (u: User): Facet => `user:${u}`;
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruthOf(fm);
  const stars = (t["stars"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const u of USERS) out[USER_FACET(u)] = fingerprintArtifact(files({ "u.json": jsonFile(stars[u] ?? null) }));
  return out;
};

// The registry exposes ONE eligibility facet per user — only users that are
// newly eligible (not suppressed, not already contacted) advance.
const ELIGIBLE_FACET = (u: User): Facet => `eligible:${u}`;
const registryCanon = (fm: WorldModelFiles) => {
  const t = readTruthOf(fm);
  const elig = (t["eligible"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: fingerprintArtifact(fm) };
  for (const u of USERS) out[ELIGIBLE_FACET(u)] = fingerprintArtifact(files({ "e.json": jsonFile(elig[u] ?? null) }));
  return out;
};

function readTruthOf(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

// A footprint mapper exposes its WHOLE truth on ATOMIC_FACET (the person resolver
// subscribes here — a re-attempt nonce bump moves it ⇒ the Exa People call is
// re-driven), PLUS a narrower `company-signal` facet projecting ONLY the
// company-enrichment inputs (eligible / signal / company). The SHARED company
// resolver subscribes to `company-signal`, so a person-lane RETRY (attempt bump)
// does NOT wake the shared company render — the company is still enriched ONCE.
const COMPANY_SIGNAL_FACET: Facet = "company-signal";
const footprintCanon = (fm: WorldModelFiles) => {
  const t = readTruthOf(fm);
  const signalSlice = {
    eligible: t["eligible"] ?? false,
    signal: t["signal"] ?? 0,
    company: t["company"] ?? null,
    clears: t["clears_enrichment_threshold"] ?? false,
  };
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [COMPANY_SIGNAL_FACET]: fingerprintArtifact(files({ "s.json": jsonFile(signalSlice) })),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

type Render = (ctx: RenderContext) => RenderProduct | RenderFailure;

/** One starring user's normalized star slice (the dry-run GitHub adapter's row). */
interface Star {
  readonly repo: string;
  readonly starred_at: string;
  /**
   * A monotonic evidence counter on the star. New GitHub evidence on a SINGLE
   * user (a fresh star, a new public footprint signal) bumps this — moving ONLY
   * that user's `user:<login>` gateway facet (and downstream, ONLY that user's
   * `eligible:<login>` registry facet). The sibling lanes never see it move.
   */
  readonly evidence: number;
  /**
   * A per-user render-RETRY counter. Bumping it (like `evidence`) moves ONLY this
   * user's gateway + eligibility facet, but the footprint folds it into its
   * ATOMIC truth (the person resolver subscribes) WITHOUT touching its
   * `company-signal` facet — so a retry re-drives ONLY that user's person
   * resolver (the Exa recovery beat) and never re-runs the shared company render.
   */
  readonly retry: number;
}

interface Deps {
  readonly store: WorldModelStore;
  /** The current human-review truth (approvals / suppressions). */
  readonly review: () => Record<User, string | null>;
  /**
   * Per-user Exa availability (the dry-run Exa adapter's circuit breaker). When a
   * user's flag is `false` the expensive Exa People call is DOWN — the person
   * resolver fails LOUDLY with a debuggable cause rather than fabricating truth.
   */
  readonly exaUp: () => Record<User, boolean>;
}

// The gateway: normalize the raw star batch into per-user truth. It reads the
// phantom SOURCE ingress truth BY REFERENCE (the published star batch the poller
// re-publishes) — NOT the mutable in-memory map — so a re-poll only re-renders
// when the SOURCE truth actually moved. The canonicalizer projects each user's
// slice into an independent facet token.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const src = readJson<{ stars?: Record<string, Star | null> }>(deps.store, SOURCE);
    const stars = (src?.stars ?? {}) as Record<string, Star | null>;
    let moved = 0;
    const projected: Record<string, unknown> = {};
    for (const u of USERS) {
      projected[u] = stars[u] ?? null;
      if (stars[u]) moved += 1;
    }
    return commit({ stars: projected, watched: USERS.length }, renderCost(ctx, Math.max(1, moved), 1));
  };
}

// The human-review gateway: normalize the owner's review actions (approve / edit
// / send_mark / suppress) into the review-ledger truth the registry + outreach
// packets subscribe to. The second external-driven entry point.
function humanReviewRender(deps: Deps): Render {
  return (ctx) => {
    const review = deps.review();
    return commit({ review }, renderCost(ctx, 1, 1));
  };
}

// The registry: dedupe events, decide per-user eligibility. A user is eligible
// iff they have a star AND are not suppressed/already-contacted by the human
// review ledger. The eligibility facet moves only when that decision changes.
function registryRender(deps: Deps): Render {
  return (ctx) => {
    // Read the gateway's published star truth + the human-review ledger BY
    // REFERENCE (the two producers this node subscribes to). Reading the
    // upstream published truth — not the mutable map — is what makes the memo
    // story honest: the registry only re-renders when a gateway facet moved.
    const gw = readJson<{ stars?: Record<string, Star | null> }>(deps.store, GATEWAY);
    const stars = (gw?.stars ?? {}) as Record<string, Star | null>;
    const hr = readJson<{ review?: Record<string, string | null> }>(deps.store, HUMAN_REVIEW);
    const review = (hr?.review ?? {}) as Record<string, string | null>;
    const eligible: Record<string, { user: User; first_seen: string; evidence: number; retry: number } | null> = {};
    let count = 0;
    for (const u of USERS) {
      const suppressed = review[u] === "suppress";
      const contacted = review[u] === "sent";
      eligible[u] =
        stars[u] && !suppressed && !contacted
          ? { user: u, first_seen: stars[u]!.starred_at, evidence: stars[u]!.evidence, retry: stars[u]!.retry }
          : null;
      if (eligible[u]) count += 1;
    }
    return commit({ eligible, eligible_count: count }, renderCost(ctx, Math.max(1, count), 1));
  };
}

// A per-user GitHub footprint mapper: the CHEAP local enrichment. It reads only
// its own eligibility facet off the registry and emits the user's GitHub
// signal + resolved company key. This is the cost gate's INPUT — Exa never fires
// unless this cheap signal clears the threshold.
function footprintRender(deps: Deps, user: User): Render {
  return (ctx) => {
    const reg = readJson(deps.store, REGISTRY);
    const elig = ((reg?.["eligible"] ?? {}) as Record<string, unknown>)[user];
    if (elig == null) {
      // Not eligible (suppressed / no star): emit an empty footprint.
      return commit({ user, eligible: false, signal: 0, company: null }, renderCost(ctx, 1, 1));
    }
    const fp = FOOTPRINTS[user];
    // The retry counter rides in on this user's own eligibility facet (the only
    // thing the footprint reads). It is folded into the ATOMIC truth but EXCLUDED
    // from the `company-signal` facet — so a retry re-drives the person resolver
    // without re-running the shared company render.
    const attempt = ((elig as Record<string, unknown>)["retry"] ?? 0) as number;
    return commit(
      {
        user,
        eligible: true,
        signal: fp.signal,
        company: fp.company,
        headline: fp.headline,
        // the cost gate decision, made on CHEAP GitHub evidence alone.
        clears_enrichment_threshold: fp.signal >= ENRICH_THRESHOLD,
        // render-attempt provenance: bumps ONLY when this user's lane is
        // deliberately re-driven (e.g. a person-resolver retry after an Exa
        // recovery). 0 in the steady state ⇒ does not perturb the cold cascade.
        attempt,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// A per-user person resolver: the EXPENSIVE Exa People enrichment, COST-GATED.
// It reads its own footprint; if the GitHub signal did NOT clear the threshold it
// returns a CHEAP "deferred" truth (no Exa call). Only above-threshold users pay
// the ~6× Exa fresh cost. (A dry-run Exa adapter — no network.)
function personRender(deps: Deps, user: User): Render {
  return (ctx) => {
    const fp = readJson(deps.store, FOOTPRINT(user));
    const clears = (fp?.["clears_enrichment_threshold"] ?? false) as boolean;
    if (!clears) {
      // COST GATE CLOSED: skip the Exa People call entirely. Cheap "deferred".
      return commit(
        { user, enriched: false, reason: "below enrichment threshold — Exa People not called", exa_sources: [] },
        renderCost(ctx, 1, 0),
      );
    }
    // COST GATE OPEN: the Exa People call is warranted. But the call can FAIL
    // (a dry-run Exa outage / circuit breaker). A failed external call must be
    // LOUD and debuggable — not a fabricated truth — so we fail with the adapter
    // named on the cost and a human-readable cause. The reconciler logs a
    // `failed` receipt, the prior truth stands, and NOTHING downstream wakes.
    if (!deps.exaUp()[user]) {
      return failedRender(ctx, {
        provider: "exa",
        model: "exa-people",
        reason: `Exa People enrichment failed for ${user}: upstream 503 (circuit breaker open) — prior identity stands, no downstream woken`,
      });
    }
    // pay for the Exa People call (the ~6× expensive render).
    const company = (fp?.["company"] ?? null) as string | null;
    return commit(
      {
        user,
        enriched: true,
        likely_employer: company,
        likely_role: user === "alice" ? "platform engineer" : "support lead",
        exa_sources: [`exa://people/${user}`, `exa://profile/${user}`],
        identity_confidence: 0.8,
      },
      renderCost(ctx, 4, 1, FRESH_PER_UNIT * EXA_FRESH_MULTIPLIER),
    );
  };
}

// A per-company resolver: the SHARED enrichment. It is keyed by COMPANY identity
// and subscribes to the footprints of EVERY user who maps to it (a DIAMOND
// fan-in: alice + bob → company.acme). It renders ONCE per company and both
// downstream intent lanes consume the SAME receipt — company spend is paid once,
// not once-per-stargazer. (A dry-run Exa Company adapter — no network.)
function companyRender(deps: Deps, companyKey: string): Render {
  return (ctx) => {
    const members = USERS_OF_COMPANY[companyKey] ?? [];
    // Read the member footprints by reference; enrich the company once.
    const memberSignals: string[] = [];
    let anyClears = false;
    for (const u of members) {
      const fp = readJson(deps.store, FOOTPRINT(u));
      if (fp?.["eligible"]) memberSignals.push(u);
      if (fp?.["clears_enrichment_threshold"]) anyClears = true;
    }
    if (!anyClears) {
      // No eligible member clears the gate → cheap "deferred" company truth.
      return commit(
        { company: companyKey, enriched: false, members: memberSignals, reason: "no member clears enrichment threshold" },
        renderCost(ctx, 1, 0),
      );
    }
    return commit(
      {
        company: companyKey,
        enriched: true,
        members: memberSignals,
        product: companyKey === "acme" ? "B2B billing platform" : "solo side project",
        engineering_surface: companyKey === "acme" ? "40-repo monorepo, weekly releases" : "one small repo",
        likely_operational_burdens: companyKey === "acme" ? ["release notes", "support triage"] : [],
        exa_company_sources: [`exa://company/${companyKey}`],
        identity_confidence: 0.75,
      },
      // shared company enrichment: paid ONCE, ~6× expensive.
      renderCost(ctx, 4, 1, FRESH_PER_UNIT * EXA_FRESH_MULTIPLIER),
    );
  };
}

// A per-user intent & safety scorer: fans in the user's footprint + person +
// the SHARED company receipt and decides a recommended track. It exposes a
// `track` facet that gates the expensive sample build downstream.
const TRACK_FACET: Facet = "track";
const intentCanon = (fm: WorldModelFiles) => {
  const t = readTruthOf(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [TRACK_FACET]: fingerprintArtifact(files({ "t.json": jsonFile(t["recommended_track"] ?? null) })),
  };
};

function intentRender(deps: Deps, user: User): Render {
  return (ctx) => {
    const fp = readJson(deps.store, FOOTPRINT(user));
    const person = readJson(deps.store, PERSON(user));
    const company = readJson(deps.store, COMPANY(COMPANY_OF[user]));
    const signal = (fp?.["signal"] ?? 0) as number;
    // The recommended track. Prefer false negatives over creepy outreach: a
    // low-signal user lands in `watch`/`defer` and never reaches a sample build.
    let track: "defer" | "watch" | "build_sample";
    if (signal >= SAMPLE_THRESHOLD) track = "build_sample";
    else if (signal >= ENRICH_THRESHOLD) track = "watch";
    else track = "defer";
    return commit(
      {
        user,
        fit_score: signal,
        recommended_track: track,
        company_context: (company?.["product"] ?? null) as unknown,
        enriched_identity: (person?.["enriched"] ?? false) as boolean,
        contact_risk: signal < ENRICH_THRESHOLD ? "high" : "low",
      },
      renderCost(ctx, 1, 2),
    );
  };
}

// A per-user sample program builder + runner: the HEAVIEST node. It subscribes
// to ONLY the intent `track` facet, so it stays DARK unless the track is
// `build_sample` (a high-fit user). It builds a tiny OpenProse program for the
// user's pain and runs it on synthetic-safe inputs — the execution-backed
// artifact the outreach packet carries.
function sampleRender(deps: Deps, user: User): Render {
  return (ctx) => {
    const intent = readJson(deps.store, INTENT(user));
    const company = readJson(deps.store, COMPANY(COMPANY_OF[user]));
    const track = (intent?.["recommended_track"] ?? "defer") as string;
    if (track !== "build_sample") {
      // The gate is closed — emit a cheap "no sample" truth (no heavy build).
      return commit({ user, built: false, reason: `track is ${track}, not build_sample` }, renderCost(ctx, 1, 0));
    }
    const burdens = (company?.["likely_operational_burdens"] ?? []) as string[];
    const pain = burdens[0] ?? "manual reporting";
    // Build + run a tiny synthetic-safe OpenProse program (a dry-run Sample
    // Runner — no harness call, no network: a deterministic sample artifact).
    return commit(
      {
        user,
        built: true,
        program_name: `${pain.replace(/\s+/g, "-")}-radar`,
        responsibility: `Maintain a ${pain} digest that only re-writes when the underlying repos move.`,
        run_inputs: { source: "public/synthetic-safe", repos: ["acme/monorepo (sampled)"] },
        sample_artifact: `Sample brief for ${pain}: drafted from 3 synthetic commits; 1 release note generated.`,
        limitations: ["dry-run inputs", "public evidence only", "no private data accessed"],
        run_status: "dry-run-ok",
      },
      // build + run: the single tallest fresh spike (the artifact is the value).
      renderCost(ctx, 4, 2, FRESH_PER_UNIT * SAMPLE_FRESH_MULTIPLIER),
    );
  };
}

// A per-user outreach packet: the HUMAN GATE. It fans in the intent + sample +
// human-review truth. It NEVER auto-sends: its status reaches `ready_for_review`
// (when a sample exists and the human has not yet acted) or `blocked` (no sample)
// or, ONLY after a human acts via the review gateway, `sent_by_human`.
function outreachRender(deps: Deps, user: User): Render {
  return (ctx) => {
    const intent = readJson(deps.store, INTENT(user));
    const sample = readJson(deps.store, SAMPLE(user));
    const review = deps.review();
    const built = (sample?.["built"] ?? false) as boolean;
    const track = (intent?.["recommended_track"] ?? "defer") as string;

    let status: "blocked" | "ready_for_review" | "sent_by_human" | "archived";
    if (review[user] === "sent") status = "sent_by_human"; // ONLY a human advances it
    else if (review[user] === "suppress") status = "archived";
    else if (built && track === "build_sample") status = "ready_for_review";
    else status = "blocked";

    return commit(
      {
        user,
        status,
        note: built
          ? `I built a tiny OpenProse sample for ${user} from public context. Is it useful?`
          : null,
        sample_result_summary: (sample?.["sample_artifact"] ?? null) as unknown,
        human_review_checklist: ["claims grounded in public evidence", "no private data", "not over-personalized"],
        auto_send: false, // INVARIANT: the system never auto-sends.
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly.
// ---------------------------------------------------------------------------

interface NodeDecl {
  readonly id: string;
  readonly kind: "gateway" | "responsibility";
  readonly requires: readonly { producer: string; facet?: Facet }[];
  readonly render: Render;
  readonly canonicalizer: (fm: WorldModelFiles) => Record<string, Fingerprint>;
  /** The frozen contract fingerprint for this node. */
  readonly contractFingerprint: Fingerprint;
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = d.contractFingerprint;

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: d.contractFingerprint,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => d.id);
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(e.subscriber);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return false;
    if (state.get(n) === 2) return true;
    state.set(n, 1);
    for (const next of adj.get(n) ?? []) if (!visit(next)) return false;
    state.set(n, 2);
    return true;
  };
  for (const n of declared) if (!visit(n)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The beat map. Committed beside the state-dir, self-written by THIS generator
// so a regeneration is lossless (no separate hand-authored beats.json to
// clobber). Frame indices are tuned against the receipt trail this generator
// emits.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "github-star-enricher",
  title:
    "New GitHub stars fan out into per-stargazer intelligence. Company enrichment is shared, expensive calls are cost-gated, and the outreach packet NEVER auto-sends.",
  beats: [
    {
      name: "cold-fan-out",
      park: 1,
      from: 0,
      to: 12,
      holdMs: 3000,
      caption: "a batch of new stars · the registry dedupes · three per-person lanes light up",
    },
    {
      name: "shared-company",
      park: 8,
      from: 5,
      to: 12,
      holdMs: 3200,
      caption: "alice + bob both at acme · the company resolver renders ONCE · both lanes share the receipt",
    },
    {
      name: "cost-gate",
      park: 10,
      from: 8,
      to: 12,
      holdMs: 3000,
      caption: "casey is low-signal · her Exa People call is gated OFF · no sample is built for her",
    },
    {
      name: "human-gate",
      park: 12,
      from: 11,
      to: 12,
      holdMs: 3400,
      caption: "alice's sample is built + run · the packet reaches ready_for_review · it STOPS — never auto-sent",
    },
    {
      name: "move-one-stargazer",
      park: 15,
      from: 13,
      to: 16,
      holdMs: 3200,
      caption: "new evidence on ALICE alone · only her lane lights · bob + casey stay DARK · absorbed at the footprint",
    },
    {
      name: "exa-fails",
      park: 18,
      from: 17,
      to: 19,
      holdMs: 3200,
      caption: "Exa People is DOWN for bob · person-bob fails LOUD (provider=exa) · prior identity stands · nothing downstream",
    },
    {
      name: "exa-recovers",
      park: 21,
      from: 20,
      to: 22,
      holdMs: 3000,
      caption: "Exa is back · bob's lane heals · the shared acme company render is STILL not re-run",
    },
    {
      name: "quiet-repoll",
      park: 25,
      from: 23,
      to: 27,
      holdMs: 3000,
      caption: "a re-poll with the same stars · the whole graph memo-SKIPS · cost flat near zero",
    },
  ],
};

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the state-dir to (re)create. */
  readonly stateDir: string;
  /** Wipe an existing dir first (default true) for a clean, deterministic build. */
  readonly clean?: boolean;
}

export interface GenerateResult {
  readonly stateDir: string;
  readonly receiptsCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly facets: readonly Facet[];
}

// The frozen contract fingerprints (one per node; stable across regenerations).
function fp(id: string): Fingerprint {
  return `contract:${id}@v1`;
}

/**
 * Build the deterministic github-star-enricher state-dir at `opts.stateDir`.
 * Drives the cold-fan-out → shared-company → cost-gate → human-gate → quiet-repoll
 * beat timeline through the REAL `@openprose/reactor` reconciler over the
 * FileSystem store + ledger (NO model key, NO network), then writes
 * `compile/topology.json` + `compile/labels.json` + `beats.json`. Re-running with
 * the same path reproduces the bytes.
 */
export function generateGithubStarEnricherFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });

  // The mutable external state the dry-run adapters project.
  const stars: Record<User, Star | null> = {
    alice: { repo: "openprose/prose", starred_at: "2026-06-01T09:00:00Z", evidence: 1, retry: 0 },
    bob: { repo: "openprose/prose", starred_at: "2026-06-01T09:01:00Z", evidence: 1, retry: 0 },
    casey: { repo: "openprose/prose", starred_at: "2026-06-01T09:02:00Z", evidence: 1, retry: 0 },
  };
  const review: Record<User, string | null> = { alice: null, bob: null, casey: null };
  // Every user's Exa adapter starts UP; a beat below trips one to model an outage.
  const exaUp: Record<User, boolean> = { alice: true, bob: true, casey: true };

  const deps: Deps = {
    store,
    review: () => review,
    exaUp: () => exaUp,
  };

  // ---- The node declarations (one mount set; topology is stable). ----
  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      // The gateway watches the phantom SOURCE ingress (the re-published star
      // batch). A re-poll moves a SOURCE facet only when the batch actually
      // changed — that is what lets the gateway re-render new evidence (and
      // memo-skip a quiet re-poll). SOURCE is NOT a topology node; it is the edge
      // of the world (mirrors the news-desk / surprise-cost ingress pattern).
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
      contractFingerprint: fp(GATEWAY),
    },
    {
      id: HUMAN_REVIEW,
      kind: "gateway",
      // The human-review gateway is the SECOND external-driven entry point — the
      // owner approves, edits, sends, or suppresses a packet. It has no upstream;
      // it maintains the review ledger truth the registry + outreach packets read.
      requires: [],
      render: humanReviewRender(deps),
      canonicalizer: atomicTruth,
      contractFingerprint: fp(HUMAN_REVIEW),
    },
    {
      id: REGISTRY,
      kind: "responsibility",
      // The registry watches the gateway's whole truth (atomic) + the human
      // review ledger (suppressions advance/retract eligibility).
      requires: [
        { producer: GATEWAY, facet: ATOMIC_FACET },
        { producer: HUMAN_REVIEW, facet: ATOMIC_FACET },
      ],
      render: registryRender(deps),
      canonicalizer: registryCanon,
      contractFingerprint: fp(REGISTRY),
    },
    // Per-user footprint mappers — each subscribes to ONLY its own eligibility
    // facet (the per-person fan-out boundary).
    ...USERS.map<NodeDecl>((u) => ({
      id: FOOTPRINT(u),
      kind: "responsibility",
      requires: [{ producer: REGISTRY, facet: ELIGIBLE_FACET(u) }],
      render: footprintRender(deps, u),
      // Two facets: ATOMIC_FACET (the person resolver subscribes — a retry nonce
      // bump re-drives the Exa call) + `company-signal` (the SHARED company
      // resolver subscribes — a retry does NOT re-run the shared enrichment).
      canonicalizer: footprintCanon,
      contractFingerprint: fp(FOOTPRINT(u)),
    })),
    // Per-user person resolvers — the cost-gated Exa People enrichment.
    ...USERS.map<NodeDecl>((u) => ({
      id: PERSON(u),
      kind: "responsibility",
      requires: [{ producer: FOOTPRINT(u), facet: ATOMIC_FACET }],
      render: personRender(deps, u),
      canonicalizer: atomicTruth,
      contractFingerprint: fp(PERSON(u)),
    })),
    // Per-company resolvers — the SHARED enrichment (diamond fan-in). Each
    // subscribes to the footprints of EVERY member user.
    ...COMPANIES.map<NodeDecl>((c) => ({
      id: COMPANY(c),
      kind: "responsibility",
      // The shared enrichment subscribes to each member's `company-signal` facet
      // (eligible / signal / company) — NOT the whole footprint — so a person-lane
      // retry (attempt bump) never re-runs the company render.
      requires: (USERS_OF_COMPANY[c] ?? []).map((u) => ({ producer: FOOTPRINT(u), facet: COMPANY_SIGNAL_FACET })),
      render: companyRender(deps, c),
      canonicalizer: atomicTruth,
      contractFingerprint: fp(COMPANY(c)),
    })),
    // Per-user intent & safety scorers — fan in footprint + person + SHARED
    // company receipt.
    ...USERS.map<NodeDecl>((u) => ({
      id: INTENT(u),
      kind: "responsibility",
      requires: [
        { producer: FOOTPRINT(u), facet: ATOMIC_FACET },
        { producer: PERSON(u), facet: ATOMIC_FACET },
        { producer: COMPANY(COMPANY_OF[u]), facet: ATOMIC_FACET },
      ],
      render: intentRender(deps, u),
      canonicalizer: intentCanon,
      contractFingerprint: fp(INTENT(u)),
    })),
    // Per-user sample program builder — subscribes to ONLY the intent `track`
    // facet (stays dark unless track is build_sample).
    ...USERS.map<NodeDecl>((u) => ({
      id: SAMPLE(u),
      kind: "responsibility",
      requires: [{ producer: INTENT(u), facet: TRACK_FACET }],
      render: sampleRender(deps, u),
      canonicalizer: atomicTruth,
      contractFingerprint: fp(SAMPLE(u)),
    })),
    // Per-user outreach packet — the human gate. Fans in intent + sample + the
    // human review ledger; NEVER auto-sends.
    ...USERS.map<NodeDecl>((u) => ({
      id: OUTREACH(u),
      kind: "responsibility",
      requires: [
        { producer: INTENT(u), facet: ATOMIC_FACET },
        { producer: SAMPLE(u), facet: ATOMIC_FACET },
        { producer: HUMAN_REVIEW, facet: ATOMIC_FACET },
      ],
      render: outreachRender(deps, u),
      canonicalizer: atomicTruth,
      contractFingerprint: fp(OUTREACH(u)),
    })),
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The poller: re-publish the current star batch to the phantom SOURCE ingress
  // (a manual external receipt linked into SOURCE's own chain) and wake the
  // gateway. When the batch is byte-identical to the prior publish the gateway
  // memo-skips and the graph below it stays dark (the quiet re-poll). When a
  // single user's slice moved, ONLY that user's gateway facet moves. This is the
  // canonical ingress pattern (news-desk / surprise-cost): the gateway re-renders
  // new evidence because its INPUT (SOURCE) moved — not because it was re-poked.
  const publishStarsAndWake = (): readonly ReturnType<typeof dag.ingest>[number][] => {
    const fm = files({ "truth.json": jsonFile({ stars }) });
    const commitRes = store.commitPublished(SOURCE, fm, atomicTruth);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: SOURCE,
      contract_fingerprint: `contract:${SOURCE}@ingress`,
      wake,
      input_fingerprints: [],
      fingerprints: commitRes.fingerprints,
      semantic_diff: EMPTY_SEMANTIC_DIFF,
      prev: prevRef,
      status: "rendered",
      cost: zeroCost("external"),
      sig: createNullSignature(),
    });
    return dag.ingest(GATEWAY);
  };

  // ======================================================================
  // The scripted beat timeline over ONE ledger.
  // ======================================================================

  // --- Beat 1-4: COLD FAN-OUT + SHARED COMPANY + COST GATE + HUMAN GATE. A batch
  // of new stars arrives. Publish the batch to SOURCE + wake the gateway (the big
  // cold cascade), then ingest the (empty) human-review gateway. The whole graph
  // lights up once:
  //   - the registry dedupes → three eligibility facets move;
  //   - three footprint lanes render (per-person fan-out);
  //   - alice + bob clear the gate → their person resolvers PAY for Exa; casey is
  //     below threshold → her person resolver renders CHEAP (gate closed);
  //   - the acme company resolver renders ONCE (shared by alice + bob); solo once;
  //   - intent scores: alice build_sample, bob watch, casey defer;
  //   - ONLY alice's sample program builds + runs (the heaviest spike);
  //   - alice's outreach packet reaches ready_for_review and STOPS.
  publishStarsAndWake(); // the big cold fan-out cascade
  dag.ingest(HUMAN_REVIEW); // publish the (empty) review ledger the packets subscribe to

  // --- Beat 5: MOVE ONE STARGAZER (per-person fan-out, replay-backed). New GitHub
  // evidence lands on ALICE alone — a fresh star bumps ONLY alice's evidence. The
  // gateway's `user:alice` facet moves ⇒ ONLY the registry's `eligible:alice` facet
  // moves ⇒ ONLY alice's footprint lane is woken. bob's and casey's footprints stay
  // DARK (their facets never moved). And because alice's footprint re-renders to
  // BYTE-IDENTICAL truth (her signal/company/attempt are unchanged), the move is
  // ABSORBED at the footprint boundary: nothing deeper re-runs. THIS is the
  // README's "move one stargazer / sibling lanes stay dark" claim, on the trail.
  stars.alice = { ...stars.alice!, evidence: stars.alice!.evidence + 1, starred_at: "2026-06-01T11:30:00Z" };
  publishStarsAndWake(); // -> gateway+registry+footprint-alice render; bob/casey lanes dark

  // --- Beat 6: AN EXTERNAL CALL FAILS (LOUD, DEBUGGABLE). The Exa People adapter
  // goes DOWN for bob (a 503 / open circuit breaker). We re-drive bob's lane (a
  // retry bump on his star moves ONLY his footprint ATOMIC facet — the shared
  // `company-signal` facet does NOT move, so the acme company render is NOT re-run).
  // bob's person resolver attempts the Exa call and FAILS: a `failed` receipt whose
  // COST names the adapter (`provider: "exa"`, `model: "exa-people"`) and whose
  // reason states the cause — debuggable, not an anonymous red node. The prior
  // identity stands and NOTHING downstream of person-bob wakes (a failure
  // propagates nothing, exactly like a skip).
  exaUp.bob = false;
  stars.bob = { ...stars.bob!, retry: stars.bob!.retry + 1 };
  publishStarsAndWake(); // -> footprint-bob re-renders; person-bob FAILS (Exa down)

  // --- Beat 7: RECOVERY. Exa comes back up; we re-drive bob's lane once more. His
  // person resolver now completes the Exa People call and RENDERS — bob's lane
  // heals end-to-end. (The shared acme company render is STILL not re-run: it was
  // paid once and reused throughout.)
  exaUp.bob = true;
  stars.bob = { ...stars.bob!, retry: stars.bob!.retry + 1 };
  publishStarsAndWake(); // -> footprint-bob re-renders; person-bob recovers (renders)

  // --- Beat 8: QUIET RE-POLL. The poller re-fires with the SAME stars and no new
  // review events. Nothing moved ⇒ the memo key is a HIT across the board: the
  // gateway memo-SKIPS, and a skip propagates nothing ⇒ the entire graph stays
  // dark. Cost flat near zero. Cost scales with surprise, not with poll frequency.
  publishStarsAndWake(); // -> gateway:skipped, nothing else woken

  // --- Persist the topology snapshot (MANDATORY for replay) ----------------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(compileDir, "labels.json"), `${JSON.stringify(LABELS, null, 2)}\n`, "utf8");
  writeFileSync(join(stateDir, "beats.json"), `${JSON.stringify(BEATS, null, 2)}\n`, "utf8");

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [
      ATOMIC_FACET,
      ...USERS.map((u) => USER_FACET(u)),
      ...USERS.map((u) => ELIGIBLE_FACET(u)),
      COMPANY_SIGNAL_FACET,
      TRACK_FACET,
    ],
  };
}

// Allow `node generate.js [stateDir]` (and a re-invoke from a package script).
if (require.main === module) {
  const dirArg = process.argv[2];
  const stateDir = dirArg
    ? require("node:path").resolve(dirArg)
    : join(__dirname, "replay");
  const result = generateGithubStarEnricherFixture({ stateDir });
  process.stdout.write(
    `wrote github-star-enricher fixture → ${result.stateDir}\n` +
      `  receipts: ${result.receiptsCount}\n` +
      `  nodes:    ${result.nodeCount}\n` +
      `  edges:    ${result.edgeCount}\n`,
  );
}
