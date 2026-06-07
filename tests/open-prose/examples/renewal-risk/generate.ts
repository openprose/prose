// The renewal-risk fixture GENERATOR — drives the REAL @openprose/reactor
// reconciler with DETERMINISTIC fake renders (no model key) and freezes a
// replayable `replay/` state-dir whose lesson is:
//
//   A STANDING, MAINTAINED TRUTH (customer renewal-health) re-judges ONLY the
//   accounts whose signals actually moved — quiet accounts cost nothing, and a
//   non-material nudge that does not change a verdict never wakes the alert feed.
//
// THE GRAPH (single responsibility + selective wake):
//
//   ingress.account-signals   (phantom edge: the raw signal inbox)
//        │  atomic
//   gateway.account-signals    entry point — exposes ONE facet per account
//        │  acct:<id>          (the selective-wake boundary: one account's slice
//        ▼                      moving perturbs ONLY that account's facet)
//   responsibility.renewal-risk   the standing maintained truth; exposes `risk`
//        │  risk                   (live verdict) + `history` (append-only log)
//        ▼
//   responsibility.renewal-alert-feed   subscribes to `risk` ONLY — dark on a
//                                        non-material re-judgement
//
// THE BEAT ARC (cold → quiet-skip → surprise):
//   1 COLD BOOT       all three nodes render once.
//   2 LONG QUIET      byte-identical re-ticks → the WHOLE graph memo-SKIPS (flat
//                     fresh near zero).
//   3 SELF-TICK FLOOR a self-sourced wake on renewal-risk with no moved input →
//                     a `self` skipped receipt (the audit floor).
//   4 SURPRISE        ONE account (acme) usage drops near renewal → ONLY the
//                     `acct:acme` facet moves → renewal-risk re-judges → its
//                     `risk` facet moves → the alert feed fires (the spike).
//   5 NON-MATERIAL    a second nudge on acme (a tiny usage wobble) re-renders
//                     renewal-risk to a BYTE-IDENTICAL verdict → the `risk` facet
//                     does NOT move → the alert feed MEMO-SKIPS (the dark beat).
//   6 SECOND SURPRISE a different account (globex) churns → its `acct` facet
//                     moves → a second alert spike (cost tracks SURPRISE, not the
//                     number of signal deliveries).
//   7 FINAL QUIET     byte-identical re-ticks → flat again (the bookend).
//
// Determinism: every render is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir.
//
// State-dir shape (matches the devtools fixtures EXACTLY):
//   replay/receipts.json                 flat ROOT ledger trail
//   replay/world-models/<hexNodeId>/…    per-node published truth + history
//   replay/compile/topology.json         the TopologyWorldModel the SPA draws
//   replay/compile/labels.json           nodeId → friendly label
//   replay/beats.json                    the scripted beat timeline (self-written)

import { createHash } from "node:crypto";
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

import type { RenderContext, RenderProduct } from "@openprose/reactor";
import type { ReconcilerTopology } from "@openprose/reactor/internals";

// ---------------------------------------------------------------------------
// Node identities + the accounts in the portfolio.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.account-signals"; // phantom edge: the raw signal inbox
const GATEWAY = "gateway.account-signals"; // entry point; ONE facet per account
const RENEWAL_RISK = "responsibility.renewal-risk"; // the standing maintained truth
const ALERT_FEED = "responsibility.renewal-alert-feed"; // subscribes to `risk` only

const ACCOUNTS = ["acme", "globex", "initech", "umbrella"] as const;
type Account = (typeof ACCOUNTS)[number];

// One facet per account on the gateway — the selective-wake boundary.
const ACCT_FACET: Record<Account, Facet> = Object.fromEntries(
  ACCOUNTS.map((a) => [a, `acct:${a}`]),
) as Record<Account, Facet>;

// The two facets renewal-risk exposes.
const RISK_FACET: Facet = "risk"; // the live verdict the alert feed reads
const HISTORY_FACET: Facet = "history"; // the append-only decision log

const LABELS: Record<string, string> = {
  [SOURCE]: "Signal Inbox",
  [GATEWAY]: "Account Signals",
  [RENEWAL_RISK]: "Renewal Risk",
  [ALERT_FEED]: "Renewal Alert Feed",
};

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (own facet tokens). A
// facet token moves iff its projected sub-value moves.
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    );
  return `{${entries.join(",")}}`;
}

function materialFingerprint(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// The cost model: fresh tokens scale with how much NEW material a render had to
// judge; the parts it reused count as REUSED. The reconciler stamps `skipped`
// receipts with zeroCost (fresh:0). `surprise_cause` MUST equal the wake source.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 200; // fresh tokens per account re-judged
const REUSED_FLOOR = 260; // prior frame + contract always carried

function renderCost(
  ctx: RenderContext,
  freshUnits: number,
  reusedUnits = 0,
): Cost {
  return {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: {
      fresh: Math.max(1, Math.round(freshUnits * FRESH_PER_UNIT)),
      reused: REUSED_FLOOR + reusedUnits * 40,
    },
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The signal payload: a flat per-account map. A "tick" re-publishes the inbox;
// a real change mutates exactly one account's slice (so one acct facet moves).
// ---------------------------------------------------------------------------

interface AccountSignal {
  /** Material: the usage trend bucket (drives the verdict). */
  readonly usage_trend: "steady" | "softening" | "dropping" | "churning";
  /** Material: days until the renewal window opens. */
  readonly renewal_in_days: number;
  /** Material: open support escalations. */
  readonly support_friction: number;
  /** IMMATERIAL: a per-account dispatch counter — a noisy nudge that does NOT
   *  change the canonical verdict inputs (used for the non-material beat). */
  readonly nudge?: number;
}

type SignalInbox = Record<Account, AccountSignal>;

function seedInbox(): SignalInbox {
  // Cold boot: every account is healthy and far from renewal — a cheap cold
  // verdict, so the cold cascade does not plant a tall spike that rivals the
  // surprise beat.
  return Object.fromEntries(
    ACCOUNTS.map((a) => [
      a,
      {
        usage_trend: "steady",
        renewal_in_days: 180,
        support_friction: 0,
      } satisfies AccountSignal,
    ]),
  ) as SignalInbox;
}

// The canonical verdict inputs for an account — a PURE function of the MATERIAL
// signal fields ONLY (usage, renewal timing, friction). The immaterial `nudge`
// is deliberately excluded, so a nudge-only delivery re-renders to a
// byte-identical verdict (the non-material memo-hit downstream).
function verdictInputs(s: AccountSignal): {
  usage_trend: string;
  renewal_in_days: number;
  support_friction: number;
} {
  return {
    usage_trend: s.usage_trend,
    renewal_in_days: s.renewal_in_days,
    support_friction: s.support_friction,
  };
}

// Classify one account's risk from its material signals. Pure + deterministic.
function classify(s: AccountSignal): {
  level: "low" | "medium" | "high";
  evidence: string;
  next_action: string;
} {
  const near = s.renewal_in_days <= 60;
  if ((s.usage_trend === "dropping" || s.usage_trend === "churning") && near) {
    return {
      level: "high",
      evidence: `usage ${s.usage_trend}, renewal in ${s.renewal_in_days}d, ${s.support_friction} open escalations`,
      next_action: "owner reaches out this week with a value review",
    };
  }
  if (s.usage_trend === "softening" || s.support_friction >= 2 || near) {
    return {
      level: "medium",
      evidence: `usage ${s.usage_trend}, renewal in ${s.renewal_in_days}d`,
      next_action: "owner schedules a check-in before the renewal window",
    };
  }
  return {
    level: "low",
    evidence: `usage ${s.usage_trend}, renewal in ${s.renewal_in_days}d`,
    next_action: "monitor on the weekly cadence",
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

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return { world_model: files({ "truth.json": jsonFile(world) }), cost };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes).
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

// The ingress source exposes one facet per account — the fingerprint of ONLY
// that account's MATERIAL verdict inputs. Mutate acme's usage and only the
// `acct:acme` ingress facet moves; a nudge-only change moves nothing here.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["signal-inbox.json"];
  const inbox: Partial<SignalInbox> =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as SignalInbox);
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const a of ACCOUNTS) {
    const s = inbox[a];
    out[ACCT_FACET[a]] = materialFingerprint(s ? verdictInputs(s) : null);
  }
  return out;
};

// THE selective-wake boundary. The gateway re-projects each account's MATERIAL
// signal slice into an INDEPENDENT facet token. An acme-only material change
// moves ONLY `acct:acme`; the sibling accounts are byte-identical, so their
// lanes stay dark. The immaterial `nudge` is excluded here too.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const accts = (t["accounts"] ?? {}) as Record<string, AccountSignal>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const a of ACCOUNTS) {
    out[ACCT_FACET[a]] = materialFingerprint(
      accts[a] ? verdictInputs(accts[a]!) : null,
    );
  }
  return out;
};

// The standing truth exposes TWO facets:
//   - `risk`: the live verdict per account (level + evidence + next action). The
//     alert feed reads this. It moves iff a verdict actually CHANGES — a nudge
//     that leaves every classification put keeps this byte-identical.
//   - `history`: the append-only decision log. It moves on every re-judgement,
//     but the alert feed does NOT subscribe to it.
const renewalRiskCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const accounts = (t["accounts"] ?? {}) as Record<
    string,
    { verdict: { level: string; next_action: string } }
  >;
  // The `risk` facet fingerprints ONLY the ALERTABLE verdict per account — the
  // level + the next action the owner is paged with. A material signal change
  // that re-renders the truth but does NOT change the level/action (e.g. a
  // friction tick within the same band) leaves this facet byte-identical, so the
  // alert feed is never woken — the non-material memo-hit.
  const riskView: Record<string, unknown> = {};
  for (const a of ACCOUNTS) {
    const v = accounts[a]?.verdict;
    if (v) riskView[a] = { level: v.level, next_action: v.next_action };
  }
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [RISK_FACET]: materialFingerprint(riskView),
    [HISTORY_FACET]: materialFingerprint(t["decision_history"] ?? []),
  };
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw signal inbox, normalize into a per-account view.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const inbox = (readJson<Partial<SignalInbox>>(
      deps.store,
      SOURCE,
      "signal-inbox.json",
    ) ?? {}) as Partial<SignalInbox>;
    const accounts: Record<string, AccountSignal> = {};
    for (const a of ACCOUNTS) {
      const s = inbox[a];
      if (s) accounts[a] = s;
    }
    return commit(
      { accounts, watched: ACCOUNTS.length },
      renderCost(ctx, 1, 1),
    );
  };
}

// The standing truth: read its prior verdicts BY REFERENCE, re-judge each
// account from the gateway's signals, carry forward unchanged accounts. The
// `history` facet appends a row only when a verdict actually changes.
function renewalRiskRender(deps: Deps): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const signals = (gw?.["accounts"] ?? {}) as Record<string, AccountSignal>;
    const prior = readJson(deps.store, RENEWAL_RISK);
    const priorAccounts = (prior?.["accounts"] ?? {}) as Record<
      string,
      { verdict: { level: string; evidence: string; next_action: string } }
    >;
    const priorHistory = (prior?.["decision_history"] ?? []) as {
      account: string;
      level: string;
    }[];

    const accounts: Record<
      string,
      { verdict: ReturnType<typeof classify>; renewal_in_days: number }
    > = {};
    const history = [...priorHistory];
    let reJudged = 0;
    for (const a of ACCOUNTS) {
      const s = signals[a];
      if (!s) continue;
      const verdict = classify(s);
      const priorLevel = priorAccounts[a]?.verdict.level;
      if (priorLevel !== verdict.level) {
        // a real verdict change is appended to the decision history.
        history.push({ account: a, level: verdict.level });
        reJudged += 1;
      }
      accounts[a] = { verdict, renewal_in_days: s.renewal_in_days };
    }
    return commit(
      { accounts, decision_history: history },
      renderCost(ctx, Math.max(1, reJudged), 2),
    );
  };
}

// The alert feed: subscribes to `risk` ONLY. It re-renders when the live verdict
// moves and memo-skips when a nudge left every classification put.
function alertFeedRender(deps: Deps): Render {
  return (ctx) => {
    const rr = readJson(deps.store, RENEWAL_RISK);
    const accounts = (rr?.["accounts"] ?? {}) as Record<
      string,
      { verdict: { level: string; evidence: string; next_action: string } }
    >;
    const alerts = ACCOUNTS.flatMap((a) => {
      const v = accounts[a]?.verdict;
      if (!v || v.level === "low") return [];
      return [
        {
          account: a,
          level: v.level,
          cause: v.evidence,
          next_action: v.next_action,
        },
      ];
    }).sort((x, y) => (x.level < y.level ? 1 : x.level > y.level ? -1 : 0));
    return commit(
      { alerts, alert_count: alerts.length },
      renderCost(ctx, Math.max(1, alerts.length), 1),
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
}

function contractFingerprint(decl: NodeDecl): Fingerprint {
  return materialFingerprint({
    kind: decl.kind,
    id: decl.id,
    requires: decl.requires
      .map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`)
      .sort(),
  });
}

function isAcyclic(
  declared: ReadonlySet<string>,
  edges: readonly { subscriber: string; producer: string }[],
): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!declared.has(e.producer) || !declared.has(e.subscriber)) continue;
    (adj.get(e.producer) ?? adj.set(e.producer, []).get(e.producer)!).push(
      e.subscriber,
    );
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

function buildReconcilerTopology(
  decls: readonly NodeDecl[],
): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: d.id,
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: d.id,
      producer: r.producer,
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls
    .filter((d) => d.kind === "gateway")
    .map((d) => d.id);
  const declared = new Set(decls.map((d) => d.id));
  const topology: TopologyWorldModel = {
    nodes,
    edges,
    entry_points,
    acyclic: isAcyclic(declared, edges),
  };
  return { topology, contract_fingerprints };
}

// ---------------------------------------------------------------------------
// The beat timeline self-write (so a regen is lossless: no adjacent
// beats.json is clobbered).
// ---------------------------------------------------------------------------

interface Beat {
  readonly name: string;
  readonly caption: string;
}

const BEATS: readonly Beat[] = [
  {
    name: "cold-boot",
    caption:
      "the portfolio wires up · gateway, the standing truth, the alert feed — lit once",
  },
  {
    name: "quiet",
    caption:
      "re-deliver the same signals · every re-tick memo-skips · cost flat near zero",
  },
  {
    name: "self-tick",
    caption:
      "a weekly self-wake with no moved signal · a self skipped receipt (the floor)",
  },
  {
    name: "surprise",
    caption:
      "acme usage drops near renewal · only acct:acme moves · the verdict flips → an alert fires",
  },
  {
    name: "non-material",
    caption:
      "a tiny usage wobble on acme · the verdict is unchanged · the alert feed memo-SKIPS",
  },
  {
    name: "second-surprise",
    caption:
      "globex churns · a second verdict flip → a second alert (cost tracks surprise)",
  },
  {
    name: "final-quiet",
    caption: "re-deliver the steady state · flat again (the bookend)",
  },
];

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the replay state-dir to (re)create. */
  readonly stateDir: string;
  /** Wipe an existing dir first (default true) for a deterministic build. */
  readonly clean?: boolean;
}

export interface GenerateResult {
  readonly stateDir: string;
  readonly receiptsCount: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly facets: readonly Facet[];
}

/**
 * Build the deterministic renewal-risk replay state-dir at `opts.stateDir`.
 * Drives the scripted beat timeline through the REAL reconciler over the
 * FileSystem store + ledger, then writes compile/topology.json, compile/
 * labels.json, and beats.json. Re-running reproduces the bytes.
 */
export function generateRenewalRiskFixture(
  opts: GenerateOptions,
): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  const worldModelDir = join(stateDir, "world-models");
  const store = new FileSystemWorldModelStore({ directory: worldModelDir });
  const storage = createFileSystemStorageAdapter({ directory: stateDir });
  const ledger = new FileSystemReceiptLedger({ storage });
  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    {
      id: RENEWAL_RISK,
      kind: "responsibility",
      // Subscribes to every per-account facet of the gateway — a single
      // account's material change wakes a re-judgement of THAT account only.
      requires: ACCOUNTS.map((a) => ({
        producer: GATEWAY,
        facet: ACCT_FACET[a],
      })),
      render: renewalRiskRender(deps),
      canonicalizer: renewalRiskCanon,
    },
    {
      id: ALERT_FEED,
      kind: "responsibility",
      // Subscribes to the `risk` facet ONLY (never `history`) — dark on a
      // non-material re-judgement.
      requires: [{ producer: RENEWAL_RISK, facet: RISK_FACET }],
      render: alertFeedRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<
    string,
    { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
  > = {};
  for (const d of decls)
    mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  const inbox: SignalInbox = seedInbox();

  // Re-publish the signal inbox and wake the gateway. A byte-identical inbox
  // memo-skips the whole graph (the quiet re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "signal-inbox.json": jsonFile(inbox) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
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
    dag.ingest(GATEWAY);
  };

  // Mutate exactly one account's slice (⇒ at most one acct facet moves).
  const deliver = (account: Account, patch: Partial<AccountSignal>): void => {
    inbox[account] = { ...inbox[account], ...patch };
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline (cold → quiet-skip → surprise).
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed the steady portfolio; all three nodes render.
  publishAndWake();

  // --- Beat 2: LONG QUIET. Byte-identical re-deliveries — the WHOLE graph
  // memo-skips, the fresh line flat near zero.
  for (let i = 0; i < 8; i++) publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A self-sourced wake on the standing truth with
  // no moved input ⇒ a `self` skipped receipt (the audit floor).
  dag.tick(RENEWAL_RISK);
  dag.tick(RENEWAL_RISK);

  for (let i = 0; i < 3; i++) publishAndWake();

  // --- Beat 4: THE SURPRISE. acme's usage drops AND the renewal window is near.
  // ONLY `acct:acme` moves ⇒ renewal-risk re-judges acme (low → high) ⇒ its
  // `risk` facet moves ⇒ the alert feed fires the spike.
  deliver("acme", { usage_trend: "dropping", renewal_in_days: 30 });

  // --- Beat 5: THE NON-MATERIAL HIT. A tiny usage wobble on acme (only the
  // IMMATERIAL `nudge` bumps; the material verdict inputs are unchanged). The
  // gateway's `acct:acme` facet does NOT move (nudge is excluded), so
  // renewal-risk is not even woken. To show the downstream-skip explicitly we
  // also exercise a verdict-stable material re-judge below.
  deliver("acme", { nudge: 1 });

  // A material-but-verdict-stable change on acme: friction ticks 0 → 1, which
  // does NOT cross a classification threshold (still high). `acct:acme` moves ⇒
  // renewal-risk IS woken and re-renders, but its `risk` verdict is byte-
  // identical ⇒ the `risk` facet does NOT move ⇒ the alert feed MEMO-SKIPS.
  deliver("acme", { support_friction: 1 });

  for (let i = 0; i < 3; i++) publishAndWake();

  // --- Beat 6: SECOND SURPRISE. A different account (globex) churns near its
  // renewal ⇒ `acct:globex` moves ⇒ a second verdict flip ⇒ a second alert.
  deliver("globex", { usage_trend: "churning", renewal_in_days: 20 });

  // --- Beat 7: FINAL QUIET. Byte-identical re-deliveries — flat again.
  for (let i = 0; i < 9; i++) publishAndWake();

  // --- Persist the compile snapshot (MANDATORY for replay) ----------------
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "topology.json"),
    `${JSON.stringify(reconcilerTopology.topology, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(stateDir, "beats.json"),
    `${JSON.stringify(
      {
        scenario: "renewal-risk",
        title:
          "A standing customer-health truth that re-judges ONLY the accounts whose signals moved.",
        beats: BEATS,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [...ACCOUNTS.map((a) => ACCT_FACET[a]), RISK_FACET, HISTORY_FACET],
  };
}
