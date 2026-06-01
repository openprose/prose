// Local vitest config scoped to THIS example only — a convenience for iterating
// on the agent-observatory gate in isolation. It mirrors the root config's
// `@openprose/reactor` → prebuilt-dist aliases (the example dir has no local
// node_modules), and includes BOTH the deterministic tier-2 gate and the
// key-gated tier-3 live test so a run can confirm the live body passing-skips
// offline. The shared root gate excludes `*.live.test.ts`; this local config
// keeps them in scope on purpose.
//
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 npx vitest run \
//     --config skills/open-prose/examples/agent-observatory/vitest.local.config.ts

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    include: [
      fileURLToPath(new URL("./agent-observatory.test.ts", import.meta.url)),
      fileURLToPath(new URL("./agent-observatory.live.test.ts", import.meta.url)),
    ],
    exclude: ["**/node_modules/**"],
  },
});
