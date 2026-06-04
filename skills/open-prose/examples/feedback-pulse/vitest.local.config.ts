import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local, single-example vitest config for feedback-pulse. Mirrors the root
// config's reactor-dist aliasing so the public `@openprose/reactor` subpaths
// resolve to the prebuilt workspace dist, and scopes the run to THIS example's
// tests (the deterministic tier-2 gate + the key-gated tier-3 live test, which
// passing-skips offline). The integrator may reuse or remove this file.
const reactorDist = (sub: string) =>
  fileURLToPath(
    new URL(`../../../../packages/reactor/dist/${sub}`, import.meta.url),
  );

export default defineConfig({
  resolve: {
    // Order matters: more-specific subpaths must precede the bare barrel.
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
      "skills/open-prose/examples/feedback-pulse/feedback-pulse.test.ts",
      "skills/open-prose/examples/feedback-pulse/feedback-pulse.live.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
