// Compile-checks the README's SDK snippets VERBATIM against the public surface so
// the docs can never silently drift from the real API (the same discipline as
// evals-guide.test.ts, but type-level: these snippets configure the live
// `@openai/agents` render, so we assert they TYPE-CHECK rather than run a model).
//
// Each block below mirrors a README ```ts``` fence, imported from the SAME public
// homes the README names — the front door `.` (here `./index`), the escape-hatch
// `/agents` (here `./agents`), and the injection seam `/adapters` (here
// `./adapters`). If a name moves, these imports break and both must be fixed.

import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── README: "Hello world — the reactor() facade" ────────────────────────────
import { reactor } from "./index";

// ── README: "Verify a receipt" ──────────────────────────────────────────────
import { verifyReceipt } from "./index";
import {
  inspectReceiptProof,
  projectReceiptProof,
  type LedgerReceipt,
  type ReceiptProofInspection,
} from "./internals";

// ── README: "Configure the agent fully" + "Swap a backend" ──────────────────
import type {
  RenderOptions,
  RenderBackend,
  RenderSessionRequest,
  RenderSessionOutput,
} from "./agents";
import { fileSystemSubstrate, inMemorySubstrate } from "./adapters";

test("README snippets type-check against the public surface", () => {
  // The facade returns the typed handle; we only need it to TYPE-CHECK (calling it
  // would compile a project + load a render provider), so reference it type-only.
  const _facade: typeof reactor = reactor;
  void _facade;

  // "Verify a receipt" — the receipt/projection helpers on /internals.
  const inspectStoredReceipt = (receipt: LedgerReceipt) => {
    const verification = verifyReceipt(receipt);
    if (!verification.ok) {
      throw new Error(verification.errors.join("; "));
    }
    return inspectReceiptProof(receipt);
  };
  const publicReceiptEvidence = (proof: ReceiptProofInspection) => {
    const result = projectReceiptProof({ tier: "public", proof });
    if (!result.ok) {
      throw new Error(result.errors.join("; "));
    }
    return result.projection;
  };
  void inspectStoredReceipt;
  void publicReceiptEvidence;

  // "Configure the agent fully" — the layered @openai/agents escape hatch. The
  // reserved four (instructions/tools/outputType/name) would be a COMPILE ERROR.
  const render: RenderOptions = {
    model: "anthropic/claude-sonnet-4",
    temperature: 0.2,
    maxTurns: 24,
    agent: { modelSettings: { providerData: { top_p: 0.9 } } },
    runConfig: { workflowName: "nightly-digest" },
    instructionsSuffix: "Prefer terse, sourced claims.",
  };
  void render;

  // "Swap a backend" — the @openai/agents-free RenderBackend port.
  const recordingBackend: RenderBackend = {
    async runSession(_req: RenderSessionRequest): Promise<RenderSessionOutput> {
      return {
        signal: undefined,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    },
  };
  void recordingBackend;

  // The substrate factories build the persistence record correctly. The README
  // shows `directory: "./state"`; here we point the (eagerly-created) durable
  // store at an OS temp dir and clean it up so the snippet check never litters
  // the working tree — same discipline as evals-guide.test.ts.
  const dir = mkdtempSync(join(tmpdir(), "readme-snippets-"));
  try {
    const durable = fileSystemSubstrate({ directory: dir });
    const ephemeral = inMemorySubstrate();
    void durable;
    void ephemeral;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
