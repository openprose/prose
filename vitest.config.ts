import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Root vitest config for the OpenProse SKILL conformance corpus + the shipped
// learning examples.
//
// 1. The SKILL conformance tests under `tests/open-prose/**` (contract-markdown,
//    compiler/IR, concepts, forme, tenets, primitives, state,
//    responsibility-runtime, skill-meta, examples) assert that
//    `skills/open-prose/**` embodies the Intelligent-React end-state. They are
//    repo-root tests with no owning package. `test:skill` keeps its scope by
//    passing the `tests/open-prose` positional filter.
//
// 2. The deterministic tier-2 ledger-replay tests co-located with each shipped
//    example under `skills/open-prose/examples/**/*.test.ts` drive the REAL
//    `@openprose/reactor` reconciler over a committed `replay/` state-dir at zero
//    model spend. Those example dirs have no local `node_modules`, so the public
//    `@openprose/reactor` subpaths are aliased to the prebuilt workspace dist
//    (the SAME bytes a consumer imports). The packages must be built first
//    (`pnpm build`); the example local `vitest.local.config.ts` files used the
//    same alias before they were folded into this shared gate.
//
// The optional tier-3 `*.live.test.ts` bodies are key-gated and are EXCLUDED
// from this offline gate entirely (they passing-skip offline, but excluding them
// keeps the gate hermetic and avoids loading the live agent-render adapter).
const reactorDist = (sub: string) =>
  fileURLToPath(new URL(`./packages/reactor/dist/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Order matters: more-specific subpaths must precede the bare barrel.
    // The 0.3.0 ideal surface is six subpaths: `.`, /agents, /adapters, /run,
    // /run/types, /internals.
    alias: [
      { find: "@openprose/reactor/agents", replacement: reactorDist("agents/index.js") },
      { find: "@openprose/reactor/adapters", replacement: reactorDist("adapters/index.js") },
      { find: "@openprose/reactor/run/types", replacement: reactorDist("run/types.js") },
      { find: "@openprose/reactor/run", replacement: reactorDist("run/index.js") },
      { find: "@openprose/reactor/internals", replacement: reactorDist("internals/index.js") },
      { find: "@openprose/reactor", replacement: reactorDist("index.js") },
    ],
  },
  test: {
    environment: "node",
    include: [
      "tests/open-prose/**/*.test.ts",
      "skills/open-prose/examples/**/*.test.ts",
    ],
    // Tier-3 live tests are key-gated and never run in the offline gate.
    exclude: [
      "**/*.live.test.ts",
      "**/node_modules/**",
    ],
  },
});
