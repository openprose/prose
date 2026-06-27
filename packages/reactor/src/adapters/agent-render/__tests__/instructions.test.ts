import { equal, match } from "node:assert/strict";
import { test } from "node:test";

import {
  composeNodeContract,
  composeWakeHeader,
  type CompiledContractView,
} from "../instructions";

test("composeNodeContract includes Context before Maintains", () => {
  const contract: CompiledContractView = {
    name: "Digest",
    requires: ["accepted items"],
    context: "- `style`: read-only wording guidance",
    maintains: ["`digest`: one paragraph"],
  };

  const text = composeNodeContract("digest", contract);

  match(text, /### Context\n- `style`: read-only wording guidance/);
  equal(text.indexOf("\n### Context\n") < text.indexOf("\n### Maintains\n"), true);
});

test("composeWakeHeader names resolved upstream producers and points to upstream tools", () => {
  const text = composeWakeHeader({
    node: "context-brief",
    contract_fingerprint: "sha256:abc",
    wake: { source: "input", refs: [] },
    input_fingerprints: ["fp:request"],
    inbound_edges: [{ producer: "request-inbox", facet: "request" }],
    prior: {
      ref: {
        node: "context-brief",
        workspace: "published",
        location: "/state/context-brief/published.json",
        version: null,
      },
      files: {},
    },
  } as never);

  match(text, /### Upstream truth you may read/);
  match(text, /producer `request-inbox`, facet `request`/);
  match(text, /wm_list_upstream/);
  match(text, /wm_read_upstream/);
});
