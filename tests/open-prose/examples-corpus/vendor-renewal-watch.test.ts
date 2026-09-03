// Conformance test for the CANONICAL multi-slice eval example,
// skills/open-prose/examples/vendor-renewal-watch.
//
// This example is the reference end-to-end exercise of the mounted-responsibility
// model: the canonical example, re-authored as a mounted `responsibility` with
// helper `function`s. It must demonstrate, in one repo:
//   - a responsibility maintaining a world-model
//   - a fingerprint-driven skip
//   - a `function` call helper
//   - a `gateway` for external input
//   - facets routing propagation
//   - a memory ledger of decision-history + watermark
//
// It is a doc-conformance test in the same style as
// tests/open-prose/forme/forme.test.ts: it reads the source `.prose.md` files
// and asserts on their content; no runtime.
//
// RUN: vitest auto-discovers this file. Run it with:
//   npx vitest run tests/open-prose/examples-corpus
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const exampleDir = join(
  repoRoot,
  "skills/open-prose/examples/vendor-renewal-watch",
);
const srcDir = join(exampleDir, "src");

function read(rel: string): string {
  return readFileSync(join(srcDir, rel), "utf8");
}
function flat(rel: string): string {
  return read(rel).replace(/\s+/g, " ");
}
function frontmatter(rel: string): string {
  const source = read(rel);
  const end = source.indexOf("\n---", 3);
  return source.slice(0, end + 4);
}

describe("vendor-renewal-watch — the retired vocabulary is gone", () => {
  const files = [
    "vendor-renewals-prepared.prose.md",
    "collect-renewal-signals.prose.md",
    "prepare-renewal-brief.prose.md",
    "renewal-review-events.prose.md",
    "score-vendor-renewal.prose.md",
  ];

  it("declares no `service` or `system` kind anywhere", () => {
    for (const f of files) {
      const fm = frontmatter(f);
      // service -> function, system -> deleted.
      expect(fm).not.toMatch(/kind:\s*service/);
      expect(fm).not.toMatch(/kind:\s*system/);
    }
  });

  it("uses no `### Ensures`, `### Services`, `### Wiring`, `### Criteria`, `### Fulfillment` section headers", () => {
    for (const f of files) {
      const source = read(f);
      // Ensures -> Maintains; Criteria/Fulfillment folded; system gone.
      expect(source).not.toMatch(/^### Ensures\b/m);
      expect(source).not.toMatch(/^### Services\b/m);
      expect(source).not.toMatch(/^### Wiring\b/m);
      expect(source).not.toMatch(/^### Criteria\b/m);
      expect(source).not.toMatch(/^### Fulfillment\b/m);
    }
  });

  it("retired the standalone `### Memory` ledger header (memory-fold into the world-model)", () => {
    for (const f of files) {
      // Ledger-writer services fold into the parent
      // responsibility's world-model, not a separate ledger.
      expect(read(f)).not.toMatch(/^### Memory\b/m);
    }
  });
});

describe("vendor-renewal-watch — a responsibility maintaining a world-model", () => {
  const f = "vendor-renewals-prepared.prose.md";

  it("is a mounted responsibility with ### Requires -> ### Maintains", () => {
    expect(frontmatter(f)).toMatch(/kind:\s*responsibility/);
    const source = read(f);
    // The responsibility interface is Requires -> Maintains.
    expect(source).toMatch(/^### Requires\b/m);
    expect(source).toMatch(/^### Maintains\b/m);
  });

  it("declares a vendor-keyed ledger as its maintained truth (world-model schema)", () => {
    const source = flat(f);
    // ### Maintains is the world-model schema (type/canon/facets/postconditions).
    expect(source).toMatch(/vendor renewal ledger|vendor.+ledger/i);
    expect(source).toMatch(/keyed by `vendor_id`|map keyed by/i);
  });

  it("reads its prior world-model BY REFERENCE in the render, not pre-stuffed", () => {
    const source = flat(f);
    // A render reads by reference (location), never pre-stuffed.
    expect(source).toMatch(/by reference/i);
    expect(source).toMatch(/read_world_model\("self"\)/);
  });

  it("self-polices ### Maintains postconditions before signing (no separate judge beat)", () => {
    const source = flat(f);
    // Criteria folds into Maintains postconditions; there is no judge beat.
    expect(source).toMatch(/postconditions?/i);
    expect(source).toMatch(/no separate judge beat|self-polic/i);
  });
});

describe("vendor-renewal-watch — fingerprint-driven skip", () => {
  const f = "collect-renewal-signals.prose.md";

  it("carries a watermark as IMMATERIAL state so re-deliveries do not move the fingerprint", () => {
    const source = flat(f);
    // Immaterial fields are the highest-leverage memo control.
    expect(source).toMatch(/watermark/i);
    expect(source).toMatch(/[Ii]mmaterial/);
    expect(source).toMatch(/latest_signal_at/);
  });

  it("explains that an unmoved fingerprint makes the downstream write a `skipped` receipt", () => {
    const source = flat(f);
    // An unmoved memo key => skipped receipt, spawns nothing.
    expect(source).toMatch(/skipped/i);
    expect(source).toMatch(/spawns nothing|stops here|never reach/i);
    expect(source).toMatch(/cost scales with surprise/i);
  });
});

describe("vendor-renewal-watch — a `function` call helper", () => {
  const f = "score-vendor-renewal.prose.md";

  it("is a `function` with ### Parameters -> ### Returns, not Requires/Maintains", () => {
    expect(frontmatter(f)).toMatch(/kind:\s*function/);
    const source = read(f);
    // Callables declare Parameters -> Returns; Requires/Maintains are not
    // overloaded for calls.
    expect(source).toMatch(/^### Parameters\b/m);
    expect(source).toMatch(/^### Returns\b/m);
    expect(source).not.toMatch(/^### Maintains\b/m);
    expect(source).not.toMatch(/^### Continuity\b/m);
  });

  it("is stateless — no world-model — and the parent calls it via ProseScript `call`", () => {
    const fnSource = flat(f);
    // A function is stateless, ephemeral; no world-model.
    expect(fnSource).toMatch(/stateless/i);
    // The headline responsibility invokes it imperatively.
    const parent = flat("vendor-renewals-prepared.prose.md");
    expect(parent).toMatch(/call score-vendor-renewal/);
  });
});

describe("vendor-renewal-watch — a `gateway` for external input", () => {
  const f = "renewal-review-events.prose.md";

  it("is a gateway with explicit ### Continuity: external-driven and no ### Requires", () => {
    expect(frontmatter(f)).toMatch(/kind:\s*gateway/);
    const source = read(f);
    // A gateway declares an explicit external-driven `### Continuity` and has
    // no ### Requires.
    expect(source).toMatch(/^### Continuity\b/m);
    expect(flat(f)).toMatch(/### Continuity external-driven/);
    expect(source).not.toMatch(/^### Requires\b/m);
  });

  it("maintains the incoming-event truth that the collector subscribes to", () => {
    const source = flat(f);
    // A gateway maintains the latest incoming truth.
    expect(source).toMatch(/^.*### Maintains/s);
    expect(source).toMatch(/renewal_events/);
    // External-driven nodes are the entry points.
    expect(source).toMatch(/entry point/i);
  });
});

describe("vendor-renewal-watch — facets routing propagation", () => {
  it("the assessor declares recommendation / history / ownership facets as #### named parts", () => {
    const source = read("vendor-renewals-prepared.prose.md");
    // Facets make propagation finer-grained; a `#### <facet>` sub-heading IS a
    // facet (the named-parts rule in contract-markdown.md).
    expect(source).toMatch(/[Ff]acets/);
    expect(source).toMatch(/^#### recommendation\b/m);
    expect(source).toMatch(/^#### history\b/m);
    expect(source).toMatch(/^#### ownership\b/m);
  });

  it("the brief writer subscribes to the `recommendation` facet ONLY (selector, not atomic)", () => {
    const source = flat("prepare-renewal-brief.prose.md");
    // B depends on a NAMED facet of A's Maintains.
    expect(source).toMatch(/facet `recommendation`|`recommendation` facet/);
    expect(source).toMatch(
      /never wakes? on `history`|not.+`history`|not on the decision-history/i,
    );
  });
});

describe("vendor-renewal-watch — memory ledger: decision-history + watermark", () => {
  it("the assessor's truth holds an append-only decision_history", () => {
    const source = flat("vendor-renewals-prepared.prose.md");
    // The ledger holds decision history, not just latest truth.
    expect(source).toMatch(/decision_history/);
    expect(source).toMatch(/append-only/i);
  });

  it("the collector's truth holds the watermark (transient watermark state in the WM)", () => {
    const source = flat("collect-renewal-signals.prose.md");
    // Watermark state lives in the world-model, not a separate ledger.
    expect(source).toMatch(/watermark/i);
    expect(source).toMatch(/latest_signal_at/);
  });
});

describe("vendor-renewal-watch — README frames the canonical eval", () => {
  function readme(): string {
    return readFileSync(join(exampleDir, "README.md"), "utf8").replace(
      /\s+/g,
      " ",
    );
  }
  it("names all six exercised slices and the compile/run phase split", () => {
    const r = readme();
    expect(r).toMatch(/canonical multi-slice eval/i);
    expect(r).toMatch(/fingerprint-driven skip/i);
    expect(r).toMatch(/function.+helper|`function` call helper/i);
    expect(r).toMatch(/gateway.+external input/i);
    expect(r).toMatch(/[Ff]acets/);
    expect(r).toMatch(
      /decision history.*watermark|watermark.*decision history/i,
    );
    // compile (intelligent) / run (dumb),
    // joined by promoting the compiled IR to the active manifest.
    expect(r).toMatch(/intelligent phase|prose compile/i);
    expect(r).toMatch(/cp dist\/manifest\.next\.json dist\/manifest\.active\.json/);
  });
});
