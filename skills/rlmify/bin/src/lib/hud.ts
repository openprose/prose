// HUD XML composition.
//
// The output is an `<rlm_hud>...</rlm_hud>` block suitable for `pi -p --append-system-prompt`.
// Sections MUST appear in this order:
//   1. <responsibility>
//   2. <return_contract>
//   3. <system_purpose>
//   4. <environmental_context>
//   5. <environment>          (key: value lines, one per entry)
//   6. <registry>             (<program> children with public-face fields)
//   7. <action_history>
//
// Indent section contents with 2 spaces for readability. Do not escape ampersands inside
// section bodies — the model reads this as prose, not strict XML.

import type { HudSpec, PublicFace, ContractClause } from "../types.ts";

const INDENT = "  ";

function indent(text: string, pad: string = INDENT): string {
  if (text === "") return "";
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

function section(tag: string, body: string): string {
  if (body === "") {
    return `${INDENT}<${tag}></${tag}>`;
  }
  return `${INDENT}<${tag}>\n${indent(body, INDENT + INDENT)}\n${INDENT}</${tag}>`;
}

function renderClauses(clauses: ContractClause[]): string {
  return clauses
    .map((c) =>
      c.description ? `${c.name}: ${c.description}` : c.name,
    )
    .join(", ");
}

/** Compose a full `<rlm_hud>` XML string from the spec. */
export function composeHud(spec: HudSpec): string {
  const envLines = Object.entries(spec.environment)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const registryBody = spec.registry
    .map((face) => renderRegistryEntry(face))
    .join("\n");

  const parts = [
    "<rlm_hud>",
    section("responsibility", spec.responsibility),
    section("return_contract", spec.returnContract),
    section("system_purpose", spec.systemPurpose),
    section("environmental_context", spec.environmentalContext),
    section("environment", envLines),
    section("registry", registryBody),
    section("action_history", spec.actionHistory ?? ""),
    "</rlm_hud>",
  ];
  return parts.join("\n") + "\n";
}

/** Render a single `<program>` registry entry. Exposed for tests. */
export function renderRegistryEntry(face: PublicFace): string {
  const requires = renderClauses(face.requires);
  const ensures = renderClauses(face.ensures);
  return [
    "<program>",
    `  <name>${face.name}</name>`,
    `  <requires>${requires}</requires>`,
    `  <ensures>${ensures}</ensures>`,
    `  <when>${face.when}</when>`,
    "</program>",
  ].join("\n");
}
