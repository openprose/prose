// Regenerate the COMMITTED masked-relay fixture into `fixtures/masked-relay/`.
//
//   node dist/fixtures/generate.js                 → packages/.../fixtures/masked-relay
//   node dist/fixtures/generate.js <abs-state-dir> → a custom location
//
// The committed output is the demo's replay input AND the devtools test corpus,
// so it is checked in (deterministic ⇒ reviewable as a diff). Re-run after any
// change to the generator and commit the result.

import { resolve, join } from "node:path";

import { generateMaskedRelayFixture } from "./masked-relay";

function defaultStateDir(): string {
  // dist/fixtures/generate.js → package root is two dirs up from dist/fixtures.
  // Resolve against the package root so it works from any cwd.
  const packageRoot = resolve(__dirname, "..", "..");
  return join(packageRoot, "fixtures", "masked-relay");
}

function main(): void {
  const arg = process.argv[2];
  const stateDir = arg ? resolve(arg) : defaultStateDir();
  const result = generateMaskedRelayFixture({ stateDir });
  process.stdout.write(
    `wrote masked-relay fixture → ${result.stateDir}\n` +
      `  receipts: ${result.receiptsCount}\n` +
      `  nodes:    ${result.nodeCount}\n` +
      `  edges:    ${result.edgeCount}\n` +
      `  facets:   ${result.facets.join(", ")}\n`,
  );
}

main();
