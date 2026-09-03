// Conformance test for the RESHAPED SKILL doc, primitives/session.md — the
// render's harness contract.
//
// session.md is the existing render-harness contract reshaped to the end-state:
// a render reads its inputs + prior world-model BY REFERENCE, leaves its
// ### Maintains postconditions satisfied, writes the CANONICAL world-model (the
// private workspace scratch is NEVER fingerprinted), and signs a RECEIPT with the
// fingerprints (by applying the compiled canonicalizer locally — works
// standalone). It signals `rendered` or `failed`; `skipped` is never the render's
// signal. Language-layer sovereignty: a render only knows its own node.
//
// Doc-conformance style matching tests/open-prose/forme/forme.test.ts.
//
// RUN from the repo root:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/primitives
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const docPath = join(repoRoot, "skills/open-prose/primitives/session.md");

function doc(): string {
	return readFileSync(docPath, "utf8").replace(/\s+/g, " ");
}

describe("session.md — the render atom and language-layer sovereignty", () => {
	it("frames the session as a render: (contract, evidence, prior WM) -> (new WM, receipt)", () => {
		const source = doc();
		// The render atom signature.
		expect(source).toMatch(/\bcontract,?\s*evidence,?\s*prior world-model\b/i);
		expect(source).toMatch(/new world-model,?\s*receipt/i);
	});

	it("keeps language-layer sovereignty: a render only knows its own node", () => {
		const source = doc();
		// Language sovereignty: standalone vs mounted.
		expect(source).toMatch(/only know about your own/i);
		expect(source).toMatch(/standalone/i);
		expect(source).toMatch(/mounting is additive|mounting adds/i);
	});
});

describe("session.md — read by reference (evidence + prior world-model)", () => {
	it("reads inputs by reference, not inlined, via the waking receipt + semantic_diff", () => {
		const source = doc();
		// Evidence arrives by reference.
		expect(source).toMatch(/by reference/i);
		expect(source).toMatch(/semantic_diff/);
		expect(source).toMatch(/never (a wake signal|the reason you commit)/i);
	});

	it("reads the prior world-model by reference and treats it as continuity", () => {
		const source = doc();
		// Memory is folded into the world-model.
		expect(source).toMatch(/prior world-model/i);
		expect(source).toMatch(/never pre-stuffed into context/i);
		// the single world-model subsumes the old per-agent memory ledger.
		expect(source).toMatch(/subsume/i);
	});

	it("pins a content-addressed snapshot to avoid torn reads", () => {
		const source = doc();
		// Cross-node read isolation.
		expect(source).toMatch(/pinned|snapshot/i);
		expect(source).toMatch(/torn read/i);
	});
});

describe("session.md — workspace is never fingerprinted; world-model is canonical", () => {
	it("declares the workspace private scratch, never fingerprinted, never subscribed", () => {
		const source = doc();
		// Workspace scratch is never fingerprinted.
		expect(source).toMatch(/workspace[^.]*never fingerprinted/i);
		expect(source).toMatch(/never subscribed/i);
	});

	it("commits the structured truth to the canonical world-model artifact", () => {
		const source = doc();
		// The structured-backing rule.
		expect(source).toMatch(/canonical world-model artifact/i);
		expect(source).toMatch(/fingerprint the structured truth/i);
		expect(source).toMatch(/render prose from it|derived projection/i);
	});
});

describe("session.md — postconditions, not a judge", () => {
	it("teaches deterministic verify-on-commit and render-attested postconditions", () => {
		const source = doc();
		// Commit-gating is validators plus self-attestation, not a judge.
		expect(source).toMatch(/postcondition/i);
		expect(source).toMatch(/attest/i);
		expect(source).toMatch(/no separate judge|There is no separate judge/i);
	});
});

describe("session.md — the receipt and the rendered/failed signal", () => {
	it("describes signing a receipt with fingerprints by applying the canonicalizer locally", () => {
		const source = doc();
		// The render signs its own receipt.
		expect(source).toMatch(/\breceipt\b/i);
		expect(source).toMatch(/fingerprints/i);
		expect(source).toMatch(/compiled canonicalizer.*locally|applying.*canonicalizer/i);
		expect(source).toMatch(/works standalone|standalone/i);
	});

	it("signals rendered or failed; skipped is never the render's signal", () => {
		const source = doc();
		// rendered / failed are the render's signals.
		expect(source).toMatch(/\brendered\b/);
		expect(source).toMatch(/\bfailed\b/);
		expect(source).toMatch(/`?skipped`? is \*{0,2}never\*{0,2} your signal/i);
		expect(source).toMatch(/Skipping is the reconciler'?s decision/i);
	});

	it("returns references not values", () => {
		const source = doc();
		// Read-by-reference; the harness tracks pointers.
		expect(source).toMatch(/references,? not values|references, not values/i);
	});
});

describe("session.md — retired vocabulary is gone", () => {
	it("does not teach the retired bindings/ensures/judge framing as live", () => {
		const source = doc();
		// ### Ensures -> ### Maintains; bindings -> world-model.
		expect(source).not.toMatch(/copy-on-return/i);
		expect(source).not.toMatch(/### Ensures/);
		expect(source).not.toMatch(/\bverdict\b/i);
	});
});
