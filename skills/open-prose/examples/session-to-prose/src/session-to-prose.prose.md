---
name: session-to-prose
kind: system
version: 0.5.0
---

### Description

Convert an agent session log into a generalized OpenProse Contract Markdown
program. The source may be a Claude Code, Codex, or Pi JSONL path, or a bare
session id that can be resolved from local session roots.

### Services

- `session-resolver`
- `harness-adapter`
- `source-snapshotter`
- `session-parser`
- `decision-classifier`
- `phase-identifier`
- `contract-extractor`
- `pattern-recognizer`
- `strategy-miner`
- `program-assembler`
- `validator`
- `report-writer`
- `quality-regression-gate`
- `receipt-auditor`
- `tail-and-citation-auditor`

### Requires

- `session-source`: path to a `.jsonl` session log, or a bare full or prefix session id. Supported path families include Claude Code logs under `~/.claude/projects/`, Codex logs under `~/.codex/sessions/`, and Pi logs under `~/.pi/agent/sessions/`.
- `additional-context`: optional caller guidance about the session or desired extracted program.
- `agent-harness`: optional execution harness request. Use `auto` by default. Supported adapter families include `in-session`, `prose-cli`, `codex-sdk`, `claude-sdk`, `pi-agent-rust`, and `mock`.
- `baseline-run`: optional completed run id or run path to use as the quality floor for generated program/report richness. When omitted, infer an earlier matching run only from explicit caller context or session digest; never guess silently.

### Ensures

- `resolved-session`: canonical path, detected harness format, session id, source kind, project path, and resolver warnings.
- `harness-plan`: normalized harness adapter plan describing selected harness, runtime/provider, capabilities, result protocol, stdout/stderr contract, recursion policy, and warnings.
- `source-snapshot`: immutable parse input with snapshot path, sha256, byte count, line count, mtime, and source-change status.
- `program`: a valid OpenProse `*.prose.md` service or system that generalizes the session workflow.
- `program`: uses current Contract Markdown sections, including `### Services` for multi-service output and `### Requires`, `### Ensures`, `### Shape`, `### Errors`, and `### Strategies` where applicable.
- `program`: captures iteration loops, parallel work, decision gates, and phase transitions evidenced by the session.
- `extraction-report`: concise summary of phases found, patterns identified, strategies mined, validation status, and confidence notes.
- `quality-comparison`: baseline-aware regression gate proving the generated program and report are at least as concrete, cited, and structurally complete as the selected baseline.
- `receipt-audit`: final run-envelope audit proving output paths, manifest wiring, validation caveats, and source snapshot consistency.
- `tail-citation-audit`: final live-tail and citation coverage audit proving whether the snapshot still represents the live source and whether required claims cite evidence.

### Errors

- `session-not-found`: the requested path or id cannot be resolved from known session roots.
- `ambiguous-session-id`: a bare id or prefix matches more than one local session log.
- `unsupported-session-format`: the resolved path exists but is not a recognized Claude Code, Codex, or Pi session log.
- `unsupported-harness`: the requested agent harness is unavailable or cannot provide required OpenProse VM primitives.
- `harness-recursion-risk`: a wrapper host would recursively invoke itself instead of launching an independent harness process.
- `harness-result-missing`: the selected harness completed without writing the structured result path promised by its adapter contract.
- `unparseable-session`: the log format is recognized but the JSONL is corrupted or cannot be structured.
- `trivial-session`: the session is too short or simple to extract a meaningful workflow with at least three distinct phases.
- `source-changed-during-run`: the source session changed while being snapshotted or parsed and the run cannot prove it processed a stable input.
- `invalid-receipt`: the generated run envelope, manifest, bindings, result metadata, or validation caveats are inconsistent.
- `source-provenance-mismatch`: copied run sources, root source, or reported source digest do not match the invoked contract source.
- `tail-drift`: the live source has grown or changed after snapshot creation and the run cannot honestly claim latest-tail coverage.
- `insufficient-citations`: phases, gates, observed errors, strategies, or material claims lack event-id/source-line evidence.
- `quality-regression`: the candidate generated program or report is worse than the selected baseline on concrete contracts, control flow, evidence citations, report detail, or syntactic validity.

### Strategies

- when the caller supplies a path: canonicalize it and do not perform fuzzy id search unless the path is missing and the value contains no path separator.
- when the caller supplies a bare id: resolve exact matches before prefix matches, search all supported harness roots, and fail with `ambiguous-session-id` rather than guessing.
- when the session has long stretches of tool calls with no user messages: model those as autonomous execution phases with detailed service strategies.
- when the session contains human corrections or direction changes: treat them as potential gate points and explain the classification in the extraction report.
- when `additional-context` is provided: use it to guide naming, scope, and emphasis without inventing evidence not present in the session.
- always parse a source snapshot, never a live session log, so growing Codex or Pi sessions cannot produce stale or partial receipts.
- treat fallback validation as `pass-with-warnings` unless every explicit semantic checklist item passes and the report records the fallback caveat.
- preserve concrete extracted contract language from the session; do not replace specific inputs, outputs, failures, or decisions with generic placeholders during receipt hardening.
- publish only the minimal source snapshot evidence needed for audit by default: digest, line index, counts, and cited excerpts; keep full source copies in workspace unless a persisted secret scan permits publication.
- treat harnesses as modular adapters over abstract OpenProse VM primitives (`spawn_session`, `ask_user`, `read_file`, `write_file`, `copy_binding`, `check_env`); do not hardcode Codex, Claude, Pi, or CLI behavior into semantic services.
- treat `prose-cli` as a valid process-level agent harness when it can launch a selected provider harness and enforce the `PROSE_RUN_RESULT_PATH` structured-result protocol; it is invalid only when the current wrapper would recurse into itself.
- audit the run source itself: `root.prose.md`, copied `sources/`, manifest source digests, and final result metadata must prove the invoked contract version and sha256, or the run is no stronger than `fail`.
- derive final CLI/JSON summaries from the persisted result contract and receipt artifacts; do not hand-write a shorter console summary that can diverge from `result.json`.
- persist every recovered write-pass error, failed probe command, validation correction, and late artifact write as a warning in validation, extraction report, receipt audit, tail/citation audit, and final result metadata.
- distinguish the outer runner from the inner VM: a shell `prose run ... --harness codex-sdk` invocation proves the CLI launched the provider only when the run captures the outer command, process/result protocol, and log path; inside a Prose Complete wrapper, a nested `prose` call remains blocked and must be labeled as inner recursion.
- treat generated-program defects as blocking, not cosmetic: malformed ProseScript braces, generic placeholder contracts, dropped evidenced loops or parallel branches, nonexistent provenance paths, missing manifest input mappings, and logical-output names that drift from `### Ensures` all fail validation.
- preserve rich V3-level extraction detail when it remains evidence-backed; a new audit envelope is not an excuse to replace human decisions, observed errors, phase strategies, or pattern explanations with counts only.
- validate actual artifacts rather than self-reported parity: parse the on-disk manifest and result file, stat every declared binding path, compare logical output names to service `### Ensures`, and fail if the manifest names a file stem such as `program.prose` where the contract output is `program`.
- use V3 as the generation-quality floor and V4 as the receipt/audit floor: V5 may keep V4's harness, tail, receipt, and source-provenance surfaces only if the generated program/report meet or exceed the best evidence-backed V3 artifacts.
- if the baseline has concrete loops, branches, human decisions, or service contracts and the candidate does not, treat the candidate as failed even when lint, result parity, and receipt audits pass.

### Execution

```prose
let resolved_session = call session-resolver
  session-source: session-source

let harness_plan = call harness-adapter
  agent-harness: agent-harness
  resolved-session: resolved_session
  additional-context: additional-context
  baseline-run: baseline-run

let source_snapshot = call source-snapshotter
  resolved-session: resolved_session
  harness-plan: harness_plan

let parsed_session = call session-parser
  resolved-session: resolved_session
  source-snapshot: source_snapshot

let decision_analysis = call decision-classifier
  user-messages: parsed_session.user-messages
  assistant-actions: parsed_session.assistant-actions
  timeline: parsed_session.timeline
  evidence-index: parsed_session.evidence-index

let phase_analysis = call phase-identifier
  timeline: parsed_session.timeline
  user-messages: parsed_session.user-messages
  assistant-actions: parsed_session.assistant-actions
  session-metadata: parsed_session.session-metadata
  human-decisions: decision_analysis.human-decisions
  human-messages: decision_analysis.human-messages
  gate-candidates: decision_analysis.gate-candidates
  evidence-index: parsed_session.evidence-index

let extracted_contracts = call contract-extractor
  phases: phase_analysis.phases
  assistant-actions: parsed_session.assistant-actions
  tool-results: parsed_session.tool-results
  evidence-index: parsed_session.evidence-index

let recognized_patterns = call pattern-recognizer
  phases: phase_analysis.phases
  phase-transitions: phase_analysis.phase-transitions
  phase-graph: phase_analysis.phase-graph
  phase-contracts: extracted_contracts.phase-contracts
  user-messages: parsed_session.user-messages
  evidence-index: parsed_session.evidence-index

let mined_strategies = call strategy-miner
  timeline: parsed_session.timeline
  phases: phase_analysis.phases
  phase-contracts: extracted_contracts.phase-contracts
  user-messages: parsed_session.user-messages
  tool-results: parsed_session.tool-results
  evidence-index: parsed_session.evidence-index

let assembled_program = call program-assembler
  phases: phase_analysis.phases
  phase-contracts: extracted_contracts.phase-contracts
  shape-constraints: extracted_contracts.shape-constraints
  pattern-annotations: recognized_patterns.pattern-annotations
  strategies: mined_strategies.strategies
  error-conditions: mined_strategies.error-conditions
  program-contract: extracted_contracts.program-contract
  session-metadata: parsed_session.session-metadata
  additional-context: additional-context
  gate-candidates: decision_analysis.gate-candidates
  absorbable-inputs: decision_analysis.absorbable-inputs
  gated-phases: phase_analysis.gated-phases
  evidence-index: parsed_session.evidence-index
  source-snapshot: source_snapshot
  harness-plan: harness_plan
  baseline-run: baseline-run

let validation = call validator
  program: assembled_program.program
  program-contract: extracted_contracts.program-contract
  evidence-index: parsed_session.evidence-index
  source-snapshot: source_snapshot
  harness-plan: harness_plan

loop while validation.validation-result has blocking issues (max: 3):
  assembled_program = call program-assembler
    phases: phase_analysis.phases
    phase-contracts: extracted_contracts.phase-contracts
    shape-constraints: extracted_contracts.shape-constraints
    pattern-annotations: recognized_patterns.pattern-annotations
    strategies: mined_strategies.strategies
    error-conditions: mined_strategies.error-conditions
    program-contract: extracted_contracts.program-contract
    session-metadata: parsed_session.session-metadata
    additional-context: additional-context
    gate-candidates: decision_analysis.gate-candidates
    absorbable-inputs: decision_analysis.absorbable-inputs
    gated-phases: phase_analysis.gated-phases
    prior-program: assembled_program.program
    validation-feedback: validation.validation-result
    structural-issues: validation.structural-issues
    wiring-issues: validation.wiring-issues
    semantic-issues: validation.semantic-issues
    evidence-issues: validation.evidence-issues
    receipt-issues: validation.receipt-issues
    evidence-index: parsed_session.evidence-index
    source-snapshot: source_snapshot
    harness-plan: harness_plan
    baseline-run: baseline-run

  validation = call validator
    program: assembled_program.program
    program-contract: extracted_contracts.program-contract
    evidence-index: parsed_session.evidence-index
    source-snapshot: source_snapshot
    harness-plan: harness_plan

let extraction_report = call report-writer
  resolved-session: resolved_session
  source-snapshot: source_snapshot
  session-metadata: parsed_session.session-metadata
  additional-context: additional-context
  phases: phase_analysis.phases
  phase-contracts: extracted_contracts.phase-contracts
  human-decisions: decision_analysis.human-decisions
  human-messages: decision_analysis.human-messages
  gate-candidates: decision_analysis.gate-candidates
  absorbable-inputs: decision_analysis.absorbable-inputs
  pattern-annotations: recognized_patterns.pattern-annotations
  strategies: mined_strategies.strategies
  error-conditions: mined_strategies.error-conditions
  tool-results: parsed_session.tool-results
  validation-result: validation.validation-result
  program: assembled_program.program
  evidence-index: parsed_session.evidence-index
  harness-plan: harness_plan
  baseline-run: baseline-run

let quality_comparison = call quality-regression-gate
  baseline-run: baseline-run
  resolved-session: resolved_session
  source-snapshot: source_snapshot
  program: assembled_program.program
  extraction-report: extraction_report
  validation-result: validation.validation-result
  phases: phase_analysis.phases
  pattern-annotations: recognized_patterns.pattern-annotations
  strategies: mined_strategies.strategies
  error-conditions: mined_strategies.error-conditions
  evidence-index: parsed_session.evidence-index
  harness-plan: harness_plan

let receipt_audit = call receipt-auditor
  resolved-session: resolved_session
  source-snapshot: source_snapshot
  program: assembled_program.program
  extraction-report: extraction_report
  validation-result: validation.validation-result
  quality-comparison: quality_comparison
  manifest-contract: assembled_program.manifest-contract
  result-contract: assembled_program.result-contract
  harness-plan: harness_plan

let tail_citation_audit = call tail-and-citation-auditor
  resolved-session: resolved_session
  source-snapshot: source_snapshot
  program: assembled_program.program
  extraction-report: extraction_report
  validation-result: validation.validation-result
  quality-comparison: quality_comparison
  receipt-audit: receipt_audit
  evidence-index: parsed_session.evidence-index
  harness-plan: harness_plan

loop while quality_comparison has blocking issues or receipt_audit has blocking issues or tail_citation_audit has blocking issues (max: 3):
  assembled_program = call program-assembler
    phases: phase_analysis.phases
    phase-contracts: extracted_contracts.phase-contracts
    shape-constraints: extracted_contracts.shape-constraints
    pattern-annotations: recognized_patterns.pattern-annotations
    strategies: mined_strategies.strategies
    error-conditions: mined_strategies.error-conditions
    program-contract: extracted_contracts.program-contract
    session-metadata: parsed_session.session-metadata
    additional-context: additional-context
    gate-candidates: decision_analysis.gate-candidates
    absorbable-inputs: decision_analysis.absorbable-inputs
    gated-phases: phase_analysis.gated-phases
    prior-program: assembled_program.program
    validation-feedback: validation.validation-result
    quality-feedback: quality_comparison
    receipt-issues: receipt_audit
    evidence-issues: tail_citation_audit
    evidence-index: parsed_session.evidence-index
    source-snapshot: source_snapshot
    harness-plan: harness_plan
    baseline-run: baseline-run

  validation = call validator
    program: assembled_program.program
    program-contract: extracted_contracts.program-contract
    evidence-index: parsed_session.evidence-index
    source-snapshot: source_snapshot
    harness-plan: harness_plan

  extraction_report = call report-writer
    resolved-session: resolved_session
    source-snapshot: source_snapshot
    session-metadata: parsed_session.session-metadata
    additional-context: additional-context
    phases: phase_analysis.phases
    phase-contracts: extracted_contracts.phase-contracts
    human-decisions: decision_analysis.human-decisions
    human-messages: decision_analysis.human-messages
    gate-candidates: decision_analysis.gate-candidates
    absorbable-inputs: decision_analysis.absorbable-inputs
    pattern-annotations: recognized_patterns.pattern-annotations
    strategies: mined_strategies.strategies
    error-conditions: mined_strategies.error-conditions
    tool-results: parsed_session.tool-results
    validation-result: validation.validation-result
    program: assembled_program.program
    evidence-index: parsed_session.evidence-index
    harness-plan: harness_plan
    baseline-run: baseline-run

  quality_comparison = call quality-regression-gate
    baseline-run: baseline-run
    resolved-session: resolved_session
    source-snapshot: source_snapshot
    program: assembled_program.program
    extraction-report: extraction_report
    validation-result: validation.validation-result
    phases: phase_analysis.phases
    pattern-annotations: recognized_patterns.pattern-annotations
    strategies: mined_strategies.strategies
    error-conditions: mined_strategies.error-conditions
    evidence-index: parsed_session.evidence-index
    harness-plan: harness_plan

  receipt_audit = call receipt-auditor
    resolved-session: resolved_session
    source-snapshot: source_snapshot
    program: assembled_program.program
    extraction-report: extraction_report
    validation-result: validation.validation-result
    quality-comparison: quality_comparison
    manifest-contract: assembled_program.manifest-contract
    result-contract: assembled_program.result-contract
    harness-plan: harness_plan

  tail_citation_audit = call tail-and-citation-auditor
    resolved-session: resolved_session
    source-snapshot: source_snapshot
    program: assembled_program.program
    extraction-report: extraction_report
    validation-result: validation.validation-result
    quality-comparison: quality_comparison
    receipt-audit: receipt_audit
    evidence-index: parsed_session.evidence-index
    harness-plan: harness_plan

return { resolved-session: resolved_session, harness-plan: harness_plan, source-snapshot: source_snapshot, program: assembled_program.program, extraction-report: extraction_report, quality-comparison: quality_comparison, receipt-audit: receipt_audit, tail-citation-audit: tail_citation_audit }
```

## session-resolver

### Shape

- `self`: resolve paths and ids to one canonical local JSONL session log.
- `self`: identify the harness family before parsing.
- `prohibited`: parsing the workflow or making extraction decisions.

### Requires

- `session-source`: path to a `.jsonl` log, or a bare full or prefix session id.

### Ensures

- `resolved-session`: object containing `path`, `format`, `session-id`, `source-kind`, `project-path`, `candidate-count`, and `warnings`.
- `resolved-session.path`: canonical absolute path to an existing `.jsonl` file.
- `resolved-session.format`: one of `claude-code`, `codex`, or `pi`.
- `resolved-session.session-id`: stable session id parsed from metadata, filename, or both.
- `resolved-session.source-kind`: either `path`, `exact-id`, or `prefix-id`.

### Errors

- `session-not-found`: no candidate exists for the supplied path, exact id, or prefix.
- `ambiguous-session-id`: more than one candidate remains after exact-id and prefix-id matching.
- `unsupported-session-format`: the resolved file does not match Claude Code, Codex, or Pi path and metadata signals.

### Strategies

- when `session-source` names an existing file: use that file directly, canonicalize the path, and infer format from the path plus first JSONL records.
- when `session-source` looks like a missing path because it contains `/`, `~`, `.jsonl`, or a path prefix: fail with `session-not-found` rather than searching by id.
- when resolving Claude Code ids: search `~/.claude/projects/**/*.jsonl`, match basename ids exactly first, then prefix-match basenames.
- when resolving Codex ids: search `~/.codex/sessions/**/*.jsonl`, match `session_meta.payload.id` exactly first, then filenames containing the id or prefix, then `session_meta.payload.id` prefixes.
- when resolving Pi ids: search `~/.pi/agent/sessions/**/*.jsonl` and match filename ids or metadata ids when present.
- when multiple candidates match a prefix: return `ambiguous-session-id` with candidate paths so the caller can provide a longer id.
- when detecting Codex format: prefer a first record with `type: session_meta` and `payload.id`, then records such as `turn_context`, `response_item`, and `event_msg`.
- when detecting Claude Code format: prefer top-level records with `type` values such as `user`, `assistant`, `tool_result`, and `system`, with project path encoded under `~/.claude/projects/`.
- when detecting Pi format: prefer records with `role`, `tool_calls`, or `tool_results` fields and a Pi session root path.

## harness-adapter

### Shape

- `self`: normalize the requested execution harness into OpenProse VM primitives and result protocols.
- `self`: distinguish source-session format from execution harness; a Pi session log and a Pi execution harness are related but not the same contract.
- `prohibited`: executing the generated program, parsing the workflow, or silently falling back to another harness.

### Requires

- `agent-harness`: optional requested harness adapter such as `auto`, `in-session`, `prose-cli`, `codex-sdk`, `claude-sdk`, `pi-agent-rust`, or `mock`.
- `resolved-session`: canonical source path, detected source format, session id, source kind, and resolver warnings.
- `additional-context`: optional caller guidance that may name a preferred harness, model, sandbox, or provider.
- `baseline-run`: optional completed run id or path used only to record baseline comparison intent in the harness plan.

### Ensures

- `harness-plan`: object containing `adapter`, `provider`, `runtime`, `spawn-session`, `ask-user`, `state-backend`, `copy-binding`, `check-env`, `result-protocol`, `stdout-contract`, `stderr-contract`, `recursion-policy`, `session-persistence`, `capabilities`, and `warnings`.
- `harness-plan.outer-runner`: object recording whether this activation was launched by the `prose` CLI, the selected provider harness, the observed command or log path when available, and whether a structured result path such as `PROSE_RUN_RESULT_PATH` was provided.
- `harness-plan.adapter`: one of `in-session`, `prose-cli`, `codex-sdk`, `claude-sdk`, `pi-agent-rust`, or `mock`.
- `harness-plan.result-protocol`: for `prose-cli`, requires the CLI-provided `PROSE_RUN_RESULT_PATH` structured-result file; for in-session adapters, requires the selected backend's result artifact.
- `harness-plan.stdout-contract`: for `prose-cli --json`, stdout is exactly one JSON object and harness chatter goes to stderr.
- `harness-plan.recursion-policy`: says whether shelling out to `prose` is allowed, blocked as recursive, or allowed only as a child process that selects a different real harness.
- `harness-plan.session-persistence`: declares how the harness persists sessions and whether interactive and RPC/stdin modes share the same session/index semantics.

### Errors

- `unsupported-harness`: the requested adapter is unknown or lacks required OpenProse VM primitives.
- `harness-recursion-risk`: the selected `prose-cli` adapter would invoke the same wrapper host recursively instead of launching an independent harness process.
- `harness-result-missing`: a CLI or SDK harness completed without writing the required structured result artifact.

### Strategies

- when `agent-harness` is absent or `auto`: prefer the host-provided in-session adapter for the current VM, but record whether `prose-cli` is available as a separate process-level adapter.
- when `agent-harness` is `prose-cli`: treat the CLI as a working process harness only if it can select an underlying provider harness (`codex-sdk`, `claude-sdk`, or `mock`) and enforce `PROSE_RUN_RESULT_PATH`; do not confuse the CLI shell entrypoint with the semantic VM.
- when running inside a Prose Complete wrapper: block recursive `prose run` only when it would re-enter the same wrapper; allow an explicitly requested external `prose-cli` child harness when the result protocol, stdout/stderr split, and sandbox policy are declared.
- when the current run was itself launched by `prose run`: record that as `outer-runner.adapter = prose-cli` and record the selected provider; do not write `external-child-process-started: false` without also saying that the outer CLI process already spawned this provider session.
- when `PROSE_RUN_RESULT_PATH` is unavailable inside the wrapper: mark inner child-result proof as unavailable, but keep the outer CLI proof separate if command/log evidence exists.
- when using `codex-sdk`: record Codex sandbox, approval policy, model, reasoning effort, current working directory, and environment forwarding.
- when using `claude-sdk`: record Claude SDK availability, model, skill loading behavior, working directory, and environment forwarding.
- when using `pi-agent-rust`: follow the Prime Intellect harness discipline: preserve provider/tool/session boundaries, verify interactive vs RPC/stdin behavior separately, keep progress/status on stderr when stdout carries data, and make session persistence/index behavior explicit.
- when using `mock`: mark results as smoke-test only and never use them to claim semantic extraction quality.
- always record harness failures with explicit status and artifact paths; do not let partial or mixed outcomes collapse into a generic success.

## source-snapshotter

### Shape

- `self`: freeze the resolved session log into an immutable run-local parse input.
- `self`: record enough metadata to prove the parser read a stable source.
- `prohibited`: interpreting workflow content or modifying the original session log.

### Requires

- `resolved-session`: canonical path, detected format, session id, source kind, and resolver warnings.
- `harness-plan`: selected execution harness and persistence policy from `harness-adapter`.

### Ensures

- `source-snapshot`: object containing `original-path`, `snapshot-path`, `sha256`, `byte-count`, `line-count`, `mtime-before`, `mtime-after`, `changed-during-snapshot`, and `warnings`.
- `source-snapshot.snapshot-path`: run-local copy used by all downstream parsing.
- `source-snapshot.sha256`: digest of the snapshot contents.
- `source-snapshot.line-count`: physical JSONL line count in the snapshot.
- `source-snapshot.changed-during-snapshot`: true when original file metadata changed during the copy or digest pass.
- `source-snapshot.retention-policy`: whether the full source copy is workspace-only, redacted before publication, or explicitly permitted for binding publication.
- `source-snapshot.secret-scan`: persisted result of any scan required before a full source snapshot or raw source excerpt is published to bindings.
- `source-snapshot.line-index-path`: run-local line index or citation map that lets auditors verify cited lines without publishing the full raw session.

### Errors

- `source-changed-during-run`: original source changed during snapshot creation and a stable parse cannot be proven.
- `snapshot-unreadable`: the snapshot cannot be read back or its digest cannot be computed.

### Strategies

- stat the original source before copying, copy it to the run workspace, then stat the original source again before accepting the snapshot.
- compute sha256 and line count from the snapshot, not from the original live file.
- when the original file changed during snapshot creation: fail unless the host can prove the snapshot contains a complete final file; if continuing, record the exact before/after byte counts and mark validation no stronger than `pass-with-warnings`.
- downstream services must use `source-snapshot.snapshot-path` rather than `resolved-session.path`.
- include the snapshot digest and line count in the final report so later auditors can distinguish stale live-session tails from actual run input.
- keep the raw snapshot in `workspace/` by default; publish only digest, counts, and line-index artifacts to `bindings/` unless a secret scan passes and `additional-context` explicitly asks for full retained source.
- when source retention is workspace-only: cite evidence by event id, source line, and short excerpt; do not copy whole JSONL records into report or result metadata.
- when a live source has grown after snapshot creation: preserve the snapshot as the authoritative parse input and record the live tail delta as a caveat, not as a failure unless the caller requested latest-tail completeness.

## session-parser

### Shape

- `self`: read JSONL logs and extract a structured timeline of events.
- `self`: assign stable evidence identifiers that every downstream citation must preserve.
- `prohibited`: interpreting the reusable workflow.

### Requires

- `resolved-session`: canonical path, detected format, session id, and project path from `session-resolver`.
- `source-snapshot`: immutable parse input from `source-snapshotter`.

### Ensures

- `timeline`: ordered list of session events, each with `event-id`, source line, timestamp, actor, content summary, harness record type, and event class.
- `user-messages`: all real user messages with timestamps, excluding system reminders and hook noise.
- `assistant-actions`: all assistant responses, tool calls grouped by type, file reads, file writes, shell commands, spawned agents, and notable decisions.
- `tool-results`: significant tool outputs such as build results, test results, command failures, and linter output with their triggering action.
- `session-metadata`: format, source path, snapshot path, snapshot digest, source line count, session id, message count, duration, working directory, project name, and parse warnings.
- `evidence-index`: map from stable `event-id` to source line, actor, timestamp, event class, record type, and short content summary.
- `timeline`: classifies each event as direction, action, feedback, correction, or noise.
- `evidence-usage`: every event referenced by downstream outputs uses an `event-id` from `evidence-index`; downstream services must not recompute physical line numbers.

### Errors

- `unparseable-session`: the resolved log cannot be decoded as JSONL or cannot be mapped to the detected harness format.

### Strategies

- when log format is `claude-code`: parse top-level `type` records; keep `user`, `assistant`, `tool_result`, and `system` records; classify XML system-reminder tags as noise unless the agent acted on hook feedback.
- when log format is `codex`: parse `session_meta.payload` for id, cwd, CLI version, and model; parse `response_item` payloads for assistant messages, reasoning summaries, function calls, and function call outputs; parse `event_msg` payloads for user messages, agent messages, token counts, and tool progress.
- when a Codex record contains encrypted reasoning content: ignore the encrypted content and use only visible summaries, tool calls, messages, and outputs.
- when log format is `pi`: parse `role`, `tool_calls`, and `tool_results` records and preserve the same actor/action/result structure as other formats.
- when a user message is only a task notification: classify it as feedback, not direction.
- when the log exceeds 50 MB: sample strategically by reading first 500 lines, last 500 lines, and every 100th line in between, then report sampling in `session-metadata.parse-warnings`.
- when parser recovery is needed after an exception or malformed record: keep parsing where possible, but record the exception class, source line, recovery action, and affected event range in `session-metadata.parse-warnings`.
- when source line references are reported later: copy them from `evidence-index`, not from filtered user-message indexes or re-counted slices.

## decision-classifier

### Shape

- `self`: classify every user message as a human decision or a human message.
- `prohibited`: skipping user messages or classifying without justification.

### Requires

- `user-messages`: all user messages with timestamps.
- `assistant-actions`: assistant actions before and after each user message.
- `timeline`: full event timeline for surrounding context.
- `evidence-index`: stable event-id map from `session-parser`.

### Ensures

- `human-decisions`: user messages that changed trajectory in a way the agent could not have chosen autonomously, each with `event-id`, source line, message, what changed, and why.
- `human-messages`: user messages that steered, encouraged, confirmed, or clarified without introducing load-bearing new information, each with `event-id`.
- `decision-graph`: counterfactual for each human decision: what likely would have happened without the intervention.
- `gate-candidates`: human decisions that should become `gate()` points in the extracted program, linked to `event-id`.
- `absorbable-inputs`: human decisions that can be eliminated by adding the right upfront `### Requires` input or service strategy, linked to `event-id`.

### Strategies

- classify by asking whether the agent would reach the same outcome if the full workflow description had been supplied upfront.
- when the user introduces domain knowledge the agent lacked: classify as a human decision.
- when the user makes a value judgment that tests or code cannot determine: classify as a human decision.
- when the user confirms, acknowledges, or says to continue: classify as a human message.
- when the user gives a methodology preference such as test-first work: classify as a human message and promote it to a strategy.
- when a correction introduces new information: classify as a decision; when it corrects an avoidable mistake, classify it as strategy material.
- when in doubt: classify as decision and explain the uncertainty.
- preserve `event-id` and source line from `evidence-index` exactly; never cite filtered list indexes as source lines.

## phase-identifier

### Shape

- `self`: segment the timeline into distinct workflow phases.
- `prohibited`: inventing phases not evidenced by the timeline.

### Requires

- `timeline`: parsed session timeline.
- `user-messages`: extracted user messages.
- `assistant-actions`: extracted assistant actions.
- `session-metadata`: source and project context.
- `human-decisions`: classified decision points.
- `human-messages`: classified non-decision messages.
- `gate-candidates`: user messages that should become gate points.
- `evidence-index`: stable event-id map from `session-parser`.

### Ensures

- `phases`: ordered workflow phases with names, start/end timestamps, evidence event ranges, and one-sentence descriptions.
- `phases`: each phase has a dominant activity type such as research, implementation, testing, refactoring, coordination, or verification.
- `phase-transitions`: trigger for each transition and whether it came from a human decision, human message, tool result, or autonomous progress.
- `phase-graph`: dependency edges between phases.
- `gated-phases`: phases that began because of a human decision.
- `phase-evidence`: every phase and transition cites one or more `event-id` values from `evidence-index`.

### Errors

- `trivial-session`: fewer than three distinct workflow phases can be identified.

### Strategies

- look for inflection points: shifts in files touched, tool types used, artifacts produced, or human decisions.
- when a human decision splits the session into a fundamentally different direction: make a phase boundary.
- when the agent reads many files before writing any: mark a study or research phase.
- when the agent alternates between writing tests and code: treat it as a bounded TDD loop rather than two unrelated phases.
- when the agent repeatedly runs a command and fixes failures: treat it as an iterative fix loop.
- when a gate candidate falls mid-phase: split the phase at the gate.
- when source evidence is only sampled: mark the phase confidence and sampling warning explicitly rather than presenting exact source coverage.

## contract-extractor

### Shape

- `self`: derive public contracts for each phase by analyzing inputs consumed and outputs produced.
- `prohibited`: fabricating contracts not evidenced by file reads, commands, messages, or generated artifacts.

### Requires

- `phases`: identified workflow phases.
- `assistant-actions`: full action log including reads, writes, shell commands, and spawned agents.
- `tool-results`: significant tool outputs.
- `evidence-index`: stable event-id map from `session-parser`.

### Ensures

- `phase-contracts`: requires and ensures for each phase.
- `phase-contracts`: every requires and ensures entry uses semantic names rather than session-specific file paths.
- `program-contract`: overall requires and ensures derived from the first and last phases.
- `shape-constraints`: for each phase, what the agent did directly, delegated, and avoided.
- `contract-evidence`: every contract entry carries evidence references or an explicit note that it is derived from a phase-level synthesis.

### Strategies

- when a phase reads outputs from a previous phase: create a wiring edge from the upstream ensures to the downstream requires.
- when a phase produces tests: describe what the tests verify rather than naming files only.
- when a phase modifies existing files: describe the semantic change.
- when the agent explicitly avoided an action: encode that as `### Shape` prohibited guidance.
- when deriving the system-level contract: include caller inputs needed to rerun the workflow on a similar but different codebase.
- when the source session contains an unresolved caveat: keep it as an error condition, risk note, or required verification output; do not also claim the corresponding result is complete.

## pattern-recognizer

### Shape

- `self`: identify loops, parallelism, gates, and conditional branches from the phase graph and timeline.
- `prohibited`: imposing patterns not evidenced by the session.

### Requires

- `phases`: workflow phases.
- `phase-transitions`: transition triggers.
- `phase-graph`: dependency graph between phases.
- `phase-contracts`: contracts for each phase.
- `user-messages`: user messages for gate detection.
- `evidence-index`: stable event-id map from `session-parser`.

### Ensures

- `iteration-loops`: phases that repeated with feedback, including TDD cycles and fix-and-retry loops.
- `parallel-opportunities`: independent phases that could run concurrently.
- `decision-gates`: points where a human choice changed workflow direction.
- `conditional-branches`: points where different outcomes would have changed the workflow path.
- `pattern-annotations`: each phase annotated with applicable structural patterns.
- `pattern-evidence`: every loop, gate, branch, and parallel opportunity includes the event evidence that justified it.

### Errors

- `no-patterns`: the session is purely linear with no useful iteration, parallelism, or branching.

### Strategies

- when the same phase type appears multiple times: distinguish iteration from unrelated repetition.
- when user messages contain questions or approvals between phases: evaluate whether they are true decision gates.
- when the agent spawned subagents: treat that as evidence of parallelism or delegation.
- when tests fail and fixes follow: capture the bounded feedback loop and observed iteration count.
- when the user stops or redirects the work: model the correction as a gate or strategy depending on whether it introduced new information.
- when a failed helper search is recovered from source-session evidence: record the failed search as an operational caveat and do not reframe it as a successful external cross-check.

## strategy-miner

### Shape

- `self`: extract hard-won lessons, corrections, failure recoveries, and non-obvious choices.
- `prohibited`: inventing strategies not grounded in session evidence.

### Requires

- `timeline`: full event timeline.
- `phases`: identified phases.
- `phase-contracts`: contracts for each phase.
- `user-messages`: user messages.
- `tool-results`: significant outputs, especially errors and test failures.
- `evidence-index`: stable event-id map from `session-parser`.

### Ensures

- `strategies`: per-phase guidance derived from observed events.
- `strategies`: every strategy is grounded in a specific failure, correction, non-obvious choice, or successful approach pattern.
- `error-conditions`: named errors derived from actual failures.
- `anti-patterns`: approaches that failed or were rejected, encoded as prohibited guidance or negative strategies.
- `strategy-evidence`: every strategy, error condition, and anti-pattern carries event evidence or a low-confidence marker.

### Strategies

- when the agent hit an error and recovered: make the recovery approach a strategy.
- when the user corrected the agent: preserve the correction as strategy material or a gate.
- when the agent made a non-obvious tool choice: capture the choice with rationale.
- when a test failed multiple times before passing: extract the root cause and fix.
- when the session had few failures: derive strategies from successful approach patterns and mark confidence accordingly.

## program-assembler

### Shape

- `self`: assemble all extracted components into a valid current OpenProse source file.
- `prohibited`: adding services, contracts, or strategies not provided by upstream extractors.

### Requires

- `phases`: workflow phases that become services or service responsibilities.
- `phase-contracts`: requires and ensures per phase.
- `shape-constraints`: self, delegates, and prohibited boundaries per phase.
- `pattern-annotations`: loops, parallelism, gates, and branches per phase.
- `strategies`: per-phase strategies.
- `error-conditions`: per-phase errors.
- `program-contract`: overall requires and ensures.
- `session-metadata`: provenance data.
- `additional-context`: optional caller guidance about naming, scope, or desired extracted output.
- `gate-candidates`: decisions that should become gate points.
- `absorbable-inputs`: decisions that can become requires or strategies.
- `gated-phases`: phases triggered by human decisions.
- `prior-program`: optional prior program to revise after validation.
- `validation-feedback`: optional validation result from `validator`.
- `structural-issues`: optional linter issues.
- `wiring-issues`: optional semantic wiring issues.
- `semantic-issues`: optional ProseScript, return, and output-shape issues.
- `evidence-issues`: optional unsupported or contradictory evidence claims.
- `receipt-issues`: optional run-envelope and manifest issues.
- `quality-feedback`: optional baseline comparison feedback from `quality-regression-gate`.
- `evidence-index`: stable event-id map from `session-parser`.
- `source-snapshot`: immutable source snapshot metadata.
- `harness-plan`: selected harness adapter, result protocol, primitive support, and recursion policy from `harness-adapter`.
- `baseline-run`: optional completed run id or path to use as the generated-program/report quality floor.
- `invoked-contract`: optional host-provided digest, version, path, and copied source paths for the contract being executed.

### Ensures

- `program`: a complete `*.prose.md` file with provenance comment, YAML frontmatter, current Contract Markdown sections, and inline services when the output has multiple phases.
- `program`: uses `kind: service` for a single-service output or `kind: system` with `### Services` for multi-service output.
- `program`: includes `### Requires` and `### Ensures`, and includes `### Shape`, `### Errors`, `### Strategies`, and `### Execution` when evidenced by the source.
- `program`: uses generalized names, not session-specific project names, file names, or ids.
- `program`: can run on a similar but different codebase with the same domain problem.
- `program`: includes `gate()` or explicit caller inputs for human decisions that cannot be safely absorbed.
- `manifest-contract`: expected service graph containing every declared service, each service input, each service output, root return keys, and source mapping for every binding.
- `result-contract`: exact result key names and raw content output paths expected for the final receipt.
- `program`: root `### Ensures` exactly matches the keys returned by `### Execution`; if the output is contracts-only, the manifest-contract must still map every root ensures entry to a producing service.
- `program`: single-output service calls are used as direct values; only multi-output services are dereferenced by declared output names.
- `program`: generated evidence citations use event IDs and source lines from `evidence-index`.
- `program`: for every declared service in `### Services`, either includes a matching inline `## service-name` section in the same file or declares an explicit external dependency path in `manifest-contract`.
- `program`: top-level `### Requires` and `### Ensures` preserve concrete semantic descriptions from `program-contract` and `phase-contracts`; generic placeholders such as "caller-provided policy or runtime input" or "generated evidence-backed output" are invalid unless those exact concepts are evidenced by the source.
- `program`: includes compact provenance metadata with session id, harness format, snapshot sha256, snapshot line count, and key event ids without embedding raw sensitive session content.
- `program`: includes invoked contract version and source digest when available, and labels any copied-source divergence as a validation caveat rather than claiming full provenance.
- `program`: every phase, nontrivial strategy, observed error, and gate has at least one event-id citation or is explicitly marked as synthesized with low confidence.
- `manifest-contract`: includes the invoked contract source path, copied source path, source sha256, copied sha256, and version, so receipt audit can detect stale `root.prose.md` or `sources/` copies.
- `result-contract`: records the canonical final result artifact path and the exact public binding path for every returned object, including structured outputs such as `resolved-session` and `source-snapshot`.
- `program`: never contains malformed ProseScript such as doubled return braces `{{` or `}}`.
- `program`: every provenance path it prints either exists in the current run or is explicitly labeled as a historical path; current snapshot paths must exactly match `source-snapshot.snapshot-path`.
- `program`: preserves concrete service contracts, loops, branches, gates, observed errors, and parallel work from the best prior evidence-backed draft instead of collapsing them into generic `prior-artifact`, `upstream-context`, or "evidence-backed output" placeholders.
- `manifest-contract`: keeps logical output names separate from binding filenames; for example, the logical output is `program` even when its binding file is `program.prose.md`.

### Strategies

- when naming services: use role names such as researcher, test-writer, implementer, reviewer, and synthesizer rather than tool names.
- when the phase graph is linear with no gates or loops: prefer a contracts-only system and let Forme wire it.
- when the phase graph has loops, branches, or gates: include a bounded `### Execution` block.
- when a human decision can be anticipated upfront: promote it to `### Requires`.
- when a human decision cannot be anticipated upfront: model it as a gate with the original decision context.
- when a methodology preference appears in user messages: make it a service strategy.
- when a phase delegated to subagents: model delegation in `### Shape` rather than inventing extra services.
- when assembling provenance: include session id, harness format, project path, date, source path, and a one-line summary.
- when revising after validation: fix only the reported issues and preserve the extracted workflow.
- when validation reports missing return keys: either add the missing return bindings or remove unsupported ensures entries; do not leave root contract and return object divergent.
- when validation reports object dereference of a single-output call: rewrite the call variable or service ensures shape so the access model is unambiguous.
- when prior validation used only fallback checks: include that caveat in the generated program provenance and in `result-contract`.
- when hardening receipt metadata after a validation pass: preserve the prior generated program's concrete contract language unless that language caused a specific validation or evidence issue.
- when emitting a multi-service system: include inline service contracts by default; use external service references only when the source evidence shows reuse of an existing service and the manifest records the dependency path.
- when old output had richer human decisions, strategies, or observed errors than the current draft: merge the richer grounded material back into the report and program rather than dropping it for brevity.
- when the run source copy is stale or cannot be proven: block the receipt, or write an explicit `source-provenance-mismatch` warning into every final artifact before any success status is emitted.
- when adding or removing root returns such as `tail-citation-audit`: update root `### Ensures`, root `return`, manifest returns, result contract, and final result metadata together in one revision.
- when prior generated programs have richer concrete inputs, outputs, loops, or parallel branches than the current draft: merge those details unless the new source evidence contradicts them.
- when emitting ProseScript returns: use exactly one object literal delimiter pair and reject `{{ ... }}` or `}}` as invalid syntax.
- when writing manifest and result contracts: derive logical output names from service `### Ensures`, derive binding paths from the actual file written, and record both fields without substituting one for the other.
- when adding provenance paths: compute or copy the exact current path from `source-snapshot`, not by appending suffixes to an existing filename.
- when `quality-feedback` reports a regression against the baseline: reuse the richer baseline structure as a repair guide, but update citations and provenance to the current source snapshot.
- when `baseline-run` is unavailable: apply the same quality floor against the richest current upstream evidence instead of weakening the generated program to satisfy the receipt.

## validator

### Shape

- `self`: validate the assembled `*.prose.md` source structurally and semantically.
- `prohibited`: modifying the program.

### Requires

- `program`: assembled OpenProse source.
- `program-contract`: extracted root requires and ensures.
- `evidence-index`: stable event-id map from `session-parser`.
- `source-snapshot`: immutable source snapshot metadata.
- `harness-plan`: selected harness adapter, result protocol, primitive support, and recursion policy from `harness-adapter`.

### Tools

- `cli:prose`: OpenProse CLI on PATH for `prose lint` and `prose preflight` when available.

### Ensures

- `validation-result`: pass or fail with specific blocking issues and warnings.
- `lint-output`: raw structural validation output from `prose lint` or the best available Contract Markdown validator.
- `structural-issues`: frontmatter, section, contract, shape, and ProseScript issues.
- `wiring-issues`: requires with no source, orphan ensures, unresolved services, and ambiguous wiring.
- `semantic-issues`: root return mismatches, invalid single-output dereferences, undeclared output dereferences, unbounded loops, malformed gates, and contradictory reportable claims.
- `evidence-issues`: citations missing from `evidence-index`, wrong source lines, unsupported claims, stale source snapshots, and unrecorded parser recoveries.
- `receipt-issues`: manifest, binding, result metadata, validation caveat, and VM log issues the final receipt must not hide.
- `validation-result`: records whether validation used the real CLI or a manual fallback.
- `validation-result.status`: one of `pass-machine`, `pass-manual-complete`, `pass-with-warnings`, or `fail`.
- `validation-result`: `pass-machine` requires successful CLI or deterministic validator lint/preflight; `pass-manual-complete` requires every explicit fallback checklist item to pass; fallback with unavailable machine validation and any caveat must be `pass-with-warnings`.
- `validation-result`: includes `recovered-errors`, `failed-probes`, `late-writes`, and `source-provenance-check` arrays even when they are empty.

### Errors

- `invalid-program`: validation found blocking Contract Markdown or wiring problems.

### Strategies

- when the `prose` CLI is available outside a recursive Prose wrapper: write the candidate source to a scratch `*.prose.md` file and run `prose lint` first.
- when lint passes: run `prose preflight` to catch missing dependencies and unresolved services.
- when `harness-plan.adapter` is `prose-cli`: validate the generated program through the CLI harness result protocol, require `PROSE_RUN_RESULT_PATH`, and treat missing structured results as blocking.
- when `harness-plan.recursion-policy` is `blocked`: do not shell out to `prose`; run deterministic fallback checks and record the recursion warning instead.
- when CLI validation is unavailable or blocked by host rules: manually run the full semantic checklist and mark status no stronger than `pass-with-warnings` unless all checklist items are persisted.
- when lint reports structural errors: return them as blocking issues.
- when lint or preflight cannot run: persist the command attempted, raw failure, and fallback status in `lint-output`, `validation-result`, `extraction-report`, and final result metadata.
- when wiring validation finds missing inputs: either require the input at the system level or add an upstream ensures entry during the next assembly pass.
- when the program has inline services: validate the single multi-service file directly.
- parse only fenced `### Execution` blocks for call syntax; ignore words such as "call out" in prose strategies.
- build a service symbol table from `### Services`, every inline service `### Requires`, and every inline service `### Ensures`.
- verify every `call` target is declared, every passed input is accepted or deliberately variadic, and every required input has a source.
- verify single-output services bind directly and are not dereferenced as `value.output-name`; verify multi-output dereferences use declared output names only.
- verify root `### Ensures` exactly equals the returned object keys, with no missing declared outputs and no undeclared extra outputs.
- verify final result key names preserve contract names exactly; do not silently convert hyphens to underscores.
- verify every `### Services` entry resolves to an inline `## service-name` section or an explicit external service path in `manifest-contract`; declared-but-undefined services are blocking issues.
- verify generated top-level contract lines are not generic placeholders; reject repeated boilerplate descriptions that omit domain nouns, phase evidence, or caller meaning.
- verify the generated program contains compact provenance and at least one evidence citation for every phase, gate, observed error, and nontrivial strategy.
- verify `result-contract` paths exactly match final result metadata paths for every root output, including single-output objects such as `source-snapshot`.
- verify evidence citations against `evidence-index` and record parser exceptions or recovery in parse warnings.
- verify unsupported or contradicted claims are downgraded to caveats, risks, or required verification outputs.
- verify every file copied to `bindings/` is a declared output; non-declared diagnostics stay in `workspace/`.
- verify raw source snapshots are not published under `bindings/` unless `source-snapshot.secret-scan` is persisted and passing; otherwise require a redacted or line-index-only binding.
- verify the invoked contract source digest/version matches `root.prose.md`, copied `sources/`, manifest source metadata, and final result metadata; any mismatch is a blocking `source-provenance-mismatch`.
- verify the final result artifact by parsing the actual `result.json` or `run-result.json` on disk against `result-contract`, not by trusting self-reported parity fields.
- verify `vm.log.md` against the normative filesystem backend grammar: `---start`, ordered `N→ service ✓` service completions, binding copy markers, logged validation corrections, receipt audit, tail/citation audit, and `---end TIMESTAMP`.
- verify every failed `jq`, `rg`, shell probe, safety-hook block, missing-file recovery, or rerun correction from the CLI/session log is persisted in the final warning surfaces.
- verify the generated program contains no doubled ProseScript return braces and no generic placeholder contract lines such as `prior-artifact`, `upstream-context`, or "evidence-backed output" unless those exact domain terms are evidenced and cited.
- verify recognized iteration loops, parallel branches, and human gates appear in the generated `### Execution` or are explicitly justified as declarative Forme wiring in the report.
- verify manifest service inputs are present for every non-caller required input; empty `inputs` arrays are blocking unless the service truly has no `### Requires`.
- verify every manifest output binding path exists on disk and every manifest output name equals a declared service/root `### Ensures` key, not a filename stem.
- verify every recovered Python traceback, exception class, failed write pass, missing directory creation, and rerun correction is named with class/message in validation, extraction report, receipt audit, tail/citation audit, VM log, and final result metadata.
- verify `tail-citation-audit` checks at least one material report claim whenever `extraction-report` contains phase, strategy, error, or conclusion claims.

## report-writer

### Shape

- `self`: compile extraction metadata into a human-readable report.
- `prohibited`: modifying the program.

### Requires

- `resolved-session`: canonical source, format, id, and resolver warnings.
- `source-snapshot`: immutable source snapshot metadata.
- `session-metadata`: format, message count, duration, project name, and parse warnings.
- `additional-context`: optional caller guidance used during assembly.
- `phases`: identified workflow phases.
- `phase-contracts`: requires, ensures, shape constraints, and evidence for each extracted phase.
- `human-decisions`: classified decision points.
- `human-messages`: classified non-decision messages.
- `gate-candidates`: decisions that became gate points.
- `absorbable-inputs`: decisions promoted to requires or strategies.
- `pattern-annotations`: loops, parallelism, gates, and conditionals found.
- `strategies`: extracted strategies per service.
- `error-conditions`: observed failures, caveats, anti-patterns, and recovery paths mined from the session.
- `tool-results`: significant command, lint, test, and tool outputs used as evidence.
- `validation-result`: final validation status.
- `program`: final assembled program.
- `evidence-index`: stable event-id map from `session-parser`.
- `harness-plan`: selected harness adapter, result protocol, primitive support, and recursion policy from `harness-adapter`.
- `baseline-run`: optional completed run id or path used as the report-detail quality floor.

### Ensures

- `extraction-report`: structured Markdown report under 500 lines.
- `extraction-report`: includes source path, snapshot path, snapshot sha256, source line count, harness format, duration, message count, project, and resolver warnings.
- `extraction-report`: lists phases with descriptions and activity types.
- `extraction-report`: explains human decision classification, counterfactual risk, and what was absorbed versus gated.
- `extraction-report`: lists the concrete phase contracts, mined strategies, observed errors, validation revisions, and notable tool results with event-id citations.
- `extraction-report`: summarizes patterns, strategy counts, validation status, confidence notes, and counterfactual risk.
- `extraction-report`: names parser recoveries, source sampling, source-change warnings, failed helper searches, validation fallback caveats, and receipt-audit caveats.
- `extraction-report`: names recovered write-pass errors, failed probe commands, safety-hook blocks, rerun corrections, source-provenance mismatches, and live-tail drift.
- `extraction-report`: reports citation coverage for phases, gates, observed errors, and nontrivial strategies, including any claims intentionally marked low-confidence.
- `extraction-report`: no claim may contradict an unresolved caveat; if evidence says a result is partial, the report must say partial.
- `extraction-report`: preserves evidence-backed human decision tables, pattern explanations, strategy lists, observed error lists, and validation corrections from prior runs when comparing against an older run.
- `extraction-report`: names each recovered write-pass exception with class, message, affected path, recovery action, and whether the rerun reused or removed partial artifacts.

### Strategies

- when many human decisions were absorbed as requires: say that the program is opinionated about choices the original session left open.
- when few strategies were mined: note that the session had few failures or corrections and confidence may be lower.
- when resolver warnings exist: include them near the top of the report.
- when the validation loop ran multiple iterations: include the issues fixed on each pass.
- when a source snapshot line count differs from the live file line count: report that the run used the snapshot and mark the live-tail risk explicitly.
- when validation status is `pass-with-warnings`: summarize the exact warnings and avoid saying the generated program is fully runnable.
- when generated outputs are drafts rather than machine-validated runnable programs: say so plainly in the confidence notes.
- preserve rich old-run narrative material when it remains evidence-backed: human decision tables, strategy explanations, observed error lists, and confidence caveats are required report sections, not optional prose.
- when the report must stay under 500 lines: summarize repeated phases compactly, but do not drop unique human decisions, unresolved errors, or validation caveats.
- when any recovered error appears in the CLI log or VM log: repeat it in the report with the recovery action and affected artifact paths.
- when live source line count differs at audit time: state snapshot lines, live lines, excluded tail count, and whether the generated program claims latest-tail coverage.
- when comparing V3 and V4: explicitly state whether generated program quality improved, stayed unchanged, or regressed; do not let receipt improvements mask program regressions.
- when `baseline-run` is provided: compare the current report to the baseline report for human decisions, strategies, observed errors, pattern explanations, and validation caveats; preserve any baseline detail that is still supported by current evidence.

## quality-regression-gate

### Shape

- `self`: compare the candidate generated program and report against a selected baseline run and the current extraction evidence.
- `self`: decide whether the candidate keeps V3-style concrete workflow quality while adding V4-style audit surfaces.
- `prohibited`: modifying the generated program, report, receipt, or baseline run.

### Requires

- `baseline-run`: optional completed run id or path to use as the quality floor; if absent, use only explicit prior-run references in `additional-context` or `harness-plan`.
- `resolved-session`: canonical source path, format, id, project path, and resolver warnings.
- `source-snapshot`: immutable source snapshot metadata.
- `program`: candidate generated OpenProse source.
- `extraction-report`: candidate extraction report.
- `validation-result`: current validation status and warnings.
- `phases`: identified workflow phases.
- `pattern-annotations`: loops, parallelism, gates, and conditionals found.
- `strategies`: extracted strategies per service.
- `error-conditions`: observed failures, caveats, anti-patterns, and recovery paths.
- `evidence-index`: stable event-id map from `session-parser`.
- `harness-plan`: selected harness adapter, outer runner proof, and recursion policy.

### Ensures

- `quality-comparison`: pass, pass-with-warnings, or fail with baseline id, compared artifacts, blocking regressions, warnings, and repair guidance.
- `quality-comparison.generated-program`: records whether the candidate is better, equal, or worse than the baseline for concrete contract language, inline service completeness, control flow, evidence citations, and syntax.
- `quality-comparison.extraction-report`: records whether the candidate preserves baseline-level human decisions, patterns, strategies, observed errors, validation caveats, and confidence notes.
- `quality-comparison.audit-envelope`: records whether V4-style additions are present: `harness-plan`, `tail-citation-audit`, source provenance, strict result paths, recovered warning surfaces, and raw-source retention.
- `quality-comparison.verdict`: is `fail` whenever generated program/report quality regresses, even if the audit envelope improves.
- `quality-comparison.repair-guidance`: concrete instructions for `program-assembler` and `report-writer` to restore baseline detail without reverting V4 audit improvements.

### Errors

- `quality-regression`: the candidate is worse than the baseline or current evidence on concrete contracts, control flow, report detail, citation coverage, or syntactic validity.
- `baseline-unreadable`: the provided baseline run cannot be found or its generated program/report cannot be read.

### Strategies

- resolve `baseline-run` as a run id under `runs/` or as an explicit path; if ambiguous or missing, record no-baseline and enforce only current-evidence checks.
- prefer the baseline generated program/report only as a quality floor, not as source truth; current `source-snapshot` and `evidence-index` remain authoritative.
- compare generated programs for frontmatter validity, inline service count, concrete `### Requires` and `### Ensures`, `### Execution` loops/branches/gates, placeholder density, citation density, and syntax defects such as doubled braces.
- compare reports for named human decisions, pattern explanations, strategy lists, observed errors, validation corrections, and confidence caveats.
- fail if the candidate replaces baseline-specific contract nouns with generic `prior-artifact`, `upstream-context`, "evidence-backed output", or similar placeholders.
- fail if recognized `pattern-annotations` contain loops or parallel branches and the candidate neither models them in `### Execution` nor explains why Forme auto-wiring is sufficient.
- fail if `validation-result` is nonblocking while this gate finds malformed syntax, nonexistent provenance paths, missing manifest-input expectations, or unpersisted recovered errors.
- pass with warnings, not fail, when the baseline lacks V4 audit surfaces but the current candidate adds them while preserving generated-program/report quality.
- include enough artifact paths and line references in `quality-comparison` for a reviewer to reproduce the verdict without rerunning the extraction.

## receipt-auditor

### Shape

- `self`: audit the run receipt, manifest, bindings, result metadata, and validation caveats before success is reported.
- `prohibited`: modifying the generated program.

### Requires

- `resolved-session`: canonical source, format, id, and resolver warnings.
- `source-snapshot`: immutable source snapshot metadata.
- `program`: final assembled OpenProse source.
- `extraction-report`: final extraction report.
- `validation-result`: final validation status.
- `quality-comparison`: baseline-aware generated-program/report quality gate.
- `manifest-contract`: expected service graph and binding lineage from `program-assembler`.
- `result-contract`: expected result keys and output paths from `program-assembler`.
- `harness-plan`: selected harness adapter, result protocol, primitive support, and recursion policy from `harness-adapter`.

### Ensures

- `receipt-audit`: pass or fail with blocking receipt issues and warnings.
- `receipt-audit`: verifies result paths exist and point to raw declared outputs, not binding-wrapper prose unless the wrapper itself is the declared output format.
- `receipt-audit`: verifies manifest contains every declared service, service input, service output, error condition, root return key, and return source mapping.
- `receipt-audit`: verifies `bindings/` contains only declared published outputs and `workspace/` contains scratch diagnostics.
- `receipt-audit`: verifies `vm.log.md` records start, ordered service completions, validation iterations, receipt audit, and final end marker.
- `receipt-audit`: verifies validation caveats are repeated in `validation-result`, `extraction-report`, and final result metadata.
- `receipt-audit`: verifies source snapshot digest and line count are persisted in the receipt and report.
- `receipt-audit`: verifies every actual file under `bindings/` is declared by `manifest-contract`, and every declared binding path exists exactly once.
- `receipt-audit`: verifies final result metadata uses exact hyphenated Contract Markdown output names and exact paths from `result-contract`; underscore aliases may appear only as supplemental compatibility fields and never replace canonical keys.
- `receipt-audit`: verifies `vm.log.md` uses canonical filesystem backend markers for start, service completion, binding copy, validation correction, receipt audit, and end, and that artifact mtimes do not postdate the final end marker unless the late write is logged as a correction.
- `receipt-audit`: verifies live-source line count and mtime at audit time are recorded so auditors can distinguish a point-in-time snapshot from the latest tail.
- `receipt-audit`: verifies source retention policy and secret-scan status whenever raw source content is copied outside `workspace/`.
- `receipt-audit`: verifies copied run sources and `root.prose.md` match the invoked contract digest/version recorded in `manifest-contract`.
- `receipt-audit`: verifies final CLI/JSON response is generated from persisted result metadata, result contract, receipt audit, and tail/citation audit without omitting declared outputs or changing statuses.
- `receipt-audit`: verifies recovered errors, failed probes, late writes, and corrections are present in all final warning surfaces.
- `receipt-audit`: verifies every manifest input mapping and output binding path against actual on-disk files, and distinguishes logical output names from file names.
- `receipt-audit`: verifies generated program provenance paths exist or are explicitly historical, including the exact `source-snapshot.snapshot-path`.
- `receipt-audit`: verifies `quality-comparison` is present in result metadata and has no blocking generated-program/report regressions before any success status is emitted.

### Errors

- `invalid-receipt`: output files, manifest wiring, result metadata, validation caveats, or VM log are inconsistent.

### Strategies

- treat missing manifest service outputs or input mappings as blocking receipt issues, even when output files exist.
- treat a file write after the logged run end as a blocking receipt issue unless the late write is logged as a validation correction.
- treat stale copied source files, stale `root.prose.md`, missing source digests, or version mismatch as blocking `source-provenance-mismatch` issues.
- treat declared services without inline contracts or explicit external paths as blocking receipt issues because the generated program cannot be re-run from the receipt.
- treat undeclared files in `bindings/` as blocking, including summaries, digests, diagnostics, or helper files; move them to `workspace/` or declare them as outputs before publication.
- treat undeclared extra result keys as blocking unless the root `### Ensures` and return object also declare them.
- treat secret-scan or validation claims as unauditable unless their raw artifact or checklist result is persisted in the receipt.
- treat full raw source snapshots in `bindings/` as blocking unless a persisted secret scan passes and the retention policy explicitly permits publication.
- when the live source has grown after snapshot creation: pass only with an explicit point-in-time caveat that states snapshot lines, live lines, and excluded tail count.
- when a result path names a wrapper document but `result-contract` expects raw content: fail the audit or update the contract to make the wrapper the declared output format.
- when `result.json` and console JSON disagree: fail the audit unless the console JSON is a documented pointer to the persisted result artifact.
- if the receipt audit fails, return `invalid-receipt` and force another assembler/validator loop rather than publishing a clean success.
- when a receipt failure is recovered during the run: keep the original failure visible as a recovered issue with class/message/path in every final warning surface; do not collapse it to a generic "recovered surfaces" warning.
- when the manifest has missing input mappings, nonexistent binding paths, or output names that do not match declared `### Ensures`: fail even if the final result object has the right top-level keys.
- when `quality-comparison` fails: fail the receipt even if all files exist, because a good envelope around a worse generated program is still a regression.

## tail-and-citation-auditor

### Shape

- `self`: audit live-source drift after snapshot creation and citation coverage across the generated program and report.
- `self`: produce a machine-readable warning surface that downstream receipts and final summaries must include verbatim.
- `prohibited`: modifying the generated program, source snapshot, or receipt files.

### Requires

- `resolved-session`: canonical source path, format, id, project path, and resolver warnings.
- `source-snapshot`: snapshot path, sha256, line count, byte count, retention policy, and snapshot timing.
- `program`: final assembled OpenProse source.
- `extraction-report`: final extraction report.
- `validation-result`: final validation status and warning arrays.
- `quality-comparison`: baseline-aware generated-program/report quality gate.
- `receipt-audit`: final receipt-audit status and warning arrays.
- `evidence-index`: stable event-id map from `session-parser`.
- `harness-plan`: selected harness adapter, result protocol, primitive support, and recursion policy from `harness-adapter`.

### Ensures

- `tail-citation-audit`: pass, pass-with-warnings, or fail with blocking issues and warnings.
- `tail-citation-audit`: records snapshot line count, live source line count, live source mtime, excluded tail count, and whether the generated program claims latest-tail coverage.
- `tail-citation-audit`: records citation coverage counts for phases, gate candidates, observed errors, nontrivial strategies, generated service sections, and material report claims.
- `tail-citation-audit`: records invalid citations, missing citations, stale citations, and low-confidence synthesized claims.
- `tail-citation-audit`: records every recovered write-pass error, failed probe command, safety-hook block, and rerun correction that appears in CLI or VM logs and checks whether each appears in final warning surfaces.
- `tail-citation-audit`: records whether final result metadata includes the `tail-citation-audit` binding and whether final console JSON was derived from persisted artifacts.
- `tail-citation-audit`: records material report claims checked and fails when report claims are not cited or when `report-citations-checked` would be zero for a non-empty report.
- `tail-citation-audit`: verifies quality-regression warnings are cited and repeated when `quality-comparison` reports any regression or baseline caveat.

### Errors

- `tail-drift`: the live source changed after snapshot and the output claims latest-tail completeness or omits the point-in-time caveat.
- `insufficient-citations`: required phases, gates, observed errors, strategies, generated services, or report claims are missing event-id/source-line citations.
- `unreported-recovery`: a recovered write-pass error, failed probe, safety-hook block, or rerun correction is visible in logs but absent from final warnings.

### Strategies

- stat the live source again after receipt audit; compare live line count, byte count, and mtime to `source-snapshot`.
- when live source changed after the snapshot: keep the run valid only as a point-in-time extraction and require the excluded tail count in report, receipt, tail audit, and result metadata.
- parse citations using the evidence id format emitted by `session-parser`; reject citations that are not present in `evidence-index` or whose source line does not match.
- require at least one citation for each phase, gate, observed error, nontrivial strategy, and generated service section; allow low-confidence synthesized claims only when explicitly marked.
- treat CLI probe failures such as `jq` shape errors, `rg` no-match exits used as assertions, missing-file recoveries, or safety-hook false positives as warnings unless they affect output correctness; they must still be persisted everywhere.
- when final console JSON omits returned outputs or changes persisted statuses: return a blocking issue so the next pass emits a pointer to the persisted result or regenerates the console JSON from disk.
- parse `extraction-report` for phase, strategy, error, decision, and conclusion claims; require claim-level citation accounting, not only generated-program citation counts.
