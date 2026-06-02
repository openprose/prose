import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_SEMANTIC_DIFF } from "../../../shapes";
import type { WorldModelFiles } from "../../../world-model";
import {
  DEFAULT_RENDER_MODEL,
  OPENROUTER_PROVIDER_LABEL,
} from "../provider";
import type { RenderUsage } from "../cost";
import {
  mapRenderOutput,
  renderOutputSchema,
  UNSPECIFIED_FAILURE_REASON,
  type RenderOutputSignal,
} from "../output-schema";

const USAGE: RenderUsage = { inputTokens: 10, outputTokens: 20, totalTokens: 30 };

function files(record: Record<string, string>): WorldModelFiles {
  const enc = new TextEncoder();
  const out: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(record)) {
    out[path] = enc.encode(content);
  }
  return out;
}

// --- the schema validates the small done/failed signal (D6) ----------------

test("renderOutputSchema: accepts a minimal done signal, no file contents", () => {
  const schema = renderOutputSchema();
  const parsed = schema.parse({ status: "done" }) as RenderOutputSignal;
  equal(parsed.status, "done");
  // No world_model field exists on the schema — the truth lives in the workspace.
  ok(!("world_model" in (parsed as unknown as Record<string, unknown>)));
});

test("renderOutputSchema: accepts done + semantic_diff and failed + reason", () => {
  const schema = renderOutputSchema();
  const done = schema.parse({
    status: "done",
    semantic_diff: { summary: "3 controls went stale", notes: ["a", "b"] },
  }) as RenderOutputSignal;
  equal(done.semantic_diff?.summary, "3 controls went stale");

  const failed = schema.parse({
    status: "failed",
    reason: "postcondition X unmet",
  }) as RenderOutputSignal;
  equal(failed.status, "failed");
  equal(failed.reason, "postcondition X unmet");
});

test("renderOutputSchema: rejects an unknown status", () => {
  const schema = renderOutputSchema();
  let threw = false;
  try {
    schema.parse({ status: "rendered" });
  } catch {
    threw = true;
  }
  ok(threw, "non-enum status must fail validation");
});

// --- mapper: done → RenderProduct carrying the HARVESTED workspace files -----

test("mapRenderOutput: done → RenderProduct with harvested files + cost", () => {
  const harvested = files({ "summary.md": "hello" });
  const product = mapRenderOutput({
    signal: { status: "done" },
    harvested,
    usage: USAGE,
    surprise_cause: "self",
  });

  ok(!("failed" in product), "done must not be a failure");
  if ("failed" in product) return;
  // The truth is the HARVESTED workspace, byte-for-byte — not from finalOutput.
  equal(product.world_model, harvested);
  deepEqual(product.semantic_diff, EMPTY_SEMANTIC_DIFF);
  deepEqual(product.cost, {
    provider: OPENROUTER_PROVIDER_LABEL,
    model: DEFAULT_RENDER_MODEL,
    tokens: { fresh: 30, reused: 0 },
    surprise_cause: "self",
  });
});

test("mapRenderOutput: done carries a normalized semantic_diff", () => {
  const product = mapRenderOutput({
    signal: {
      status: "done",
      semantic_diff: { summary: "moved", notes: ["x"] },
    },
    harvested: files({}),
    usage: USAGE,
    surprise_cause: "input",
  });
  if ("failed" in product) {
    ok(false, "expected a RenderProduct");
    return;
  }
  deepEqual(product.semantic_diff, { summary: "moved", notes: ["x"] });
});

test("mapRenderOutput: empty/partial semantic_diff collapses to the shared empty diff", () => {
  const product = mapRenderOutput({
    signal: { status: "done", semantic_diff: {} },
    harvested: files({}),
    usage: USAGE,
    surprise_cause: "input",
  });
  if ("failed" in product) {
    ok(false, "expected a RenderProduct");
    return;
  }
  equal(product.semantic_diff, EMPTY_SEMANTIC_DIFF);
});

// --- mapper: failed → RenderFailure (prior truth stands) --------------------

test("mapRenderOutput: failed → RenderFailure with reason + cost", () => {
  const product = mapRenderOutput({
    signal: { status: "failed", reason: "validator unmet" },
    harvested: files({ "ignored.md": "ignored" }),
    usage: USAGE,
    surprise_cause: "external",
  });
  ok("failed" in product && product.failed === true);
  if (!("failed" in product)) return;
  equal(product.reason, "validator unmet");
  equal(product.cost.surprise_cause, "external");
  deepEqual(product.cost.tokens, { fresh: 30, reused: 0 });
});

test("mapRenderOutput: failed without a reason uses the default reason", () => {
  const product = mapRenderOutput({
    signal: { status: "failed" },
    harvested: files({}),
    usage: USAGE,
    surprise_cause: "self",
  });
  ok("failed" in product);
  if (!("failed" in product)) return;
  equal(product.reason, UNSPECIFIED_FAILURE_REASON);
});
