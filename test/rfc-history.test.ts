import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";

const repoRoot = join(import.meta.dir, "..");
const phase04Root = join(
  repoRoot,
  "rfcs/013-ideal-oss-package-restructure/phases/04-provider-protocol",
);

describe("historical RFC guardrails", () => {
  test("RFC 013 provider phase pages are stubs, not implementation playbooks", () => {
    for (const entry of readdirSync(phase04Root).filter((name) => name.endsWith(".md"))) {
      const text = readFileSync(join(phase04Root, entry), "utf8");

      expect(text, entry).toMatch(/historical/i);
      expect(text, entry).toMatch(/Current (Reading|Architecture)/);
      expect(text, entry).not.toContain("Commit as `");
      expect(text, entry).not.toContain("Build:");
      expect(text, entry).not.toContain("Tests:");
      expect(text, entry).not.toContain("ProviderRequest");
      expect(text, entry).not.toContain("ProviderResult");
    }
  });
});
