// The Masked Relay learning-example generator.
//
// The scenario itself (the 12-node peer-blind relay, the scripted
// cold -> surprise -> quiet-skip -> surprise episode, every render body, and the
// cost model) lives ONCE, in the canonical fixture generator at
// packages/reactor-devtools/src/fixtures/masked-relay.ts. This module imports it
// so the learning corpus and the devtools replay corpus can never drift: both
// drive the SAME real @openprose/reactor reconciler with the SAME deterministic
// fake renders (NO model key) over the SAME beat timeline.
//
// The canonical generator writes the replay state-dir (receipts.json flat at the
// root, world-models/<HEX>/..., and compile/topology.json). On top of that this
// example adds the two files the example library requires for every scenario:
//
//   1. compile/labels.json  (nodeId -> human label; the devtools fixture omits it)
//   2. beats.json           (the scripted beat timeline the SPA scrubs)
//
// Both are static, example-side framing: labels name the nodes the canonical
// generator declares, and the beats describe the canonical episode. Same inputs
// => byte-identical state-dir.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  generateMaskedRelayFixture,
  type GenerateOptions,
  type GenerateResult,
} from "../../../../packages/reactor-devtools/src/fixtures/masked-relay";

export type { GenerateOptions, GenerateResult };

// ---------------------------------------------------------------------------
// Node identities (mirror the .prose.md contract under src/ and the canonical
// generator's node ids). Kept here only as labels.json keys.
// ---------------------------------------------------------------------------

const SOURCE = "ingress.signal-inbox"; // the system's edge (phantom producer)
const GATEWAY = "gateway.signal-inbox";
const SIGNAL_LEDGER = "responsibility.signal-ledger";

const SCOUT_PRICE = "responsibility.scout-price";
const SCOUT_FRICTION = "responsibility.scout-friction";
const SCOUT_DESIRE = "responsibility.scout-desire";

const VIEWPORT_MASKER = "responsibility.viewport-masker";

const EXPANDER_1 = "responsibility.expander-1";
const EXPANDER_2 = "responsibility.expander-2";

const CRITIC_STRONG = "responsibility.critic-strong";
const CRITIC_WEAK = "responsibility.critic-weak";

const SYNTHESIZER = "responsibility.insight-synthesizer";
const AUDITOR = "responsibility.diversity-auditor";

// Friendly labels for the devtools SPA (nodeId -> human label). The devtools
// masked-relay fixture shipped without one; the example library requires
// labels.json for every example.
const LABELS: Record<string, string> = {
  [SOURCE]: "Signal Inbox (edge)",
  [GATEWAY]: "Signal Inbox",
  [SIGNAL_LEDGER]: "Signal Ledger",
  [SCOUT_PRICE]: "Scout · Price",
  [SCOUT_FRICTION]: "Scout · Friction",
  [SCOUT_DESIRE]: "Scout · Desire",
  [VIEWPORT_MASKER]: "Viewport Masker",
  [EXPANDER_1]: "Expander 1",
  [EXPANDER_2]: "Expander 2",
  [CRITIC_STRONG]: "Critic · Strong",
  [CRITIC_WEAK]: "Critic · Weak",
  [SYNTHESIZER]: "Insight Synthesizer",
  [AUDITOR]: "Diversity Auditor",
};

// The recorder beat map: the cold -> surprise -> quiet-skip -> surprise story arc
// the SPA scrubs. Describes the canonical episode the shared generator drives.
const BEATS = {
  scenario: "masked-relay",
  title:
    "A 12-node peer-blind relay. A new signal arrives and one path re-renders; a no-change re-wake memo-skips the whole relay; cost scales with surprise, never the clock.",
  beats: [
    {
      name: "cold-boot",
      from: 0,
      to: 11,
      holdMs: 2600,
      caption:
        "cold start · all 12 nodes render once · scouts fan out peer-blind · masker projects per-consumer view facets · synthesizer commits over the full trail",
    },
    {
      name: "surprise-s2",
      from: 12,
      to: 23,
      holdMs: 3200,
      caption:
        "a NEW signal (S2) arrives · the gateway memo-misses · the relay re-renders down its path · fresh tokens spike with the surprise",
    },
    {
      name: "quiet-skip",
      from: 24,
      to: 35,
      holdMs: 2400,
      caption:
        "a byte-identical re-wake · the GATEWAY memo-SKIPS and nothing downstream wakes · no facet moves · no lane lights · fresh 0 · the flat-line",
    },
    {
      name: "surprise-s3",
      from: 36,
      to: 47,
      holdMs: 3200,
      caption:
        "a third distinct signal (S3) · another surprise spike · the masked projections re-derive deterministically",
    },
  ],
};

/**
 * Build the deterministic masked-relay state-dir at `opts.stateDir` by driving
 * the canonical devtools generator, then add the example-library files
 * (compile/labels.json + beats.json). Re-running with the same path reproduces
 * the same bytes (lossless regen).
 */
export function generateMaskedRelayExample(
  opts: GenerateOptions,
): GenerateResult {
  const result = generateMaskedRelayFixture(opts);

  const compileDir = join(opts.stateDir, "compile");
  mkdirSync(compileDir, { recursive: true });
  writeFileSync(
    join(compileDir, "labels.json"),
    `${JSON.stringify(LABELS, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(opts.stateDir, "beats.json"),
    `${JSON.stringify(BEATS, null, 2)}\n`,
    "utf8",
  );

  return result;
}

// Allow `tsx generate.ts` / `node generate.js` to (re)build the state-dir in
// place for local inspection.
if (require.main === module) {
  const out = join(__dirname, "replay");
  const res = generateMaskedRelayExample({ stateDir: out });
  // eslint-disable-next-line no-console
  console.log(
    `masked-relay: ${res.receiptsCount} receipts · ${res.nodeCount} nodes · ${res.edgeCount} edges -> ${out}`,
  );
}
