// The tamper-forge LEARNING-EXAMPLE generator.
//
// tamper-forge is an AUDIT/REPLAY LENS over an EXISTING ledger — it does NOT
// define a new DAG. Its committed `replay/` state-dir IS the masked-relay ledger,
// regenerated through the REAL @openprose/reactor reconciler with deterministic
// fake renders (NO model key), so the example depends on (and stays byte-identical
// to) masked-relay. We then overwrite two files with tamper-forge-specific
// narration:
//
//   compile/labels.json   — keeps the masked-relay node labels (so devtools can
//                           still replay the graph) but is re-emitted here so a
//                           tamper-forge regen is self-contained and lossless.
//   beats.json            — REPLACED with the cold -> quiet-skip -> SURPRISE
//                           (3-attack) audit timeline this example teaches.
//
// The receipts.json / topology.json / world-models/<HEX>/… bytes are produced by
// the shared masked-relay generator verbatim, so:
//   - the audit operates on the SAME 41-receipt trail the strangers' corpus cites
//     (the 41/41 computeReceiptContentHash recompute), and
//   - any drift between masked-relay and tamper-forge is caught by the byte-equal
//     determinism assertion in tamper-forge.test.ts.
//
// Determinism: the masked-relay generator is a pure function of its scripted
// episode; this overlay writes two pure JSON files. Same generator => byte-
// identical state-dir.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  generateMaskedRelayExample,
  type GenerateOptions as MaskedRelayOptions,
} from "../masked-relay/generate";

export type GenerateOptions = MaskedRelayOptions;

export interface GenerateResult {
  readonly stateDir: string;
  /** Receipts in the replayed masked-relay trail (the audit's subject). */
  readonly receiptsCount: number;
  /** Distinct nodes in the trail (each gets its own prev-linked chain). */
  readonly nodeCount: number;
}

// The tamper-forge beat timeline — the 3-attack escalation the README + the
// deterministic gate walk. SELF-WRITTEN so a regen is lossless (never clobbers a
// adjacent beats file), exactly as the masked-relay normalization requires.
const BEATS = {
  scenario: "tamper-forge",
  title:
    "An audit/replay lens over the masked-relay ledger. Chain-verify catches a naive cost-inflation edit; a public-hash re-stamp heals the chain (honest book-keeping, NOT cryptographic non-repudiation under the v1 null signer); a forged sig.scheme is rejected; and the documented world-model integrity gap is asserted so it can't regress silently.",
  beats: [
    {
      name: "cold-audit",
      from: 0,
      to: 40,
      holdMs: 2600,
      caption:
        "cold audit · verifyReceiptChain passes over all 13 per-node chains · 41/41 receipts recompute their content_hash via computeReceiptContentHash · the trail is internally consistent",
    },
    {
      name: "quiet-reaudit",
      from: 0,
      to: 40,
      holdMs: 2200,
      caption:
        "a byte-identical re-presentation of the SAME ledger · the trail fingerprint did not move · the auditor memo-SKIPS · fresh 0 — cost scales with surprise, not the clock",
    },
    {
      name: "attack-a-naive-edit",
      from: 1,
      to: 1,
      holdMs: 3200,
      caption:
        "ATTACK (a) · inflate a receipt's cost.tokens.fresh and leave the stale content_hash · CHAIN-VERIFY FAILED · the mutated body no longer hashes to its recorded content_hash",
    },
    {
      name: "attack-b-restamp",
      from: 1,
      to: 1,
      holdMs: 3200,
      caption:
        "ATTACK (b) · re-stamp the edited receipt's public content_hash via computeReceiptContentHash · chain PASSES again · HONEST book-keeping, NOT non-repudiation — a null signer means whoever rewrites the file can also recompute the hash",
    },
    {
      name: "attack-c-forged-sig",
      from: 0,
      to: 0,
      holdMs: 3000,
      caption:
        "ATTACK (c) · forge sig.scheme to claim a signed posture the run never had · REJECTED · verifyReceipt flags the receipt whose content_hash no longer covers its mutated signature envelope",
    },
    {
      name: "boundary-d-world-model-gap",
      from: 0,
      to: 0,
      holdMs: 3400,
      caption:
        "BOUNDARY (d) · edit a world-models/<hex>/published.json artifact but leave receipts.json intact · receipts chain-verify still PASSES · the maintained truth sits OUTSIDE the receipt integrity envelope · asserted as CURRENT behavior so it can't regress silently",
    },
  ],
};

/**
 * Build the tamper-forge `replay/` state-dir at `opts.stateDir`. Regenerates the
 * masked-relay ledger verbatim (the audit's subject), then overlays the
 * tamper-forge `beats.json`. Re-running with the same path reproduces the same
 * bytes (lossless regen).
 */
export function generateTamperForgeExample(
  opts: GenerateOptions,
): GenerateResult {
  const masked = generateMaskedRelayExample(opts);
  const { stateDir } = opts;

  // --- Overlay the tamper-forge beat timeline (the 3-attack escalation). ----
  // Self-written so a regen is LOSSLESS — it replaces the masked-relay beats
  // with the audit narrative this example teaches.
  writeFileSync(
    join(stateDir, "beats.json"),
    `${JSON.stringify(BEATS, null, 2)}\n`,
    "utf8",
  );

  // --- Keep labels.json present + self-contained for this example. ----------
  // (Re-emit the same masked-relay labels so devtools can still draw the graph
  // the audit inspects; normalized: labels.json present for every example.)
  const compileDir = join(stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  const labels = readFileSync(join(compileDir, "labels.json"), "utf8");
  writeFileSync(join(compileDir, "labels.json"), labels, "utf8");

  // Count distinct nodes in the trail (each has its own prev-linked chain).
  const receipts = JSON.parse(
    readFileSync(join(stateDir, "receipts.json"), "utf8"),
  ) as { readonly node: string }[];
  const nodes = new Set(receipts.map((r) => r.node));

  return {
    stateDir,
    receiptsCount: masked.receiptsCount,
    nodeCount: nodes.size,
  };
}

// Allow `tsx generate.ts` / `node generate.js` to (re)freeze the committed
// `replay/` state-dir in place.
if (require.main === module) {
  const out = join(__dirname, "replay");
  const res = generateTamperForgeExample({ stateDir: out });
  // eslint-disable-next-line no-console
  console.log(
    `tamper-forge: ${res.receiptsCount} receipts · ${res.nodeCount} nodes -> ${out}`,
  );
}
