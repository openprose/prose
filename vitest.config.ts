import { defineConfig } from "vitest/config";

// Root vitest config for the OpenProse SKILL conformance corpus.
//
// The 197 SKILL conformance tests under `tests/open-prose/**` (contract-markdown,
// compiler/IR, concepts, forme, tenets, primitives, state, responsibility-runtime,
// skill-meta, examples) assert that `skills/open-prose/**` embodies the
// Intelligent-React end-state. They are repo-root tests with no owning package,
// so this root config gives the `test:skill` gate a single, scoped entry point
// (`vitest run tests/open-prose`) without coupling them to the cli/cradle suites.
//
// Scope is deliberately limited to `tests/open-prose/**` so this gate never
// reaches into `packages/*` or `tools/cli` test filters.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/open-prose/**/*.test.ts"]
  }
});
