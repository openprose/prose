// Offline tests for the trivial contract LOADER (Phase 3, gap-audit #8). The
// loader is NOT a `.prose` parser: it enumerates the contract set and slices each
// file into verbatim sections for the SESSION to read. These tests pin the dumb
// slicing behaviour (frontmatter id/name/kind, `###` section split, `####` facet
// parts staying INSIDE their `### Maintains` parent, the wake-source default) —
// all pure over strings, no model, no network.

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  sliceContract,
  defaultWakeSource,
  renderContractSet,
  type LoadedContract,
} from "../index";

const SAMPLE = `---
name: competitor-activity
kind: responsibility
extra:
  nested: ignored
---

Intro prose the session reads.

### Requires
- a current view of the market

### Maintains
A corroborated view of each competitor.

#### funding
Funding events per competitor. Material: the event set (unordered).

#### hiring
Open-role activity — the department set.

### Continuity
Self-driven: re-check on a daily forecast cadence.

### Execution
Fetch sources, corroborate, write the world-model.
`;

test("sliceContract: reads frontmatter id/name/kind (flat scalars only)", () => {
  const c = sliceContract(SAMPLE, "/x/competitor-activity.prose.md");
  equal(c.id, "competitor-activity");
  equal(c.name, "competitor-activity");
  equal(c.kind, "responsibility");
  equal(c.path, "/x/competitor-activity.prose.md");
});

test("sliceContract: splits the body into verbatim ### sections", () => {
  const c = sliceContract(SAMPLE, "/x/c.prose.md");
  ok(c.requires?.includes("a current view of the market"));
  ok(c.continuity?.includes("daily forecast cadence"));
  ok(c.execution?.includes("Fetch sources"));
});

test("sliceContract: #### facet parts stay INSIDE the ### Maintains body (the session sees them)", () => {
  const c = sliceContract(SAMPLE, "/x/c.prose.md");
  ok(c.maintains?.includes("#### funding"), "funding facet stays in Maintains");
  ok(c.maintains?.includes("#### hiring"), "hiring facet stays in Maintains");
  ok(c.maintains?.includes("the event set (unordered)"));
  // facet bodies did NOT leak into a separate section
  equal((c as unknown as Record<string, unknown>)["funding"], undefined);
});

test("sliceContract: id falls back to the file stem when no frontmatter name", () => {
  const c = sliceContract("### Maintains\nx\n", "/x/my-node.prose.md");
  equal(c.id, "my-node");
  equal(c.kind, "responsibility"); // default kind
});

test("sliceContract: a gateway kind is read from frontmatter", () => {
  const c = sliceContract("---\nname: ingress\nkind: gateway\n---\n### Maintains\nx\n", "/x/g.prose.md");
  equal(c.kind, "gateway");
});

test("defaultWakeSource: gateway → external; cadence → self; else input", () => {
  const gw: LoadedContract = { id: "g", name: "g", kind: "gateway", path: "/g" };
  equal(defaultWakeSource(gw), "external");

  const selfDriven = sliceContract(SAMPLE, "/x/c.prose.md");
  equal(defaultWakeSource(selfDriven), "self");

  const inputDriven: LoadedContract = {
    id: "i",
    name: "i",
    kind: "responsibility",
    continuity: "Re-render when an upstream input moves.",
    path: "/i",
  };
  equal(defaultWakeSource(inputDriven), "input");
});

test("renderContractSet: lays out every contract's identity + sections as stable evidence", () => {
  const a = sliceContract(SAMPLE, "/x/a.prose.md");
  const text = renderContractSet([a]);
  ok(text.includes("Contract `competitor-activity`"));
  ok(text.includes("kind: responsibility"));
  ok(text.includes("### Maintains"));
  ok(text.includes("#### funding"));
  // deterministic: rendering twice is byte-identical
  equal(renderContractSet([a]), text);
});

test("sliceContract: a contract with no sections still loads (the session sees an empty body)", () => {
  const c = sliceContract("---\nname: bare\n---\n", "/x/bare.prose.md");
  equal(c.id, "bare");
  equal(c.requires, undefined);
  equal(c.maintains, undefined);
  deepEqual(Object.keys(c).sort(), ["id", "kind", "name", "path"]);
});
