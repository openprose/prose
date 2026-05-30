/**
 * The Forme SESSION's structured output schema + the deterministic lowering of
 * that output into a {@link ReconcilerTopology} (Phase 3a; architecture.md §3.1;
 * forme.md). This is the Determinism boundary in code:
 *
 *   - The SESSION (intelligent, SKILL-loaded) reads the contract set and makes
 *     the ONE judgment call only it can make: the semantic `### Requires` ↔
 *     `### Maintains` match (forme.md step 2; "string-matching would defeat the
 *     point of a smart wiring layer"). It also reports each node's facet
 *     decomposition + declared wake-source. It emits all of this as a STRUCTURED
 *     `finalOutput` (this schema).
 *   - The deterministic `wire(...)` scaffolding (edge resolution given the
 *     matches, fan-in slots, ambiguity/unsatisfied diagnostics, acyclicity DFS)
 *     is Forme's TOOLS/VALIDATORS — it runs HERE, deterministically, over the
 *     session's decisions. The placeholder `exactFacetMatcher` is NOT used; the
 *     matcher is the session's reported match-set.
 *
 * Intelligence is frozen ONCE (the session) into a deterministic artifact (the
 * topology) the dumb reconciler executes — gap-audit "Determinism boundary".
 *
 * `zod` is a dev/optional dep imported for the schema; nothing here runs at
 * import time (the schema is built lazily via {@link formeOutputSchema}), so the
 * offline-build guard holds. The lowering ({@link lowerFormeOutput}) is pure and
 * imports no SDK — it is offline-testable with a literal object.
 */

import { z } from "zod";

import {
  ATOMIC_FACET,
  type Fingerprint,
  type WakeSource,
} from "../../shapes";
import {
  wire,
  type FacetMatcher,
  type RenderContract,
  type RenderKind,
  type RequiresContract,
  type FormeResult,
} from "../../forme";
import type { ReconcilerTopology } from "../../reactor";

// ---------------------------------------------------------------------------
// The structured finalOutput the Forme session emits (zod `outputType`)
// ---------------------------------------------------------------------------

const WAKE_SOURCES = ["input", "self", "external"] as const;
const RENDER_KINDS = [
  "responsibility",
  "gateway",
  "function",
  "pattern",
  "test",
] as const;

/**
 * Build the Forme session's structured-output schema. Each node reports its
 * resolved facet decomposition (`requires`/`maintains` facet names) + its
 * declared `wake_source`; `matches` carries the session's semantic
 * `Requires ↔ Maintains` decisions as explicit `(subscriber, facet) →
 * (producer, facet)` edges. The deterministic lowering turns these into the
 * topology — including drawing the edges, slotting fan-in, and surfacing
 * diagnostics the session's matches imply.
 */
export function formeOutputSchema(): z.ZodTypeAny {
  return z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(RENDER_KINDS),
        wake_source: z.enum(WAKE_SOURCES),
        /** The `### Requires` facet-contract NAMES this node declares. */
        requires: z.array(
          z.object({
            facet: z.string(),
            /** Deliberate fan-in: many producers may satisfy this one need. */
            fan_in: z.boolean().optional(),
          }),
        ),
        /** The `### Maintains` facet NAMES this node exposes (empty ⇒ atomic). */
        maintains: z.array(z.string()),
      }),
    ),
    /**
     * The session's semantic match decisions: subscriber's `### Requires` facet
     * NAME → the producer + producer-facet that satisfies it. One entry per
     * resolved (subscriber-need, producer) pair; fan-in yields several entries
     * for one need.
     */
    matches: z.array(
      z.object({
        subscriber: z.string(),
        /** The subscriber's `### Requires` facet-contract name. */
        requirement: z.string(),
        producer: z.string(),
        /** The producer's `### Maintains` facet (or `@atomic`). */
        facet: z.string(),
      }),
    ),
  });
}

/**
 * The validated Forme output, in plain TypeScript (mirrors
 * {@link formeOutputSchema}). The lowering takes THIS, so it is unit-testable
 * with a literal object (no SDK / no zod round-trip).
 */
export interface FormeOutputSignal {
  readonly nodes: readonly FormeNodeDecl[];
  readonly matches: readonly FormeMatchDecl[];
}

export interface FormeNodeDecl {
  readonly id: string;
  readonly kind: RenderKind;
  readonly wake_source: WakeSource;
  readonly requires: readonly { readonly facet: string; readonly fan_in?: boolean }[];
  readonly maintains: readonly string[];
}

export interface FormeMatchDecl {
  readonly subscriber: string;
  readonly requirement: string;
  readonly producer: string;
  readonly facet: string;
}

// ---------------------------------------------------------------------------
// Deterministic lowering: session output → ReconcilerTopology (the artifact)
// ---------------------------------------------------------------------------

/**
 * The full result of lowering a Forme session output: the mountable
 * {@link ReconcilerTopology} plus the underlying {@link FormeResult} (which
 * carries the wiring diagnostics the session's matches implied). A caller that
 * wants to FAIL the compile on an unsatisfied/ambiguous match, or on a cycle,
 * reads `forme.diagnostics` / `forme.topology.acyclic`.
 */
export interface LoweredFormeOutput {
  readonly reconcilerTopology: ReconcilerTopology;
  readonly forme: FormeResult;
}

/**
 * Lower the Forme session's structured output into the deterministic topology
 * artifact, by running the existing `wire(...)` scaffolding with a matcher
 * BACKED BY THE SESSION'S DECISIONS (never the placeholder `exactFacetMatcher`).
 *
 * The session reports `matches` as `(subscriber, requirement-facet) →
 * (producer, producer-facet)`. We build a {@link FacetMatcher} that returns
 * `true` exactly for those reported pairs, then `wire(...)` does the
 * deterministic rest: resolve edges, slot fan-in (the diamond rule), surface
 * unsatisfied/ambiguous diagnostics, and run the acyclicity DFS. The
 * contract-fingerprints are supplied by the caller (the loaded contract set).
 */
export function lowerFormeOutput(
  signal: FormeOutputSignal,
  contractFingerprints: Readonly<Record<string, Fingerprint>>,
): LoweredFormeOutput {
  const contracts = signal.nodes.map((node): RenderContract => {
    const fingerprint = contractFingerprints[node.id];
    if (fingerprint === undefined) {
      throw new Error(
        `forme-output: session reported node '${node.id}' with no contract fingerprint ` +
          `in the loaded contract set`,
      );
    }
    const requires: RequiresContract[] = node.requires.map((need) =>
      need.fan_in === true
        ? { facet: need.facet, fanIn: true }
        : { facet: need.facet },
    );
    return {
      id: node.id,
      contract_fingerprint: fingerprint,
      kind: node.kind,
      requires,
      maintains: node.maintains.slice(),
      wakeSource: node.wake_source,
    };
  });

  const matcher = sessionMatcher(signal.matches);
  const forme = wire(contracts, { matcher });

  // Only data-flow nodes (responsibility/gateway) enter the topology, so the
  // contract-fingerprint map the reconciler reads is scoped to topology nodes.
  const fingerprints: Record<string, Fingerprint> = {};
  for (const node of forme.topology.nodes) {
    const fp = contractFingerprints[node.node];
    if (fp !== undefined) {
      fingerprints[node.node] = fp;
    }
  }

  return {
    forme,
    reconcilerTopology: {
      topology: forme.topology,
      contract_fingerprints: fingerprints,
    },
  };
}

/**
 * Build the injected {@link FacetMatcher} from the session's reported matches.
 * The matcher returns `true` for a `(requirement, candidate)` pair exactly when
 * the session reported a match for `(subscriber, requirement-facet) →
 * (producer, producer-facet)`. This is the seam where the intelligent decision
 * (the session) drives the deterministic scaffolding (`wire`): the placeholder
 * `exactFacetMatcher` is explicitly NOT production (forme.md step 2).
 *
 * `@atomic` requirement/candidate facets are matched verbatim like any other
 * name (a producer with no declared facets exposes `@atomic`).
 */
export function sessionMatcher(matches: readonly FormeMatchDecl[]): FacetMatcher {
  const keys = new Set<string>();
  for (const m of matches) {
    keys.add(matchKey(m.subscriber, m.requirement, m.producer, m.facet));
  }
  return (requirement, candidate) =>
    keys.has(
      matchKey(
        requirement.subscriber,
        requirement.facet,
        candidate.producer,
        candidate.facet,
      ),
    );
}

function matchKey(
  subscriber: string,
  requirement: string,
  producer: string,
  facet: string,
): string {
  return `${subscriber} ${requirement} ${producer} ${facet}`;
}

/** Re-export the reserved atomic facet for callers building match-sets. */
export { ATOMIC_FACET };
