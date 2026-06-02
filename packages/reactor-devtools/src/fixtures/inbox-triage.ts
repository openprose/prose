// The Inbox Triage fixture GENERATOR — produces a deterministic, replayable
// `<state-dir>` that drives a launch demo (and doubles as a devtools test
// corpus). It is a sibling of `agent-observatory.ts` and `masked-relay.ts` and
// reuses ONLY the public, exported SDK primitives; no SDK change is required.
//
// THE STORY (what the recording must land):
//   The same newsletter hits FIVE inboxes — summarized ONCE. One malformed email
//   fails — your digest still ships.
//
//   An `Inbox Stream` gateway watches a raw mail feed and exposes ONE FACET PER
//   INCOMING EMAIL (`email:<id>`). A `Classifier` per email subscribes to ONLY
//   its own email facet ⇒ a new email to one inbox lights ONLY that classifier
//   lane; the sibling classifier lanes stay DARK (the facet "dark lane"). The
//   classifiers fan into a `Threader` that groups emails by CANONICAL CONTENT and
//   exposes a `thread:<hash>` facet per DISTINCT thread — the fingerprint of ONLY
//   the canonical subject+body, NOT the recipient. So five recipients receiving
//   the SAME newsletter collapse to ONE `thread:<hash>` facet. A per-thread
//   `Thread Render` subscribes to exactly one thread facet: the FIRST identical
//   copy renders the shared thread; the next four DEDUP-SKIP (the diamond). A
//   `Priority` node scores the threads, and a terminal `Digest` fans them in.
//
//   THE FAILURE ISOLATION: one email is malformed — its Classifier render THROWS
//   ⇒ a RED `failed` receipt with NO downstream corruption. The Digest still
//   renders from the healthy threads (the digest still ships). Then the sender
//   re-sends a fixed copy ⇒ the Classifier flashes GREEN (recover).
//
// THE MECHANICAL FIX (MVC, mirrors agent-observatory §R2): the gateway emits
// INDEPENDENT per-email facet tokens, and the threader's `thread:<hash>` facet is
// the fingerprint of ONLY the canonical content. A second recipient of the same
// newsletter perturbs NOTHING the thread-render reads, so its lane stays dark and
// the shared render memo-skips. Siblings do NOT move together — the dark lane is
// REAL.
//
// It persists the SAME full state-dir shape agent-observatory does:
//
//   <state-dir>/receipts.json              (durable append-only ledger trail)
//   <state-dir>/world-models/<node>/…      (per-node published truth + history)
//   <state-dir>/compile/topology.json      (the flat TopologyWorldModel the SPA draws)
//   <state-dir>/compile/labels.json        (nodeId → friendly label for the SPA)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved. Same
// generator ⇒ byte-identical state-dir ⇒ the devtools replays the same animation
// every time.

import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  mountDag,
  fileSystemSubstrate,
  files,
  jsonFile,
  ATOMIC_FACET,
  type Cost,
  type WakeSource,
  type Wake,
  type RenderContext,
  type RenderProduct,
} from "@openprose/reactor";

import {
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
  type ReconcilerTopology, asFacet, asFingerprint, asNodeId} from "@openprose/reactor/internals";

import { materialFingerprint, readJson } from "./_fixture-shared";

// ---------------------------------------------------------------------------
// Node identities (relatable names — the labels the SPA shows come from the
// labels map below; the ids stay namespaced for the topology).
// ---------------------------------------------------------------------------

const SOURCE = "ingress.mail-feed"; // the phantom edge: the raw mail feed
const GATEWAY = "gateway.inbox-stream"; // entry point; ONE facet per incoming email

// The five newsletter copies — same content, five different recipients. Plus a
// few non-newsletter emails so the graph isn't all-newsletter, and a malformed
// email (`bad1`) whose classifier throws.
const NEWSLETTER_IDS = ["nl1", "nl2", "nl3", "nl4", "nl5"] as const;
const OTHER_IDS = ["ship1", "invoice1"] as const;
const BAD_ID = "bad1"; // the malformed email — its classifier throws
// The full set of email ids that EXIST as classifier nodes in the topology.
const EMAIL_IDS = [...NEWSLETTER_IDS, ...OTHER_IDS, BAD_ID] as const;
type EmailId = (typeof EMAIL_IDS)[number];

const CLASSIFIER: Record<EmailId, string> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `responsibility.classifier-${id}`]),
) as Record<EmailId, string>;

const THREADER = "responsibility.threader";

// Distinct thread keys the threader can expose a per-thread render for. The
// newsletter copies all collapse onto `newsletter`; the others get their own.
const THREAD_KEYS = ["newsletter", "ship", "invoice", "alert"] as const;
type ThreadKey = (typeof THREAD_KEYS)[number];

const THREAD_RENDER: Record<ThreadKey, string> = {
  newsletter: "responsibility.thread-newsletter",
  ship: "responsibility.thread-ship",
  invoice: "responsibility.thread-invoice",
  alert: "responsibility.thread-alert",
};

const PRIORITY = "responsibility.priority";
const DIGEST = "responsibility.digest";

// --- Facet tokens -----------------------------------------------------------

// One facet per incoming email on the gateway — the dark-lane boundary. A new
// email to one inbox moves ONLY that email's facet.
const EMAIL_FACET: Record<EmailId, Facet> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `email:${id}`]),
) as Record<EmailId, Facet>;

// One facet per DISTINCT thread on the threader — the diamond/dedup boundary.
// The token is the fingerprint of ONLY the canonical thread content (subject +
// body), so five identical newsletters collapse to ONE `thread:newsletter`
// token that only moves when the SHARED content changes — never on a new
// recipient. That is the dedup: copies 2..5 leave it byte-identical ⇒ the
// per-thread render memo-skips.
const THREAD_FACET: Record<ThreadKey, Facet> = {
  newsletter: asFacet("thread:newsletter"),
  ship: asFacet("thread:ship"),
  invoice: asFacet("thread:invoice"),
  alert: asFacet("thread:alert"),
};

// The cheap rollup facet the Priority + Digest read — moves on every threader
// render (a thread set / membership change).
const ROLLUP_FACET = asFacet("rollup");

// Which thread an email belongs to (its canonical grouping). All five newsletter
// copies map to `newsletter` — that is the collapse.
const THREAD_OF: Record<string, ThreadKey> = {
  nl1: "newsletter",
  nl2: "newsletter",
  nl3: "newsletter",
  nl4: "newsletter",
  nl5: "newsletter",
  ship1: "ship",
  invoice1: "invoice",
  bad1: "alert",
};

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Mail Feed",
  [GATEWAY]: "Inbox Stream",
  [CLASSIFIER.nl1]: "Classifier [nl→alice]",
  [CLASSIFIER.nl2]: "Classifier [nl→bob]",
  [CLASSIFIER.nl3]: "Classifier [nl→carol]",
  [CLASSIFIER.nl4]: "Classifier [nl→dave]",
  [CLASSIFIER.nl5]: "Classifier [nl→erin]",
  [CLASSIFIER.ship1]: "Classifier [shipping]",
  [CLASSIFIER.invoice1]: "Classifier [invoice]",
  [CLASSIFIER.bad1]: "Classifier [alert]",
  [THREADER]: asFingerprint("Threader"),
  [THREAD_RENDER.newsletter]: "Thread Render [newsletter]",
  [THREAD_RENDER.ship]: "Thread Render [shipping]",
  [THREAD_RENDER.invoice]: "Thread Render [invoice]",
  [THREAD_RENDER.alert]: "Thread Render [alert]",
  [PRIORITY]: asFingerprint("Priority"),
  [DIGEST]: "Daily Digest",
};

// ---------------------------------------------------------------------------
// The cost model — what makes the token meter SING.
// ---------------------------------------------------------------------------
//
// Fresh tokens scale with how much NEW material a render had to digest; the
// reconciler stamps `skipped`/`failed` receipts with zeroCost automatically
// (fresh:0 — a flat line). The Threader's fresh is deliberately heavy because it
// re-embeds the WHOLE thread body on a content change; that makes the FIRST
// newsletter copy a visible spike and the next four dedup-skips a flat line.
//
// `surprise_cause` MUST equal the wake source (receipt validation enforces it).

const FRESH_PER_UNIT = 180; // fresh tokens per unit of new material digested
const REUSED_FLOOR = 240; // reused tokens always carried (prior frame + contract)
const THREAD_FRESH_MULTIPLIER = 6; // re-summarizing a thread body is expensive

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
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The mail-feed payload: a flat map of inbox → emails. A "delivery" mutates
// exactly one email slot (so exactly one email facet moves).
// ---------------------------------------------------------------------------

interface Email {
  readonly id: EmailId;
  readonly recipient: string;
  /** The thread this email canonically belongs to. */
  readonly thread: ThreadKey;
  /** The canonical subject — SHARED across newsletter copies. */
  readonly subject: string;
  /** The canonical body — SHARED across newsletter copies (so they collapse). */
  readonly body: string;
  /** Monotonic delivery counter for this slot — bumping it re-delivers. */
  readonly rev: number;
  /** When true, the email is malformed — the classifier throws on parse. */
  readonly malformed?: boolean;
}

// The mutable mail feed the generator drives, keyed by email id. An absent id
// means that email has not been delivered yet (its facet is the empty fp).
type MailFeed = Record<string, Email>;

// The shared newsletter content (identical across all five recipients — THIS is
// what makes them dedup to one thread render).
const NEWSLETTER_SUBJECT = "The Weekly Reactor — issue #42";
const NEWSLETTER_BODY =
  "Top story: incremental graphs that only pay for what changed. Plus: the dark lane, diamonds, and you.";

function newsletterEmail(id: EmailId, recipient: string): Email {
  return {
    id,
    recipient,
    thread: "newsletter",
    subject: NEWSLETTER_SUBJECT,
    body: NEWSLETTER_BODY,
    rev: 1,
  };
}

function seedFeed(): MailFeed {
  // Cold boot delivers ONE newsletter copy + the two non-newsletter emails. The
  // other four newsletter copies + the malformed email arrive LATER (the
  // scripted beats), so the dedup + fail beats are isolated, distinct ticks.
  return {
    nl1: newsletterEmail("nl1", "alice"),
    ship1: {
      id: "ship1",
      recipient: "ops",
      thread: "ship",
      subject: "Your order shipped",
      body: "Tracking #ZX9: out for delivery.",
      rev: 1,
    },
    invoice1: {
      id: "invoice1",
      recipient: "billing",
      thread: "invoice",
      subject: "Invoice 0042 due",
      body: "Amount due: $128.00 by the 15th.",
      rev: 1,
    },
  };
}

function readTruth(fm: WorldModelFiles): Record<string, unknown> {
  const bytes = fm["truth.json"];
  return bytes === undefined
    ? {}
    : (JSON.parse(readTextFile(bytes)) as Record<string, unknown>);
}

function commit(world: unknown, cost: Cost): RenderProduct {
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes)
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
});

// The ingress source exposes one facet per email — the fingerprint of ONLY that
// email's slice. Root of the dark lane: deliver to one inbox and only that
// email's ingress facet moves.
const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["mail-feed.json"];
  const feed: MailFeed =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as MailFeed);
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(feed[id] ?? null);
  }
  return out;
};

// THE dark-lane boundary. The gateway re-projects each email slot into an
// INDEPENDENT facet token. A delivery to one inbox moves ONLY that email facet;
// the sibling email tokens are byte-identical, so the sibling classifier lanes
// stay dark.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const emails = (t["emails"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = { [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)) };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(emails[id] ?? null);
  }
  return out;
};

// THE diamond/dedup boundary. The threader exposes one facet per DISTINCT thread
// plus a cheap rollup facet. Each `thread:<key>` token is the fingerprint of
// ONLY the canonical thread CONTENT (subject + body) — NOT the recipients or the
// member email ids. So five identical newsletters yield ONE `thread:newsletter`
// token that does not move when copies 2..5 arrive ⇒ the per-thread render
// memo-skips (the dedup). The `rollup` facet moves on every membership change so
// the Priority/Digest stay current.
const threaderCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const threads = (t["threads"] ?? {}) as Record<string, { content?: unknown }>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: asFingerprint(fingerprintArtifact(fm)),
    [ROLLUP_FACET]: asFingerprint(materialFingerprint(t["rollup"] ?? null)),
  };
  for (const key of THREAD_KEYS) {
    // Fingerprint ONLY the canonical content — the dedup invariant.
    out[THREAD_FACET[key]!] = materialFingerprint(threads[key]?.content ?? null);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved)
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

// The gateway: read the raw mail feed, normalize into a per-email view. The
// per-email structure is what the canonicalizer projects into independent facet
// tokens.
function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const feed = (readJson<MailFeed>(deps.store, SOURCE, "mail-feed.json") ?? {}) as MailFeed;
    const emails: Record<string, unknown> = {};
    let moved = 0;
    for (const id of EMAIL_IDS) {
      const e = feed[id];
      if (e === undefined) continue;
      emails[id] = {
        id: e.id,
        recipient: e.recipient,
        thread: e.thread,
        subject: e.subject,
        body: e.body,
        rev: e.rev,
        malformed: e.malformed ?? false,
      };
      moved += 1;
    }
    return commit(
      { emails, received: Object.keys(emails).length },
      renderCost(ctx, Math.max(1, moved), 1),
    );
  };
}

// A per-email classifier: read ONLY its own email off the gateway and tag it
// with a thread + a coarse priority. The malformed email's classifier THROWS
// (the fail beat) — a `failed` receipt, no downstream propagation, prior truth
// stands.
function classifierRender(deps: Deps, id: EmailId): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const emails = (gw?.["emails"] ?? {}) as Record<string, Email>;
    const me = emails[id] ?? null;
    if (me === null) {
      // Not yet delivered — a trivial empty classification.
      return commit({ email: id, classified: false }, renderCost(ctx, 1, 1));
    }
    if (me.malformed) {
      // A malformed email — missing headers / truncated MIME — cannot be parsed.
      throw new Error(`classifier ${id}: malformed email (rev ${me.rev}) — unparseable MIME`);
    }
    return commit(
      {
        email: id,
        classified: true,
        thread: me.thread,
        recipient: me.recipient,
        subject: me.subject,
        // The canonical content the threader groups on — IDENTICAL across the
        // five newsletter copies (so they collapse to one thread).
        content: { subject: me.subject, body: me.body },
        priority: me.thread === "invoice" ? "high" : me.thread === "alert" ? "high" : "normal",
        rev: me.rev,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Threader: fan in every classifier, group classified emails by their
// canonical content into threads. The canonicalizer exposes one facet per
// distinct thread (fingerprinting ONLY the content), so identical newsletters
// collapse to one thread facet. Heavy fresh on a content change (re-summarize).
function threaderRender(deps: Deps): Render {
  return (ctx) => {
    const byThread: Record<string, { content: unknown; members: string[]; recipients: string[] }> = {};
    let contentUnits = 0;
    for (const id of EMAIL_IDS) {
      const c = readJson(deps.store, CLASSIFIER[id]!);
      if (c === null || c["classified"] !== true) continue;
      const key = c["thread"] as string;
      const slot = (byThread[key] ??= { content: c["content"], members: [], recipients: [] });
      slot.members.push(id);
      slot.recipients.push(c["recipient"] as string);
      // Re-summarizing only counts fresh when the CONTENT is new for this thread;
      // a new member with identical content adds nothing (the dedup, in cost).
      slot.content = c["content"];
    }
    // Stable ordering for determinism.
    const threads: Record<string, unknown> = {};
    const rollup: Record<string, unknown> = {};
    for (const key of [...Object.keys(byThread)].sort()) {
      const slot = byThread[key]!;
      slot.members.sort();
      slot.recipients.sort();
      threads[key] = { content: slot.content, members: slot.members, recipients: slot.recipients };
      rollup[key] = { count: slot.members.length, recipients: slot.recipients };
      contentUnits += 1; // one unit of fresh per DISTINCT thread content
    }
    return commit(
      { threads, rollup, thread_count: Object.keys(threads).length },
      // Fresh scales with the number of DISTINCT threads (content), NOT the email
      // count — so 5 identical newsletters cost the SAME as 1 (the dedup payoff).
      renderCost(ctx, Math.max(1, contentUnits), 2, FRESH_PER_UNIT * THREAD_FRESH_MULTIPLIER),
    );
  };
}

// A per-thread render: read ONLY its own thread off the threader and produce the
// shared thread summary. Subscribes to exactly one `thread:<key>` facet, so a
// new recipient of the SAME content leaves it DARK — it renders ONCE for the
// shared content and dedup-skips the copies.
function threadRender(deps: Deps, key: ThreadKey): Render {
  return (ctx) => {
    const th = readJson(deps.store, THREADER);
    const threads = (th?.["threads"] ?? {}) as Record<string, Record<string, unknown>>;
    const me = threads[key] ?? null;
    const content = (me?.["content"] ?? null) as { subject?: string; body?: string } | null;
    return commit(
      {
        thread: key,
        summary: content ? `summary of "${content.subject}" — ${String(content.body).slice(0, 40)}…` : "(no thread)",
        member_count: ((me?.["members"] ?? []) as unknown[]).length,
      },
      // The expensive shared summary — burned ONCE per distinct content.
      renderCost(ctx, 3, 1, FRESH_PER_UNIT * THREAD_FRESH_MULTIPLIER),
    );
  };
}

// The Priority node: read the cheap rollup off the threader and score the
// threads. Reads the rollup facet so it stays current on membership changes.
function priorityRender(deps: Deps): Render {
  return (ctx) => {
    const th = readJson(deps.store, THREADER);
    const rollup = (th?.["rollup"] ?? {}) as Record<string, { count?: number }>;
    const scored = Object.keys(rollup)
      .sort()
      .map((key) => ({
        thread: key,
        // Threads with more recipients score higher (the newsletter, hit 5×).
        score: (rollup[key]?.count ?? 0) + (key === "invoice" || key === "alert" ? 5 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.thread.localeCompare(b.thread));
    return commit({ ranked: scored, thread_count: scored.length }, renderCost(ctx, Math.max(1, scored.length), 1));
  };
}

// The terminal Daily Digest: fan in every per-thread render + the priority
// ranking and assemble the shipped digest. A failed classifier upstream leaves
// the malformed thread absent — the digest still renders from the healthy
// threads (the digest still ships).
function digestRender(deps: Deps): Render {
  return (ctx) => {
    const pr = readJson(deps.store, PRIORITY);
    const ranked = (pr?.["ranked"] ?? []) as { thread: string; score: number }[];
    const sections: Record<string, unknown> = {};
    let shipped = 0;
    for (const key of THREAD_KEYS) {
      const tr = readJson(deps.store, THREAD_RENDER[key]);
      if (tr === null || tr["summary"] === "(no thread)") continue;
      sections[key] = { summary: tr["summary"], members: tr["member_count"] };
      shipped += 1;
    }
    return commit(
      {
        headline: `daily digest: ${shipped} threads shipped`,
        order: ranked.map((r) => r.thread),
        sections,
        shipped,
      },
      renderCost(ctx, Math.max(1, shipped), 2),
    );
  };
}

// ---------------------------------------------------------------------------
// Topology assembly
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
    requires: decl.requires.map((r) => `${r.producer}:${r.facet ?? ATOMIC_FACET}`).sort(),
  });
}

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
  const contract_fingerprints: Record<string, Fingerprint> = {};
  for (const d of decls) contract_fingerprints[d.id] = contractFingerprint(d);

  const nodes: TopologyNode[] = decls.map((d) => ({
    node: asNodeId(d.id),
    contract_fingerprint: contract_fingerprints[d.id]!,
    wake_source: (d.kind === "gateway" ? "external" : "input") as WakeSource,
  }));
  const edges: TopologyEdge[] = decls.flatMap((d) =>
    d.requires.map((r) => ({
      subscriber: asNodeId(d.id),
      producer: asNodeId(r.producer),
      facet: r.facet ?? ATOMIC_FACET,
    })),
  );
  const entry_points = decls.filter((d) => d.kind === "gateway").map((d) => asNodeId(d.id));
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
// The generator
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

/**
 * Build the deterministic Inbox Triage state-dir at `opts.stateDir`. Drives the
 * scripted beat timeline through the REAL reconciler over the FileSystem store +
 * ledger, then writes `compile/topology.json` + `compile/labels.json`. Re-running
 * with the same path reproduces the bytes.
 */
export function generateInboxTriageFixture(opts: GenerateOptions): GenerateResult {
  const { stateDir } = opts;
  if (opts.clean !== false && existsSync(stateDir)) {
    rmSync(stateDir, { recursive: true, force: true });
  }
  mkdirSync(stateDir, { recursive: true });

  // The one Substrate primitive: storage at `<stateDir>/receipts.json`, the
  // world-model store under `<stateDir>/world-models`, and the durable ledger
  // re-derived from that storage — one blessed factory for the split this
  // fixture wired by hand before.
  const { worldModel: store, ledger } = fileSystemSubstrate({
    directory: stateDir,
  });

  const deps: Deps = { store };

  const decls: NodeDecl[] = [
    {
      id: GATEWAY,
      kind: "gateway",
      // Watches the whole mail feed (atomic); its canonicalizer splits the change
      // into per-email facets.
      requires: [{ producer: SOURCE, facet: ATOMIC_FACET }],
      render: gatewayRender(deps),
      canonicalizer: gatewayCanon,
    },
    // One classifier per email — each subscribes to ONLY its own email facet.
    ...EMAIL_IDS.map<NodeDecl>((id) => ({
      id: CLASSIFIER[id]!,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: EMAIL_FACET[id]! }],
      render: classifierRender(deps, id),
      canonicalizer: atomicTruth,
    })),
    {
      id: THREADER,
      kind: "responsibility",
      // DIAMOND fan-in from every classifier (atomic) — it groups by content.
      requires: EMAIL_IDS.map((id) => ({ producer: CLASSIFIER[id]! })),
      render: threaderRender(deps),
      canonicalizer: threaderCanon,
    },
    // One per-thread render — each subscribes to ONLY its own thread facet. The
    // newsletter render dedup-skips the 2nd..5th identical copy.
    ...THREAD_KEYS.map<NodeDecl>((key) => ({
      id: THREAD_RENDER[key],
      kind: "responsibility",
      requires: [{ producer: THREADER, facet: THREAD_FACET[key] }],
      render: threadRender(deps, key),
      canonicalizer: atomicTruth,
    })),
    {
      id: PRIORITY,
      kind: "responsibility",
      // Reads the cheap rollup facet — stays current on membership changes.
      requires: [{ producer: THREADER, facet: ROLLUP_FACET }],
      render: priorityRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: DIGEST,
      kind: "responsibility",
      // Fan-in from every per-thread render + the priority ranking.
      requires: [
        ...THREAD_KEYS.map((key) => ({ producer: THREAD_RENDER[key] })),
        { producer: PRIORITY },
      ],
      render: digestRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<string, { render: Render; canonicalizer: NodeDecl["canonicalizer"] }> = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  // The mutable mail feed the generator drives.
  const feed: MailFeed = seedFeed();

  // Re-publish the mail feed and wake the gateway. When `feed` is byte-identical
  // to the prior publish, the gateway memo-skips and the whole graph memo-skips
  // too (the quiet-world re-wake).
  const publishAndWake = (): void => {
    const fm = files({ "mail-feed.json": jsonFile(feed) });
    const commitRes = store.commitPublished(SOURCE, fm, ingressCanon);
    const prev = ledger.lastReceipt(SOURCE);
    const prevRef = prev !== null ? ledger.addressOf(prev) : null;
    const wake: Wake = { source: "external", refs: [] };
    ledger.append({
      node: asNodeId(SOURCE),
      contract_fingerprint: asFingerprint(`contract:${SOURCE}@ingress`),
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

  // Deliver / re-deliver one email (mutate exactly one email slot ⇒ exactly one
  // email facet moves).
  const deliver = (email: Email): void => {
    feed[email.id] = email;
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline.
  // ======================================================================

  // --- Beat 1: COLD BOOT. Seed the feed (nl1 + ship1 + invoice1); every node
  // renders once — a full flash cascade across the whole graph.
  publishAndWake();

  // --- Beat 2: QUIET STRETCH. Byte-identical re-scans: the WHOLE graph
  // memo-SKIPS — a long field of dim skip pulses, the fresh-line flat near zero.
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR. A lone self-sourced wake on the Digest in the
  // quiet world. Its inputs have not moved ⇒ a `self` skipped receipt that lights
  // no edges and costs ~nothing (the audit floor).
  dag.tick(DIGEST);
  dag.tick(DIGEST);

  // a little more quiet so the floor reads flat before the surprise.
  publishAndWake();

  // --- Beat 4: THE HERO (selective wake). A single non-newsletter email lands in
  // ONE inbox: the shipping thread gets an update. ONLY the `email:ship1` facet
  // moves ⇒ ONLY the shipping Classifier lane lights; every sibling classifier
  // lane stays DARK. The threader flashes once; the digest reships. The cost
  // meter ticks ONCE off the flat line.
  deliver({
    id: "ship1",
    recipient: "ops",
    thread: "ship",
    subject: "Your order shipped",
    body: "Tracking #ZX9: DELIVERED.",
    rev: 2,
  });

  // --- Beat 5: DIAMOND DEDUP. The SAME newsletter now hits four MORE inboxes
  // (bob, carol, dave, erin) as four separate deliveries. Each delivery moves
  // ONLY its own `email:nlN` facet ⇒ its own Classifier lane lights and the
  // threader re-runs — BUT the `thread:newsletter` facet is the fingerprint of
  // the SHARED content, which does NOT move ⇒ the Thread Render [newsletter]
  // memo-SKIPS all four times. Five identical emails ⇒ the shared thread renders
  // EXACTLY ONCE (at cold boot, nl1); copies 2..5 dedup-skip. THE diamond.
  const recipients: Record<EmailId, string> = {
    nl2: "bob",
    nl3: "carol",
    nl4: "dave",
    nl5: "erin",
  } as Record<EmailId, string>;
  for (const id of ["nl2", "nl3", "nl4", "nl5"] as const) {
    deliver(newsletterEmail(id, recipients[id]!));
  }

  // --- Beat 6: FAIL (failure isolation). A malformed email lands — the `alert`
  // classifier THROWS ⇒ a `failed` (RED) receipt with NO downstream corruption.
  // The threader still runs over the HEALTHY classifiers; the Digest still
  // renders and SHIPS from the healthy threads (no failed digest).
  deliver({
    id: BAD_ID,
    recipient: "secops",
    thread: "alert",
    subject: "[ALERT] anomaly detected",
    body: "<<truncated MIME — unparseable>>",
    rev: 1,
    malformed: true,
  });

  // --- Beat 7: RECOVER. The sender re-sends a FIXED copy of the alert ⇒ the
  // alert Classifier parses cleanly and flashes GREEN (rendered), recovering from
  // the prior failed receipt. Its thread render now lights and joins the digest.
  deliver({
    id: BAD_ID,
    recipient: "secops",
    thread: "alert",
    subject: "[ALERT] anomaly detected",
    body: "Resolved: transient spike, no action needed.",
    rev: 2,
  });

  // --- Beat 8: FINAL QUIET. Byte-identical re-scans — back to dim pulses, flat
  // line (the bookend: it goes quiet again). LONG enough that the earlier spikes
  // scroll fully out of the sparkline window, so the bookend reads flat near zero.
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Persist the topology snapshot (MANDATORY for replay) ----------------
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

  const receipts = ledger.all();
  return {
    stateDir,
    receiptsCount: receipts.length,
    nodeCount: reconcilerTopology.topology.nodes.length,
    edgeCount: reconcilerTopology.topology.edges.length,
    facets: [
      ...EMAIL_IDS.map((id) => EMAIL_FACET[id]!),
      ...THREAD_KEYS.map((key) => THREAD_FACET[key]),
      ROLLUP_FACET,
    ],
  };
}
