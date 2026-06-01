import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local offline gate for the basic-unit-suite example ONLY. Mirrors the root
// vitest.config.ts alias (the public @openprose/reactor subpaths → prebuilt dist)
// but narrows `include` to this example's deterministic tier-2 test so it can be
// self-verified in isolation:
//
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 npx vitest run \
//     --config skills/open-prose/examples/basic-unit-suite/vitest.local.config.ts
const reactorDist = (sub: string) =>
  fileURLToPath(new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@openprose/reactor/adapters/agent-render",
        replacement: reactorDist("adapters/agent-render/index.js"),
      },
      { find: "@openprose/reactor/receipt", replacement: reactorDist("receipt/index.js") },
      { find: "@openprose/reactor/sdk", replacement: reactorDist("sdk/index.js") },
      { find: "@openprose/reactor", replacement: reactorDist("index.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["skills/open-prose/examples/basic-unit-suite/basic-unit-suite.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
