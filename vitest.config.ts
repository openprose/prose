import { defineConfig } from "vitest/config";

// Root vitest config for the OpenProse skill conformance corpus.
//
// The tests under `tests/open-prose/**` (contract-markdown, compiler/IR,
// concepts, forme, tenets, primitives, state, responsibility-runtime,
// skill-meta, stale-docs, examples-corpus) assert that `skills/open-prose/**`
// embodies the Intelligent-React end-state. They read Markdown off disk and
// need no build step: there is no owning package and nothing to compile.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/open-prose/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
