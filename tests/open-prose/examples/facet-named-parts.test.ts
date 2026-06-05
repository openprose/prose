// Conformance test for the FACET named-parts model across the examples corpus.
//
// The facet-syntax decision is settled (delta.md Part G L548-L555: "a `####`
// sub-heading inside `### Maintains` declares a facet; ... One name = fingerprint
// unit + subscription symbol (`Requires.<facet>` <-> `Maintains.<facet>`) +
// world-model subtree (`published/<facet>/...`)"). This test proves the public
// learning surface authors facets THAT way:
//   - the canonical competitor-activity-monitor declares its facets as
//     `#### funding` / `#### hiring` / `#### product-launches` named parts
//     (architecture.md §3.2 worked example L182-L191);
//   - each subscribed `####` part carries a structured material backing, the
//     structured-backing rule (world-model.md §3 L177-L182; architecture.md §3.2
//     L144-L148);
//   - every migrated example replaced the old prose-bullet facet form
//     ("`X` facet (material): ...") with `####` parts;
//   - state/filesystem.md documents the `published/<facet>/...` on-disk layout
//     (delta.md Part G L592; world-model.md §3 "Declaring facets").
//
// It is a doc-conformance test in the same style as
// tests/open-prose/examples/vendor-renewal-watch.test.ts: it reads the source
// `.prose.md` / `.md` files and asserts on their content; no runtime.
//
// RUN: npx vitest run tests/open-prose/examples
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const examplesDir = join(repoRoot, "skills/open-prose/examples");
const skillDir = join(repoRoot, "skills/open-prose");

function read(rel: string): string {
  return readFileSync(join(examplesDir, rel), "utf8");
}

// Extract the body of the `### Maintains` section (up to the next `###` heading
// that is NOT a `####` sub-heading).
function maintainsBlock(source: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => /^### Maintains\b/.test(l));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^### (?!#)/.test(lines[i]) || /^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

// The `#### ` part headings inside a Maintains block (the facet names).
function facetParts(block: string): string[] {
  return block
    .split("\n")
    .filter((l) => /^#### /.test(l))
    .map((l) => l.replace(/^####\s+/, "").trim());
}

// Every example whose maintaining responsibility declares facets, migrated to
// the `####` named-parts form. (vendor-renewal-watch is covered by its own
// canonical test; it is asserted here too because facets are its headline.)
const FACETED: { rel: string; facets: string[] }[] = [
  {
    rel: "competitor-activity/src/competitor-activity-monitor.prose.md",
    facets: ["funding", "hiring", "product-launches"],
  },
  {
    rel: "vendor-renewal-watch/src/vendor-renewals-prepared.prose.md",
    facets: ["recommendation", "history", "ownership"],
  },
  {
    rel: "customer-risk-radar/src/customer-risk-maintained.prose.md",
    facets: ["risk", "history"],
  },
  {
    rel: "research-inbox-triage/src/research-inbox-responsibility.prose.md",
    facets: ["report", "topics", "ignored"],
  },
  {
    rel: "stargazer-outreach/src/high-intent-stargazer-outreach.prose.md",
    facets: ["qualification", "contact-history"],
  },
  {
    rel: "compliance-evidence-tracker/src/compliance-evidence-current.prose.md",
    facets: ["status", "gaps", "register"],
  },
  {
    rel: "incident-briefing-room/src/incident-channel-current.prose.md",
    facets: ["brief", "timeline", "actions"],
  },
  {
    rel: "release-readiness/src/release-candidate-ready.prose.md",
    facets: ["decision", "history"],
  },
  {
    rel: "content-performance-loop/src/content-learning-cycle.prose.md",
    facets: ["brief", "actions", "history"],
  },
];

describe("canonical competitor-activity-monitor declares facets as #### named parts (delta.md Part G; architecture.md §3.2)", () => {
  const rel = "competitor-activity/src/competitor-activity-monitor.prose.md";

  it("is a mounted responsibility whose ### Maintains contains #### facet parts", () => {
    const source = read(rel);
    expect(source).toMatch(/kind:\s*responsibility/);
    const block = maintainsBlock(source);
    const parts = facetParts(block);
    // architecture.md §3.2 L182-L191: the three named parts.
    expect(parts).toEqual(["funding", "hiring", "product-launches"]);
  });

  it("each subscribed facet part has a structured MATERIAL backing (the structured-backing rule, world-model.md §3)", () => {
    const block = maintainsBlock(read(rel));
    const parts = block.split(/^#### /m).slice(1);
    // Each `#### <facet>` body must state what is material (its structured
    // backing) so the subscribed token is computed over real structure, not
    // re-rendered prose (world-model.md §3 L177-L182).
    for (const part of parts) {
      expect(part).toMatch(/[Mm]aterial:/);
    }
  });

  it("names the funding / hiring / launch ### Requires inputs the facets join on", () => {
    const source = read(rel);
    // Requires.<facet> <-> Maintains.<facet> (architecture.md §6.3; delta.md Part G L586-L587).
    expect(source).toMatch(/^### Requires\b/m);
    expect(source).toMatch(/funding-signals/);
    expect(source).toMatch(/hiring-signals/);
    expect(source).toMatch(/launch-signals/);
  });

  it("keeps shared un-facetted fields (name / last_corroborated) outside any part — atomic-only", () => {
    const block = maintainsBlock(read(rel)).replace(/\s+/g, " ");
    // architecture.md §3.2 L195-L196: shared fields move only the atomic token.
    expect(block).toMatch(/last_corroborated/);
    expect(block).toMatch(/@atomic|atomic token/);
  });
});

describe("every faceted example uses #### named parts, not prose-bullet facets (delta.md Part G migration)", () => {
  it("declares each facet as a #### sub-heading under ### Maintains", () => {
    for (const { rel, facets } of FACETED) {
      const block = maintainsBlock(read(rel));
      const parts = facetParts(block);
      for (const facet of facets) {
        expect(parts, `${rel} missing #### ${facet}`).toContain(facet);
      }
    }
  });

  it("each #### facet part carries a structured material backing (structured-backing lint passes)", () => {
    for (const { rel } of FACETED) {
      const block = maintainsBlock(read(rel));
      const parts = block.split(/^#### /m).slice(1);
      expect(parts.length, `${rel} declares no #### parts`).toBeGreaterThan(0);
      for (const part of parts) {
        const name = part.split("\n")[0].trim();
        expect(
          part,
          `${rel} facet #### ${name} lacks a structured material backing`,
        ).toMatch(/[Mm]aterial:/);
      }
    }
  });

  it("retired the old prose-bullet facet form across the corpus", () => {
    for (const { rel } of FACETED) {
      const source = read(rel);
      // The pre-migration form was a bullet: "`X` facet (material): ...".
      expect(
        source,
        `${rel} still uses the old prose-bullet facet form`,
      ).not.toMatch(/`[^`]+` facet \(material\)/);
      // ...and "with `a`, `b`, and `c` facets" trailing enumerations.
      expect(
        source,
        `${rel} still enumerates facets in a trailing prose list`,
      ).not.toMatch(/, and `[^`]+` facets\b/);
    }
  });
});

describe("state/filesystem.md documents the published/<facet>/... layout (delta.md Part G L592; world-model.md §3)", () => {
  function fs(): string {
    return readFileSync(join(skillDir, "state/filesystem.md"), "utf8");
  }

  it("describes one subtree per facet under published/, with the atomic token over the whole tree", () => {
    const source = fs();
    expect(source).toMatch(/published\/<facet>\//);
    // one subtree per facet
    expect(source).toMatch(/funding\//);
    expect(source).toMatch(/product-launches\//);
    // atomic token over the whole published/ tree
    expect(source.replace(/\s+/g, " ")).toMatch(
      /@atomic token is computed over the whole `?published\/`? tree|atomic.+over the whole `?published/i,
    );
  });

  it("states facets are additive — atomic-only nodes keep the flat layout", () => {
    const source = fs().replace(/\s+/g, " ");
    expect(source).toMatch(
      /[Aa]tomic-only nodes.+keep the flat layout|facets are purely additive/,
    );
  });
});
