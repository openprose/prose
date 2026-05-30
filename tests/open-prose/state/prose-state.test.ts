// Conformance tests for the RESHAPE of the VM doc (prose.md) + the state backends
// (state/{README,filesystem,sqlite,postgres,in-context}.md).
//
// These assert the docs embody the Intelligent React end-state:
//   - world-model.md §1: the canonical world-model is the truth; SQL/vector are
//     DERIVED PROJECTIONS, never the truth; published is fingerprinted, workspace
//     scratch never is.
//   - delta.md Part B §B6 + Part F "State shape": re-point bindings/ to the
//     canonical world-model artifact; add a canonical-serialization-before-
//     fingerprint pass; reframe copy_binding -> "write world-model + sign
//     receipt"; delete the policy/responsibility-status/pressure registry.
//   - architecture.md §5.2/§10: deterministic canonical serialization.
//
// Doc-conformance only (read the source docs, assert on content), matching
// tests/open-prose/contract-markdown/contract-markdown.test.ts.
//
// RUN-WIRING NOTE: vitest in tools/cli is configured with
// include: ["tests/**/*.test.ts"] relative to tools/cli, so this repo-root
// tests/open-prose/ file is NOT yet picked up by the default `pnpm test`. The
// integration/test wave must add the repo-root tests/ dir to a vitest project
// include (or relocate under tools/cli/tests/open-prose/). Until then run with:
//   cd /Users/sl/code/prose && npx vitest run tests/open-prose/state
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function read(rel: string): string {
	return readFileSync(join(repoRoot, "skills/open-prose", rel), "utf8");
}

// Markdown hard-wraps prose, so phrase assertions collapse whitespace.
function flat(rel: string): string {
	return read(rel).replace(/\s+/g, " ");
}

const PROSE = "prose.md";
const README = "state/README.md";
const FS = "state/filesystem.md";
const SQLITE = "state/sqlite.md";
const PG = "state/postgres.md";
const INCTX = "state/in-context.md";

describe("the truth is canonical; SQL/vector are derived projections (world-model.md §1)", () => {
	it("README frames SQL/vector/dashboards as derived projections, never the truth", () => {
		const f = flat(README);
		expect(f).toMatch(/derived projection/i);
		expect(f).toMatch(/never the truth/i);
		expect(f).toMatch(/canonical world-model is a single content-addressable artifact/i);
	});

	it("sqlite declares SQL is a derived projection, not the truth", () => {
		const f = flat(SQLITE);
		expect(f).toMatch(/SQL is a derived projection, not the truth/i);
		// canonical tables present
		expect(read(SQLITE)).toContain("world_model_version");
		expect(read(SQLITE)).toContain("CREATE TABLE IF NOT EXISTS receipt");
	});

	it("postgres declares SQL/vector are derived projections, not the truth", () => {
		const f = flat(PG);
		expect(f).toMatch(/derived projections of it, never the truth/i);
		expect(read(PG)).toContain("openprose.world_model_version");
		expect(read(PG)).toContain("openprose.receipt");
	});

	it("in-context keeps the canonical world-model even in-memory", () => {
		expect(flat(INCTX)).toMatch(/canonical world-model still holds even in-memory/i);
	});
});

describe("workspace vs published is fingerprint-materiality, not visibility (delta.md Part F)", () => {
	it("filesystem reframes workspace as never-fingerprinted private scratch", () => {
		const f = flat(FS);
		expect(f).toMatch(/never fingerprinted/i);
		expect(f).toMatch(/never subscribed to/i);
		// explicitly distinguishes from the old visibility-only model
		expect(f).toMatch(/not.*mere output-visibility/i);
		expect(f).toMatch(/fingerprint-materiality/i);
	});

	it("filesystem re-points bindings/ to the canonical world-model/ artifact", () => {
		const src = read(FS);
		// the published canonical directory exists in the layout
		expect(src).toContain("world-model/");
		// .version content-address stamp present on a committed node
		expect(src).toContain(".version");
		// the old caller path is now under world-model/, not bindings/
		expect(src).toContain("world-model/caller/{name}.md");
	});
});

describe("canonical-serialization-before-fingerprint pass (architecture.md §5.2/§10)", () => {
	it("filesystem documents the deterministic serialization + canonicalize + fingerprint pass", () => {
		const f = flat(FS);
		expect(f).toMatch(/Canonical-Serialization-Before-Fingerprint Pass/i);
		expect(f).toMatch(/stable file ordering/i);
		expect(f).toMatch(/path\/encoding normalization/i);
		// the pass: serialize -> canonicalize -> fingerprint -> sign
		expect(f).toMatch(/serialize canonically/i);
		expect(f).toMatch(/compiled canonicalizer/i);
	});

	it("filesystem keeps immaterial churn (fetched_at) in workspace, never published", () => {
		expect(flat(FS)).toMatch(/fetched_at/i);
		expect(flat(FS)).toMatch(/immaterial churn/i);
	});
});

describe("copy_binding reframed to write-world-model + sign-receipt (delta.md §B6 prose.md)", () => {
	it("prose.md replaces copy_binding with commit_world_model", () => {
		const src = read(PROSE);
		expect(src).toContain("commit_world_model");
		// the old dumb-copy primitive name is gone
		expect(src).not.toMatch(/`copy_binding`/);
	});

	it("prose.md frames publishing as write world-model + sign receipt, not a copy", () => {
		const f = flat(PROSE);
		expect(f).toMatch(/write world-model \+ sign receipt/i);
	});

	it("filesystem documents the commit-and-sign protocol replacing copy-on-return", () => {
		const f = flat(FS);
		expect(f).toMatch(/Commit-and-Sign Protocol/i);
		expect(f).toMatch(/Only a `?rendered`? receipt with a moved fingerprint propagates/i);
	});
});

describe("render-harness seam: read prior WM by reference, scratch never fingerprinted (architecture.md §7.3)", () => {
	it("prose.md adds the render harness seam reading the prior WM by reference", () => {
		const f = flat(PROSE);
		expect(f).toMatch(/Render Harness Seam/i);
		expect(f).toMatch(/Locate the prior world-model by reference/i);
		// not stuffed into context
		expect(f).toMatch(/not.*handed the world-model stuffed into context/i);
		expect(f).toMatch(/Scratch is never fingerprinted and never subscribed to/i);
	});
});

describe("the judge/pressure activation envelope is retired (delta.md §B4, Part F)", () => {
	it("prose.md drops the judge/pressure status env vars", () => {
		const src = read(PROSE);
		expect(src).not.toContain("PROSE_RESPONSIBILITY_STATUS_LATEST");
		expect(src).not.toContain("PROSE_RESPONSIBILITY_STATUS_LOG");
		expect(src).not.toContain("PROSE_PRESSURE_ID");
		expect(src).not.toContain("PROSE_PRESSURE_DEDUPE_KEY");
		expect(src).not.toMatch(/judge-responsibility\.prose\.md/);
	});

	it("prose.md replaces the judge beat with the reconciler comparing fingerprints", () => {
		const f = flat(PROSE);
		expect(f).toMatch(/no judge beat/i);
		expect(f).toMatch(/reconciler.*compared fingerprints/i);
	});

	it("the responsibility kind row drops the judge/trigger/fulfillment framing", () => {
		const src = read(PROSE);
		expect(src).not.toMatch(/Standing goal compiled into judge, trigger, and fulfillment intent/);
		expect(src).toMatch(/mounted DAG node/i);
	});
});

describe("the policy / responsibility-status / pressure registry is deleted (Part F: State shape)", () => {
	it("filesystem layout no longer carries state/responsibilities with status/pressure files", () => {
		const src = read(FS);
		expect(src).not.toContain("state/responsibilities/");
		expect(src).not.toContain("pressure.latest.json");
		expect(src).not.toContain("status.jsonl");
		expect(src).not.toContain("pressure.jsonl");
		// replaced by the durable per-node world-model namespace
		expect(src).toContain("state/world-model/");
	});

	it("sqlite + postgres state the wake decision is fingerprint comparison, no registry", () => {
		expect(flat(SQLITE)).toMatch(/no policy \/ responsibility-status \/ pressure registry/i);
		expect(flat(PG)).toMatch(/no policy \/ responsibility-status \/ pressure registry/i);
	});
});

describe("README envelope reflects ledger + canonical WM, not the old vm.log/bindings split", () => {
	it("README durable envelope names the receipt ledger and canonical world-model", () => {
		const f = flat(README);
		expect(f).toMatch(/append-only receipt ledger/i);
		expect(f).toMatch(/canonical world-model/i);
	});
});
