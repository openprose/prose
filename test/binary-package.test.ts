import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";
import { createDistPackageJson } from "../scripts/write-dist-package";

const repoRoot = join(import.meta.dir, "..");

describe("OpenProse binary package surface", () => {
  test("keeps the source workspace private and script-driven", () => {
    const rootPackage = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );

    expect(rootPackage.private).toBe(true);
    expect(rootPackage.bin).toBeUndefined();
    expect(rootPackage.scripts.prose).toBe("bun bin/prose.ts");
    expect(rootPackage.scripts["smoke:cold-start"]).toBe(
      "bun scripts/cold-start-smoke.ts",
    );
    expect(rootPackage.scripts["smoke:agent-onboarding"]).toBe(
      "bun scripts/agent-onboarding-smoke.ts",
    );
    expect(rootPackage.scripts["build:binary"]).toContain(
      "scripts/write-dist-package.ts",
    );
  });

  test("generates the publishable package metadata from the source package", () => {
    const distPackage = createDistPackageJson({
      name: "@openprose/prose",
      version: "0.11.0-dev",
      description: "OpenProse compiler and local reactive runtime.",
      license: "MIT",
      homepage: "https://github.com/openprose/prose#readme",
      repository: {
        type: "git",
        url: "git+https://github.com/openprose/prose.git",
      },
      bugs: {
        url: "https://github.com/openprose/prose/issues",
      },
      keywords: ["agents", "openprose"],
    });

    expect(distPackage).toMatchObject({
      name: "@openprose/prose",
      version: "0.11.0-dev",
      license: "MIT",
      bin: {
        prose: "./prose",
      },
      files: ["prose"],
    });
    expect("private" in distPackage).toBe(false);
  });
});
