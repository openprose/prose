import { readFileSync } from "node:fs";
import { compileSource } from "../compiler.js";
import type { ComponentIR } from "../types.js";

export { collectSourceFiles } from "../files.js";
export { formatFile, formatPath, formatSource, renderFormatCheckText } from "../format.js";
export { buildTextMateGrammar, renderTextMateGrammar } from "../grammar.js";
export { handoffFile, handoffSource, renderSingleRunHandoffMarkdown } from "../handoff.js";
export type { SingleRunHandoff, SingleRunHandoffOptions } from "../handoff.js";
export { highlightFile, highlightSource, renderHighlightHtml, renderHighlightText } from "../highlight.js";
export { lintFile, lintPath, lintSource, renderLintReportText, renderLintText } from "../lint.js";
export {
  findSection,
  parseContractMarkdown,
  span,
  type ComponentDraft,
  type SectionDraft,
  type SourceLine,
} from "../markdown.js";
export {
  parseAccess,
  parseEffects,
  parseEnvironment,
  parseExecution,
  parsePorts,
  parseRuntime,
  parseServices,
  parseSkills,
} from "../sections.js";

/**
 * Load components from a `.prose.md` source file on disk.
 *
 * Thin wrapper around `compileSource` that reads the file synchronously and
 * returns just the `ComponentIR[]`. Used by skills wiring tests and any
 * caller that wants components without the surrounding ProseIR.
 */
export function loadComponentsFromSource(filePath: string): ComponentIR[] {
  const source = readFileSync(filePath, "utf8");
  const ir = compileSource(source, { path: filePath });
  return ir.components;
}
