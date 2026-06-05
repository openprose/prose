// Conformance test for the MIGRATED examples corpus (everything under
// skills/open-prose/examples EXCEPT vendor-renewal-watch, which has its own
// canonical test).
//
// This is the module-1 (skill-examples-corpus) acceptance test: it proves the
// whole public learning surface was re-cleaved onto the new kinds + sections
// (delta.md Part B §B1/§B2/§B7), the `system` kind is gone, every `service`
// became a `function`, every judge-era `responsibility` gained Requires +
// Maintains and dropped Criteria/Fulfillment, every gateway gained an explicit
// `### Continuity: external-driven`, and the `### Memory` ledger folded into the
// world-model.
//
// It is a doc-conformance test in the same style as
// tests/open-prose/examples/vendor-renewal-watch.test.ts: it reads the source
// `.prose.md` files and asserts on their content; no runtime.
//
// RUN: npx vitest run tests/open-prose/examples
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const examplesDir = join(repoRoot, "skills/open-prose/examples");

// Every example directory we own (vendor-renewal-watch is a sibling's, and
// flat-tokens carries no `.prose.md`, so both are excluded from ownership).
const OWNED_EXAMPLES = [
  "auto-pocock",
  "compliance-evidence-tracker",
  "content-performance-loop",
  "customer-risk-radar",
  "declared-skills",
  "declared-tools",
  "incident-briefing-room",
  "release-readiness",
  "research-inbox-triage",
  "session-to-prose",
  "stargazer-outreach",
];

function proseFiles(): string[] {
  const out: string[] = [];
  for (const ex of OWNED_EXAMPLES) {
    const src = join(examplesDir, ex, "src");
    if (!existsSync(src)) continue;
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

describe("examples corpus — the retired kinds are gone (delta.md §B1)", () => {
  it("declares no `service` or `system` kind in any owned example", () => {
    for (const f of ALL) {
      const fm = frontmatter(f);
      // delta.md §B1 L275-L276: service -> function; system -> DELETE.
      expect(fm, f).not.toMatch(/kind:\s*service\b/);
      expect(fm, f).not.toMatch(/kind:\s*system\b/);
    }
  });

  it("uses only the five recognized kinds (responsibility/function/gateway/pattern/test)", () => {
    // architecture.md §7.1 L268-L274: the kind taxonomy.
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

describe("examples corpus — the retired sections are gone (delta.md §B2)", () => {
  it("no `### Ensures`, `### Criteria`, `### Fulfillment`, `### Services`, `### Wiring`, `### Memory` headers", () => {
    for (const f of ALL) {
      const source = read(f);
      // delta.md §B2 L286-L294: Ensures->Maintains/Returns; Criteria/Fulfillment
      // folded; Services/Wiring deleted with system; Memory folds into the WM.
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

describe("examples corpus — functions declare Parameters -> Returns (plan.md §4)", () => {
  const functions = ALL.filter((f) => kindOf(f) === "function");

  it("there is at least one migrated function (the former services)", () => {
    // delta.md §B7 L373-L375: the 43 `service` files become `function`s.
    expect(functions.length).toBeGreaterThan(0);
  });

  it("every function declares ### Returns and no subscription/wake sections (### Parameters optional for a nullary call)", () => {
    for (const f of functions) {
      const source = read(f);
      // plan.md §4 L112-L113: callables declare Parameters -> Returns, no
      // Requires/Maintains; architecture.md §7.2 L290 (no Continuity on a function).
      // A nullary function (e.g. ensure-skills, which reads the workspace) may
      // omit ### Parameters, but it always returns a value.
      expect(source, f).toMatch(/^### Returns\b/m);
      expect(source, f).not.toMatch(/^### Requires\b/m);
      expect(source, f).not.toMatch(/^### Maintains\b/m);
      expect(source, f).not.toMatch(/^### Continuity\b/m);
    }
  });
});

describe("examples corpus — responsibilities are mounted nodes (plan.md §3, delta.md §B1 inversion)", () => {
  const responsibilities = ALL.filter((f) => kindOf(f) === "responsibility");

  it("there are exactly the seven re-authored responsibilities", () => {
    // One headline responsibility per non-trivial example (the spec's core
    // inversion, delta.md §B1 L277 / §B7 L380-L381).
    expect(responsibilities.length).toBe(7);
  });

  it("each gains both halves of the interface: ### Requires AND ### Maintains", () => {
    for (const f of responsibilities) {
      const source = read(f);
      // plan.md §3 L99 / §4 L110: responsibility interface is Requires -> Maintains.
      expect(source, f).toMatch(/^### Requires\b/m);
      expect(source, f).toMatch(/^### Maintains\b/m);
    }
  });

  it("each declares a ### Continuity wake-source (input/self/external)", () => {
    for (const f of responsibilities) {
      const source = read(f);
      // architecture.md §7.2 L290-L291: Continuity is the intrinsic wake-source.
      expect(source, f).toMatch(/^### Continuity\b/m);
      expect(read(f), f).toMatch(/input-driven|self-driven|external-driven/);
    }
  });

  it("each declares an ### Execution that calls its helper functions (intra-node `call`)", () => {
    for (const f of responsibilities) {
      const source = read(f);
      // plan.md §7 L150-L159: inside a node, composition is imperative `call`.
      expect(source, f).toMatch(/^### Execution\b/m);
      expect(source, f).toMatch(/\bcall\s+[a-z-]+/);
    }
  });

  it("each ### Maintains carries a postcondition (the folded-in ### Criteria)", () => {
    for (const f of responsibilities) {
      // world-model.md §2 L99-L100: Criteria fold into Maintains postconditions.
      expect(read(f), f).toMatch(/postcondition/i);
    }
  });
});

describe("examples corpus — gateways are external-driven responsibilities (plan.md §3/§5)", () => {
  const gateways = ALL.filter((f) => kindOf(f) === "gateway");

  it("there is one gateway per event-driven example", () => {
    // delta.md §B7 L373-L374: the gateway files gain `### Continuity: external-driven`.
    expect(gateways.length).toBeGreaterThan(0);
  });

  it("each gateway declares explicit `### Continuity: external-driven`, no ### Requires, and a ### Maintains", () => {
    for (const f of gateways) {
      const source = read(f);
      // delta.md §B1 L278 / architecture.md §7.1 L272: gateway = sugar for an
      // external-driven responsibility; no Requires; maintains incoming truth.
      expect(source, f).toMatch(/^### Continuity\b/m);
      expect(read(f).replace(/\s+/g, " "), f).toMatch(
        /### Continuity\s*-?\s*external-driven/,
      );
      expect(source, f).not.toMatch(/^### Requires\b/m);
      expect(source, f).toMatch(/^### Maintains\b/m);
    }
  });

  it("each gateway ### Emits a bare responsibility name (no judge-era `.evidence-change` suffix)", () => {
    for (const f of gateways) {
      const source = read(f);
      expect(source, f).toMatch(/^### Emits\b/m);
      // The judge-era wake-channel suffix is retired; Forme keys on the node.
      const emits = /### Emits\s*\n+\s*-\s*([^\n]+)/.exec(source);
      expect(emits, f).not.toBeNull();
      expect(emits![1], f).not.toMatch(/\.evidence-change/);
    }
  });
});

describe("examples corpus — memory-fold (delta.md §B7 MEMORY-FOLD)", () => {
  it("the pure `*-ledger` / `record-*` writer services were folded away, not left as functions", () => {
    // delta.md §B7 L383-L384: ledger-writer services fold into the parent
    // responsibility's world-model; they are not separate nodes anymore.
    const retiredWriters = [
      "customer-risk-radar/src/update-risk-ledger.prose.md",
      "stargazer-outreach/src/record-outreach-decision.prose.md",
      "release-readiness/src/record-release-decision.prose.md",
      "compliance-evidence-tracker/src/update-evidence-register.prose.md",
    ];
    for (const rel of retiredWriters) {
      expect(existsSync(join(examplesDir, rel)), rel).toBe(false);
    }
  });

  it("a responsibility that absorbed a ledger now keeps a durable `history`/register facet in its WM", () => {
    // delta.md §B7 L385-L390: the ledger held decision history; that becomes a facet.
    // delta.md Part G L548-L555: facets are declared as `#### <facet>` named parts.
    const risk = read(
      join(
        examplesDir,
        "customer-risk-radar/src/customer-risk-maintained.prose.md",
      ),
    );
    expect(risk).toMatch(/^#### history\b/m);
    expect(risk).toMatch(/prior risk decisions/i);
  });
});

describe("examples corpus — the system orchestrators were deleted (plan.md §3)", () => {
  it("no `*-system` orchestration file survives where one existed", () => {
    // plan.md §3 L105: composition is `call` or subscription, never a system kind.
    const deletedSystems = [
      "customer-risk-radar/src/risk-radar.prose.md",
      "research-inbox-triage/src/research-inbox-triage.prose.md",
      "stargazer-outreach/src/stargazer-outreach.prose.md",
      "incident-briefing-room/src/incident-briefing-room.prose.md",
      "release-readiness/src/release-readiness.prose.md",
      "compliance-evidence-tracker/src/evidence-tracker.prose.md",
      "content-performance-loop/src/content-performance-loop.prose.md",
    ];
    for (const rel of deletedSystems) {
      expect(existsSync(join(examplesDir, rel)), rel).toBe(false);
    }
  });
});
