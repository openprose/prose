// The Inbox Triage example GENERATOR — produces a deterministic, replayable
// `replay/` state-dir by driving the REAL `@openprose/reactor` reconciler with
// deterministic fake renders (NO model key). It is lifted from the devtools
// fixture generator (`packages/reactor-devtools/src/fixtures/inbox-triage.ts`)
// and made LOSSLESS on regeneration: it SELF-WRITES `beats.json` (the devtools
// generator does not — the known caveat in the plan §6) so a regen reproduces
// the committed `replay/` byte-for-byte, including the beat timeline.
//
// THE STORY (the architecture this example stakes out — diamond fan-in +
// failure isolation):
//   The same newsletter hits FIVE inboxes — summarized ONCE. One malformed email
//   fails — your digest still ships.
//
//   An `Inbox Stream` gateway watches a raw mail feed and exposes ONE FACET PER
//   INCOMING EMAIL (`email:<id>`). A `Classifier` per email subscribes to ONLY
//   its own email facet ⇒ a new email to one inbox lights ONLY that classifier
//   lane; the sibling classifier lanes stay DARK (the facet "dark lane"). The
//   classifiers fan into a `Threader` (the DIAMOND fan-in) that groups emails by
//   CANONICAL CONTENT and exposes a `thread:<key>` facet per DISTINCT thread —
//   the fingerprint of ONLY the canonical subject+body, NOT the recipient. So
//   five recipients of the SAME newsletter collapse to ONE `thread:newsletter`
//   facet. A per-thread `Thread Render` subscribes to exactly one thread facet:
//   the FIRST identical copy renders the shared thread; the next four DEDUP-SKIP
//   (the diamond = a single wake). A `Priority` node scores the threads, and a
//   terminal `Digest` fans them in.
//
//   THE FAILURE ISOLATION (the tenet this example teaches): one email is
//   malformed — its Classifier render THROWS ⇒ a RED `failed` receipt that
//   carries ZERO fresh and wakes NOTHING downstream. The Digest still renders
//   from the healthy threads (the digest still ships). Then the sender re-sends
//   a fixed copy ⇒ the Classifier flashes GREEN (recover).
//
// It persists the full devtools state-dir shape so reactor-devtools can replay
// this example unchanged:
//
//   replay/receipts.json              (flat root append-only ledger trail)
//   replay/world-models/<hexNode>/…   (per-node published truth + history)
//   replay/compile/topology.json      (the flat TopologyWorldModel)
//   replay/compile/labels.json        (nodeId → friendly label)
//   replay/beats.json                 (the scripted beat timeline — SELF-WRITTEN)
//
// Determinism: every render body is a PURE function of (upstream truth read by
// reference, own prior); cost is a pure function of how much actually moved.
// Same generator ⇒ byte-identical state-dir.

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

import type {
  ReconcilerTopology,
} from "@openprose/reactor/internals";
import type {
  RenderContext,
  RenderProduct,
} from "@openprose/reactor";

// ---------------------------------------------------------------------------
// Node identities.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.mail-feed"; // the phantom edge: the raw mail feed
const GATEWAY = "gateway.inbox-stream"; // entry point; ONE facet per incoming email

const NEWSLETTER_IDS = ["nl1", "nl2", "nl3", "nl4", "nl5"] as const;
const OTHER_IDS = ["ship1", "invoice1"] as const;
const BAD_ID = "bad1"; // the malformed email — its classifier throws
const EMAIL_IDS = [...NEWSLETTER_IDS, ...OTHER_IDS, BAD_ID] as const;
type EmailId = (typeof EMAIL_IDS)[number];

const CLASSIFIER: Record<EmailId, string> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `responsibility.classifier-${id}`]),
) as Record<EmailId, string>;

const THREADER = "responsibility.threader";

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

// One facet per incoming email on the gateway — the dark-lane boundary.
const EMAIL_FACET: Record<EmailId, Facet> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `email:${id}`]),
) as Record<EmailId, Facet>;

// One facet per DISTINCT thread on the threader — the diamond/dedup boundary.
const THREAD_FACET: Record<ThreadKey, Facet> = {
  newsletter: "thread:newsletter",
  ship: "thread:ship",
  invoice: "thread:invoice",
  alert: "thread:alert",
};

// The cheap rollup facet the Priority + Digest read.
const ROLLUP_FACET: Facet = "rollup";

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
  [THREADER]: "Threader",
  [THREAD_RENDER.newsletter]: "Thread Render [newsletter]",
  [THREAD_RENDER.ship]: "Thread Render [shipping]",
  [THREAD_RENDER.invoice]: "Thread Render [invoice]",
  [THREAD_RENDER.alert]: "Thread Render [alert]",
  [PRIORITY]: "Priority",
  [DIGEST]: "Daily Digest",
};

// ---------------------------------------------------------------------------
// The scripted beat timeline — SELF-WRITTEN so regeneration is lossless.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "inbox-triage",
  title:
    "The same newsletter hits 5 inboxes — summarized once. One malformed email fails — your digest still ships.",
  beats: [
    {
      name: "cold-boot",
      park: 23,
      from: 0,
      to: 23,
      holdMs: 2600,
      caption:
        "the inbox graph lights up once · gateway → classifiers → threader → digest",
    },
    {
      name: "quiet",
      park: 37,
      from: 24,
      to: 37,
      holdMs: 2400,
      caption: "dim skip pulses · nothing changed · cost flat near zero",
    },
    {
      name: "self-tick",
      park: 35,
      from: 34,
      to: 35,
      holdMs: 2600,
      caption:
        "self-tick audit floor · the digest re-checks itself · no edges, no cost",
    },
    {
      name: "hero-dark-lane",
      park: 43,
      from: 38,
      to: 43,
      holdMs: 3600,
      caption:
        "HERO: one email lands in ONE inbox · only that classifier lane lights · the other 7 stay dark",
    },
    {
      name: "diamond-dedup",
      park: 67,
      from: 44,
      to: 67,
      holdMs: 4200,
      caption:
        "the SAME newsletter hits 4 more inboxes · the shared thread already rendered · 4 copies dedup away · summarized ONCE",
    },
    {
      name: "red-fail",
      park: 70,
      from: 68,
      to: 70,
      holdMs: 3200,
      caption:
        "a malformed email · its classifier fails RED · no downstream, no digest corruption · prior truth stands",
    },
    {
      name: "recover",
      park: 77,
      from: 71,
      to: 77,
      holdMs: 3000,
      caption:
        "the sender re-sends a fixed copy · the classifier flashes GREEN · its thread joins the digest",
    },
    {
      name: "final-quiet",
      park: 94,
      from: 78,
      to: 94,
      holdMs: 2600,
      caption: "it goes quiet again · the digest shipped · cost back to flat",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Deterministic fingerprint of a structured sub-value (own facet tokens).
// ---------------------------------------------------------------------------

function materialFingerprint(value: unknown): Fingerprint {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

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

// ---------------------------------------------------------------------------
// The cost model. `surprise_cause` MUST equal the wake source.
// ---------------------------------------------------------------------------

const FRESH_PER_UNIT = 180;
const REUSED_FLOOR = 240;
const THREAD_FRESH_MULTIPLIER = 6;

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
    // The load-bearing invariant — read off the wake, NEVER hardcoded.
    surprise_cause: ctx.wake.source,
  };
}

// ---------------------------------------------------------------------------
// The mail-feed payload.
// ---------------------------------------------------------------------------

interface Email {
  readonly id: EmailId;
  readonly recipient: string;
  readonly thread: ThreadKey;
  readonly subject: string;
  readonly body: string;
  readonly rev: number;
  readonly malformed?: boolean;
}

type MailFeed = Record<string, Email>;

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
  return {
    world_model: files({ "truth.json": jsonFile(world) }),
    cost,
  };
}

// ---------------------------------------------------------------------------
// Canonicalizers (which facets a node's truth exposes).
// ---------------------------------------------------------------------------

const atomicTruth = (fm: WorldModelFiles) => ({
  [ATOMIC_FACET]: fingerprintArtifact(fm),
});

const ingressCanon = (fm: WorldModelFiles) => {
  const bytes = fm["mail-feed.json"];
  const feed: MailFeed =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as MailFeed);
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(feed[id] ?? null);
  }
  return out;
};

// THE dark-lane boundary — independent per-email facet tokens.
const gatewayCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const emails = (t["emails"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(emails[id] ?? null);
  }
  return out;
};

// THE diamond/dedup boundary — one facet per DISTINCT thread, fingerprinting
// ONLY the canonical content (subject + body), so five identical newsletters
// collapse to ONE `thread:newsletter` token that stays still on copies 2..5.
const threaderCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const threads = (t["threads"] ?? {}) as Record<string, { content?: unknown }>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [ROLLUP_FACET]: materialFingerprint(t["rollup"] ?? null),
  };
  for (const key of THREAD_KEYS) {
    out[THREAD_FACET[key]!] = materialFingerprint(threads[key]?.content ?? null);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Render bodies (pure deterministic fakes; cost scales with material moved).
// ---------------------------------------------------------------------------

interface Deps {
  readonly store: WorldModelStore;
}

type Render = (ctx: RenderContext) => RenderProduct;

function gatewayRender(deps: Deps): Render {
  return (ctx) => {
    const feed = (readJson<MailFeed>(deps.store, SOURCE, "mail-feed.json") ??
      {}) as MailFeed;
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

// A per-email classifier. The malformed email's classifier THROWS — a `failed`
// receipt, no downstream propagation, prior truth stands.
function classifierRender(deps: Deps, id: EmailId): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const emails = (gw?.["emails"] ?? {}) as Record<string, Email>;
    const me = emails[id] ?? null;
    if (me === null) {
      return commit({ email: id, classified: false }, renderCost(ctx, 1, 1));
    }
    if (me.malformed) {
      throw new Error(
        `classifier ${id}: malformed email (rev ${me.rev}) — unparseable MIME`,
      );
    }
    return commit(
      {
        email: id,
        classified: true,
        thread: me.thread,
        recipient: me.recipient,
        subject: me.subject,
        content: { subject: me.subject, body: me.body },
        priority:
          me.thread === "invoice"
            ? "high"
            : me.thread === "alert"
              ? "high"
              : "normal",
        rev: me.rev,
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Threader: the DIAMOND fan-in. Groups classified emails by canonical
// content; the canonicalizer exposes one facet per distinct thread.
function threaderRender(deps: Deps): Render {
  return (ctx) => {
    const byThread: Record<
      string,
      { content: unknown; members: string[]; recipients: string[] }
    > = {};
    for (const id of EMAIL_IDS) {
      const c = readJson(deps.store, CLASSIFIER[id]!);
      if (c === null || c["classified"] !== true) continue;
      const key = c["thread"] as string;
      const slot = (byThread[key] ??= {
        content: c["content"],
        members: [],
        recipients: [],
      });
      slot.members.push(id);
      slot.recipients.push(c["recipient"] as string);
      slot.content = c["content"];
    }
    const threads: Record<string, unknown> = {};
    const rollup: Record<string, unknown> = {};
    let contentUnits = 0;
    for (const key of [...Object.keys(byThread)].sort()) {
      const slot = byThread[key]!;
      slot.members.sort();
      slot.recipients.sort();
      threads[key] = {
        content: slot.content,
        members: slot.members,
        recipients: slot.recipients,
      };
      rollup[key] = { count: slot.members.length, recipients: slot.recipients };
      contentUnits += 1;
    }
    return commit(
      { threads, rollup, thread_count: Object.keys(threads).length },
      // Fresh scales with DISTINCT thread content, NOT email count — 5 identical
      // newsletters cost the SAME as 1 (the dedup payoff).
      renderCost(
        ctx,
        Math.max(1, contentUnits),
        2,
        FRESH_PER_UNIT * THREAD_FRESH_MULTIPLIER,
      ),
    );
  };
}

// A per-thread render. Subscribes to exactly one `thread:<key>` facet, so a new
// recipient of the SAME content leaves it DARK — renders ONCE, dedup-skips the
// copies (the diamond = single wake).
function threadRender(deps: Deps, key: ThreadKey): Render {
  return (ctx) => {
    const th = readJson(deps.store, THREADER);
    const threads = (th?.["threads"] ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const me = threads[key] ?? null;
    const content = (me?.["content"] ?? null) as {
      subject?: string;
      body?: string;
    } | null;
    return commit(
      {
        thread: key,
        summary: content
          ? `summary of "${content.subject}" — ${String(content.body).slice(0, 40)}…`
          : "(no thread)",
        member_count: ((me?.["members"] ?? []) as unknown[]).length,
      },
      renderCost(ctx, 3, 1, FRESH_PER_UNIT * THREAD_FRESH_MULTIPLIER),
    );
  };
}

function priorityRender(deps: Deps): Render {
  return (ctx) => {
    const th = readJson(deps.store, THREADER);
    const rollup = (th?.["rollup"] ?? {}) as Record<string, { count?: number }>;
    const scored = Object.keys(rollup)
      .sort()
      .map((key) => ({
        thread: key,
        score:
          (rollup[key]?.count ?? 0) +
          (key === "invoice" || key === "alert" ? 5 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.thread.localeCompare(b.thread));
    return commit(
      { ranked: scored, thread_count: scored.length },
      renderCost(ctx, Math.max(1, scored.length), 1),
    );
  };
}

// The terminal Daily Digest: fan in every per-thread render + the priority
// ranking. A failed classifier upstream leaves the malformed thread absent — the
// digest still renders from the healthy threads (the digest still ships).
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

function buildReconcilerTopology(decls: readonly NodeDecl[]): ReconcilerTopology {
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

// ---------------------------------------------------------------------------
// The generator.
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Absolute path of the replay state-dir to (re)create. */
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
 * Build the deterministic Inbox Triage `replay/` state-dir at `opts.stateDir`.
 * Drives the scripted beat timeline through the REAL reconciler over the
 * FileSystem store + ledger, then writes `compile/topology.json`,
 * `compile/labels.json`, and (LOSSLESSLY) `beats.json`. Re-running with the same
 * path reproduces the bytes.
 */
export function generateInboxTriageExample(opts: GenerateOptions): GenerateResult {
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
      requires: EMAIL_IDS.map((id) => ({ producer: CLASSIFIER[id]! })),
      render: threaderRender(deps),
      canonicalizer: threaderCanon,
    },
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
      requires: [{ producer: THREADER, facet: ROLLUP_FACET }],
      render: priorityRender(deps),
      canonicalizer: atomicTruth,
    },
    {
      id: DIGEST,
      kind: "responsibility",
      requires: [
        ...THREAD_KEYS.map((key) => ({ producer: THREAD_RENDER[key] })),
        { producer: PRIORITY },
      ],
      render: digestRender(deps),
      canonicalizer: atomicTruth,
    },
  ];

  const reconcilerTopology = buildReconcilerTopology(decls);
  const mounts: Record<
    string,
    { render: Render; canonicalizer: NodeDecl["canonicalizer"] }
  > = {};
  for (const d of decls) mounts[d.id] = { render: d.render, canonicalizer: d.canonicalizer };

  const dag = mountDag({ topology: reconcilerTopology, mounts, store, ledger });

  const feed: MailFeed = seedFeed();

  const publishAndWake = (): void => {
    const fm = files({ "mail-feed.json": jsonFile(feed) });
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

  const deliver = (email: Email): void => {
    feed[email.id] = email;
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline (mirrors BEATS above).
  // ======================================================================

  // --- Beat 1: COLD BOOT.
  publishAndWake();

  // --- Beat 2: QUIET STRETCH (byte-identical re-scans → whole graph SKIPS).
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: SELF-TICK FLOOR (self-sourced wake; inputs unmoved → self skip).
  dag.tick(DIGEST);
  dag.tick(DIGEST);

  publishAndWake();

  // --- Beat 4: THE HERO (selective wake / dark lane).
  deliver({
    id: "ship1",
    recipient: "ops",
    thread: "ship",
    subject: "Your order shipped",
    body: "Tracking #ZX9: DELIVERED.",
    rev: 2,
  });

  // --- Beat 5: DIAMOND DEDUP (4 more newsletter copies → 4 dedup-skips).
  const recipients: Record<EmailId, string> = {
    nl2: "bob",
    nl3: "carol",
    nl4: "dave",
    nl5: "erin",
  } as Record<EmailId, string>;
  for (const id of ["nl2", "nl3", "nl4", "nl5"] as const) {
    deliver(newsletterEmail(id, recipients[id]!));
  }

  // --- Beat 6: FAIL (failure isolation — failed receipt, zero fresh, no wake).
  deliver({
    id: BAD_ID,
    recipient: "secops",
    thread: "alert",
    subject: "[ALERT] anomaly detected",
    body: "<<truncated MIME — unparseable>>",
    rev: 1,
    malformed: true,
  });

  // --- Beat 7: RECOVER (a fixed copy → the classifier flashes GREEN).
  deliver({
    id: BAD_ID,
    recipient: "secops",
    thread: "alert",
    subject: "[ALERT] anomaly detected",
    body: "Resolved: transient spike, no action needed.",
    rev: 2,
  });

  // --- Beat 8: FINAL QUIET (byte-identical re-scans → back to flat).
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Persist the compile snapshot + the SELF-WRITTEN beats (lossless regen).
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
    `${JSON.stringify(BEATS, null, 2)}\n`,
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

// Allow `tsx generate.ts` / `node` invocation to (re)write the committed replay/.
if (require.main === module) {
  const here = join(__dirname, "replay");
  const result = generateInboxTriageExample({ stateDir: here });
  // eslint-disable-next-line no-console
  console.log(
    `inbox-triage: wrote ${result.receiptsCount} receipts, ${result.nodeCount} nodes, ${result.edgeCount} edges → ${result.stateDir}`,
  );
}
