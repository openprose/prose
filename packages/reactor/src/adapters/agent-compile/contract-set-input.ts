/**
 * Render a loaded {@link ContractSet} into the EVIDENCE text a compile session
 * reads (Phase 3). A compile step is a render whose evidence is the contract set
 * (forme.md: Forme's `### Requires` is "the set of all declared contracts");
 * this module lays that evidence out as a stable, legible prompt the session
 * reasons over.
 *
 * Deliberately dumb + deterministic: it concatenates each contract's identity +
 * verbatim section bodies in sorted-id order. It assigns NO meaning to the
 * bodies — the SESSION reads and understands them. Pure + SDK-free (no `zod`, no
 * `@openai/agents`), so it is offline-testable and safe to import anywhere.
 */

import type { ContractSet, LoadedContract } from "./contract-loader";

/**
 * Render the whole contract set as the compile session's run input. Each
 * contract is a fenced block carrying its id/name/kind and its verbatim
 * `### Requires` / `### Maintains` / `### Continuity` / `### Execution`
 * sections. Contracts are emitted in the (already-sorted) set
 * order so the evidence is stable across runs (reproducibility).
 */
export function renderContractSet(contracts: ContractSet): string {
  const lines: string[] = [];
  lines.push(
    `You are given the full set of ${contracts.length} declared Prose ` +
      `contract(s) below. This is your evidence — read every one before you ` +
      `emit your structured result.`,
  );
  lines.push("");
  for (const contract of contracts) {
    lines.push(renderContract(contract));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** Render one contract as a legible block (identity + verbatim sections). */
export function renderContract(contract: LoadedContract): string {
  const lines: string[] = [];
  lines.push(`## Contract \`${contract.id}\``);
  lines.push(`- name: ${contract.name}`);
  lines.push(`- kind: ${contract.kind}`);
  lines.push("");

  appendSection(lines, "Requires", contract.requires);
  appendSection(lines, "Maintains", contract.maintains);
  appendSection(lines, "Continuity", contract.continuity);
  appendSection(lines, "Execution", contract.execution);

  return lines.join("\n").trimEnd();
}

function appendSection(
  lines: string[],
  heading: string,
  body: string | undefined,
): void {
  if (body === undefined || body.length === 0) {
    return;
  }
  lines.push(`### ${heading}`);
  lines.push(body);
  lines.push("");
}
