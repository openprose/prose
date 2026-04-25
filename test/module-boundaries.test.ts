import { describe, expect, test } from "./support";
import * as prose from "../src/index";

describe("OpenProse module boundaries", () => {
  test("exposes architectural namespaces from the public entry point", () => {
    expect(typeof prose.core.sha256).toBe("function");
    expect(typeof prose.source.formatSource).toBe("function");
    expect(typeof prose.ir.compileSource).toBe("function");
    expect(typeof prose.graph.graphSource).toBe("function");
    expect(typeof prose.store.statusPath).toBe("function");
    expect(typeof prose.runtime.planSource).toBe("function");
    expect(typeof prose.packageLifecycle.packagePath).toBe("function");
    expect(typeof prose.runCli).toBe("function");
    expect(prose.schema).toBeDefined();
    expect(prose.meta).toBeDefined();
    expect(prose.providers).toBeDefined();
    expect(prose.policy).toBeDefined();
    expect(prose.evals).toBeDefined();
  });
});
