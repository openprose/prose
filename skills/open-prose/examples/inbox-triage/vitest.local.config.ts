import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local, single-example vitest config for inbox-triage. Mirrors the root
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
      "skills/open-prose/examples/inbox-triage/inbox-triage.test.ts",
      "skills/open-prose/examples/inbox-triage/inbox-triage.live.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
