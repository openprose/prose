// scenarios.mjs — the 5-scenario set per example (spec "Scenario Set" + plan §5).
//
//   cold_start        run from empty state with fixture inputs
//   changed_input     add one material new input; confirm affected slices wake
//   no_change_replay  re-run identical inputs; confirm expensive renders skip
//   blocked_or_gated  inject a safety/human-gate condition; confirm no forbidden commit
//   artifact_review   inspect the top-level maintained artifact for usefulness
//
// A committed devtools state-dir is a SCRIPTED beat timeline that already
// contains the cold → quiet-skip → surprise arc (the surprise-cost lesson). So
// for the offline/fixture path a single state-dir witnesses several scenarios:
// we derive a scenario CONTEXT (kind + which events evidence it + any gate
// nodes) from one trajectory. A live harness adapter can instead point each
// scenario at a distinct run; the downstream checker/judges are identical.

export const SCENARIO_KINDS = [
  "cold_start",
  "changed_input",
  "no_change_replay",
  "blocked_or_gated",
  "artifact_review",
];

/**
 * Decide which scenarios a single committed trajectory can witness, and produce
 * a scenario context for each. The checker reads `kind` + `gatedNodes`; judges
 * read `focusEvents`.
 *
 * @param {import("./normalizer.mjs").EvalTrajectory} traj
 * @param {Object} [opts]
 * @param {string[]} [opts.only]        restrict to these scenario kinds
 * @param {string[]} [opts.gatedNodes]  nodes behind a human/safety gate (blocked_or_gated)
 * @returns {{kind:string,scenarioId:string,supported:boolean,skipReason?:string,gatedNodes:string[],focusEvents:number[]}[]}
 */
export function deriveScenarios(traj, opts = {}) {
  const want = opts.only ?? SCENARIO_KINDS;
  const out = [];
  for (const kind of want) {
    out.push(deriveOne(traj, kind, opts));
  }
  return out;
}

function deriveOne(traj, kind, opts) {
  const base = {
    kind,
    scenarioId: kind,
    supported: false,
    gatedNodes: opts.gatedNodes ?? [],
    focusEvents: [],
  };
  switch (kind) {
    case "cold_start": {
      // The cold start = the first render of each node (every facet moved). At
      // least the entry node must render at the head of the timeline.
      const entry = new Set(traj.entryPoints);
      const coldRenders = traj.renderEvents.filter(
        (e) => entry.has(e.node) || e.wakeSource === "external",
      );
      return {
        ...base,
        supported: traj.renderEvents.length > 0,
        skipReason: traj.renderEvents.length ? undefined : "no render events",
        focusEvents: coldRenders.slice(0, 4).map((e) => e.index),
      };
    }
    case "changed_input": {
      // A material new input = a later render whose wake source is `input` and
      // whose facets moved, after the node had already been seen (a surprise).
      const seen = new Set();
      const surprises = [];
      for (const e of traj.events) {
        if (
          e.status === "rendered" &&
          e.wakeSource === "input" &&
          e.movedFacets.length > 0 &&
          seen.has(e.node)
        ) {
          surprises.push(e.index);
        }
        seen.add(e.node);
      }
      return {
        ...base,
        supported: surprises.length > 0,
        skipReason: surprises.length
          ? undefined
          : "no post-cold input-driven surprise render in this trajectory",
        focusEvents: surprises.slice(0, 4),
      };
    }
    case "no_change_replay": {
      const skips = traj.skipEvents.map((e) => e.index);
      return {
        ...base,
        supported: skips.length > 0,
        skipReason: skips.length
          ? undefined
          : "trajectory contains no skip events to witness a quiet replay",
        focusEvents: skips.slice(0, 6),
      };
    }
    case "blocked_or_gated": {
      const gated = new Set(base.gatedNodes);
      const blockEvents = traj.events
        .filter((e) => e.status === "failed" || gated.has(e.node))
        .map((e) => e.index);
      // Supported if the trajectory has a failed/blocked step OR the caller
      // declared gate nodes to assert non-bypass against.
      return {
        ...base,
        supported: blockEvents.length > 0,
        skipReason: blockEvents.length
          ? undefined
          : "no failed/blocked step and no gated nodes declared",
        focusEvents: blockEvents.slice(0, 4),
      };
    }
    case "artifact_review": {
      // The terminal (sink) artifacts — last render per sink node.
      const producers = new Set(traj.edges.map((e) => e.producer));
      const sinks = new Set(
        traj.nodes.map((n) => n.id).filter((id) => !producers.has(id)),
      );
      const sinkRenders = traj.renderEvents
        .filter((e) => sinks.has(e.node))
        .map((e) => e.index);
      return {
        ...base,
        supported: traj.renderEvents.length > 0,
        focusEvents: sinkRenders.slice(-4),
      };
    }
    default:
      return { ...base, skipReason: `unknown scenario kind ${kind}` };
  }
}
