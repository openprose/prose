import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local, scoped offline gate for the `surprise-cost` example. Mirrors the root
// `vitest.config.ts` alias map (public `@openprose/reactor` subpaths → prebuilt
// workspace dist) but narrows `include` to THIS example's deterministic test so
// it can be self-verified offline in isolation:
//
//   REACTOR_OFFLINE=1 \
//     npx vitest run --config \
//     tests/open-prose/examples/surprise-cost/vitest.local.config.ts
//
// The integrator may reuse or remove this file; the canonical gate is the root
// config, which already globs `tests/open-prose/examples/**/*.test.ts`.
const reactorDist = (sub: string) =>
  fileURLToPath(
    new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url),
  );

export default defineConfig({
  resolve: {
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
    include: ["tests/open-prose/examples/surprise-cost/surprise-cost.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
