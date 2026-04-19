// Shared types for the rlmify CLI.
//
// These types define the contract between the `lib/` implementations and the
// `cmd/` entry points. Keep this file narrow; add types here only if they are
// genuinely shared across modules.

/** A single `requires:` or `ensures:` contract clause on a program. */
export interface ContractClause {
  /** The field name (e.g. "path", "summary"). */
  name: string;
  /** Human-readable description (the text after the em-dash in YAML). */
  description: string;
}

/** A program's public face — what appears in a parent's registry. */
export interface PublicFace {
  name: string;
  requires: ContractClause[];
  ensures: ContractClause[];
  /** Short description of when it's appropriate to call this program. */
  when: string;
  /**
   * Optional list of child program names the HUD declares MUST be invoked by
   * a node running this program. Surfaced to the model as a hint via the
   * HUD's `<required_spawns>` section, and (at root only, v1) warned about
   * post-session if any entry was never spawned. Missing = undefined = no
   * requirement.
   */
  requiredSpawns?: string[];
}

/** A fully loaded program file. */
export interface Program {
  publicFace: PublicFace;
  /** Instruction text — everything after the YAML frontmatter fence. */
  body: string;
  /** Absolute path to the source `.md` file. */
  filePath: string;
  /** Full raw file contents (frontmatter + body). */
  raw: string;
}

/** Input spec for composing a HUD XML string. */
export interface HudSpec {
  responsibility: string;
  returnContract: string;
  systemPurpose: string;
  environmentalContext: string;
  /** Key-value environment — rendered as indented `key: value` lines. */
  environment: Record<string, string>;
  /** Registry entries to expose to this node. */
  registry: PublicFace[];
  /** Optional action-history prose. Defaults to empty. */
  actionHistory?: string;
  /**
   * Optional list of child program names this node MUST invoke via
   * `rlmify spawn`. Rendered as `<required_spawns>` only when non-empty.
   */
  requiredSpawns?: string[];
}

/** The structured delta a node emits when done. */
export interface Delta {
  status: "complete" | "partial" | "error";
  /** JSON-serializable object describing what changed in the HUD slice. */
  delta: Record<string, unknown>;
  provenance: {
    /** Depth in the recursion tree. Root = 0. */
    layer: number;
    model?: string;
    ensures_satisfied?: string[];
    requires_consumed?: string[];
  };
  /** Short human-readable recap. */
  summary: string;
}

/** Options for invoking a child pi session. */
export interface PiOptions {
  /** Absolute path to the HUD file to append as system prompt. */
  hudFile: string;
  /** User prompt passed to pi. Defaults to "Begin.". */
  task?: string;
  /** Gemini/Anthropic/etc. model id. Defaults to env `RLMIFY_MODEL` or gemini-2.5-pro. */
  model?: string;
  /** Thinking level. Defaults to "low". */
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Absolute path to the skill directory. Defaults to env `RLMIFY_SKILL`. */
  skillPath?: string;
  /** If set, write pi's session trace here. */
  sessionFile?: string;
  /** Capture raw stdout to this file in addition to returning it. */
  stdoutFile?: string;
  /** Additional environment variables to pass to the child. */
  env?: Record<string, string>;
}

/** Result of invoking pi as a subprocess. */
export interface PiResult {
  /** Pi's raw stdout (post-exit). May contain TUI noise pre-pi-flush. */
  rawStdout: string;
  /** Pi's raw stderr. */
  rawStderr: string;
  exitCode: number;
  /** Delta extracted from the `~~~rlm-delta ... ~~~` fence, if present. */
  delta: Delta | null;
}

/** A validation issue on a program file. */
export interface ValidationIssue {
  severity: "error" | "warning";
  /** Field path or section this issue pertains to (e.g. "frontmatter.name"). */
  field?: string;
  message: string;
}

/** Criteria for resolving a program by contract. */
export interface ResolveCriteria {
  /** Require all of these field names to appear in the program's `ensures`. */
  ensures?: string[];
  /** Require all of these field names to appear in the program's `requires`. */
  requires?: string[];
  /** Free-text match against the program's `when:` clause (case-insensitive substring). */
  when?: string;
}
