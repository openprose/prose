import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Root vitest config for the OpenProse skill conformance corpus and the
// example ledger-replay tests.
//
// 1. The conformance tests under `tests/open-prose/**` (contract-markdown,
//    compiler/IR, concepts, forme, tenets, primitives, state,
//    responsibility-runtime, skill-meta, examples) assert that
//    `skills/open-prose/**` embodies the Intelligent-React end-state. They are
//    repo-root tests with no owning package.
//
// 2. The deterministic ledger-replay tests under
//    `tests/open-prose/examples/**/*.test.ts` drive the REAL `@openprose/reactor`
//    reconciler over a committed `replay/` state-dir at zero model spend. They
//    have no local `node_modules`, so the public `@openprose/reactor` subpaths
//    are aliased to the prebuilt workspace dist (the SAME bytes a consumer
//    imports). The packages must be built first (`pnpm build`).
//
// The optional `*.live.test.ts` bodies are key-gated and are EXCLUDED from this
// offline gate entirely (they passing-skip offline, but excluding them keeps the
// gate hermetic and avoids loading the live agent-render adapter).
const reactorDist = (sub: string) =>
  fileURLToPath(new URL(`./packages/reactor/dist/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Order matters: more-specific subpaths must precede the bare barrel.
    // The 0.3.0 ideal surface is six subpaths: `.`, /agents, /adapters, /run,
    // /run/types, /internals.
    alias: [
      {
        find: "@openprose/reactor/agents",
        replacement: reactorDist("agents/index.js"),
      },
      {
        find: "@openprose/reactor/adapters",
        replacement: reactorDist("adapters/index.js"),
      },
      {
        find: "@openprose/reactor/run/types",
        replacement: reactorDist("run/types.js"),
      },
      {
        find: "@openprose/reactor/run",
        replacement: reactorDist("run/index.js"),
      },
      {
        find: "@openprose/reactor/internals",
        replacement: reactorDist("internals/index.js"),
      },
      { find: "@openprose/reactor", replacement: reactorDist("index.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/open-prose/**/*.test.ts"],
    // Tier-3 live tests are key-gated and never run in the offline gate.
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
