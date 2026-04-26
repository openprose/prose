import { readdirSync } from "node:fs";
import {
  compileSource,
  describe,
  expect,
  join,
  lintSource,
  readFileSync,
  test,
} from "./support";

const deliveryRoot = join(import.meta.dir, "..", "packages", "std", "delivery");
const hostRecipeTerms =
  /(Bash tool|write a Python script|curl via|Claude Code|\/tmp\/send_email\.py|reference implementation|Python's|AWS SDK or CLI|Google Cloud SDK or CLI)/;

describe("OpenProse std delivery adapters", () => {
  test("delivery contracts compile and lint cleanly", () => {
    for (const file of deliveryFiles()) {
      const source = readFileSync(join(deliveryRoot, file), "utf8");
      const path = `packages/std/delivery/${file}`;
      const ir = compileSource(source, { path });

      expect(ir.diagnostics, file).toEqual([]);
      expect(lintSource(source, { path }), file).toEqual([]);
    }
  });

  test("delivery contracts avoid host-specific implementation recipes", () => {
    for (const file of deliveryFiles()) {
      const source = readFileSync(join(deliveryRoot, file), "utf8");

      expect(source, file).not.toMatch(hostRecipeTerms);
    }
  });
});

function deliveryFiles(): string[] {
  return readdirSync(deliveryRoot)
    .filter((file) => file.endsWith(".prose.md"))
    .sort();
}
