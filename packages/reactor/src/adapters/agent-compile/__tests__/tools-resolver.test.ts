// Offline unit tests for the deterministic `### Tools` resolver. Mirrors the
// canonical VM `tools_resolver` (skills/open-prose/compiler/index.prose.md) +
// contract-markdown.md §Tools. Pure/synchronous/offline: an injected PATH +
// injected MCP registry, never a real host probe.

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveTools } from "../tools-resolver";

const NO_HOST = { pathEnv: "", mcp: new Set<string>() };

test("malformed `gh` (no namespace) ⇒ tool_invalid, message includes the code + the tool", () => {
  const r = resolveTools([{ id: "n", kind: "responsibility", tools: "- `gh`: x", requiredBy: ["n"] }], NO_HOST);
  const d = r.diagnostics.find((x) => x.kind === "tool_invalid");
  ok(d, "tool_invalid emitted");
  ok(d!.detail!.includes("tool_invalid"), "message includes the code");
  ok(d!.detail!.includes("gh"), "names the tool");
  equal(r.resolved.length, 0);
});

test("`cli:` / `mcp:` / `cli:bin/gh` ⇒ tool_invalid (empty or path-separator name)", () => {
  const r = resolveTools(
    [{ id: "n", kind: "responsibility", tools: "- `cli:`\n- `mcp:`\n- `cli:bin/gh`", requiredBy: ["n"] }],
    NO_HOST,
  );
  equal(r.diagnostics.filter((x) => x.kind === "tool_invalid").length, 3);
});

test("`http:x` (reserved namespace) ⇒ tool_unsupported_kind, message includes the code", () => {
  const r = resolveTools([{ id: "n", kind: "responsibility", tools: "- `http:x`", requiredBy: ["n"] }], NO_HOST);
  const d = r.diagnostics.find((x) => x.kind === "tool_unsupported_kind");
  ok(d && d.detail!.includes("tool_unsupported_kind") && d.detail!.includes("http"));
});

test("`cli:definitely-absent-xyz` absent from PATH ⇒ one tool_unresolved naming the lookup (PATH)", () => {
  const r = resolveTools(
    [{ id: "n", kind: "responsibility", tools: "- `cli:definitely-absent-xyz`", requiredBy: ["n"] }],
    NO_HOST,
  );
  const d = r.diagnostics.find((x) => x.kind === "tool_unresolved");
  ok(d && d.detail!.includes("tool_unresolved") && d.detail!.includes("definitely-absent-xyz"));
  ok(d!.detail!.includes("PATH"), "names the lookup checked");
  equal(r.resolved.length, 0);
});

test("a present cli resolves to { kind:'cli', name, requiredBy } with no diagnostics", () => {
  const dir = mkdtempSync(join(tmpdir(), "rx-tools-"));
  try {
    const bin = join(dir, "faketool");
    writeFileSync(bin, "#!/bin/sh\n");
    chmodSync(bin, 0o755);
    const r = resolveTools(
      [{ id: "n", kind: "responsibility", tools: "- `cli:faketool`", requiredBy: ["n", "m"] }],
      { pathEnv: dir, mcp: new Set() },
    );
    equal(r.diagnostics.length, 0);
    deepEqual(r.resolved, [{ kind: "cli", name: "faketool", requiredBy: ["m", "n"] }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mcp:name present in the injected registry resolves; absent ⇒ tool_unresolved naming the registry", () => {
  const good = resolveTools(
    [{ id: "n", kind: "responsibility", tools: "- `mcp:gmail`", requiredBy: ["n"] }],
    { pathEnv: "", mcp: new Set(["gmail"]) },
  );
  equal(good.diagnostics.length, 0);
  deepEqual(good.resolved, [{ kind: "mcp", name: "gmail", requiredBy: ["n"] }]);

  const bad = resolveTools(
    [{ id: "n", kind: "responsibility", tools: "- `mcp:gmail`", requiredBy: ["n"] }],
    { pathEnv: "", mcp: new Set() },
  );
  ok(bad.diagnostics.some((x) => x.kind === "tool_unresolved" && x.detail!.includes("registry")));
});

test("the same tool declared on two nodes dedupes with a unioned, sorted requiredBy", () => {
  const dir = mkdtempSync(join(tmpdir(), "rx-tools-"));
  try {
    const bin = join(dir, "faketool");
    writeFileSync(bin, "#!/bin/sh\n");
    chmodSync(bin, 0o755);
    const r = resolveTools(
      [
        { id: "b", kind: "responsibility", tools: "- `cli:faketool`", requiredBy: ["b"] },
        { id: "a", kind: "responsibility", tools: "- `cli:faketool`", requiredBy: ["a"] },
      ],
      { pathEnv: dir, mcp: new Set() },
    );
    deepEqual(r.resolved, [{ kind: "cli", name: "faketool", requiredBy: ["a", "b"] }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a function node's resolved tools land in byFunction (additive scope record)", () => {
  const r = resolveTools(
    [{ id: "verify", kind: "function", tools: "- `mcp:gmail`", requiredBy: ["verify"] }],
    { pathEnv: "", mcp: new Set(["gmail"]) },
  );
  deepEqual(r.byFunction, [{ functionName: "verify", tools: [{ kind: "mcp", name: "gmail" }] }]);
});

test("parse is resolution-agnostic for the worked cli:jq fixture shape (no PATH dependency)", () => {
  // The spec fixture skills/open-prose/examples/declared-tools declares cli:jq.
  // Assert the PARSE/classify is {kind:'cli',name:'jq'} regardless of whether jq
  // is on CI's PATH (resolution status is host-dependent; parse is not).
  const r = resolveTools(
    [{ id: "json-verifier", kind: "function", tools: "- `cli:jq`: JSON validation", requiredBy: ["json-verifier"] }],
    { pathEnv: "", mcp: new Set() },
  );
  // jq absent on this injected (empty) PATH ⇒ unresolved, but it parsed as a cli.
  const d = r.diagnostics.find((x) => x.kind === "tool_unresolved");
  ok(d && d.detail!.includes("cli:jq"), "parsed as a cli declaration named jq");
  // no tool_invalid / tool_unsupported_kind — the shape is well-formed + supported
  equal(r.diagnostics.filter((x) => x.kind === "tool_invalid" || x.kind === "tool_unsupported_kind").length, 0);
});

test("a node with no ### Tools body contributes nothing", () => {
  const r = resolveTools([{ id: "n", kind: "responsibility", requiredBy: ["n"] }], NO_HOST);
  equal(r.resolved.length, 0);
  equal(r.diagnostics.length, 0);
  equal(r.byFunction.length, 0);
});
