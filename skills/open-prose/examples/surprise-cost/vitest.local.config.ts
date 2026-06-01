import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local, scoped tier-2 gate for the `surprise-cost` example. Mirrors the root
// `vitest.config.ts` alias map (public `@openprose/reactor` subpaths → prebuilt
// workspace dist) but narrows `include` to THIS example's deterministic test so
// it can be self-verified offline in isolation:
//
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 \
//     npx vitest run --config \
//     skills/open-prose/examples/surprise-cost/vitest.local.config.ts
//
// The integrator may reuse or remove this file; the canonical gate is the root
// config, which already globs `skills/open-prose/examples/**/*.test.ts`.
const reactorDist = (sub: string) =>
  fileURLToPath(new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@openprose/reactor/adapters/agent-render",
        replacement: reactorDist("adapters/agent-render/index.js"),
      },
      {
        find: "@openprose/reactor/receipt",
        replacement: reactorDist("receipt/index.js"),
      },
      { find: "@openprose/reactor/sdk", replacement: reactorDist("sdk/index.js") },
      { find: "@openprose/reactor", replacement: reactorDist("index.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["skills/open-prose/examples/surprise-cost/surprise-cost.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
