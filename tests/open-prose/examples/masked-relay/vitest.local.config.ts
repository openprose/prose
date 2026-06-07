import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local offline gate for THIS example only. Mirrors the root vitest.config.ts
// aliases (the public @openprose/reactor subpaths -> the prebuilt workspace dist,
// the SAME bytes a consumer imports) but scopes the run to masked-relay.test.ts.
//
// RUN (offline, zero spend):
//   REACTOR_OFFLINE=1 \
//     npx vitest run --config tests/open-prose/examples/masked-relay/vitest.local.config.ts
const reactorDist = (sub: string) =>
  fileURLToPath(
    new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url),
  );

export default defineConfig({
  resolve: {
    // Order matters: more-specific subpaths must precede the bare barrel.
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
    include: ["tests/open-prose/examples/masked-relay/masked-relay.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
