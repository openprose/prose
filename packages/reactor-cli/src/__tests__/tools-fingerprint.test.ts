// The cache-invalidation guard for declared `### Tools`. The contract-set
// fingerprint MUST move when a node's `### Tools` body changes, or the compile
// cache silently fails to re-resolve tools on a Tools edit. This proves the
// `tools` field reached the content-address image.

import { equal, notEqual } from "node:assert/strict";
import { test } from "node:test";
import { contractSetFingerprint, type ContractImage } from "../compile/ir-cache";

const base: ContractImage[] = [{ id: "n", name: "n", kind: "responsibility" }];
const withTool: ContractImage[] = [
  { id: "n", name: "n", kind: "responsibility", tools: "- `cli:jq`" },
];

test("the contract-set fingerprint MOVES when ### Tools changes", () => {
  notEqual(contractSetFingerprint(base), contractSetFingerprint(withTool));
});

test("identical tools ⇒ identical fingerprint (deterministic)", () => {
  const a: ContractImage[] = [{ id: "n", name: "n", kind: "responsibility", tools: "- `cli:jq`" }];
  const b: ContractImage[] = [{ id: "n", name: "n", kind: "responsibility", tools: "- `cli:jq`" }];
  equal(contractSetFingerprint(a), contractSetFingerprint(b));
});

test("a different ### Tools body moves the fingerprint again", () => {
  const jq: ContractImage[] = [{ id: "n", name: "n", kind: "responsibility", tools: "- `cli:jq`" }];
  const gh: ContractImage[] = [{ id: "n", name: "n", kind: "responsibility", tools: "- `cli:gh`" }];
  notEqual(contractSetFingerprint(jq), contractSetFingerprint(gh));
});
