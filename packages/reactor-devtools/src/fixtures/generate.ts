// Regenerate the COMMITTED demo fixtures into `fixtures/<name>/`.
//
//   node dist/fixtures/generate.js                          → all committed fixtures
//   node dist/fixtures/generate.js masked-relay             → just masked-relay
//   node dist/fixtures/generate.js observatory              → just the observatory
//   node dist/fixtures/generate.js observatory <abs-dir>    → a custom location
//
// The committed output is the demo's replay input AND the devtools test corpus,
// so it is checked in (deterministic ⇒ reviewable as a diff). Re-run after any
// change to a generator and commit the result.

import { resolve, join } from "node:path";

import { generateMaskedRelayFixture } from "./masked-relay";
import { generateAgentObservatoryFixture } from "./agent-observatory";
import { generateMonorepoCiFixture } from "./monorepo-ci";
import { generateNewsDeskFixture } from "./news-desk";
import { generateInboxTriageFixture } from "./inbox-triage";
import { generateContractRedlineFixture } from "./contract-redline";
import { generateResearchTreeFixture } from "./research-tree";

function packageRoot(): string {
  // dist/fixtures/generate.js → package root is two dirs up from dist/fixtures.
  return resolve(__dirname, "..", "..");
}

interface Target {
  readonly name: string;
  readonly defaultDir: string;
  readonly generate: (opts: { stateDir: string }) => {
    stateDir: string;
    receiptsCount: number;
    nodeCount: number;
    edgeCount: number;
    facets: readonly string[];
  };
}

const TARGETS: Record<string, Target> = {
  "masked-relay": {
    name: "masked-relay",
    defaultDir: join(packageRoot(), "fixtures", "masked-relay"),
    generate: generateMaskedRelayFixture,
  },
  observatory: {
    name: "agent-observatory",
    defaultDir: join(packageRoot(), "fixtures", "agent-observatory"),
    generate: generateAgentObservatoryFixture,
  },
  "monorepo-ci": {
    name: "monorepo-ci",
    defaultDir: join(packageRoot(), "fixtures", "monorepo-ci"),
    generate: generateMonorepoCiFixture,
  },
  "news-desk": {
    name: "news-desk",
    defaultDir: join(packageRoot(), "fixtures", "news-desk"),
    generate: generateNewsDeskFixture,
  },
  "inbox-triage": {
    name: "inbox-triage",
    defaultDir: join(packageRoot(), "fixtures", "inbox-triage"),
    generate: generateInboxTriageFixture,
  },
  "contract-redline": {
    name: "contract-redline",
    defaultDir: join(packageRoot(), "fixtures", "contract-redline"),
    generate: generateContractRedlineFixture,
  },
  "research-tree": {
    name: "research-tree",
    defaultDir: join(packageRoot(), "fixtures", "research-tree"),
    generate: generateResearchTreeFixture,
  },
};

function emit(target: Target, stateDir: string): void {
  const result = target.generate({ stateDir });
  process.stdout.write(
    `wrote ${target.name} fixture → ${result.stateDir}\n` +
      `  receipts: ${result.receiptsCount}\n` +
      `  nodes:    ${result.nodeCount}\n` +
      `  edges:    ${result.edgeCount}\n` +
      `  facets:   ${result.facets.join(", ")}\n`,
  );
}

function main(): void {
  const which = process.argv[2];
  const dirArg = process.argv[3];

  if (!which) {
    // Default: regenerate all committed fixtures into their default dirs.
    for (const target of Object.values(TARGETS)) {
      emit(target, target.defaultDir);
    }
    return;
  }

  const target = TARGETS[which];
  if (!target) {
    process.stderr.write(
      `unknown fixture "${which}" — expected one of: ${Object.keys(TARGETS).join(", ")}\n`,
    );
    process.exit(1);
    return;
  }
  const stateDir = dirArg ? resolve(dirArg) : target.defaultDir;
  emit(target, stateDir);
}

main();
