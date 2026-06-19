/**
 * The DETERMINISTIC `### Tools` resolver — parity with the canonical VM
 * `tools_resolver` (`skills/open-prose/compiler/index.prose.md` ~L160-201) and
 * `contract-markdown.md` §Tools (~L681-735).
 *
 * It is pure + synchronous + offline. It parses each node's verbatim `### Tools`
 * body into `cli:<name>` / `mcp:<name>` declarations, classifies malformed /
 * unsupported declarations, resolves the supported ones by PRESENCE ONLY (host
 * PATH for cli, the injected host MCP registry for mcp — via
 * {@link existsOnPath} / {@link mcpServerRegistered}), and emits one diagnostic
 * per unresolved entry. It NEVER runs a tool and NEVER mutates host state — this
 * is NOT a model session; tool resolution is a pure presence check.
 *
 * Load-bearing rules mirrored from the spec:
 *   - exactly `cli:<name>` and `mcp:<name>`; names non-empty, no path separators;
 *   - `gh` / `cli:` / `mcp:` / `cli:bin/gh` ⇒ `tool_invalid`;
 *   - a namespace other than cli/mcp (e.g. `http:x`) ⇒ `tool_unsupported_kind`;
 *   - cli absent from PATH / mcp absent from the registry ⇒ `tool_unresolved`;
 *   - every diagnostic `detail` INCLUDES its code + the offending tool token;
 *   - tools do NOT satisfy `### Requires` and do NOT create Forme edges (this
 *     function returns only resolved tools + diagnostics; it is never fed into
 *     the matcher);
 *   - resolved tools dedupe by (kind,name) with a unioned, sorted `requiredBy`.
 */

import { existsOnPath, mcpServerRegistered } from "./tool-presence";

/** A node's `### Tools` body + the topology nodes that require its capabilities. */
export interface NodeToolsInput {
  /** The topology node id (audit / `requiredBy`). */
  readonly id: string;
  /** The declared kind (so a `function` node's tools land in `byFunction`). */
  readonly kind: string;
  /** Verbatim `### Tools` body (absent ⇒ no declared tools). */
  readonly tools?: string;
  /** The topology nodes that need this node's capabilities (its own id + callers). */
  readonly requiredBy: readonly string[];
}

/** The deterministic host state the resolver checks against (injected, offline). */
export interface ToolsResolveHost {
  /** A `PATH`-style string the cli check splits on `path.delimiter`. */
  readonly pathEnv: string;
  /** The host MCP registry (empty injected set by default in v1). */
  readonly mcp: ReadonlySet<string>;
}

/** One resolved aggregated tool record (`tools_resolver` node tool record). */
export interface ResolvedTool {
  readonly kind: "cli" | "mcp";
  readonly name: string;
  /** Topology nodes that need the capability (sorted, deduped). */
  readonly requiredBy: readonly string[];
}

/** Per-function tool list (`tools_resolver` function tool list). */
export interface FunctionTools {
  readonly functionName: string;
  readonly tools: readonly { readonly kind: "cli" | "mcp"; readonly name: string }[];
}

/** A resolver diagnostic — free-form `kind` (the CLI's CompileDiagnostic shape). */
export interface ToolDiagnostic {
  /** `tool_invalid` | `tool_unsupported_kind` | `tool_unresolved`. */
  readonly kind: string;
  /** Human message — ALWAYS includes the `kind` code + the offending token. */
  readonly detail: string;
  /** The offending declaration token (attribution). */
  readonly tool: string;
}

export interface ToolsResolveResult {
  readonly resolved: readonly ResolvedTool[];
  readonly byFunction: readonly FunctionTools[];
  readonly diagnostics: readonly ToolDiagnostic[];
}

/** A parsed `### Tools` declaration token (`cli:jq` → namespace `cli`, name `jq`). */
interface ParsedDecl {
  readonly token: string;
  readonly namespace: string;
  readonly name: string;
  /** No `:` at all, or an empty/path-separator name. */
  readonly malformed: boolean;
}

/**
 * Resolve the declared `### Tools` for a set of topology nodes. Deterministic,
 * presence-only, offline. See the module doc for the mirrored spec rules.
 */
export function resolveTools(
  nodes: readonly NodeToolsInput[],
  host: ToolsResolveHost,
): ToolsResolveResult {
  const diagnostics: ToolDiagnostic[] = [];
  // (kind,name) → unioned requiredBy set, in first-seen-then-sorted order.
  const aggregate = new Map<string, { kind: "cli" | "mcp"; name: string; requiredBy: Set<string> }>();
  const byFunction: FunctionTools[] = [];

  for (const node of nodes) {
    const decls = parseToolsBody(node.tools);
    const functionTools: { kind: "cli" | "mcp"; name: string }[] = [];

    for (const decl of decls) {
      // 1. Malformed shape (no namespace, empty name, or a path separator).
      if (decl.malformed) {
        diagnostics.push({
          kind: "tool_invalid",
          tool: decl.token,
          detail:
            `tool_invalid: \`${decl.token}\` is a malformed tool declaration ` +
            `(expected \`cli:<name>\` or \`mcp:<name>\`, names non-empty with no path separators)`,
        });
        continue;
      }
      // 2. Unsupported namespace (reserved but not cli/mcp).
      if (decl.namespace !== "cli" && decl.namespace !== "mcp") {
        diagnostics.push({
          kind: "tool_unsupported_kind",
          tool: decl.token,
          detail:
            `tool_unsupported_kind: \`${decl.token}\` uses an unsupported namespace ` +
            `\`${decl.namespace}\` (only \`cli\` and \`mcp\` are supported)`,
        });
        continue;
      }
      // 3. Resolve by presence only.
      const kind = decl.namespace as "cli" | "mcp";
      const present =
        kind === "cli"
          ? existsOnPath(decl.name, host.pathEnv)
          : mcpServerRegistered(decl.name, host.mcp);
      if (!present) {
        const lookup =
          kind === "cli" ? "checked host PATH" : "checked the host MCP registry";
        diagnostics.push({
          kind: "tool_unresolved",
          tool: decl.token,
          detail: `tool_unresolved: \`${decl.token}\` not found (${lookup})`,
        });
        continue;
      }
      // Resolved: aggregate the node-level record + record the per-function list.
      const key = `${kind}:${decl.name}`;
      let agg = aggregate.get(key);
      if (agg === undefined) {
        agg = { kind, name: decl.name, requiredBy: new Set() };
        aggregate.set(key, agg);
      }
      for (const r of node.requiredBy) {
        agg.requiredBy.add(r);
      }
      functionTools.push({ kind, name: decl.name });
    }

    // A `function` node records its (resolved) tool list — additive scope record.
    if (node.kind === "function" && functionTools.length > 0) {
      byFunction.push({ functionName: node.id, tools: functionTools });
    }
  }

  const resolved: ResolvedTool[] = [...aggregate.values()]
    .map((a) => ({
      kind: a.kind,
      name: a.name,
      requiredBy: [...a.requiredBy].sort(),
    }))
    .sort((x, y) =>
      x.kind === y.kind ? (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) : x.kind < y.kind ? -1 : 1,
    );

  return { resolved, byFunction, diagnostics };
}

/**
 * Parse a `### Tools` body into declaration tokens. Each bullet may carry a
 * backtick-fenced token `` `<decl>` ``; everything after the token (the human
 * description after `:`) is ignored. A bullet with no backtick token is skipped.
 */
function parseToolsBody(body: string | undefined): ParsedDecl[] {
  if (body === undefined || body.length === 0) {
    return [];
  }
  const out: ParsedDecl[] = [];
  // Each backtick-fenced run is one declaration token; one per bullet in
  // practice, but we extract every fenced token so a malformed body still
  // surfaces every offending declaration.
  const fenced = /`([^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = fenced.exec(body)) !== null) {
    out.push(classify(m[1] ?? ""));
  }
  return out;
}

/** Classify a single declaration token into namespace + name + malformed flag. */
function classify(raw: string): ParsedDecl {
  const token = raw.trim();
  const colon = token.indexOf(":");
  if (colon < 0) {
    // No namespace separator at all (e.g. `gh`).
    return { token, namespace: "", name: "", malformed: true };
  }
  const namespace = token.slice(0, colon);
  const name = token.slice(colon + 1);
  // Empty name (`cli:`, `mcp:`) or a path separator in the name (`cli:bin/gh`).
  const malformed = name.length === 0 || name.includes("/") || name.includes("\\");
  return { token, namespace, name, malformed };
}
