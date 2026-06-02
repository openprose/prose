import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local, dir-scoped config so the integrator (or a self-verify run) can execute
// ONLY this example's deterministic tier-2 gate offline:
//   cd /Users/sl/code/prose && REACTOR_OFFLINE=1 \
//     npx vitest run --config skills/open-prose/examples/forme-fixpoint/vitest.local.config.ts
//
// It mirrors the ROOT vitest.config.ts resolve aliases: the example dir has no
// local node_modules, so the public @openprose/reactor subpaths are aliased to
// the prebuilt workspace dist (the SAME bytes a consumer imports). Order matters:
// more-specific subpaths must precede the bare barrel.
const reactorDist = (sub: string) =>
  fileURLToPath(new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
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
    include: ["skills/open-prose/examples/forme-fixpoint/forme-fixpoint.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**"],
  },
});
