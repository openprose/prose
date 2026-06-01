import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local offline gate for THIS example only. Mirrors the root vitest.config.ts
// aliases (the public @openprose/reactor subpaths -> the prebuilt workspace dist,
// the SAME bytes a consumer imports) but scopes the run to masked-relay.test.ts.
//
// RUN (offline, zero spend):
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 \
//     npx vitest run --config skills/open-prose/examples/masked-relay/vitest.local.config.ts
const reactorDist = (sub: string) =>
  fileURLToPath(new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Order matters: more-specific subpaths must precede the bare barrel.
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
    include: ["skills/open-prose/examples/masked-relay/masked-relay.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
