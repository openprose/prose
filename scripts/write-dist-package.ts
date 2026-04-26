import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface RootPackageJson {
  name: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: unknown;
  bugs?: unknown;
  keywords?: string[];
}

export function createDistPackageJson(rootPackage: RootPackageJson) {
  return {
    name: rootPackage.name,
    version: rootPackage.version,
    description:
      rootPackage.description ?? "OpenProse compiler and local reactive runtime.",
    license: rootPackage.license ?? "MIT",
    homepage: rootPackage.homepage,
    repository: rootPackage.repository,
    bugs: rootPackage.bugs,
    keywords: rootPackage.keywords ?? [],
    bin: {
      prose: "./prose",
    },
    files: ["prose"],
  };
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const rootPackage = JSON.parse(
    await readFile(resolve(repoRoot, "package.json"), "utf8"),
  ) as RootPackageJson;
  const distPackage = createDistPackageJson(rootPackage);

  await mkdir(resolve(repoRoot, "dist"), { recursive: true });
  await writeFile(
    resolve(repoRoot, "dist", "package.json"),
    `${JSON.stringify(distPackage, null, 2)}\n`,
    "utf8",
  );
}

if (import.meta.main) {
  await main();
}
