import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface RootPackageJson {
  name: string;
  version: string;
  description?: string;
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const rootPackage = JSON.parse(
    await readFile(resolve(repoRoot, "package.json"), "utf8"),
  ) as RootPackageJson;
  const distPackage = {
    name: rootPackage.name,
    version: rootPackage.version,
    description: rootPackage.description ?? "OpenProse compiler and runtime tooling.",
    bin: {
      prose: "./prose",
    },
    files: ["prose"],
  };

  await mkdir(resolve(repoRoot, "dist"), { recursive: true });
  await writeFile(
    resolve(repoRoot, "dist", "package.json"),
    `${JSON.stringify(distPackage, null, 2)}\n`,
    "utf8",
  );
}

await main();
