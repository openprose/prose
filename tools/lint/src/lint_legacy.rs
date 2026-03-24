use crate::diag::{Diagnostic, Severity};
#[cfg(not(target_arch = "wasm32"))]
use crate::fs::collect_prose_files;
use crate::profile::LintProfile;
#[cfg(not(target_arch = "wasm32"))]
use anyhow::{Context, Result};
use std::collections::{HashMap, HashSet};
#[cfg(not(target_arch = "wasm32"))]
use std::fs;
use std::path::{Path, PathBuf};

// ── Spec-generated vocabulary ───────────────────────────────────────
// These are extracted from the compiler spec at build time by build.rs.
// Rebuild after spec changes to update.
#[cfg(not(target_arch = "wasm32"))]
mod spec_vocab {
    include!(concat!(env!("OUT_DIR"), "/spec_vocab.rs"));
}

// Merge spec-generated vocabulary with hardcoded compat values.
// Compat values cover fork extensions (gate, exec, web, edit, etc.)
// that may not be in the upstream spec.
const COMPAT_MODELS: &[&str] = &["sonnet", "opus", "haiku"];
const COMPAT_AGENT_PROPERTIES: &[&str] = &[
    "model", "prompt", "persist", "context", "retry", "backoff", "skills", "permissions",
];
const SESSION_PROPERTIES: &[&str] = &[
    "model", "prompt", "persist", "context", "retry", "backoff", "skills", "permissions",
    "timeout", "cwd", "on-fail", "on_fail",
];
const EXEC_PROPERTIES: &[&str] = &["timeout", "cwd", "on-fail", "on_fail"];
const GATE_PROPERTIES: &[&str] = &["prompt", "allow", "timeout", "on_reject"];
const COMPAT_PERMISSION_TYPES: &[&str] = &["read", "write", "execute", "bash", "network", "web", "edit", "exec"];
const COMPAT_PERMISSION_VALUES: &[&str] = &["allow", "deny", "ask", "prompt"];

/// Returns the effective vocabulary, preferring spec-generated values
/// and falling back to compat defaults when spec values are empty.
#[cfg(not(target_arch = "wasm32"))]
fn known_models() -> &'static [&'static str] {
    if spec_vocab::SPEC_MODELS.is_empty() { COMPAT_MODELS } else { spec_vocab::SPEC_MODELS }
}

#[cfg(target_arch = "wasm32")]
fn known_models() -> &'static [&'static str] { COMPAT_MODELS }

#[cfg(not(target_arch = "wasm32"))]
fn agent_properties() -> &'static [&'static str] {
    if spec_vocab::SPEC_AGENT_PROPERTIES.is_empty() { COMPAT_AGENT_PROPERTIES } else { spec_vocab::SPEC_AGENT_PROPERTIES }
}

#[cfg(target_arch = "wasm32")]
fn agent_properties() -> &'static [&'static str] { COMPAT_AGENT_PROPERTIES }

#[cfg(not(target_arch = "wasm32"))]
fn permission_types() -> &'static [&'static str] {
    if spec_vocab::SPEC_PERMISSION_TYPES.is_empty() { COMPAT_PERMISSION_TYPES } else { spec_vocab::SPEC_PERMISSION_TYPES }
}

#[cfg(target_arch = "wasm32")]
fn permission_types() -> &'static [&'static str] { COMPAT_PERMISSION_TYPES }

#[cfg(not(target_arch = "wasm32"))]
fn permission_values() -> &'static [&'static str] {
    if spec_vocab::SPEC_PERMISSION_VALUES.is_empty() { COMPAT_PERMISSION_VALUES } else { spec_vocab::SPEC_PERMISSION_VALUES }
}

#[cfg(target_arch = "wasm32")]
fn permission_values() -> &'static [&'static str] { COMPAT_PERMISSION_VALUES }

#[derive(Clone, Debug)]
pub struct LintResult {
    pub path: PathBuf,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct DiagnosticCounts {
    pub errors: usize,
    pub warnings: usize,
}

#[derive(Clone, Debug)]
struct Scope {
    variables: HashMap<String, usize>,
    outputs: HashMap<String, usize>,
}

impl Scope {
    fn new() -> Self {
        Self {
            variables: HashMap::new(),
            outputs: HashMap::new(),
        }
    }
}

#[derive(Clone, Debug)]
struct AgentRecord {
    persistent: bool,
}

#[derive(Clone, Debug)]
struct AgentRef {
    name: String,
    line: usize,
    column: usize,
    kind: RefKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RefKind {
    Session,
    Resume,
}

#[derive(Clone, Debug)]
struct LogicalLine {
    line: usize,
    indent: usize,
    text: String,
}

#[derive(Clone, Debug)]
enum PendingLogical {
    String {
        start_line: usize,
        indent: usize,
        buffer: String,
        state: QuoteState,
    },
    Discretion {
        start_line: usize,
        indent: usize,
        buffer: String,
    },
    Container {
        start_line: usize,
        indent: usize,
        balance: isize,
        buffer: String,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum QuoteState {
    Single { escaped: bool },
    Triple,
}

#[derive(Clone, Debug)]
struct ScanOutcome {
    processed: String,
    state: Option<QuoteState>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BlockKind {
    Root,
    Agent,
    Session,
    Resume,
    Exec,
    Gate,
    Permissions,
    PropertyBag,
    Control,
    BlockDef,
    Object,
}

#[derive(Clone, Debug)]
struct BlockFrame {
    kind: BlockKind,
    indent: usize,
    line: usize,
    column: usize,
    name: Option<String>,
    creates_scope: bool,
    seen_properties: HashSet<String>,
    has_prompt: bool,
}

impl BlockFrame {
    fn new(kind: BlockKind, indent: usize, line: usize, column: usize) -> Self {
        let creates_scope = matches!(kind, BlockKind::Control | BlockKind::BlockDef);
        Self {
            kind,
            indent,
            line,
            column,
            name: None,
            creates_scope,
            seen_properties: HashSet::new(),
            has_prompt: false,
        }
    }
}

#[derive(Clone, Debug)]
struct ParseState {
    profile: LintProfile,
    diagnostics: Vec<Diagnostic>,
    blocks: Vec<BlockFrame>,
    scopes: Vec<Scope>,
    agents: HashMap<String, AgentRecord>,
    imports: HashSet<String>,
    inputs: HashMap<String, usize>,
    pending_refs: Vec<AgentRef>,
    saw_executable: bool,
}

impl ParseState {
    fn new(profile: LintProfile) -> Self {
        Self {
            profile,
            diagnostics: Vec::new(),
            blocks: vec![BlockFrame::new(BlockKind::Root, 0, 1, 1)],
            scopes: vec![Scope::new()],
            agents: HashMap::new(),
            imports: HashSet::new(),
            inputs: HashMap::new(),
            pending_refs: Vec::new(),
            saw_executable: false,
        }
    }

    fn push_block(&mut self, block: BlockFrame) {
        if block.creates_scope {
            self.scopes.push(Scope::new());
        }
        self.blocks.push(block);
    }

    fn pop_block(&mut self) {
        if let Some(block) = self.blocks.pop()
            && block.creates_scope
        {
            let _ = self.scopes.pop();
        }
    }

    fn current_scope_mut(&mut self) -> &mut Scope {
        self.scopes.last_mut().expect("scope stack is never empty")
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_paths(targets: &[PathBuf]) -> Result<Vec<LintResult>> {
    lint_paths_with_profile(targets, LintProfile::Compat)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_paths_with_profile(
    targets: &[PathBuf],
    profile: LintProfile,
) -> Result<Vec<LintResult>> {
    let files = collect_prose_files(targets)?;
    let mut results = Vec::with_capacity(files.len());

    for file in files {
        results.push(lint_path_with_profile(&file, profile)?);
    }

    Ok(results)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_path(path: &Path) -> Result<LintResult> {
    lint_path_with_profile(path, LintProfile::Compat)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_path_with_profile(path: &Path, profile: LintProfile) -> Result<LintResult> {
    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    Ok(lint_source_with_profile(path, &source, profile))
}

pub fn lint_source(path: &Path, source: &str) -> LintResult {
    lint_source_with_profile(path, source, LintProfile::Compat)
}

pub fn lint_source_with_profile(path: &Path, source: &str, profile: LintProfile) -> LintResult {
    let (lines, mut diagnostics) = logical_lines(path, source);
    let mut state = ParseState::new(profile);
    state.diagnostics.append(&mut diagnostics);

    for line in lines {
        parse_logical_line(path, &mut state, line);
    }

    for block in &state.blocks {
        if block.kind == BlockKind::Gate && !block.has_prompt {
            push_diag(
                &mut state.diagnostics,
                path,
                "OPE002",
                Severity::Error,
                "Gate missing prompt",
                block.line,
                block.column,
            );
        }
    }

    for pending in &state.pending_refs {
        let Some(agent) = state.agents.get(&pending.name) else {
            push_diag(
                &mut state.diagnostics,
                path,
                "E007",
                Severity::Error,
                "Undefined agent reference",
                pending.line,
                pending.column,
            );
            continue;
        };

        if pending.kind == RefKind::Resume && !agent.persistent {
            push_diag(
                &mut state.diagnostics,
                path,
                "E017",
                Severity::Error,
                "`resume:` requires persistent agent",
                pending.line,
                pending.column,
            );
        }
    }

    state.diagnostics.sort_by(|left, right| {
        (
            left.path.clone(),
            left.line,
            left.column,
            left.severity,
            left.code,
            left.message.clone(),
        )
            .cmp(&(
                right.path.clone(),
                right.line,
                right.column,
                right.severity,
                right.code,
                right.message.clone(),
            ))
    });

    LintResult {
        path: path.to_path_buf(),
        diagnostics: state.diagnostics,
    }
}

pub fn count_diagnostics(results: &[LintResult]) -> DiagnosticCounts {
    let mut counts = DiagnosticCounts::default();

    for result in results {
        for diagnostic in &result.diagnostics {
            match diagnostic.severity {
                Severity::Error => counts.errors += 1,
                Severity::Warning => counts.warnings += 1,
            }
        }
    }

    counts
}

fn logical_lines(path: &Path, source: &str) -> (Vec<LogicalLine>, Vec<Diagnostic>) {
    let mut lines = Vec::new();
    let mut diagnostics = Vec::new();
    let mut pending: Option<PendingLogical> = None;

    for (idx, raw_line) in source.lines().enumerate() {
        let line_number = idx + 1;
        let indent = count_leading_spaces(raw_line);

        if raw_line.starts_with('\t') {
            diagnostics.push(Diagnostic::new(
                path,
                "OPE001",
                Severity::Error,
                "Tabs used for indentation",
                line_number,
                1,
            ));
        }

        match &mut pending {
            Some(PendingLogical::String {
                start_line,
                indent: start_indent,
                buffer,
                state,
            }) => {
                let outcome = scan_line(raw_line, Some(*state));
                buffer.push('\n');
                buffer.push_str(&outcome.processed);
                if let Some(next_state) = outcome.state {
                    *state = next_state;
                } else {
                    let text = trim_first_line_indent(buffer, *start_indent);
                    lines.push(LogicalLine {
                        line: *start_line,
                        indent: *start_indent,
                        text,
                    });
                    pending = None;
                }
                continue;
            }
            Some(PendingLogical::Discretion {
                start_line,
                indent: start_indent,
                buffer,
            }) => {
                let processed = scan_line(raw_line, None).processed;
                let trimmed = processed.trim();
                buffer.push('\n');
                buffer.push_str(trimmed);
                if trimmed == "***:" {
                    lines.push(LogicalLine {
                        line: *start_line,
                        indent: *start_indent,
                        text: buffer.clone(),
                    });
                    pending = None;
                }
                continue;
            }
            Some(PendingLogical::Container {
                start_line,
                indent: start_indent,
                balance,
                buffer,
            }) => {
                let processed = scan_line(raw_line, None).processed;
                let trimmed = processed.trim();
                buffer.push('\n');
                buffer.push_str(trimmed);
                *balance += delimiter_balance(trimmed);
                if *balance <= 0 {
                    lines.push(LogicalLine {
                        line: *start_line,
                        indent: *start_indent,
                        text: buffer.clone(),
                    });
                    pending = None;
                }
                continue;
            }
            None => {}
        }

        let outcome = scan_line(raw_line, None);
        let processed = outcome.processed;
        let content = trim_first_line_indent(&processed, indent);

        if content.trim().is_empty() && outcome.state.is_none() {
            continue;
        }

        if let Some(state) = outcome.state {
            pending = Some(PendingLogical::String {
                start_line: line_number,
                indent,
                buffer: processed,
                state,
            });
            continue;
        }

        let trimmed = content.trim();
        if starts_multiline_discretion(trimmed) {
            pending = Some(PendingLogical::Discretion {
                start_line: line_number,
                indent,
                buffer: trimmed.to_string(),
            });
            continue;
        }

        let balance = delimiter_balance(trimmed);
        if balance > 0 && !is_object_block_start(trimmed) {
            pending = Some(PendingLogical::Container {
                start_line: line_number,
                indent,
                balance,
                buffer: trimmed.to_string(),
            });
            continue;
        }

        if !trimmed.is_empty() {
            lines.push(LogicalLine {
                line: line_number,
                indent,
                text: content,
            });
        }
    }

    match pending {
        Some(PendingLogical::String { start_line, .. }) => diagnostics.push(Diagnostic::new(
            path,
            "E001",
            Severity::Error,
            "Unterminated string literal",
            start_line,
            1,
        )),
        Some(PendingLogical::Discretion { start_line, .. }) => diagnostics.push(Diagnostic::new(
            path,
            "E005",
            Severity::Error,
            "Invalid syntax: unterminated multi-line discretion block",
            start_line,
            1,
        )),
        Some(PendingLogical::Container { start_line, .. }) => diagnostics.push(Diagnostic::new(
            path,
            "E005",
            Severity::Error,
            "Invalid syntax: unterminated container expression",
            start_line,
            1,
        )),
        None => {}
    }

    (lines, diagnostics)
}

fn parse_logical_line(path: &Path, state: &mut ParseState, line: LogicalLine) {
    let trimmed = line.text.trim();
    if trimmed.is_empty() {
        return;
    }

    if let Some(top) = state.blocks.last()
        && top.kind == BlockKind::Object
        && trimmed == "}"
        && line.indent <= top.indent
    {
        state.pop_block();
        return;
    }

    while state.blocks.len() > 1 {
        let should_pop = {
            let top = state.blocks.last().expect("non-empty block stack");
            line.indent <= top.indent
        };
        if !should_pop {
            break;
        }
        state.pop_block();
    }

    if let Some(top) = state.blocks.last()
        && top.kind == BlockKind::Object
    {
        return;
    }

    let current_kind = state
        .blocks
        .last()
        .map(|block| block.kind)
        .unwrap_or(BlockKind::Root);
    if line.indent > state.blocks.last().map(|block| block.indent).unwrap_or(0)
        && matches!(
            current_kind,
            BlockKind::Agent
                | BlockKind::Session
                | BlockKind::Resume
                | BlockKind::Exec
                | BlockKind::Gate
                | BlockKind::Permissions
                | BlockKind::PropertyBag
        )
        && parse_property_line(path, state, &line, current_kind)
    {
        return;
    }

    if parse_statement_line(path, state, &line) {
        return;
    }

    push_diag(
        &mut state.diagnostics,
        path,
        "E004",
        Severity::Error,
        "Unexpected token",
        line.line,
        line.indent + 1,
    );
}

fn parse_property_line(
    path: &Path,
    state: &mut ParseState,
    line: &LogicalLine,
    current_kind: BlockKind,
) -> bool {
    let trimmed = line.text.trim();
    let Some((property, value)) = split_once_colon(trimmed) else {
        return false;
    };
    let property = property.trim();
    let value = value.trim();

    if current_kind == BlockKind::Permissions {
        validate_permission(
            path,
            &mut state.diagnostics,
            state.profile,
            line.line,
            property,
            value,
        );
        return true;
    }

    if current_kind == BlockKind::PropertyBag {
        return true;
    }

    let top = state.blocks.last_mut().expect("block stack is never empty");
    if !top.seen_properties.insert(property.to_string()) {
        push_diag(
            &mut state.diagnostics,
            path,
            "E009",
            Severity::Error,
            "Duplicate property",
            line.line,
            line.indent + 1,
        );
    }

    let allowed = allowed_properties(current_kind);
    if !allowed.contains(&property) {
        push_diag(
            &mut state.diagnostics,
            path,
            "W005",
            Severity::Warning,
            "Unknown property name",
            line.line,
            line.indent + 1,
        );
    }

    match property {
        "prompt" => {
            top.has_prompt = true;
            validate_prompt_like(
                path,
                &mut state.diagnostics,
                line.line,
                line.indent + 1,
                value,
                true,
            );
        }
        "model" => {
            if !known_models().contains(&value) {
                push_diag(
                    &mut state.diagnostics,
                    path,
                    "E008",
                    Severity::Error,
                    "Invalid model value",
                    line.line,
                    line.indent + 1,
                );
            }
        }
        "persist" => {
            if current_kind == BlockKind::Agent
                && let Some(name) = &top.name
                && let Some(agent) = state.agents.get_mut(name)
            {
                agent.persistent = !value.is_empty();
            }
        }
        "skills" => validate_skills(
            path,
            &mut state.diagnostics,
            line.line,
            line.indent + 1,
            value,
        ),
        "context" => {
            if value.is_empty() {
                let block = BlockFrame::new(
                    BlockKind::PropertyBag,
                    line.indent,
                    line.line,
                    line.indent + 1,
                );
                state.push_block(block);
            }
        }
        "permissions" => {
            if !value.is_empty() {
                push_diag(
                    &mut state.diagnostics,
                    path,
                    "E015",
                    Severity::Error,
                    "Permissions must be a block",
                    line.line,
                    line.indent + 1,
                );
            } else {
                let block = BlockFrame::new(
                    BlockKind::Permissions,
                    line.indent,
                    line.line,
                    line.indent + 1,
                );
                state.push_block(block);
            }
        }
        "allow" => {
            if !looks_like_string_array(value) {
                push_diag(
                    &mut state.diagnostics,
                    path,
                    "E005",
                    Severity::Error,
                    "Invalid syntax",
                    line.line,
                    line.indent + 1,
                );
            }
        }
        _ => {}
    }

    true
}

fn parse_statement_line(path: &Path, state: &mut ParseState, line: &LogicalLine) -> bool {
    let trimmed = line.text.trim();

    if let Some(rest) = trimmed.strip_prefix("-> ") {
        return parse_arrow_target(path, state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("use ") {
        return parse_use(path, state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("import ") {
        return parse_import(path, state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("input ") {
        return parse_input(path, state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("output ") {
        return parse_output(path, state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("agent ") {
        return parse_agent(path, state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("block ") {
        return parse_block_def(state, line, rest.trim());
    }

    if let Some(rest) = trimmed.strip_prefix("gate ") {
        return parse_gate(state, line, rest.trim());
    }

    if trimmed.starts_with("session:") {
        state.saw_executable = true;
        parse_session_agent(
            path,
            state,
            line,
            trimmed.trim_start_matches("session:").trim(),
            false,
        );
        return true;
    }

    if let Some(rest) = trimmed.strip_prefix("session ") {
        state.saw_executable = true;
        return parse_session_stmt(path, state, line, rest.trim());
    }

    if trimmed.starts_with("resume:") {
        state.saw_executable = true;
        parse_resume(
            path,
            state,
            line,
            trimmed.trim_start_matches("resume:").trim(),
        );
        return true;
    }

    if let Some(rest) = trimmed.strip_prefix("exec ") {
        state.saw_executable = true;
        parse_exec(path, state, line, rest.trim(), false);
        return true;
    }

    if let Some(rest) = trimmed.strip_prefix("let ") {
        state.saw_executable = true;
        return parse_binding(path, state, line, rest.trim(), BindingKind::Let);
    }

    if let Some(rest) = trimmed.strip_prefix("const ") {
        state.saw_executable = true;
        return parse_binding(path, state, line, rest.trim(), BindingKind::Const);
    }

    if trimmed.starts_with("parallel ")
        || trimmed == "parallel:"
        || trimmed.starts_with("parallel:")
    {
        state.saw_executable = true;
        let block = BlockFrame::new(BlockKind::Control, line.indent, line.line, line.indent + 1);
        state.push_block(block);
        return true;
    }

    if trimmed.starts_with("repeat ")
        || trimmed.starts_with("for ")
        || trimmed.starts_with("try:")
        || trimmed.starts_with("catch")
        || trimmed.starts_with("finally:")
        || trimmed.starts_with("choice ")
        || trimmed.starts_with("if ")
        || trimmed.starts_with("elif ")
        || trimmed == "else:"
        || trimmed.starts_with("option ")
        || trimmed == "do:"
        || trimmed.starts_with("parallel for ")
    {
        state.saw_executable = true;
        validate_control_line(path, &mut state.diagnostics, line);
        let block = BlockFrame::new(BlockKind::Control, line.indent, line.line, line.indent + 1);
        state.push_block(block);
        return true;
    }

    if trimmed.starts_with("loop") {
        state.saw_executable = true;
        validate_loop_line(path, &mut state.diagnostics, line);
        let block = BlockFrame::new(BlockKind::Control, line.indent, line.line, line.indent + 1);
        state.push_block(block);
        return true;
    }

    if trimmed.starts_with("do ") || trimmed.starts_with("throw") {
        state.saw_executable = true;
        return true;
    }

    if is_pipeline_line(trimmed) {
        state.saw_executable = true;
        if trimmed.ends_with(':') && !has_inline_after_colon(trimmed) {
            let block =
                BlockFrame::new(BlockKind::Control, line.indent, line.line, line.indent + 1);
            state.push_block(block);
        }
        return true;
    }

    if let Some((name, expr)) = split_assignment(trimmed) {
        state.saw_executable = true;
        let _ = name;
        parse_expression(path, state, line, expr.trim());
        return true;
    }

    if parse_identifier(trimmed)
        .map(|(_, tail)| tail.trim().is_empty() || tail.trim_start().starts_with('('))
        .unwrap_or(false)
    {
        state.saw_executable = true;
        return true;
    }

    false
}

fn parse_arrow_target(
    path: &Path,
    state: &mut ParseState,
    line: &LogicalLine,
    target: &str,
) -> bool {
    if target.starts_with("session:") {
        parse_session_agent(
            path,
            state,
            line,
            target.trim_start_matches("session:").trim(),
            false,
        );
        return true;
    }
    if let Some(rest) = target.strip_prefix("session ") {
        return parse_session_stmt(path, state, line, rest.trim());
    }
    if target.starts_with("resume:") {
        parse_resume(
            path,
            state,
            line,
            target.trim_start_matches("resume:").trim(),
        );
        return true;
    }
    if let Some(rest) = target.strip_prefix("exec ") {
        parse_exec(path, state, line, rest.trim(), false);
        return true;
    }
    true
}

fn parse_use(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    if let Some(parsed) = parse_string_literal(rest) {
        let literal = parsed.content;
        let tail = parsed.rest;
        let import_key = literal.trim().to_string();
        if import_key.is_empty() {
            push_diag(
                &mut state.diagnostics,
                path,
                "E011",
                Severity::Error,
                "Empty use path",
                line.line,
                line.indent + 1,
            );
        } else if !state.imports.insert(import_key) {
            push_diag(
                &mut state.diagnostics,
                path,
                "E010",
                Severity::Error,
                "Duplicate use statement",
                line.line,
                line.indent + 1,
            );
        }

        if let Some(alias_tail) = tail.trim().strip_prefix("as ")
            && parse_identifier(alias_tail).is_none()
        {
            push_diag(
                &mut state.diagnostics,
                path,
                "E012",
                Severity::Error,
                "Invalid use path format",
                line.line,
                line.indent + 1,
            );
        }
        return true;
    }

    push_diag(
        &mut state.diagnostics,
        path,
        "E011",
        Severity::Error,
        "Empty use path",
        line.line,
        line.indent + 1,
    );
    true
}

fn parse_import(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    push_diag(
        &mut state.diagnostics,
        path,
        "OPW003",
        compatibility_severity(state.profile),
        "Legacy import syntax accepted; prefer use \"path\" as alias",
        line.line,
        line.indent + 1,
    );

    let Some(parsed) = parse_string_literal(rest) else {
        return true;
    };
    let name = parsed.content;
    let tail = parsed.rest;
    if !tail.trim().starts_with("from ") {
        push_diag(
            &mut state.diagnostics,
            path,
            "W006",
            Severity::Warning,
            "Unknown import source format",
            line.line,
            line.indent + 1,
        );
        return true;
    }

    let source = tail.trim().trim_start_matches("from ").trim();
    if let Some(origin) = parse_string_literal(source) {
        let key = format!("{}::{}", name.trim(), origin.content.trim());
        state.imports.insert(key);
    }
    true
}

fn parse_input(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    let Some((name, tail)) = parse_identifier(rest) else {
        push_diag(
            &mut state.diagnostics,
            path,
            "E020",
            Severity::Error,
            "Empty input name",
            line.line,
            line.indent + 1,
        );
        return true;
    };

    if !tail.trim_start().starts_with(':') {
        push_diag(
            &mut state.diagnostics,
            path,
            "E005",
            Severity::Error,
            "Invalid syntax",
            line.line,
            line.indent + 1,
        );
        return true;
    }

    if state.saw_executable {
        push_diag(
            &mut state.diagnostics,
            path,
            "OPW007",
            compatibility_severity(state.profile),
            "Input declaration after executable statement; spec currently treats this as invalid",
            line.line,
            line.indent + 1,
        );
    }

    if state.inputs.insert(name.to_string(), line.line).is_some() {
        push_diag(
            &mut state.diagnostics,
            path,
            "E021",
            Severity::Error,
            "Duplicate input declaration",
            line.line,
            line.indent + 1,
        );
    }

    let value = tail.trim_start().trim_start_matches(':').trim();
    validate_prompt_like(
        path,
        &mut state.diagnostics,
        line.line,
        line.indent + 1,
        value,
        false,
    );
    true
}

fn parse_output(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    if rest.trim().is_empty() {
        push_diag(
            &mut state.diagnostics,
            path,
            "E023",
            Severity::Error,
            "Empty output name",
            line.line,
            line.indent + 1,
        );
        return true;
    }

    if let Some((name, tail)) = parse_identifier(rest)
        && let Some(expr) = tail.trim_start().strip_prefix('=')
    {
        let scope = state.current_scope_mut();
        if scope.outputs.insert(name.to_string(), line.line).is_some() {
            push_diag(
                &mut state.diagnostics,
                path,
                "E024",
                Severity::Error,
                "Duplicate output declaration",
                line.line,
                line.indent + 1,
            );
        }

        parse_expression(path, state, line, expr.trim());
        return true;
    }

    parse_expression(path, state, line, rest.trim());
    true
}

fn parse_agent(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    let Some((name, tail)) = parse_identifier(rest) else {
        return false;
    };
    if tail.trim() != ":" {
        return false;
    }

    if state.agents.contains_key(name) {
        push_diag(
            &mut state.diagnostics,
            path,
            "E006",
            Severity::Error,
            "Duplicate agent definition",
            line.line,
            line.indent + 1,
        );
    } else {
        state
            .agents
            .insert(name.to_string(), AgentRecord { persistent: false });
    }

    let mut block = BlockFrame::new(BlockKind::Agent, line.indent, line.line, line.indent + 1);
    block.name = Some(name.to_string());
    state.push_block(block);
    true
}

fn parse_block_def(state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    let Some((name, tail)) = parse_identifier(rest) else {
        return false;
    };
    let tail = tail.trim();
    if !(tail == ":" || (tail.starts_with('(') && tail.ends_with(':'))) {
        return false;
    }
    let mut block = BlockFrame::new(BlockKind::BlockDef, line.indent, line.line, line.indent + 1);
    block.name = Some(name.to_string());
    state.push_block(block);
    true
}

fn parse_gate(state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    let Some((name, tail)) = parse_identifier(rest) else {
        return false;
    };
    if tail.trim() != ":" {
        return false;
    }
    let mut block = BlockFrame::new(BlockKind::Gate, line.indent, line.line, line.indent + 1);
    block.name = Some(name.to_string());
    state.push_block(block);
    true
}

fn parse_session_stmt(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) -> bool {
    if let Some(prompt) = parse_string_literal(rest) {
        validate_prompt_content(
            path,
            &mut state.diagnostics,
            line.line,
            line.indent + 1,
            &prompt.content,
            true,
        );
        let block = BlockFrame::new(BlockKind::Session, line.indent, line.line, line.indent + 1);
        state.push_block(block);
        return true;
    }

    if let Some((label, tail)) = parse_identifier(rest) {
        let tail = tail.trim_start();
        if tail == ":" {
            push_diag(
                &mut state.diagnostics,
                path,
                "OPW005",
                compatibility_severity(state.profile),
                "Legacy session block syntax accepted",
                line.line,
                line.indent + 1,
            );
            let mut block =
                BlockFrame::new(BlockKind::Session, line.indent, line.line, line.indent + 1);
            block.name = Some(label.to_string());
            state.push_block(block);
            return true;
        }
        if let Some(agent_name) = tail.strip_prefix(':').map(str::trim)
            && let Some((agent, _)) = parse_identifier(agent_name)
        {
            push_diag(
                &mut state.diagnostics,
                path,
                "OPW004",
                compatibility_severity(state.profile),
                "Legacy labeled session syntax accepted",
                line.line,
                line.indent + 1,
            );
            state.pending_refs.push(AgentRef {
                name: agent.to_string(),
                line: line.line,
                column: line.indent + 1,
                kind: RefKind::Session,
            });
            let mut block =
                BlockFrame::new(BlockKind::Session, line.indent, line.line, line.indent + 1);
            block.name = Some(label.to_string());
            state.push_block(block);
            return true;
        }
    }

    push_diag(
        &mut state.diagnostics,
        path,
        "E003",
        Severity::Error,
        "Session missing prompt or agent",
        line.line,
        line.indent + 1,
    );
    true
}

fn parse_session_agent(
    path: &Path,
    state: &mut ParseState,
    line: &LogicalLine,
    rest: &str,
    output_like: bool,
) {
    if let Some((agent, _tail)) = parse_identifier(rest) {
        state.pending_refs.push(AgentRef {
            name: agent.to_string(),
            line: line.line,
            column: line.indent + 1,
            kind: RefKind::Session,
        });
        let block = BlockFrame::new(BlockKind::Session, line.indent, line.line, line.indent + 1);
        state.push_block(block);
    } else if !output_like {
        push_diag(
            &mut state.diagnostics,
            path,
            "E003",
            Severity::Error,
            "Session missing prompt or agent",
            line.line,
            line.indent + 1,
        );
    }
}

fn parse_resume(path: &Path, state: &mut ParseState, line: &LogicalLine, rest: &str) {
    if let Some((agent, _tail)) = parse_identifier(rest) {
        state.pending_refs.push(AgentRef {
            name: agent.to_string(),
            line: line.line,
            column: line.indent + 1,
            kind: RefKind::Resume,
        });
        let block = BlockFrame::new(BlockKind::Resume, line.indent, line.line, line.indent + 1);
        state.push_block(block);
    } else {
        push_diag(
            &mut state.diagnostics,
            path,
            "E007",
            Severity::Error,
            "Undefined agent reference",
            line.line,
            line.indent + 1,
        );
    }
}

fn parse_exec(
    path: &Path,
    state: &mut ParseState,
    line: &LogicalLine,
    rest: &str,
    _output_like: bool,
) {
    validate_prompt_like(
        path,
        &mut state.diagnostics,
        line.line,
        line.indent + 1,
        rest,
        false,
    );
    let block = BlockFrame::new(BlockKind::Exec, line.indent, line.line, line.indent + 1);
    state.push_block(block);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BindingKind {
    Let,
    Const,
}

fn parse_binding(
    path: &Path,
    state: &mut ParseState,
    line: &LogicalLine,
    rest: &str,
    _kind: BindingKind,
) -> bool {
    if rest.starts_with('{') {
        return true;
    }

    let Some((name, tail)) = parse_identifier(rest) else {
        return false;
    };
    let Some(expr) = tail.trim_start().strip_prefix('=') else {
        return false;
    };

    register_variable(path, state, line, name);
    parse_expression(path, state, line, expr.trim());
    true
}

fn parse_expression(path: &Path, state: &mut ParseState, line: &LogicalLine, expr: &str) {
    if expr == "{" {
        let block = BlockFrame::new(BlockKind::Object, line.indent, line.line, line.indent + 1);
        state.push_block(block);
        return;
    }

    if is_pipeline_line(expr) {
        if expr.ends_with(':') && !has_inline_after_colon(expr) {
            let block =
                BlockFrame::new(BlockKind::Control, line.indent, line.line, line.indent + 1);
            state.push_block(block);
        }
        return;
    }

    if expr.starts_with("session:") {
        parse_session_agent(
            path,
            state,
            line,
            expr.trim_start_matches("session:").trim(),
            true,
        );
        return;
    }

    if let Some(rest) = expr.strip_prefix("session ") {
        let _ = parse_session_stmt(path, state, line, rest.trim());
        return;
    }

    if expr.starts_with("resume:") {
        parse_resume(path, state, line, expr.trim_start_matches("resume:").trim());
        return;
    }

    if let Some(rest) = expr.strip_prefix("exec ") {
        parse_exec(path, state, line, rest.trim(), true);
        return;
    }

    if expr.starts_with("do ") {}
}

fn register_variable(path: &Path, state: &mut ParseState, line: &LogicalLine, name: &str) {
    let scope = state.current_scope_mut();
    if scope
        .variables
        .insert(name.to_string(), line.line)
        .is_some()
    {
        push_diag(
            &mut state.diagnostics,
            path,
            "E019",
            Severity::Error,
            "Duplicate variable name",
            line.line,
            line.indent + 1,
        );
    }
}

fn validate_permission(
    path: &Path,
    diagnostics: &mut Vec<Diagnostic>,
    profile: LintProfile,
    line: usize,
    property: &str,
    value: &str,
) {
    if !permission_types().contains(&property) {
        push_diag(
            diagnostics,
            path,
            "W008",
            compatibility_severity(profile),
            "Unknown permission type",
            line,
            1,
        );
    }

    if permission_values().contains(&value) {
        return;
    }

    if looks_like_value_array(value) {
        return;
    }

    // Bare identifier that isn't a known permission value
    if parse_identifier(value).map(|(_, tail)| tail.trim().is_empty()).unwrap_or(false) {
        push_diag(
            diagnostics,
            path,
            "W009",
            Severity::Warning,
            "Unknown permission value",
            line,
            1,
        );
        return;
    }

    push_diag(
        diagnostics,
        path,
        "E016",
        Severity::Error,
        "Permission pattern must be a string or identifier",
        line,
        1,
    );
}

fn validate_skills(
    path: &Path,
    diagnostics: &mut Vec<Diagnostic>,
    line: usize,
    column: usize,
    value: &str,
) {
    if !value.starts_with('[') || !value.ends_with(']') {
        push_diag(
            diagnostics,
            path,
            "E013",
            Severity::Error,
            "Skills must be an array",
            line,
            column,
        );
        return;
    }

    let inner = &value[1..value.len() - 1];
    if inner.trim().is_empty() {
        push_diag(
            diagnostics,
            path,
            "W010",
            Severity::Warning,
            "Empty skills array",
            line,
            column,
        );
        return;
    }

    for item in split_csv_like(inner) {
        let trimmed = item.trim();
        if parse_string_literal(trimmed).is_none() {
            push_diag(
                diagnostics,
                path,
                "E014",
                Severity::Error,
                "Skill name must be a string",
                line,
                column,
            );
            return;
        }
    }
}

fn validate_string_escapes(
    path: &Path,
    diagnostics: &mut Vec<Diagnostic>,
    line: usize,
    column: usize,
    source: &str,
) {
    let mut escaped = false;
    for ch in source.chars() {
        if escaped {
            match ch {
                '\\' | '"' | 'n' | 't' | '{' | '}' => {}
                _ => {
                    push_diag(
                        diagnostics,
                        path,
                        "E002",
                        Severity::Error,
                        format!("Unknown escape sequence: \\{ch}"),
                        line,
                        column,
                    );
                }
            }
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
        }
    }
}

fn validate_prompt_like(
    path: &Path,
    diagnostics: &mut Vec<Diagnostic>,
    line: usize,
    column: usize,
    source: &str,
    session_prompt: bool,
) {
    if let Some(literal) = parse_string_literal(source.trim()) {
        validate_string_escapes(path, diagnostics, line, column, &literal.content);
        validate_prompt_content(
            path,
            diagnostics,
            line,
            column,
            &literal.content,
            session_prompt,
        );
        return;
    }

    if source.trim().is_empty() {
        let (code, message) = if session_prompt {
            ("W001", "Empty session prompt")
        } else {
            ("W004", "Empty prompt property")
        };
        push_diag(
            diagnostics,
            path,
            code,
            Severity::Warning,
            message,
            line,
            column,
        );
    }
}

fn validate_prompt_content(
    path: &Path,
    diagnostics: &mut Vec<Diagnostic>,
    line: usize,
    column: usize,
    content: &str,
    session_prompt: bool,
) {
    if content.is_empty() {
        let (code, message) = if session_prompt {
            ("W001", "Empty session prompt")
        } else {
            ("W004", "Empty prompt property")
        };
        push_diag(
            diagnostics,
            path,
            code,
            Severity::Warning,
            message,
            line,
            column,
        );
        return;
    }

    if content.trim().is_empty() {
        let (code, message) = if session_prompt {
            ("W002", "Whitespace-only session prompt")
        } else {
            ("W004", "Empty prompt property")
        };
        push_diag(
            diagnostics,
            path,
            code,
            Severity::Warning,
            message,
            line,
            column,
        );
    }

    if content.len() > 10_000 {
        push_diag(
            diagnostics,
            path,
            "W003",
            Severity::Warning,
            "Prompt exceeds 10,000 characters",
            line,
            column,
        );
    }
}

fn validate_loop_line(path: &Path, diagnostics: &mut Vec<Diagnostic>, line: &LogicalLine) {
    let trimmed = line.text.trim();
    if trimmed == "loop:" || trimmed.starts_with("loop:") {
        push_diag(
            diagnostics,
            path,
            "OPW001",
            Severity::Warning,
            "Unbounded loop without max iterations",
            line.line,
            line.indent + 1,
        );
    }

    if (trimmed.starts_with("loop until ") || trimmed.starts_with("loop while "))
        && let Some(condition) = extract_discretion_condition(trimmed)
        && condition.trim().len() < 10
    {
        push_diag(
            diagnostics,
            path,
            "OPW002",
            Severity::Warning,
            "Discretion condition may be ambiguous",
            line.line,
            line.indent + 1,
        );
    }

    if let Some(max_text) = extract_loop_max(trimmed)
        && max_text
            .parse::<usize>()
            .ok()
            .filter(|value| *value > 0)
            .is_none()
    {
        push_diag(
            diagnostics,
            path,
            "OPE003",
            Severity::Error,
            "Invalid loop max value",
            line.line,
            line.indent + 1,
        );
    }
}

fn validate_control_line(path: &Path, diagnostics: &mut Vec<Diagnostic>, line: &LogicalLine) {
    let trimmed = line.text.trim();
    if (trimmed.starts_with("if ")
        || trimmed.starts_with("elif ")
        || trimmed.starts_with("choice "))
        && let Some(condition) = extract_discretion_condition(trimmed)
        && condition.trim().len() < 10
    {
        push_diag(
            diagnostics,
            path,
            "OPW002",
            Severity::Warning,
            "Discretion condition may be ambiguous",
            line.line,
            line.indent + 1,
        );
    }
}

fn allowed_properties(kind: BlockKind) -> &'static [&'static str] {
    match kind {
        BlockKind::Agent => agent_properties(),
        BlockKind::Session | BlockKind::Resume => SESSION_PROPERTIES,
        BlockKind::Exec => EXEC_PROPERTIES,
        BlockKind::Gate => GATE_PROPERTIES,
        BlockKind::Permissions
        | BlockKind::PropertyBag
        | BlockKind::Control
        | BlockKind::BlockDef
        | BlockKind::Object
        | BlockKind::Root => &[],
    }
}

fn push_diag(
    diagnostics: &mut Vec<Diagnostic>,
    path: &Path,
    code: &'static str,
    severity: Severity,
    message: impl Into<String>,
    line: usize,
    column: usize,
) {
    diagnostics.push(Diagnostic::new(path, code, severity, message, line, column));
}

fn compatibility_severity(profile: LintProfile) -> Severity {
    match profile {
        LintProfile::Strict => Severity::Error,
        LintProfile::Compat => Severity::Warning,
    }
}

fn parse_identifier(input: &str) -> Option<(&str, &str)> {
    let mut chars = input.char_indices();
    let (_, first) = chars.next()?;
    if !(first.is_ascii_alphabetic() || first == '_') {
        return None;
    }

    let mut end = first.len_utf8();
    for (idx, ch) in chars {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            end = idx + ch.len_utf8();
        } else {
            break;
        }
    }
    Some((&input[..end], &input[end..]))
}

#[derive(Clone, Debug)]
struct ParsedString<'a> {
    content: String,
    rest: &'a str,
}

fn parse_string_literal(input: &str) -> Option<ParsedString<'_>> {
    if let Some(rest) = input.strip_prefix("\"\"\"") {
        let end = rest.find("\"\"\"")?;
        let content = rest[..end].to_string();
        let tail = &rest[end + 3..];
        return Some(ParsedString {
            content,
            rest: tail,
        });
    }

    let rest = input.strip_prefix('"')?;
    let mut escaped = false;
    for (idx, ch) in rest.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match ch {
            '\\' => escaped = true,
            '"' => {
                return Some(ParsedString {
                    content: rest[..idx].to_string(),
                    rest: &rest[idx + 1..],
                });
            }
            _ => {}
        }
    }

    None
}

fn split_assignment(input: &str) -> Option<(&str, &str)> {
    if input.starts_with("output ") || input.starts_with("let ") || input.starts_with("const ") {
        return None;
    }

    let (name, tail) = parse_identifier(input)?;
    let expr = tail.trim_start().strip_prefix('=')?;
    Some((name, expr))
}

fn split_once_colon(input: &str) -> Option<(&str, &str)> {
    let mut quote: Option<QuoteState> = None;
    let bytes = input.as_bytes();
    let mut idx = 0;

    while idx < bytes.len() {
        if let Some(state) = quote {
            match state {
                QuoteState::Triple => {
                    if input[idx..].starts_with("\"\"\"") {
                        quote = None;
                        idx += 3;
                    } else {
                        idx += 1;
                    }
                }
                QuoteState::Single { escaped } => {
                    let ch = input[idx..].chars().next().expect("valid char");
                    if escaped {
                        quote = Some(QuoteState::Single { escaped: false });
                    } else if ch == '\\' {
                        quote = Some(QuoteState::Single { escaped: true });
                    } else if ch == '"' {
                        quote = None;
                    }
                    idx += ch.len_utf8();
                }
            }
            continue;
        }

        if input[idx..].starts_with("\"\"\"") {
            quote = Some(QuoteState::Triple);
            idx += 3;
            continue;
        }

        let ch = input[idx..].chars().next().expect("valid char");
        if ch == '"' {
            quote = Some(QuoteState::Single { escaped: false });
            idx += ch.len_utf8();
            continue;
        }
        if ch == ':' {
            return Some((&input[..idx], &input[idx + 1..]));
        }
        idx += ch.len_utf8();
    }

    None
}

fn split_csv_like(input: &str) -> Vec<&str> {
    let mut values = Vec::new();
    let mut start = 0;
    let mut depth = 0usize;
    let mut idx = 0;
    let mut quote: Option<QuoteState> = None;

    while idx < input.len() {
        if let Some(state) = quote {
            match state {
                QuoteState::Triple => {
                    if input[idx..].starts_with("\"\"\"") {
                        quote = None;
                        idx += 3;
                    } else {
                        idx += 1;
                    }
                }
                QuoteState::Single { escaped } => {
                    let ch = input[idx..].chars().next().expect("valid char");
                    if escaped {
                        quote = Some(QuoteState::Single { escaped: false });
                    } else if ch == '\\' {
                        quote = Some(QuoteState::Single { escaped: true });
                    } else if ch == '"' {
                        quote = None;
                    }
                    idx += ch.len_utf8();
                }
            }
            continue;
        }

        if input[idx..].starts_with("\"\"\"") {
            quote = Some(QuoteState::Triple);
            idx += 3;
            continue;
        }
        let ch = input[idx..].chars().next().expect("valid char");
        match ch {
            '"' => quote = Some(QuoteState::Single { escaped: false }),
            '[' | '{' | '(' => depth += 1,
            ']' | '}' | ')' => depth = depth.saturating_sub(1),
            ',' if depth == 0 => {
                values.push(&input[start..idx]);
                start = idx + 1;
            }
            _ => {}
        }
        idx += ch.len_utf8();
    }
    values.push(&input[start..]);
    values
}

fn looks_like_string_array(value: &str) -> bool {
    if !value.starts_with('[') || !value.ends_with(']') {
        return false;
    }
    let inner = &value[1..value.len() - 1];
    if inner.trim().is_empty() {
        return true;
    }
    split_csv_like(inner)
        .into_iter()
        .all(|item| parse_string_literal(item.trim()).is_some())
}

fn looks_like_value_array(value: &str) -> bool {
    if !value.starts_with('[') || !value.ends_with(']') {
        return false;
    }
    let inner = &value[1..value.len() - 1];
    if inner.trim().is_empty() {
        return true;
    }
    split_csv_like(inner).into_iter().all(|item| {
        let trimmed = item.trim();
        parse_string_literal(trimmed).is_some()
            || parse_identifier(trimmed)
                .map(|(_, tail)| tail.trim().is_empty())
                .unwrap_or(false)
    })
}

fn extract_discretion_condition(input: &str) -> Option<String> {
    if let Some(start) = input.find("***") {
        let tail = &input[start + 3..];
        if let Some(end) = tail.rfind("***:") {
            return Some(tail[..end].replace('\n', " ").trim().to_string());
        }
    }

    let start = input.find("**")?;
    let tail = &input[start + 2..];
    let end = tail.find("**")?;
    Some(tail[..end].trim().to_string())
}

fn extract_loop_max(input: &str) -> Option<String> {
    let start = input.find("(max:")?;
    let tail = &input[start + 5..];
    let end = tail.find(')')?;
    Some(
        tail[..end]
            .trim()
            .trim_start_matches(':')
            .trim()
            .to_string(),
    )
}

fn is_pipeline_line(input: &str) -> bool {
    input.starts_with('|')
        || input.contains(" | map:")
        || input.contains(" | filter:")
        || input.contains(" | pmap:")
        || input.contains(" | reduce(")
}

fn is_object_block_start(input: &str) -> bool {
    input.starts_with("output ") && input.trim_end().ends_with('{')
}

fn delimiter_balance(input: &str) -> isize {
    let mut balance = 0isize;
    let mut idx = 0;
    let mut quote: Option<QuoteState> = None;

    while idx < input.len() {
        if let Some(state) = quote {
            match state {
                QuoteState::Triple => {
                    if input[idx..].starts_with("\"\"\"") {
                        idx += 3;
                        quote = None;
                    } else {
                        idx += input[idx..].chars().next().expect("valid char").len_utf8();
                    }
                }
                QuoteState::Single { escaped } => {
                    let ch = input[idx..].chars().next().expect("valid char");
                    idx += ch.len_utf8();
                    if escaped {
                        quote = Some(QuoteState::Single { escaped: false });
                    } else if ch == '\\' {
                        quote = Some(QuoteState::Single { escaped: true });
                    } else if ch == '"' {
                        quote = None;
                    }
                }
            }
            continue;
        }

        if input[idx..].starts_with("\"\"\"") {
            quote = Some(QuoteState::Triple);
            idx += 3;
            continue;
        }

        let ch = input[idx..].chars().next().expect("valid char");
        match ch {
            '"' => quote = Some(QuoteState::Single { escaped: false }),
            '[' | '(' => balance += 1,
            ']' | ')' => balance -= 1,
            _ => {}
        }
        idx += ch.len_utf8();
    }

    balance
}

fn has_inline_after_colon(input: &str) -> bool {
    let Some((_, tail)) = split_once_colon(input) else {
        return false;
    };
    !tail.trim().is_empty()
}

fn starts_multiline_discretion(input: &str) -> bool {
    (input.starts_with("if ***")
        || input.starts_with("elif ***")
        || input.starts_with("choice ***")
        || input.starts_with("loop until ***")
        || input.starts_with("loop while ***"))
        && !input.contains("***:")
}

fn count_leading_spaces(input: &str) -> usize {
    input.chars().take_while(|ch| *ch == ' ').count()
}

fn trim_first_line_indent(input: &str, indent: usize) -> String {
    let mut lines = input.lines();
    let first = lines.next().unwrap_or_default();
    let mut text = first.chars().skip(indent).collect::<String>();
    for line in lines {
        text.push('\n');
        text.push_str(line);
    }
    text.trim_end().to_string()
}

fn scan_line(input: &str, initial: Option<QuoteState>) -> ScanOutcome {
    let mut processed = String::new();
    let mut idx = 0;
    let mut state = initial;

    while idx < input.len() {
        if let Some(current) = state {
            match current {
                QuoteState::Triple => {
                    if input[idx..].starts_with("\"\"\"") {
                        processed.push_str("\"\"\"");
                        idx += 3;
                        state = None;
                    } else {
                        let ch = input[idx..].chars().next().expect("valid char");
                        processed.push(ch);
                        idx += ch.len_utf8();
                    }
                }
                QuoteState::Single { escaped } => {
                    let ch = input[idx..].chars().next().expect("valid char");
                    processed.push(ch);
                    idx += ch.len_utf8();
                    if escaped {
                        state = Some(QuoteState::Single { escaped: false });
                    } else if ch == '\\' {
                        state = Some(QuoteState::Single { escaped: true });
                    } else if ch == '"' {
                        state = None;
                    }
                }
            }
            continue;
        }

        if input[idx..].starts_with("\"\"\"") {
            processed.push_str("\"\"\"");
            idx += 3;
            state = Some(QuoteState::Triple);
            continue;
        }

        let ch = input[idx..].chars().next().expect("valid char");
        if ch == '"' {
            processed.push(ch);
            idx += ch.len_utf8();
            state = Some(QuoteState::Single { escaped: false });
            continue;
        }

        if ch == '#' {
            break;
        }

        processed.push(ch);
        idx += ch.len_utf8();
    }

    ScanOutcome { processed, state }
}

#[cfg(test)]
mod tests {
    use super::{count_diagnostics, lint_paths, lint_source, lint_source_with_profile};
    use crate::profile::LintProfile;
    use std::collections::BTreeMap;
    use std::path::{Path, PathBuf};

    /// Resolve the examples directory relative to this crate's position
    /// in the prose repo: tools/lint/ → skills/open-prose/examples
    fn examples_dir() -> PathBuf {
        Path::new("../../skills/open-prose/examples").to_path_buf()
    }

    #[test]
    fn valid_fixture_has_no_errors() {
        let source = std::fs::read_to_string("fixtures/valid/basic.prose").unwrap();
        let result = lint_source(Path::new("fixtures/valid/basic.prose"), &source);
        assert!(
            result
                .diagnostics
                .iter()
                .all(|diagnostic| diagnostic.severity != crate::diag::Severity::Error)
        );
    }

    #[test]
    fn invalid_fixture_reports_errors() {
        let source = std::fs::read_to_string("fixtures/invalid/mixed.prose").unwrap();
        let result = lint_source(Path::new("fixtures/invalid/mixed.prose"), &source);
        let codes = result
            .diagnostics
            .iter()
            .map(|diagnostic| diagnostic.code)
            .collect::<Vec<_>>();
        assert!(codes.contains(&"E008"));
        assert!(codes.contains(&"E009"));
        assert!(codes.contains(&"E015"));
    }

    #[test]
    fn legacy_import_is_error_in_strict_and_warning_in_compat() {
        let source = "import \"web-search\" from \"github:anthropic/skills\"\n";
        let strict = lint_source_with_profile(
            Path::new("test.prose"),
            source,
            LintProfile::Strict,
        );
        let compat = lint_source_with_profile(
            Path::new("test.prose"),
            source,
            LintProfile::Compat,
        );
        assert!(strict.diagnostics.iter().any(|d| d.code == "OPW003"
            && d.severity == crate::diag::Severity::Error));
        assert!(compat.diagnostics.iter().any(|d| d.code == "OPW003"
            && d.severity == crate::diag::Severity::Warning));
    }

    #[test]
    fn runtime_input_is_error_in_strict_and_warning_in_compat() {
        let source = "session \"Draft\"\n\ninput approval: \"Approve?\"\n";
        let strict = lint_source_with_profile(
            Path::new("test.prose"),
            source,
            LintProfile::Strict,
        );
        let compat = lint_source_with_profile(
            Path::new("test.prose"),
            source,
            LintProfile::Compat,
        );
        assert!(strict.diagnostics.iter().any(|d| d.code == "OPW007"
            && d.severity == crate::diag::Severity::Error));
        assert!(compat.diagnostics.iter().any(|d| d.code == "OPW007"
            && d.severity == crate::diag::Severity::Warning));
    }

    #[test]
    fn examples_lint_without_errors() {
        let examples = examples_dir();
        if !examples.exists() {
            eprintln!("Skipping: examples dir not found at {}", examples.display());
            return;
        }
        let results = lint_paths(&[examples.clone()]).unwrap();
        if results.is_empty() {
            // No .prose files found — examples may have been converted to .md
            eprintln!("Skipping: no .prose files found in {}", examples.display());
            return;
        }
        let counts = count_diagnostics(&results);
        assert_eq!(
            counts.errors,
            0,
            "unexpected errors: {:?}",
            summarize_errors(&results)
        );
    }

    fn summarize_errors(results: &[crate::lint_legacy::LintResult]) -> BTreeMap<String, usize> {
        let mut counts = BTreeMap::new();
        for result in results {
            for diagnostic in &result.diagnostics {
                if diagnostic.severity == crate::diag::Severity::Error {
                    *counts.entry(diagnostic.code.to_string()).or_insert(0) += 1;
                }
            }
        }
        counts
    }
}
