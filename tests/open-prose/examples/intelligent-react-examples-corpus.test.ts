// Doc-conformance test for the SHIPPED Intelligent-React learning examples: the
// reactor-substrate examples authored to the validity contract and wired into
// the offline gate alongside their ledger-replay tests under
// tests/open-prose/examples/.
//
// This is a SEPARATE owned list from examples-corpus-migration.test.ts because
// that test asserts the LEGACY judge-era corpus shape: an EXACT
// `responsibilities.length === 7` count and a universal `### Execution` + `call`
// requirement. The Intelligent-React examples model larger DAGs with many
// pure-subscriber responsibilities (no helper `call`), and several use the
// `### Continuity: external-driven` colon form, so they need their own,
// structurally-correct conformance assertions rather than being forced into the
// legacy count + Execution shape.
//
// What it asserts (the per-file shape every author guaranteed):
//   - only the recognized kinds (responsibility/function/gateway/pattern/test)
//   - no retired kinds (system/service) or sections (Ensures/Criteria/...)
//   - every responsibility carries Requires + Maintains + Continuity
//   - every gateway is external-driven, declares no Requires, and Maintains
//   - every function declares Returns and no subscription/wake sections
//
// RUN: npx vitest run tests/open-prose/examples
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const examplesDir = join(repoRoot, "skills/open-prose/examples");

// The shipped Intelligent-React examples wired into the offline gate. KEEP THIS
// LIST IN LOCKSTEP with the examples whose *.test.ts run green in the
// shared vitest gate (tests/open-prose/examples/**). Partial/WIP examples are
// intentionally NOT listed.
const OWNED_EXAMPLES = [
  // agent-observatory and forme-fixpoint were normalized: every responsibility
  // contract now leads its `### Continuity` body with the canonical
  // `input-driven`/`self-driven` token (gateways stay `external-driven`), so
  // they are now doc-conformant and wired into this list alongside their
  // green, gated ledger-replay tests.
  "agent-observatory",
  "basic-unit-suite",
  "context-boundary",
  "forme-fixpoint",
  "github-star-enricher",
  "implementation-pipeline",
  "inbox-triage",
  "masked-relay",
  "monorepo-ci",
  "oblique-weave",
  "renewal-risk",
  "research-tree",
  "surprise-cost",
  "tamper-forge",
];

function proseFiles(): string[] {
  const out: string[] = [];
  for (const ex of OWNED_EXAMPLES) {
    const src = join(examplesDir, ex, "src");
    expect(existsSync(src), `${ex}/src must exist`).toBe(true);
    for (const name of readdirSync(src)) {
      if (name.endsWith(".prose.md")) out.push(join(src, name));
    }
  }
  return out;
}

function read(abs: string): string {
  return readFileSync(abs, "utf8");
}
function frontmatter(abs: string): string {
  const source = read(abs);
  const end = source.indexOf("\n---", 3);
  return source.slice(0, end + 4);
}
function kindOf(abs: string): string {
  const m = /^kind:\s*(\S+)/m.exec(frontmatter(abs));
  return m ? m[1] : "";
}

const ALL = proseFiles();

describe("intelligent-react examples — recognized kinds only", () => {
  it("each owned example ships at least one .prose.md contract", () => {
    expect(ALL.length).toBeGreaterThan(0);
  });

  it("declares no retired `service`/`system` kind", () => {
    for (const f of ALL) {
      const fm = frontmatter(f);
      expect(fm, f).not.toMatch(/kind:\s*service\b/);
      expect(fm, f).not.toMatch(/kind:\s*system\b/);
    }
  });

  it("uses only the five recognized kinds (responsibility/function/gateway/pattern/test)", () => {
    const allowed = new Set([
      "responsibility",
      "function",
      "gateway",
      "pattern",
      "test",
    ]);
    for (const f of ALL) {
      expect(allowed.has(kindOf(f)), `${f} -> ${kindOf(f)}`).toBe(true);
    }
  });
});

describe("intelligent-react examples — retired sections are gone", () => {
  it("no `### Ensures`/`### Criteria`/`### Fulfillment`/`### Constraints`/`### Services`/`### Wiring`/`### Memory` headers", () => {
    for (const f of ALL) {
      const source = read(f);
      expect(source, f).not.toMatch(/^### Ensures\b/m);
      expect(source, f).not.toMatch(/^### Criteria\b/m);
      expect(source, f).not.toMatch(/^### Fulfillment\b/m);
      expect(source, f).not.toMatch(/^### Constraints\b/m);
      expect(source, f).not.toMatch(/^### Services\b/m);
      expect(source, f).not.toMatch(/^### Wiring\b/m);
      expect(source, f).not.toMatch(/^### Memory\b/m);
    }
  });
});

describe("intelligent-react examples — responsibilities are mounted nodes", () => {
  const responsibilities = ALL.filter((f) => kindOf(f) === "responsibility");

  it("every owned example contributes at least one responsibility", () => {
    expect(responsibilities.length).toBeGreaterThan(0);
  });

  it("each responsibility declares both halves of the interface: ### Requires AND ### Maintains", () => {
    for (const f of responsibilities) {
      const source = read(f);
      expect(source, f).toMatch(/^### Requires\b/m);
      expect(source, f).toMatch(/^### Maintains\b/m);
    }
  });

  it("each responsibility declares a ### Continuity wake-source (input/self/external-driven)", () => {
    for (const f of responsibilities) {
      const source = read(f);
      expect(source, f).toMatch(/^### Continuity\b/m);
      expect(source, f).toMatch(/input-driven|self-driven|external-driven/i);
    }
  });
});

describe("intelligent-react examples — gateways are external-driven entry nodes", () => {
  const gateways = ALL.filter((f) => kindOf(f) === "gateway");

  it("there is at least one gateway across the corpus", () => {
    expect(gateways.length).toBeGreaterThan(0);
  });

  it("each gateway is external-driven (colon or hyphen form), declares no ### Requires, and ### Maintains", () => {
    for (const f of gateways) {
      const source = read(f);
      expect(source, f).toMatch(/^### Continuity\b/m);
      // Accept both `### Continuity: external-driven` and the hyphen/space body
      // form `### Continuity\n\nexternal-driven`.
      expect(source.replace(/\s+/g, " "), f).toMatch(
        /### Continuity[:\-\s]+external-driven/,
      );
      expect(source, f).not.toMatch(/^### Requires\b/m);
      expect(source, f).toMatch(/^### Maintains\b/m);
    }
  });
});

describe("intelligent-react examples — functions declare Returns, no wake sections", () => {
  const functions = ALL.filter((f) => kindOf(f) === "function");

  it("each function declares ### Returns and no ### Requires/### Maintains/### Continuity", () => {
    for (const f of functions) {
      const source = read(f);
      expect(source, f).toMatch(/^### Returns\b/m);
      expect(source, f).not.toMatch(/^### Requires\b/m);
      expect(source, f).not.toMatch(/^### Maintains\b/m);
      expect(source, f).not.toMatch(/^### Continuity\b/m);
    }
  });
});
