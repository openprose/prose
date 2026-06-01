/**
 * Human-readable formatters for the observability commands (the non-`--json`
 * path). KEYLESS, pure string building over the projections. Kept separate from
 * the handlers so the JSON shape (the machine contract) and the text shape (the
 * operator view) evolve independently.
 */

import type {
  StatusProjection,
  TopologyProjection,
  InspectProjection,
  LogEntry,
  NodeTrace,
  ReceiptsAudit,
} from '../observe/projections';
import type { CostRollup } from '../run/cost';

function tokens(c: { fresh: number; reused: number }): string {
  return `fresh=${c.fresh} reused=${c.reused}`;
}

export function formatStatus(p: StatusProjection): string {
  const lines: string[] = [];
  lines.push('reactor status');
  lines.push('');
  lines.push(`  state dir      ${p.stateDir}`);
  lines.push(`  compiled       ${p.compiled ? 'yes' : 'no'}`);
  if (p.compiled) {
    lines.push(
      `  topology       ${p.compile.nodes} nodes, ${p.compile.edges} edges` +
        `${p.compile.compiledAt ? ` (at ${p.compile.compiledAt})` : ''}`,
    );
    lines.push(`  compile cost   ${tokens(p.compile.cost)}`);
  }
  lines.push('');
  lines.push(`  receipts       ${p.run.receipts}`);
  lines.push(`  run cost       ${tokens(p.run.total)}`);
  lines.push(
    `  dispositions   rendered=${p.run.dispositions.rendered} ` +
      `skipped=${p.run.dispositions.skipped} failed=${p.run.dispositions.failed}`,
  );
  const causes = Object.keys(p.run.bySurpriseCause).sort();
  if (causes.length > 0) {
    lines.push('');
    lines.push('  cost by surprise cause:');
    for (const cause of causes) {
      lines.push(`    ${cause.padEnd(12)} ${tokens(p.run.bySurpriseCause[cause]!)}`);
    }
  }
  const nodes = Object.keys(p.run.byNode).sort();
  if (nodes.length > 0) {
    lines.push('');
    lines.push('  cost by node:');
    for (const node of nodes) {
      lines.push(`    ${node.padEnd(28)} ${tokens(p.run.byNode[node]!)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Render the `receipts cost` rollup (cli.md §5.4): the run-side fresh/reused
 * totals, the disposition tallies, and the by-surprise-cause / by-node breakdowns
 * that make "spend scales with surprise" legible. This is the cost half of
 * {@link formatStatus} over a bare {@link CostRollup} — the human sibling of the
 * `--json` cost output (the prior human branch wrongly printed the receipts audit).
 */
export function formatCost(c: CostRollup): string {
  const lines: string[] = [];
  lines.push('reactor receipts cost');
  lines.push('');
  lines.push(`  receipts       ${c.receipts}`);
  lines.push(`  run cost       ${tokens(c.total)}`);
  lines.push(
    `  dispositions   rendered=${c.dispositions.rendered} ` +
      `skipped=${c.dispositions.skipped} failed=${c.dispositions.failed}`,
  );
  const causes = Object.keys(c.bySurpriseCause).sort();
  if (causes.length > 0) {
    lines.push('');
    lines.push('  cost by surprise cause:');
    for (const cause of causes) {
      lines.push(`    ${cause.padEnd(12)} ${tokens(c.bySurpriseCause[cause]!)}`);
    }
  }
  const nodes = Object.keys(c.byNode).sort();
  if (nodes.length > 0) {
    lines.push('');
    lines.push('  cost by node:');
    for (const node of nodes) {
      lines.push(`    ${node.padEnd(28)} ${tokens(c.byNode[node]!)}`);
    }
  }
  return lines.join('\n');
}

export function formatTopology(p: TopologyProjection): string {
  const lines: string[] = [];
  lines.push('reactor topology');
  lines.push('');
  lines.push(`  acyclic        ${p.acyclic ? 'yes' : 'no'}`);
  lines.push(`  entry points   ${p.entry_points.join(', ') || '(none)'}`);
  lines.push('');
  lines.push('  nodes:');
  for (const n of p.nodes) {
    const maintains = n.maintains.length > 0 ? ` maintains=[${n.maintains.join(', ')}]` : '';
    lines.push(`    ${n.node.padEnd(28)} wake=${n.wake_source}${maintains}`);
  }
  lines.push('');
  lines.push('  edges:');
  if (p.edges.length === 0) {
    lines.push('    (none)');
  }
  for (const e of p.edges) {
    lines.push(`    ${e.producer}.${e.facet} -> ${e.subscriber}`);
  }
  return lines.join('\n');
}

export function formatInspect(p: InspectProjection): string {
  const lines: string[] = [];
  lines.push(`reactor inspect ${p.node}`);
  lines.push('');
  lines.push(`  wake source    ${p.wake_source ?? '(unknown)'}`);
  lines.push(`  contract fp    ${p.contract_fingerprint ?? '(unknown)'}`);
  lines.push(`  maintains      ${p.maintains.join(', ') || '(none)'}`);
  if (p.subscribesTo.length > 0) {
    lines.push('  subscribes to:');
    for (const s of p.subscribesTo) {
      lines.push(`    ${s.facet} <- ${s.producer}`);
    }
  }
  lines.push('');
  lines.push('  published fingerprints:');
  const facets = Object.keys(p.publishedFingerprints).sort();
  if (facets.length === 0) {
    lines.push('    (none — cold)');
  }
  for (const facet of facets) {
    lines.push(`    ${facet.padEnd(20)} ${p.publishedFingerprints[facet]}`);
  }
  lines.push('');
  lines.push(`  receipts       ${p.receipts}`);
  lines.push(`  cost           ${tokens(p.cost.total)}`);
  if (p.lastReceipt) {
    lines.push(`  last status    ${p.lastReceipt.status}`);
  }
  lines.push(
    `  chain          ${p.chain.ok ? `ok (${p.chain.length ?? p.receipts} receipts)` : 'BROKEN'}`,
  );
  if (!p.chain.ok && p.chain.errors) {
    for (const err of p.chain.errors) {
      lines.push(`    ! ${err}`);
    }
  }
  return lines.join('\n');
}

export function formatLogs(entries: readonly LogEntry[]): string {
  if (entries.length === 0) {
    return 'reactor logs\n\n  (no receipts)';
  }
  const lines: string[] = ['reactor logs', ''];
  for (const e of entries) {
    lines.push(
      `  ${e.node.padEnd(28)} ${e.status.padEnd(8)} wake=${e.wake_source.padEnd(8)} ` +
        `${tokens(e.cost)}`,
    );
  }
  return lines.join('\n');
}

export function formatTrace(traces: readonly NodeTrace[]): string {
  if (traces.length === 0) {
    return 'reactor trace\n\n  (no receipts)';
  }
  const lines: string[] = ['reactor trace', ''];
  for (const t of traces) {
    lines.push(`  ${t.node}  ${t.chain.ok ? '(chain ok)' : '(chain BROKEN)'}`);
    for (const step of t.steps) {
      lines.push(
        `    #${step.index} ${step.status.padEnd(8)} wake=${step.wake_source.padEnd(8)} ` +
          `cause=${step.surprise_cause.padEnd(8)} ${tokens(step.cost)}`,
      );
    }
    if (!t.chain.ok && t.chain.errors) {
      for (const err of t.chain.errors) {
        lines.push(`    ! ${err}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function formatReceiptsAudit(a: ReceiptsAudit): string {
  const lines: string[] = [];
  lines.push('reactor receipts');
  lines.push('');
  lines.push(`  receipts       ${a.receipts}`);
  lines.push(`  total cost     ${tokens(a.cost.total)}`);
  lines.push(`  chain          ${a.ok ? 'ALL OK' : 'BROKEN'}`);
  lines.push('');
  lines.push('  per node:');
  if (a.nodes.length === 0) {
    lines.push('    (no receipts)');
  }
  for (const n of a.nodes) {
    lines.push(
      `    ${n.node.padEnd(28)} ${n.ok ? 'ok' : 'BROKEN'} ` +
        `(${n.receipts} receipts, ${tokens(n.cost)})`,
    );
    if (!n.ok) {
      for (const err of n.errors) {
        lines.push(`      ! ${err}`);
      }
    }
  }
  return lines.join('\n');
}
