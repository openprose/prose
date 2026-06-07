/**
 * The per-step TASK instructions for the compile sessions (Phase 3). Each is the
 * layer composed AFTER the SKILL (`session.ts` `composeCompileInstructions`):
 * the SKILL teaches the session to be a Prose-aware render; the task tells it
 * WHICH compile artifact to emit and HOW to reason about the contract set for
 * that step — framed straight from the architecture/forme.md specs.
 *
 * These are pure strings: no SDK, no `zod`, no I/O. The structured OUTPUT SHAPE
 * each task describes is enforced separately by the injected zod `outputType`
 * (the `*OutputSchema()` builders); the task text only explains the reasoning so
 * the session fills that shape well.
 */

// ---------------------------------------------------------------------------
// 3a. Forme — the topology session task (forme.md steps 1–8, architecture §3.1)
// ---------------------------------------------------------------------------

export const FORME_TASK = [
  "## Your compile step: Forme (draw the responsibility DAG)",
  "",
  "You are running **Forme**, the compile-phase render that draws the topology of",
  "a Prose system by reading every declared contract. Your judgment — which node",
  "depends on which, by understanding what each node is *for* — is the one",
  "intelligent step. Do NOT string-match: read the prose and understand which",
  "maintained truth satisfies which need.",
  "",
  "For the contract set you are given, emit a single structured result:",
  "",
  "1. **nodes** — one entry per declared `responsibility` and `gateway` (a",
  "   `function`/`pattern`/`test` is NOT a topology node; omit it). For each, give",
  "   its `id`, `kind`, declared `wake_source` (read `### Continuity`: external for",
  "   a gateway/webhook/cron trigger, self for a declared cadence/forecast/recheck,",
  "   else input), its `### Requires` facet-contract names (with `fan_in: true`",
  "   when the contract deliberately asks for MANY producers of one kind of truth),",
  "   and its `### Maintains` facet names (the `#### parts`; an empty list means the",
  "   node exposes only its implicit atomic whole-truth facet `@atomic`).",
  "",
  "2. **matches** — your semantic `### Requires` ↔ `### Maintains` decisions. For",
  "   each subscriber need that a producer satisfies, emit one match",
  "   `{ subscriber, requirement, producer, facet }`: the subscriber's requirement",
  "   facet-name, the producer node, and the producer facet that satisfies it (use",
  "   `@atomic` when the producer declares no facets). A deliberate fan-in need",
  "   emits one match per satisfying producer. A node NEVER matches its own facet",
  "   (legitimate feedback is self-driven continuity, not an edge). Omit a match",
  "   you cannot responsibly make — the harness will surface the unsatisfied or",
  "   ambiguous need as a diagnostic; never guess a binding.",
  "",
  "The harness draws the edges, slots fan-in, surfaces diagnostics, and checks",
  "acyclicity from your nodes + matches — emit only the judgment, not the wiring.",
].join("\n");

// ---------------------------------------------------------------------------
// 3b. Canonicalizer — the per-node materiality session task (architecture §3.2)
// ---------------------------------------------------------------------------

/**
 * The canonicalizer-compiler task for ONE node. The session reads that node's
 * `### Maintains` prose + `#### facet` parts and freezes the materiality
 * decision into a structured spec.
 */
export function canonicalizerTask(node: string): string {
  return [
    "## Your compile step: the canonicalizer-compiler",
    "",
    `Lower node \`${node}\`'s \`### Maintains\` canonicalization spec into a frozen,`,
    "deterministic materiality decision. Decide, by reading the prose, **what is",
    "material** (contributes to the fingerprint), **what is dropped** (immaterial",
    "churn like `fetched_at` or source request-ids), **how text/sets/numbers",
    "normalize**, and **the facet boundaries**.",
    "",
    "Emit a single structured result for this node:",
    "",
    "- **fields** — one rule per structured field path you decide on:",
    "  `{ path, material }`, plus optional normalization: `text`",
    "  (`collapse_whitespace`, `case_insensitive`), `number` (`quantum` to round to",
    "  a declared tolerance, or null for exact), `collection` (`set` when ordering",
    "  is immaterial, else `ordered`). List an otherwise-default-material field with",
    "  `material: false` to explicitly DROP it.",
    "- **default_material** — whether a field NOT named above is material by default",
    "  (true is the honest default: the whole truth is material unless a rule drops",
    "  a field).",
    "- **facets** — one entry per `#### part` the node maintains: `{ facet, paths }`",
    "  where `paths` are the material field paths that part's fingerprint covers. A",
    "  node with no `#### parts` declares NO facets here (it exposes only the",
    "  always-on atomic whole-truth facet).",
    "",
    "Rule (the structured-backing rule): anything SUBSCRIBED must have a structured,",
    "canonicalizable backing — free-form rendered prose is excluded from the",
    "fingerprint. A facet with an empty path set is a lint; give every subscribed",
    "part real material field paths.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 3b. Postcondition — the per-node commit-gate session task (architecture §3.3)
// ---------------------------------------------------------------------------

/**
 * The postcondition-compiler task for ONE node. The session reads that node's
 * `### Maintains` postconditions and tags each deterministic or render-attested.
 */
export function postconditionTask(node: string): string {
  return [
    "## Your compile step: the postcondition-compiler",
    "",
    `Compile node \`${node}\`'s \`### Maintains\` postconditions into`,
    "commit-gate validators. There is NO separate judge: each",
    "postcondition is either deterministically checkable on commit, or the render",
    "self-attests it before signing.",
    "",
    "For each postcondition emit one entry:",
    "",
    "- **deterministic** — when it is expressible as a predicate over the node's",
    "  canonicalized facts. Give `{ id, mode: \"deterministic\", facet, predicate,",
    "  source }`. The `predicate` encodes the **violation** condition (it is",
    "  considered failed when the predicate matches), built from: `equals`,",
    "  `not-equals`, `greater-than-or-equal`, `less-than` (each over a `fact` name",
    "  and a `value`), and `and`/`or`/`not` to combine them. `facet` is the part it",
    "  guards (use `@atomic` for a whole-truth obligation). `source` is the",
    "  natural-language postcondition, verbatim.",
    "- **render-attested** — when it is irreducibly semantic (no deterministic",
    "  predicate captures it). Give `{ id, mode: \"render-attested\", facet, source }`;",
    "  the render will self-police it before signing.",
    "",
    "Give each postcondition a stable, unique `id`. Prefer deterministic when a",
    "faithful predicate exists; fall back to render-attested only for genuinely",
    "semantic obligations.",
  ].join("\n");
}
