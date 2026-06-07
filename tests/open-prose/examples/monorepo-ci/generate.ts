// Regenerate the monorepo-ci learning example's `replay/` state-dir for local
// inspection (the tests regenerate into a tmpdir; nothing here is committed).
//
//   npx tsx tests/open-prose/examples/monorepo-ci/generate.ts
//
// This example SHARES its generator with the devtools fixture
// (packages/reactor-devtools/src/fixtures/monorepo-ci.ts) so the learning corpus
// and the devtools replay corpus can never drift: both drive the SAME real
// @openprose/reactor reconciler with the SAME deterministic fake renders over the
// SAME scripted beat timeline (cold → quiet skip → leaf diff → hub fan-out → RED
// → recover → quiet), then write:
//
//   replay/receipts.json                 (flat ROOT ledger trail)
//   replay/registry.json                 (storage adapter registry)
//   replay/world-models/<hexNodeId>/…    (per-node published truth + versions/*.bin)
//   replay/compile/topology.json         (the TopologyWorldModel — MANDATORY)
//   replay/compile/labels.json           (nodeId → friendly label, present always)
//   replay/beats.json                    (the scripted beat timeline; self-written
//                                         here so a regen is LOSSLESS — clean:true
//                                         wipes then the generator re-writes it)
//
// The shared generator already self-writes beats.json + labels.json and drives
// the reconciler over the FileSystem store + ledger via public SDK primitives, so
// there is nothing to hand-author here — we just point it at our replay/ dir.
//
// Determinism: every render body is a pure function of (upstream truth, own
// prior); cost is a pure function of how much moved. Same generator ⇒
// byte-identical state-dir. The monorepo-ci.test.ts asserts that.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { generateMonorepoCiFixture } from "../../../../packages/reactor-devtools/src/fixtures/monorepo-ci";

/** Absolute path to this example's committed replay state-dir. */
export function replayDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "replay");
}

/**
 * (Re)generate the committed `replay/` state-dir. `clean` defaults to true (a
 * fresh, deterministic build); the shared generator self-writes beats.json so a
 * clean regen is lossless.
 */
export function generate(stateDir: string = replayDir()) {
  return generateMonorepoCiFixture({ stateDir });
}

// `tsx generate.ts` regenerates the committed bytes in place.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = generate();
  process.stdout.write(
    `wrote monorepo-ci replay → ${result.stateDir}\n` +
      `  receipts: ${result.receiptsCount}\n` +
      `  nodes:    ${result.nodeCount}\n` +
      `  edges:    ${result.edgeCount}\n` +
      `  facets:   ${result.facets.join(", ")}\n`,
  );
}
