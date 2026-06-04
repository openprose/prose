// The Press Desk example GENERATOR — produces a deterministic, replayable
// `replay/` state-dir by driving the REAL `@openprose/reactor` reconciler with
// deterministic fake renders (NO model key). It mirrors the inbox-triage
// generator's shape (a phantom feed → gateway → per-email responsibilities →
// faceted fan-in → terminal node) but stakes out a DIFFERENT tenet:
//
// THE STORY (the architecture this example stakes out — a deterministic HUMAN
// GATE + a PRIVACY PROJECTION):
//   press@agents.openprose.ai is a live inbound inbox for media / partnership /
//   speaking inquiries. A `Press Inbox` gateway watches the inbound feed and
//   exposes ONE FACET PER INCOMING EMAIL (`email:<id>`). A `Relevance Filter`
//   per email subscribes to ONLY its own email facet ⇒ a new inquiry lights
//   ONLY that filter lane; the sibling lanes stay DARK. A PR-blast / irrelevant
//   email leaves the filter's `#### qualified` facet NULL — the dark lane — so it
//   never wakes the register. The qualified inquiries fan into an `Opportunity
//   Register` faceted by KIND (`#### media`, `#### partnership`, `#### speaking`).
//   A terminal `Briefing` node fans them in and maintains a leadership brief.
//
//   THE TWO LOAD-BEARING MECHANISMS (the tenet this example teaches):
//     (1) THE HUMAN GATE (deterministic gateCommit). A HIGH-importance inquiry
//         drives the brief to status "needs_human" with `auto_reply: false` — the
//         render MAINTAINS the truth (register + brief update) but REFUSES the
//         outward action a human must own. The system drafts and packages; it
//         never auto-replies. The ONLY thing that can clear the gate is a human.
//     (2) THE PRIVACY PROJECTION. The briefing holds the FULL owner-only view
//         (sender name + email + ask), and exposes a `#### public` facet that is a
//         PROJECTION stripping sender PII by construction — the public projection
//         carries kind + ask + status, never the raw sender name/email.
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
// reference, own prior); cost is a pure function of how much actually moved;
// surprise_cause is read OFF the wake, NEVER hardcoded. Same generator ⇒
// byte-identical state-dir.

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

import type { ReconcilerTopology } from "@openprose/reactor/internals";
import type { RenderContext, RenderProduct } from "@openprose/reactor";

// ---------------------------------------------------------------------------
// Node identities.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.press-feed"; // the phantom edge: the raw inbound feed
const GATEWAY = "gateway.press-inbox"; // entry point; ONE facet per incoming email

// The watched inquiries. `blast1` is the PR-blast / irrelevant email whose
// relevance filter leaves its `qualified` facet NULL (the dark lane).
const MEDIA_ID = "media1";
const PARTNER_ID = "partner1";
const SPEAK_ID = "speak1";
const BLAST_ID = "blast1"; // PR blast — irrelevant → qualified NULL → dark
const HIGH_ID = "partner2"; // HIGH-importance partnership → human gate
const EMAIL_IDS = [MEDIA_ID, PARTNER_ID, SPEAK_ID, BLAST_ID, HIGH_ID] as const;
type EmailId = (typeof EMAIL_IDS)[number];

const FILTER: Record<EmailId, string> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `responsibility.relevance-filter-${id}`]),
) as Record<EmailId, string>;

const REGISTER = "responsibility.opportunity-register";
const BRIEFING = "responsibility.briefing";

// The inquiry KINDs the register fans into.
const KINDS = ["media", "partnership", "speaking"] as const;
type Kind = (typeof KINDS)[number];

// ---------------------------------------------------------------------------
// Facet tokens.
// ---------------------------------------------------------------------------

// One facet per incoming email on the gateway — the dark-lane boundary.
const EMAIL_FACET: Record<EmailId, Facet> = Object.fromEntries(
  EMAIL_IDS.map((id) => [id, `email:${id}`]),
) as Record<EmailId, Facet>;

// The single `qualified` facet each relevance filter exposes — NULL (dark) for an
// irrelevant PR blast, so the register never wakes on noise.
const QUALIFIED_FACET: Facet = "qualified";

// One facet per inquiry KIND on the register — the fan-in subscription boundary.
const KIND_FACET: Record<Kind, Facet> = {
  media: "media",
  partnership: "partnership",
  speaking: "speaking",
};

// The briefing's two outward facets: the owner-only full view + the masked public
// projection (no sender PII).
const PUBLIC_FACET: Facet = "public";

// ---------------------------------------------------------------------------
// Friendly labels for the SPA (nodeId → human label).
// ---------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  [SOURCE]: "Press Feed",
  [GATEWAY]: "Press Inbox",
  [FILTER[MEDIA_ID]]: "Relevance Filter [media]",
  [FILTER[PARTNER_ID]]: "Relevance Filter [partnership]",
  [FILTER[SPEAK_ID]]: "Relevance Filter [speaking]",
  [FILTER[BLAST_ID]]: "Relevance Filter [PR blast]",
  [FILTER[HIGH_ID]]: "Relevance Filter [partnership · HIGH]",
  [REGISTER]: "Opportunity Register",
  [BRIEFING]: "Leadership Briefing",
};

// ---------------------------------------------------------------------------
// The scripted beat timeline — SELF-WRITTEN so regeneration is lossless.
// ---------------------------------------------------------------------------

const BEATS = {
  scenario: "press-desk",
  title:
    "Inbound press inquiries become a live opportunity register — a high-stakes inquiry STOPS at a human gate, and the public view never leaks sender PII.",
  beats: [
    {
      name: "cold-boot",
      park: 12,
      from: 0,
      to: 12,
      holdMs: 2800,
      caption:
        "the press desk lights up · gateway → relevance filters → opportunity register → briefing",
    },
    {
      name: "quiet",
      park: 24,
      from: 13,
      to: 24,
      holdMs: 2400,
      caption: "dim skip pulses · nothing changed · cost flat near zero",
    },
    {
      name: "pr-blast-dark",
      park: 27,
      from: 25,
      to: 27,
      holdMs: 3400,
      caption:
        "HERO: a PR blast lands · its relevance filter marks it irrelevant · the `qualified` facet stays NULL · the register never wakes (the dark lane)",
    },
    {
      name: "human-gate",
      park: 33,
      from: 28,
      to: 33,
      holdMs: 4200,
      caption:
        "HERO: a HIGH-importance partnership inquiry · the register updates AND the briefing stops at needs_human · auto_reply:false · a human must own the reply",
    },
    {
      name: "self-tick",
      park: 35,
      from: 34,
      to: 35,
      holdMs: 2600,
      caption:
        "self-tick audit floor · the briefing re-checks itself · no edges, no cost",
    },
    {
      name: "final-quiet",
      park: 47,
      from: 36,
      to: 47,
      holdMs: 2600,
      caption:
        "it goes quiet again · the gate holds · the public view carries kind + ask, never the sender · cost back to flat",
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
const REGISTER_FRESH_MULTIPLIER = 4;

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
// The inbound-feed payload.
// ---------------------------------------------------------------------------

interface Inquiry {
  readonly id: EmailId;
  readonly sender_name: string; // PII — owner-only
  readonly sender_email: string; // PII — owner-only
  readonly subject: string;
  readonly body: string;
  readonly kind: Kind | "irrelevant";
  readonly importance: "normal" | "high";
  readonly rev: number;
}

type PressFeed = Record<string, Inquiry>;

function seedFeed(): PressFeed {
  return {
    [MEDIA_ID]: {
      id: MEDIA_ID,
      sender_name: "Dana Okafor",
      sender_email: "dana.okafor@thesignalwire.example",
      subject: "Interview request — feature on agentic inboxes",
      body: "I'm writing a feature for SignalWire and would love 20 minutes with your team this month.",
      kind: "media",
      importance: "normal",
      rev: 1,
    },
    [PARTNER_ID]: {
      id: PARTNER_ID,
      sender_name: "Marcus Lindqvist",
      sender_email: "m.lindqvist@northbeam.example",
      subject: "Partnership — co-marketing on deterministic agents",
      body: "Northbeam would like to explore a co-marketing partnership around your reactor work.",
      kind: "partnership",
      importance: "normal",
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
  const bytes = fm["press-feed.json"];
  const feed: PressFeed =
    bytes === undefined ? {} : (JSON.parse(readTextFile(bytes)) as PressFeed);
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const id of EMAIL_IDS) {
    out[EMAIL_FACET[id]!] = materialFingerprint(feed[id] ?? null);
  }
  return out;
};

// THE dark-lane boundary — independent per-email facet tokens on the gateway.
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

// THE relevance-filter dark-facet recipe. The `qualified` facet fingerprints
// ONLY the qualified material slice; an irrelevant PR blast (`qualified === null`)
// fingerprints `materialFingerprint(null)` — a fixed, byte-identical NULL token —
// so its lane stays dark and never wakes the register.
const filterCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [QUALIFIED_FACET]: materialFingerprint(t["qualified"] ?? null),
  };
};

// THE register fan-in boundary — one facet per inquiry KIND, fingerprinting ONLY
// that kind's grouped material, so the briefing wakes per kind that moved.
const registerCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  const byKind = (t["by_kind"] ?? {}) as Record<string, unknown>;
  const out: Record<string, Fingerprint> = {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
  };
  for (const k of KINDS) {
    out[KIND_FACET[k]] = materialFingerprint(byKind[k] ?? null);
  }
  return out;
};

// THE projection boundary on the briefing — the OWNER-only full view lives behind
// ATOMIC_FACET; the `public` facet fingerprints ONLY the masked public projection
// (kind + ask + status, NEVER the sender PII), so a downstream public consumer
// wakes on the public view and never sees the owner-only slice.
const briefingCanon = (fm: WorldModelFiles) => {
  const t = readTruth(fm);
  return {
    [ATOMIC_FACET]: fingerprintArtifact(fm),
    [PUBLIC_FACET]: materialFingerprint(t["public"] ?? null),
  };
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
    const feed = (readJson<PressFeed>(deps.store, SOURCE, "press-feed.json") ??
      {}) as PressFeed;
    const emails: Record<string, unknown> = {};
    let moved = 0;
    for (const id of EMAIL_IDS) {
      const e = feed[id];
      if (e === undefined) continue;
      emails[id] = {
        id: e.id,
        sender_name: e.sender_name,
        sender_email: e.sender_email,
        subject: e.subject,
        body: e.body,
        kind: e.kind,
        importance: e.importance,
        rev: e.rev,
      };
      moved += 1;
    }
    return commit(
      { emails, received: Object.keys(emails).length },
      renderCost(ctx, Math.max(1, moved), 1),
    );
  };
}

// A per-email relevance filter. Tags relevance + urgency + kind. An IRRELEVANT
// PR blast leaves `qualified: null` — the dark-facet recipe — so its `qualified`
// facet fingerprints the fixed NULL token and the register never wakes on it.
function filterRender(deps: Deps, id: EmailId): Render {
  return (ctx) => {
    const gw = readJson(deps.store, GATEWAY);
    const emails = (gw?.["emails"] ?? {}) as Record<string, Inquiry>;
    const me = emails[id] ?? null;
    if (me === null) {
      return commit(
        { email: id, relevant: false, qualified: null },
        renderCost(ctx, 1, 1),
      );
    }
    // The relevance decision: an `irrelevant` inquiry (the PR blast) does NOT
    // qualify — `qualified` stays NULL (the dark lane).
    const relevant = me.kind !== "irrelevant";
    if (!relevant) {
      return commit(
        {
          email: id,
          relevant: false,
          reason: "PR blast — not a media/partnership/speaking inquiry",
          qualified: null,
        },
        renderCost(ctx, 1, 1),
      );
    }
    const kind = me.kind as Kind;
    const urgency = me.importance === "high" ? "high" : "normal";
    return commit(
      {
        email: id,
        relevant: true,
        // The qualified material the register groups on. It DOES carry sender PII
        // (owner-only) — the projection that strips it happens downstream at the
        // briefing's `public` facet.
        qualified: {
          email: id,
          kind,
          urgency,
          importance: me.importance,
          sender_name: me.sender_name,
          sender_email: me.sender_email,
          ask: me.subject,
          rev: me.rev,
        },
      },
      renderCost(ctx, 1, 1),
    );
  };
}

// The Opportunity Register: the fan-in. Reads every relevance filter by reference,
// keeps ONLY the qualified inquiries, and groups them by KIND. The canonicalizer
// exposes one facet per kind, so the briefing wakes per kind that moved.
function registerRender(deps: Deps): Render {
  return (ctx) => {
    const byKind: Record<string, Record<string, unknown>[]> = {};
    let kindsTouched = 0;
    for (const id of EMAIL_IDS) {
      const f = readJson(deps.store, FILTER[id]!);
      const q = (f?.["qualified"] ?? null) as Record<string, unknown> | null;
      if (q === null) continue; // dark lane — irrelevant / absent
      const k = q["kind"] as string;
      (byKind[k] ??= []).push({
        email: q["email"],
        importance: q["importance"],
        urgency: q["urgency"],
        sender_name: q["sender_name"], // owner-only PII (stripped downstream)
        sender_email: q["sender_email"], // owner-only PII (stripped downstream)
        ask: q["ask"],
        rev: q["rev"],
      });
    }
    const grouped: Record<string, unknown> = {};
    for (const k of [...Object.keys(byKind)].sort()) {
      const entries = byKind[k]!.sort((a, b) =>
        String(a["email"]).localeCompare(String(b["email"])),
      );
      grouped[k] = { count: entries.length, entries };
      kindsTouched += 1;
    }
    const total = Object.values(byKind).reduce((n, e) => n + e.length, 0);
    return commit(
      { by_kind: grouped, kinds: Object.keys(grouped).sort(), total },
      renderCost(
        ctx,
        Math.max(1, kindsTouched),
        1,
        FRESH_PER_UNIT * REGISTER_FRESH_MULTIPLIER,
      ),
    );
  };
}

// The terminal Leadership Briefing. TWO load-bearing mechanisms:
//   (1) THE HUMAN GATE (deterministic gateCommit). It MAINTAINS the brief (it
//       commits the register summary) but when ANY qualified inquiry is HIGH
//       importance the brief's status becomes "needs_human" and `auto_reply` is
//       hardcoded false — the system NEVER auto-replies; a human must own the
//       outward action. This is the gateCommit: maintain truth, refuse the action.
//   (2) THE PRIVACY PROJECTION. The full owner-only view (with sender PII) lives
//       behind ATOMIC_FACET; the `public` facet is a PROJECTION that strips the
//       sender name + email by construction — it carries kind + ask + status only.
function briefingRender(deps: Deps): Render {
  return (ctx) => {
    const reg = readJson(deps.store, REGISTER);
    const byKind = (reg?.["by_kind"] ?? {}) as Record<
      string,
      { count?: number; entries?: Record<string, unknown>[] }
    >;

    // Assemble the OWNER-only full view (carries sender PII) and the gate.
    const ownerItems: Record<string, unknown>[] = [];
    const publicItems: Record<string, unknown>[] = [];
    let anyHigh = false;
    for (const k of [...Object.keys(byKind)].sort()) {
      const entries = (byKind[k]?.entries ?? []).slice().sort((a, b) =>
        String(a["email"]).localeCompare(String(b["email"])),
      );
      for (const e of entries) {
        if (e["importance"] === "high") anyHigh = true;
        // Owner-only: the full record, sender PII included.
        ownerItems.push({
          kind: k,
          email: e["email"],
          importance: e["importance"],
          urgency: e["urgency"],
          sender_name: e["sender_name"],
          sender_email: e["sender_email"],
          ask: e["ask"],
        });
        // PUBLIC PROJECTION: kind + ask + importance ONLY — sender name/email are
        // STRIPPED by construction (they never enter the public slice).
        publicItems.push({
          kind: k,
          importance: e["importance"],
          urgency: e["urgency"],
          ask: e["ask"],
        });
      }
    }

    // THE GATE (gateCommit): a HIGH-importance inquiry stops the brief at
    // needs_human; auto_reply is the load-bearing safety invariant — ALWAYS false.
    const status: "ready" | "needs_human" = anyHigh ? "needs_human" : "ready";

    return commit(
      {
        // Owner-only full view (sender PII present).
        owner_view: {
          status,
          items: ownerItems,
          total: ownerItems.length,
        },
        // THE PRIVACY PROJECTION facet — no sender PII, by construction.
        public: {
          status,
          items: publicItems,
          total: publicItems.length,
          // The public view announces the gate WITHOUT leaking who triggered it.
          gated: anyHigh,
        },
        // THE HUMAN GATE: the outward action is refused to the system.
        status,
        auto_reply: false, // INVARIANT: the press desk never auto-replies.
        human_review_required: anyHigh,
        human_review_checklist: [
          "claims grounded in the inquiry",
          "no private sender data in any public output",
          "a human owns the reply to high-stakes inquiries",
        ],
      },
      renderCost(ctx, Math.max(1, ownerItems.length || 1), 2),
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
 * Build the deterministic Press Desk `replay/` state-dir at `opts.stateDir`.
 * Drives the scripted beat timeline through the REAL reconciler over the
 * FileSystem store + ledger, then writes `compile/topology.json`,
 * `compile/labels.json`, and (LOSSLESSLY) `beats.json`. Re-running with the same
 * path reproduces the bytes.
 */
export function generatePressDeskExample(opts: GenerateOptions): GenerateResult {
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
      id: FILTER[id]!,
      kind: "responsibility",
      requires: [{ producer: GATEWAY, facet: EMAIL_FACET[id]! }],
      render: filterRender(deps, id),
      canonicalizer: filterCanon,
    })),
    {
      id: REGISTER,
      kind: "responsibility",
      // The register fans in over each filter's `qualified` facet ONLY — a dark
      // (NULL) qualified facet never wakes it.
      requires: EMAIL_IDS.map((id) => ({
        producer: FILTER[id]!,
        facet: QUALIFIED_FACET,
      })),
      render: registerRender(deps),
      canonicalizer: registerCanon,
    },
    {
      id: BRIEFING,
      kind: "responsibility",
      // The briefing subscribes to each KIND facet on the register.
      requires: KINDS.map((k) => ({ producer: REGISTER, facet: KIND_FACET[k] })),
      render: briefingRender(deps),
      canonicalizer: briefingCanon,
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

  const feed: PressFeed = seedFeed();

  const publishAndWake = (): void => {
    const fm = files({ "press-feed.json": jsonFile(feed) });
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

  const deliver = (inq: Inquiry): void => {
    feed[inq.id] = inq;
    publishAndWake();
  };

  // ======================================================================
  // The scripted beat timeline (mirrors BEATS above).
  // ======================================================================

  // --- Beat 1: COLD BOOT (a couple of qualified inquiries seeded).
  publishAndWake();

  // --- Beat 2: QUIET STRETCH (byte-identical re-scans → whole graph SKIPS).
  publishAndWake();
  publishAndWake();
  publishAndWake();

  // --- Beat 3: THE PR BLAST (the dark lane). An irrelevant inquiry → its
  // relevance filter keeps `qualified: null` → the register never wakes.
  deliver({
    id: BLAST_ID,
    sender_name: "Growth Bot",
    sender_email: "deals@megasaver-promos.example",
    subject: "🔥 50% OFF backlinks + SEO domination this week only!!!",
    body: "Reply STOP to opt out. Boost your domain authority with our network.",
    kind: "irrelevant",
    importance: "normal",
    rev: 1,
  });

  // --- Beat 4: THE HUMAN GATE. A HIGH-importance partnership inquiry → the
  // register updates AND the briefing stops at needs_human (auto_reply:false),
  // and the `public` projection updates WITHOUT sender PII.
  deliver({
    id: HIGH_ID,
    sender_name: "Priya Ramaswamy",
    sender_email: "priya@apex-ventures.example",
    subject: "Strategic partnership + acquisition conversation",
    body: "Apex Ventures wants to discuss a strategic partnership and a possible acquisition. Time-sensitive.",
    kind: "partnership",
    importance: "high",
    rev: 1,
  });

  // --- Beat 5: SELF-TICK FLOOR (self-sourced wake; inputs unmoved → self skip).
  dag.tick(BRIEFING);
  dag.tick(BRIEFING);

  // --- Beat 6: FINAL QUIET (byte-identical re-scans → back to flat). The gate
  // holds across every quiet re-poll; the brief does not drift, never auto-sends.
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
      QUALIFIED_FACET,
      ...KINDS.map((k) => KIND_FACET[k]),
      PUBLIC_FACET,
    ],
  };
}

// Allow `tsx generate.ts` / `node` invocation to (re)write the committed replay/.
if (require.main === module) {
  const here = join(__dirname, "replay");
  const result = generatePressDeskExample({ stateDir: here });
  // eslint-disable-next-line no-console
  console.log(
    `press-desk: wrote ${result.receiptsCount} receipts, ${result.nodeCount} nodes, ${result.edgeCount} edges → ${result.stateDir}`,
  );
}
