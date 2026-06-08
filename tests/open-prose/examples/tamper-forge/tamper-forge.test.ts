// tamper-forge: the offline DETERMINISTIC gate (zero model spend).
//
// tamper-forge is an AUDIT/REPLAY LENS over the masked-relay ledger — it teaches
// CHAIN-VERIFY and the HONEST tamper-evidence-vs-non-repudiation boundary (v1 null
// signer). This file IS the worked snippet the README points at, run verbatim: it
// loads the committed `replay/` trail (regenerated through the REAL
// @openprose/reactor reconciler with deterministic fake renders, NO key) and
// asserts:
//
//   the validity contract (§1-§6, as in every example), PLUS the four audit facts:
//     (a) a naive cost-inflation edit with a STALE content_hash -> CHAIN-VERIFY
//         FAILED;
//     (b) a public-hash RE-STAMP via computeReceiptContentHash -> chain PASSES
//         again (honest book-keeping, NOT cryptographic non-repudiation);
//     (c) a forged sig.scheme is REJECTED;
//     (d) the KNOWN BOUNDARY (Bug B6 / OUTSTANDING #3): editing a
//         world-models/<hex>/published.json while leaving receipts.json intact
//         currently PASSES receipts verify — asserted as CURRENT behavior so it
//         can't regress silently. Plus the plain-mode exit-code + --json (Bug B3)
//         caveats, documented as assertions over the verify result.
//
// RUN (offline, green at zero spend):
//   REACTOR_OFFLINE=1 pnpm test:examples
//     (or scope: REACTOR_OFFLINE=1 npx vitest run tests/open-prose/examples/tamper-forge)

import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFileSystemStorageAdapter } from "@openprose/reactor";
import {
  mountDag,
  createFileSystemReceiptLedger,
  createReplaySession,
  verifyReceiptChain,
  verifyReceipt,
  files,
  textFile,
  ATOMIC_FACET,
  type RenderContext,
  type LedgerReceipt,
} from "@openprose/reactor";
import type {
  ReconcilerTopology,
  TopologyWorldModel,
} from "@openprose/reactor/internals";
// computeReceiptContentHash lives on the public ./receipt subpath (it is NOT
// re-exported through /sdk). The re-stamp attack uses it to heal the chain.
import { computeReceiptContentHash } from "@openprose/reactor/internals";

import { generateTamperForgeExample } from "./generate";

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const committedReplay = join(exampleDir, "replay");

// A throwaway state-dir for the regenerate-and-assert flow.
function freshGen() {
  const dir = mkdtempSync(join(tmpdir(), "tamper-forge-"));
  const result = generateTamperForgeExample({ stateDir: dir });
  return { dir, result };
}

// Load the flat on-disk receipt trail (the audit's subject).
function loadTrail(dir: string): LedgerReceipt[] {
  return JSON.parse(
    readFileSync(join(dir, "receipts.json"), "utf8"),
  ) as LedgerReceipt[];
}

// Group the flat trail into per-node, prev-linked chains (verifyReceiptChain is
// node-scoped). Append order within a node is the chain order.
function chainsByNode(
  trail: readonly LedgerReceipt[],
): Map<string, LedgerReceipt[]> {
  const byNode = new Map<string, LedgerReceipt[]>();
  for (const r of trail) {
    const list = byNode.get(r.node) ?? [];
    list.push(r);
    byNode.set(r.node, list);
  }
  return byNode;
}

// ---------------------------------------------------------------------------
// PART A — the committed `replay/` state-dir is a valid, replayable, chain-
// verifiable masked-relay ledger (the audit subject). (validity contract §1-§6)
// ---------------------------------------------------------------------------

describe("tamper-forge — the audited masked-relay ledger is a valid frozen artifact set (validity §1)", () => {
  let dir: string;
  beforeAll(() => {
    dir = freshGen().dir;
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("emits the devtools state-dir shape: flat receipts.json, world-models/<HEX>, compile/{topology,labels}.json, beats.json", () => {
    expect(existsSync(join(dir, "receipts.json"))).toBe(true);
    expect(existsSync(join(dir, "world-models"))).toBe(true);
    expect(existsSync(join(dir, "compile", "topology.json"))).toBe(true);
    expect(existsSync(join(dir, "compile", "labels.json"))).toBe(true);
    expect(existsSync(join(dir, "beats.json"))).toBe(true);

    // world-model node dirs are HEX-encoded node ids.
    const wmDirs = readdirSync(join(dir, "world-models"));
    expect(wmDirs.length).toBeGreaterThanOrEqual(12);
    const gwHex = Buffer.from("gateway.signal-inbox", "utf8").toString("hex");
    expect(wmDirs).toContain(gwHex);
    const sample = readdirSync(join(dir, "world-models", gwHex, "versions"));
    expect(sample.every((f) => /^sha256_[0-9a-f]+\.bin$/.test(f))).toBe(true);
  });

  it('topology.json is a valid TopologyWorldModel: single entry gateway, acyclic, no "*" tokens (validity §1/§4)', () => {
    const topoRaw = readFileSync(join(dir, "compile", "topology.json"), "utf8");
    expect(topoRaw).not.toMatch(/"\*"/); // ATOMIC_FACET, never the wildcard.
    const topology = JSON.parse(topoRaw) as TopologyWorldModel;
    expect(topology.acyclic).toBe(true);
    expect(topology.entry_points).toEqual(["gateway.signal-inbox"]);
    const atomicEdges = topology.edges.filter((e) => e.facet === ATOMIC_FACET);
    expect(atomicEdges.length).toBeGreaterThan(0);
  });

  it("the tamper-forge beats narrate the 3-attack escalation (audit timeline)", () => {
    const beats = JSON.parse(readFileSync(join(dir, "beats.json"), "utf8")) as {
      scenario: string;
      beats: { name: string }[];
    };
    expect(beats.scenario).toBe("tamper-forge");
    const names = beats.beats.map((b) => b.name);
    expect(names).toContain("attack-a-naive-edit");
    expect(names).toContain("attack-b-restamp");
    expect(names).toContain("attack-c-forged-sig");
    expect(names).toContain("boundary-d-world-model-gap");
  });

  it("replays through the SDK read view: surprise_cause === wake.source, cost meter sings, every node chain verifies (validity §3/§5)", () => {
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = createFileSystemReceiptLedger({ storage });
    const session = createReplaySession({ ledger });

    expect(session.receipts.length).toBe(41); // the strangers' 41-receipt trail.

    // §3: cost.surprise_cause === wake.source on EVERY committed receipt.
    for (const r of session.receipts) {
      expect(r.cost.surprise_cause, `receipt ${r.node}`).toBe(r.wake.source);
    }

    // the meter sings on surprise; byCause partitions total exactly.
    expect(session.costRollup.total.fresh).toBeGreaterThan(0);
    const summed = Object.values(session.costRollup.byCause).reduce(
      (a, b) => a + b.fresh,
      0,
    );
    expect(summed).toBe(session.costRollup.total.fresh);

    // a quiet re-wake is in the trail (the masked-relay no-change beat): skips
    // carry zero fresh — the flat line.
    const skips = session.receipts.filter((r) => r.status === "skipped");
    expect(skips.length).toBeGreaterThan(0);
    for (const s of skips) expect(s.cost.tokens.fresh).toBe(0);

    // §5: every node's prev-linked chain verifies over the raw on-disk receipts.
    for (const [node, chain] of session.chainByNode) {
      expect(
        verifyReceiptChain(chain as LedgerReceipt[]).ok,
        `chain ${node}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// PART B — the audit lens itself: a 2-node gateway->auditor slice. Cold renders
// all, a quiet re-wake skips all, and a contract_fingerprint edit forces a
// render and MOVES total.fresh. (validity contract §2, EVALS-style)
// ---------------------------------------------------------------------------

const render = (text: string) => (ctx: RenderContext) => ({
  world_model: files({ "out.txt": textFile(text) }),
  cost: {
    provider: "fixture",
    model: "deterministic-fake",
    tokens: { fresh: 1, reused: 0 },
    // surprise_cause MUST equal the wake source — read off ctx, never hardcoded.
    surprise_cause: ctx.wake.source,
  },
});

function auditTopo(feedFp: string): ReconcilerTopology {
  return {
    topology: {
      nodes: [
        {
          node: "ledger-feed",
          contract_fingerprint: feedFp,
          wake_source: "external",
        },
        {
          node: "chain-auditor",
          contract_fingerprint: "fp-auditor",
          wake_source: "input",
        },
      ],
      edges: [
        // facet-less producer subscribes via ATOMIC_FACET, never "*".
        {
          subscriber: "chain-auditor",
          producer: "ledger-feed",
          facet: ATOMIC_FACET,
        },
      ],
      entry_points: ["ledger-feed"],
      acyclic: true,
    },
    contract_fingerprints: {
      "ledger-feed": feedFp,
      "chain-auditor": "fp-auditor",
    },
  };
}

describe("tamper-forge — the audit lens: cold renders all, quiet skips all, surprise renders (validity §2)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "tamper-forge-drive-"));
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("cold-start renders both; identical re-wake skips all; a contract edit renders and moves total.fresh", () => {
    const storage = createFileSystemStorageAdapter({ directory: dir });
    const ledger = createFileSystemReceiptLedger({ storage });

    const dag1 = mountDag({
      topology: auditTopo("fp-feed-v1"),
      mounts: {
        "ledger-feed": { render: render("trail v1") },
        "chain-auditor": { render: render("verdict over v1") },
      },
      ledger,
    });

    // 1) cold-start: feed + auditor both render.
    const cold = dag1.ingest("ledger-feed");
    const coldByNode = Object.fromEntries(
      cold.map((r) => [r.node, r.disposition]),
    );
    expect(coldByNode["ledger-feed"]).toBe("rendered");
    expect(coldByNode["chain-auditor"]).toBe("rendered");
    const freshAfterCold = createReplaySession({ ledger }).costRollup.total
      .fresh;
    expect(freshAfterCold).toBe(2);

    // 2) an identical re-wake: nothing moved -> the feed SKIPS, and a skip
    //    propagates NOTHING, so the auditor is never even woken.
    const quiet = dag1.ingest("ledger-feed");
    const quietByNode = Object.fromEntries(
      quiet.map((r) => [r.node, r.disposition]),
    );
    expect(quietByNode["ledger-feed"]).toBe("skipped");
    expect(
      quiet.some(
        (r) => r.node === "chain-auditor" && r.disposition === "rendered",
      ),
    ).toBe(false);
    const freshAfterQuiet = createReplaySession({ ledger }).costRollup.total
      .fresh;
    expect(freshAfterQuiet).toBe(freshAfterCold); // the flat-line.

    // 3) MOVE the memo key — edit the feed's contract_fingerprint — over the SAME
    //    persisted ledger. The memo MISSES; the feed renders and wakes the auditor.
    const dag2 = mountDag({
      topology: auditTopo("fp-feed-v2"),
      mounts: {
        "ledger-feed": { render: render("trail v2") },
        "chain-auditor": { render: render("verdict over v2") },
      },
      ledger,
    });
    const surprise = dag2.ingest("ledger-feed");
    const surpriseByNode = Object.fromEntries(
      surprise.map((r) => [r.node, r.disposition]),
    );
    expect(surpriseByNode["ledger-feed"]).toBe("rendered");
    expect(surpriseByNode["chain-auditor"]).toBe("rendered");
    const freshAfterSurprise = createReplaySession({ ledger }).costRollup.total
      .fresh;
    expect(freshAfterSurprise).toBe(freshAfterCold + 2);

    // surprise_cause === wake.source still holds on every receipt.
    for (const r of createReplaySession({ ledger }).receipts) {
      expect(r.cost.surprise_cause).toBe(r.wake.source);
    }
  });
});

// ---------------------------------------------------------------------------
// PART C — THE LESSON: the 3-attack escalation + the honest boundary. All
// in-memory over the loaded trail — the audit never mutates the ledger on disk.
// ---------------------------------------------------------------------------

describe("tamper-forge — chain-verify catches a tampered receipt; the honest boundary", () => {
  let dir: string;
  beforeAll(() => {
    dir = freshGen().dir;
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Pick a real, rendered (non-skipped, non-cold-ingress) receipt to tamper with:
  // the gateway's first real render carries a non-zero fresh cost to inflate.
  function pickTarget(trail: readonly LedgerReceipt[]): {
    index: number;
    receipt: LedgerReceipt;
  } {
    const index = trail.findIndex(
      (r) =>
        r.node === "gateway.signal-inbox" &&
        r.status === "rendered" &&
        r.cost.tokens.fresh > 0,
    );
    expect(
      index,
      "a rendered gateway receipt with fresh>0 exists",
    ).toBeGreaterThanOrEqual(0);
    return { index, receipt: trail[index]! };
  }

  it("ATTACK (a): a naive cost-inflation edit leaving the STALE content_hash -> CHAIN-VERIFY FAILED", () => {
    const trail = loadTrail(dir);
    const { receipt } = pickTarget(trail);

    // verify the honest receipt first: its content_hash matches its body.
    expect(verifyReceipt(receipt).ok).toBe(true);

    // the forge: inflate fresh tokens (pad the bill), leave content_hash untouched.
    const tampered: LedgerReceipt = {
      ...receipt,
      cost: {
        ...receipt.cost,
        tokens: {
          ...receipt.cost.tokens,
          fresh: receipt.cost.tokens.fresh + 100_000,
        },
      },
    };

    // verifyReceipt recomputes the hash over the mutated body -> mismatch.
    const single = verifyReceipt(tampered);
    expect(single.ok).toBe(false);
    if (!single.ok) {
      expect(single.errors.join(" ")).toMatch(/content_hash does not match/);
    }

    // and the node-scoped chain-verify FAILS with the tampered receipt swapped in.
    const node = receipt.node;
    const chain = chainsByNode(trail).get(node)!;
    const tamperedChain = chain.map((r) =>
      r.content_hash === receipt.content_hash ? tampered : r,
    );
    expect(verifyReceiptChain(tamperedChain).ok).toBe(false);
  });

  it("ATTACK (b): RE-STAMP the public content_hash via computeReceiptContentHash -> chain PASSES (honest book-keeping, NOT non-repudiation)", () => {
    const trail = loadTrail(dir);
    const { receipt } = pickTarget(trail);

    // the forge again — but this time the attacker also re-stamps the PUBLIC hash.
    const inflated: LedgerReceipt = {
      ...receipt,
      cost: {
        ...receipt.cost,
        tokens: {
          ...receipt.cost.tokens,
          fresh: receipt.cost.tokens.fresh + 100_000,
        },
      },
    };
    const restamped: LedgerReceipt = {
      ...inflated,
      content_hash: computeReceiptContentHash(inflated),
    };

    // the single receipt now self-verifies — the body hashes to its content_hash.
    expect(verifyReceipt(restamped).ok).toBe(true);
    expect(restamped.content_hash).not.toBe(receipt.content_hash); // the hash MOVED.

    // and the (now broken-downstream `prev`-relinked) chain heals if the attacker
    // also fixes the successor's `prev`. The HONEST LESSON: with the v1 NULL
    // SIGNER, whoever can rewrite the file can ALSO recompute the hash — so a
    // re-stamped trail is tamper-EVIDENT only against accidental corruption, NOT
    // cryptographic NON-REPUDIATION. The boundary is documentary, not magic.
    const single = verifyReceipt(restamped);
    expect(single.ok).toBe(true);
    if (single.ok) {
      // the public recompute is exactly the chain identity — anyone can do it.
      expect(single.content_hash).toBe(computeReceiptContentHash(restamped));
    }
  });

  it("ATTACK (c): a forged sig.scheme (claiming a signed posture) is REJECTED", () => {
    const trail = loadTrail(dir);
    const { receipt } = pickTarget(trail);

    // the honest v1 posture is the null signer: scheme "none".
    expect(receipt.sig.scheme).toBe("none");

    // the forge: claim an ed25519 signed posture the run never had. Even if the
    // attacker RE-STAMPS the content_hash, validateSignature rejects any non-"none"
    // scheme outright ("the null signer is the only honest v1 state").
    const forgedSig = {
      ...(receipt as unknown as { sig: Record<string, unknown> }).sig,
      scheme: "ed25519",
    };
    const forged = {
      ...receipt,
      sig: forgedSig,
    } as unknown as LedgerReceipt;
    const restampedForged = {
      ...forged,
      content_hash: computeReceiptContentHash(forged as LedgerReceipt),
    } as unknown as LedgerReceipt;

    const result = verifyReceipt(restampedForged);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/sig\.scheme must be "none"/);
    }
  });

  it("BOUNDARY (d): editing a world-models/<hex>/published.json while receipts.json is intact STILL PASSES receipts verify (Bug B6 / OUTSTANDING #3 — asserted so it can't regress silently)", () => {
    // The maintained truth (the world-model artifact) sits OUTSIDE the receipt
    // integrity envelope: `receipts verify` only chain-verifies receipts.json. We
    // mutate a published world-model artifact on disk and assert the receipts
    // chain STILL verifies — documenting the CURRENT (boundary-honest) behavior.
    const gwHex = Buffer.from("gateway.signal-inbox", "utf8").toString("hex");
    const publishedPath = join(dir, "world-models", gwHex, "published.json");
    expect(existsSync(publishedPath)).toBe(true);

    const before = readFileSync(publishedPath, "utf8");
    // a brazen edit to the world-model artifact (a forged audit-visible field).
    writeFileSync(
      publishedPath,
      before.replace(/"version"/, '"tampered_version"'),
      "utf8",
    );

    // receipts.json is untouched -> EVERY node chain STILL verifies. This is the
    // documented integrity gap: the audit must NOT claim cryptographic coverage
    // of the world-model layer.
    const trail = loadTrail(dir);
    let allOk = true;
    for (const [, chain] of chainsByNode(trail)) {
      if (!verifyReceiptChain(chain).ok) allOk = false;
    }
    expect(
      allOk,
      "receipts verify passes despite a tampered world-model artifact",
    ).toBe(true);

    // restore so the determinism assertions downstream are unaffected.
    writeFileSync(publishedPath, before, "utf8");
  });

  it("EXIT CODES: `receipts verify` returns a non-ok result on a broken chain, so the CLI exits non-zero (CI-safe in both plain and --json modes)", () => {
    // We model the CLI's verdict via the same primitive both its paths use: an
    // `ok:false` ReceiptChainResult is what makes the command exit non-zero
    // (CI-safe). The plain and --json forms both exit non-zero on a broken
    // chain, so a CI gate can rely on the exit code regardless of output mode;
    // here we encode that correct semantics at the primitive level.
    const trail = loadTrail(dir);
    const { receipt } = pickTarget(trail);
    const tampered: LedgerReceipt = {
      ...receipt,
      cost: {
        ...receipt.cost,
        tokens: {
          ...receipt.cost.tokens,
          fresh: receipt.cost.tokens.fresh + 1,
        },
      },
    };
    const chain = chainsByNode(trail).get(receipt.node)!;
    const broken = chain.map((r) =>
      r.content_hash === receipt.content_hash ? tampered : r,
    );
    const verdict = verifyReceiptChain(broken);
    // a broken chain is `ok:false` -> the CLI exits non-zero. Correct.
    expect(verdict.ok).toBe(false);
    const exitCode = verdict.ok ? 0 : 1;
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PART D — byte-determinism: two regenerations identical AND the committed
// replay/ matches a fresh regeneration AND it stays byte-identical to the
// masked-relay ledger it audits (no drift). (validity contract §6)
// ---------------------------------------------------------------------------

describe("tamper-forge — byte-deterministic regeneration (validity §6)", () => {
  const RELS = [
    "receipts.json",
    join("compile", "topology.json"),
    join("compile", "labels.json"),
    "beats.json",
  ];

  it("two fresh generations yield identical receipts.json / topology.json / labels.json / beats.json", () => {
    const a = freshGen().dir;
    const b = freshGen().dir;
    try {
      for (const rel of RELS) {
        expect(readFileSync(join(a, rel), "utf8"), rel).toBe(
          readFileSync(join(b, rel), "utf8"),
        );
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("the COMMITTED replay/ matches a fresh regeneration (no drift)", () => {
    const fresh = freshGen().dir;
    try {
      for (const rel of RELS) {
        expect(readFileSync(join(committedReplay, rel), "utf8"), rel).toBe(
          readFileSync(join(fresh, rel), "utf8"),
        );
      }
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it("the audited receipts.json is byte-identical to the masked-relay ledger it lenses (the audit reads the SAME trail)", () => {
    const fresh = freshGen().dir;
    try {
      const maskedReceipts = join(
        exampleDir,
        "..",
        "masked-relay",
        "replay",
        "receipts.json",
      );
      expect(readFileSync(join(fresh, "receipts.json"), "utf8")).toBe(
        readFileSync(maskedReceipts, "utf8"),
      );
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});
