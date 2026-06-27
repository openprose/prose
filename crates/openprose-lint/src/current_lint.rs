use crate::diag::{Diagnostic, Severity};
use crate::profile::LintProfile;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

#[cfg(not(target_arch = "wasm32"))]
use anyhow::{Context, Result};

// ── Current Lint Result ──────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct CurrentLintResult {
    pub path: PathBuf,
    pub diagnostics: Vec<Diagnostic>,
}

// ── Current Frontmatter ──────────────────────────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub struct Frontmatter {
    pub name: Option<String>,
    pub kind: Option<String>,
    pub version: Option<String>,
    pub id: Option<String>,
    pub subject: Option<String>,
    pub nodes: Vec<String>,
    pub role: Option<String>,
    pub api: Vec<String>,
    pub requires: Vec<String>,
    pub ensures: Vec<String>,
    pub environment: Vec<String>,
    pub description: Option<String>,
    pub persist: Option<String>,
    pub use_deps: Vec<String>, // use: imports (e.g. "std/delivery/human-gate")
    pub all_keys: HashMap<String, usize>, // key -> line number
}

// ── Current Contract Sections (Markdown body) ────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub(crate) struct ContractSections {
    pub(crate) requires: Vec<ContractItem>,
    pub(crate) context: Vec<ContractItem>,
    pub(crate) ensures: Vec<ContractItem>,
    pub(crate) maintains: Vec<ContractItem>,
    pub(crate) parameters: Vec<ContractItem>,
    pub(crate) returns: Vec<ContractItem>,
    pub(crate) errors: Vec<ContractItem>,
    pub(crate) invariants: Vec<ContractItem>,
    pub(crate) strategies: Vec<ContractItem>,
    pub(crate) environment: Vec<ContractItem>,
    pub(crate) fixtures: Vec<ContractItem>,
    pub(crate) expects: Vec<ContractItem>,
    pub(crate) expects_not: Vec<ContractItem>,
}

#[derive(Clone, Debug)]
pub(crate) struct ContractItem {
    pub(crate) text: String,
    pub(crate) line: usize,
}

// ── Heading classification ──────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum HeadingKind {
    /// Executable component: matches a node name, or kebab-case identifier
    Component,
    /// State schema: prefixed with &
    StateSchema,
    /// Documentation/structural heading
    Documentation,
}

#[derive(Clone, Debug)]
pub(crate) struct Heading {
    name: String,
    line: usize,
    kind: HeadingKind,
    has_code_block: bool,
    has_body_contract: bool,
    code_block_fields: HashSet<String>,
}

// ── Known vocabulary (from current OpenProse Contract Markdown) ─────────────
//
// Invariant: no openprose/prose commit should promote or retain official source
// vocabulary that the colocated linter treats as corpus drift.

const SPEC_FRONTMATTER_KEYS: &[&str] = &[
    "name",
    "kind",
    "version",
    "id",
    "subject",
    "tier",
    "contract_version",
    "description",
];

const LEGACY_FRONTMATTER_KEYS: &[&str] = &[
    "nodes",
    "services",
    "role",
    "api",
    "state",
    "shape",
    "requires",
    "ensures",
    "errors",
    "invariants",
    "strategies",
    "environment",
    "prohibited",
    "use",
];

const SPEC_KINDS: &[&str] = &["responsibility", "function", "gateway", "pattern", "test"];

const LEGACY_KINDS: &[&str] = &["program", "program-node", "service", "system"];

const SPEC_ROLES: &[&str] = &["orchestrator", "coordinator", "leaf"];

pub(crate) const KNOWN_CONTRACT_SECTIONS: &[&str] = &[
    "description",
    "goal",
    "requires",
    "context",
    "maintains",
    "parameters",
    "returns",
    "continuity",
    "ensures",
    "errors",
    "invariants",
    "strategies",
    "environment",
    "runtime",
    "skills",
    "tools",
    "shape",
    "execution",
    "fixtures",
    "expects",
    "expects not",
    "expects-not",
    "slots",
    "config",
    "delegation",
    "schedule",
    "receives",
    "emits",
    "payload",
];

// ── Extended vocabulary (observed in press corpus, not yet in spec) ──────────

const CORPUS_FRONTMATTER_KEYS: &[&str] = &[
    // Delegation & state (used by all program-node files)
    "delegates",
    "reads",
    "writes",
    "components",
    "slots",
    // Shape sub-keys used at top level
    "self",
    // Driver/profile keys
    "author",
    "tags",
    "models",
    "drivers",
    "persist",
    // Code block field keys sometimes in frontmatter
    "capability",
    "principles",
    "given",
    // Misc
    "related",
    "purpose",
    "glossary",
];

const CORPUS_KINDS: &[&str] = &["driver", "profile"];

// ── Rule codes ──────────────────────────────────────────────────────────────
//
// MDE001–MDE009: structural (frontmatter delimiters)
// MDE010–MDE019: required frontmatter fields
// MDE020–MDE029: body structure
// MDE030–MDE039: component validation
// MDE040–MDE049: cross-validation (single-file)
// MDE050–MDE059: cross-validation (multi-file)
//
// MDW001–MDW009: frontmatter vocabulary
// MDW010–MDW019: contract quality
// MDW020–MDW029: component quality
// MDW030–MDW039: cross-validation warnings

// ── Public API ──────────────────────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
pub fn current_lint_path(path: &Path) -> Result<CurrentLintResult> {
    current_lint_path_with_profile(path, LintProfile::Compat)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn current_lint_path_with_profile(
    path: &Path,
    profile: LintProfile,
) -> Result<CurrentLintResult> {
    let source =
        std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    Ok(current_lint_source_with_profile(path, &source, profile))
}

pub fn current_lint_source(path: &Path, source: &str) -> CurrentLintResult {
    current_lint_source_with_profile(path, source, LintProfile::Compat)
}

pub fn current_lint_source_with_profile(
    path: &Path,
    source: &str,
    profile: LintProfile,
) -> CurrentLintResult {
    current_lint_source_inner(path, source, profile, false)
}

fn current_lint_source_inner(
    path: &Path,
    source: &str,
    profile: LintProfile,
    multi_file: bool,
) -> CurrentLintResult {
    let mut diagnostics = Vec::new();

    let (frontmatter, body_start) = parse_frontmatter(path, source, &mut diagnostics);

    let body = if body_start < source.lines().count() {
        source
            .lines()
            .skip(body_start)
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };
    let has_file_title = has_file_title(&body);

    validate_frontmatter(
        path,
        &frontmatter,
        has_file_title,
        profile,
        &mut diagnostics,
    );

    let (headings, contract_sections) =
        parse_markdown_body(path, &body, body_start, &frontmatter, &mut diagnostics);

    validate_contracts(path, &frontmatter, &contract_sections, &mut diagnostics);
    validate_headings(path, &frontmatter, &headings, &mut diagnostics);
    cross_validate(path, &frontmatter, &headings, multi_file, &mut diagnostics);

    diagnostics.sort_by(|a, b| (a.line, a.column, &a.code).cmp(&(b.line, b.column, &b.code)));

    CurrentLintResult {
        path: path.to_path_buf(),
        diagnostics,
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn collect_current_files(targets: &[PathBuf]) -> Result<Vec<PathBuf>> {
    use walkdir::WalkDir;

    let mut files = Vec::new();
    for target in targets {
        if target.is_file() {
            if is_current_file(target) {
                files.push(
                    target
                        .canonicalize()
                        .with_context(|| format!("canonicalize {}", target.display()))?,
                );
            }
            continue;
        }
        if target.is_dir() {
            for entry in WalkDir::new(target)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
            {
                if is_current_file(entry.path()) {
                    files.push(
                        entry
                            .path()
                            .canonicalize()
                            .with_context(|| format!("canonicalize {}", entry.path().display()))?,
                    );
                }
            }
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn current_lint_paths_with_profile(
    targets: &[PathBuf],
    profile: LintProfile,
) -> Result<Vec<CurrentLintResult>> {
    let mut results = Vec::new();
    let mut handled_dirs: HashSet<PathBuf> = HashSet::new();

    for target in targets {
        if target.is_dir() {
            current_lint_dir_recursive(target, profile, &mut results, &mut handled_dirs)?;
        } else if target.is_file() && target.extension().and_then(|ext| ext.to_str()) == Some("md")
        {
            // Explicit Markdown file targets are authoritative: lint the named
            // file even when it is malformed enough that detection would skip
            // it during directory discovery.
            if is_current_file(target) {
                if let Some(parent) = target.parent() {
                    if is_program_dir(parent) && handled_dirs.insert(parent.to_path_buf()) {
                        results.extend(current_lint_program_dir(parent, profile)?);
                    } else if !handled_dirs.contains(parent) {
                        results.push(current_lint_path_with_profile(target, profile)?);
                    }
                } else {
                    results.push(current_lint_path_with_profile(target, profile)?);
                }
            } else {
                results.push(current_lint_path_with_profile(target, profile)?);
            }
        }
    }

    Ok(results)
}

/// Recursively discover program directories and standalone Markdown files.
#[cfg(not(target_arch = "wasm32"))]
fn current_lint_dir_recursive(
    dir: &Path,
    profile: LintProfile,
    results: &mut Vec<CurrentLintResult>,
    handled_dirs: &mut HashSet<PathBuf>,
) -> Result<()> {
    if is_program_dir(dir) {
        if handled_dirs.insert(dir.to_path_buf()) {
            results.extend(current_lint_program_dir(dir, profile)?);
        }
        return Ok(());
    }

    // Not a program dir — check subdirectories and standalone files
    let mut subdirs = Vec::new();
    let mut loose_files = Vec::new();

    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if path.is_dir()
            && !path
                .file_name()
                .map(|n| n.to_string_lossy().starts_with('.'))
                .unwrap_or(true)
        {
            subdirs.push(path);
        } else if path.is_file() && is_current_file(&path) {
            loose_files.push(path);
        }
    }

    // Recurse into subdirectories
    for subdir in subdirs {
        current_lint_dir_recursive(&subdir, profile, results, handled_dirs)?;
    }

    // Lint loose Markdown files in this directory (not part of any program dir)
    for file in loose_files {
        results.push(current_lint_path_with_profile(&file, profile)?);
    }

    Ok(())
}

/// Check if a directory is a multi-file Markdown program.
///
/// A collection directory like `examples/` may contain many standalone `kind: program`
/// files, so we only treat a directory as a single multi-file program when it has
/// exactly one program root file.
#[cfg(not(target_arch = "wasm32"))]
fn is_program_dir(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };

    let mut root_files = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path)
            && looks_like_current(&content)
            && (content.contains("\nkind: program\n")
                || content.contains("\nkind: program\r")
                || content.starts_with("---\nkind: program\n"))
        {
            root_files += 1;
            if root_files > 1 {
                return false;
            }
        }
    }

    root_files == 1
}

// ── Detection ───────────────────────────────────────────────────────────────

pub fn is_current_file(path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str());
    if ext != Some("md") {
        return false;
    }
    if let Ok(content) = std::fs::read_to_string(path) {
        return looks_like_current(&content);
    }
    false
}

pub fn looks_like_current(source: &str) -> bool {
    if !source.starts_with("---") {
        return false;
    }
    if let Some(end) = source[3..].find("\n---") {
        let frontmatter = &source[3..3 + end];
        frontmatter
            .lines()
            .any(|line| line.trim().starts_with("kind:"))
    } else {
        false
    }
}

pub fn should_lint_as_current(path: &Path, source: &str) -> bool {
    path.extension().and_then(|e| e.to_str()) == Some("md") || looks_like_current(source)
}

// ── Frontmatter Parsing ─────────────────────────────────────────────────────

pub(crate) fn parse_frontmatter(
    path: &Path,
    source: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Frontmatter, usize) {
    let mut fm = Frontmatter::default();

    if !source.starts_with("---") {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE001",
            Severity::Error,
            "Missing YAML frontmatter (file must start with ---)",
            1,
            1,
        ));
        return (fm, 0);
    }

    let after_open = &source[3..];
    let Some(end_pos) = after_open.find("\n---") else {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE002",
            Severity::Error,
            "Unterminated YAML frontmatter (missing closing ---)",
            1,
            1,
        ));
        return (fm, source.lines().count());
    };

    let fm_text = &after_open[1..end_pos]; // skip newline after opening ---
    let fm_end_line = fm_text.lines().count() + 2;
    let body_start = fm_end_line;

    // Track nesting depth for multi-level YAML
    let mut current_top_key: Option<String> = None;
    let mut in_list = false;
    let mut current_list: Vec<String> = Vec::new();

    for (idx, line) in fm_text.lines().enumerate() {
        let line_num = idx + 2;
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        let indent = line.len() - line.trim_start().len();

        // Nested key (indented under a top-level key like state:)
        if indent > 0 {
            if let Some(stripped) = trimmed.strip_prefix("- ") {
                // List item
                if in_list {
                    current_list.push(stripped.trim().to_string());
                }
            }
            // Sub-keys under state:, shape:, etc. — don't flag as unknown
            continue;
        }

        // Flush pending list
        if in_list {
            if let Some(ref key) = current_top_key {
                apply_frontmatter_list(&mut fm, key, &current_list);
            }
            current_list.clear();
            in_list = false;
        }

        // Top-level key: value
        if let Some(colon_pos) = trimmed.find(':') {
            let key = trimmed[..colon_pos].trim();
            let value = trimmed[colon_pos + 1..].trim();

            // Check for unknown top-level keys
            if !SPEC_FRONTMATTER_KEYS.contains(&key)
                && !LEGACY_FRONTMATTER_KEYS.contains(&key)
                && !CORPUS_FRONTMATTER_KEYS.contains(&key)
                && !key.contains(' ')
            {
                diagnostics.push(Diagnostic::new(
                    path,
                    "MDW001",
                    Severity::Warning,
                    format!("Unknown frontmatter key: `{key}`"),
                    line_num,
                    1,
                ));
            }

            // Flag keys in corpus but not in spec (informational in strict mode)
            // This is useful for spec discovery but not an error.

            // Check for duplicate top-level keys
            if let Some(prev_line) = fm.all_keys.insert(key.to_string(), line_num) {
                diagnostics.push(Diagnostic::new(
                    path,
                    "MDE003",
                    Severity::Error,
                    format!("Duplicate frontmatter key `{key}` (first at line {prev_line})"),
                    line_num,
                    1,
                ));
            }

            current_top_key = Some(key.to_string());

            if value.is_empty() {
                // Start of nested block or list
                in_list = true;
                continue;
            }

            // Inline array: [a, b, c]
            if value.starts_with('[') && value.ends_with(']') {
                let items: Vec<String> = value[1..value.len() - 1]
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                apply_frontmatter_value(&mut fm, key, value, &items);
            } else {
                apply_frontmatter_value(&mut fm, key, value, &[]);
            }
        }
    }

    // Flush trailing list
    if in_list && let Some(ref key) = current_top_key {
        apply_frontmatter_list(&mut fm, key, &current_list);
    }

    (fm, body_start)
}

fn apply_frontmatter_value(fm: &mut Frontmatter, key: &str, value: &str, items: &[String]) {
    match key {
        "name" => fm.name = Some(value.to_string()),
        "kind" => fm.kind = Some(value.to_string()),
        "version" => fm.version = Some(value.to_string()),
        "id" => fm.id = Some(value.to_string()),
        "subject" => fm.subject = Some(value.to_string()),
        "description" => fm.description = Some(value.to_string()),
        "role" => fm.role = Some(value.to_string()),
        "persist" => fm.persist = Some(value.to_string()),
        "nodes" | "services" => {
            if !items.is_empty() {
                fm.nodes = items.to_vec();
            } else {
                fm.nodes = vec![value.to_string()];
            }
        }
        "api" if !items.is_empty() => {
            fm.api = items.to_vec();
        }
        _ => {}
    }
}

fn apply_frontmatter_list(fm: &mut Frontmatter, key: &str, items: &[String]) {
    match key {
        "nodes" | "services" => fm.nodes = items.to_vec(),
        "api" => fm.api = items.to_vec(),
        "requires" => fm.requires = items.to_vec(),
        "ensures" => fm.ensures = items.to_vec(),
        "environment" => fm.environment = items.to_vec(),
        "use" => fm.use_deps = items.to_vec(),
        _ => {}
    }
}

// ── Frontmatter Validation ──────────────────────────────────────────────────

fn validate_frontmatter(
    path: &Path,
    fm: &Frontmatter,
    has_file_title: bool,
    profile: LintProfile,
    diagnostics: &mut Vec<Diagnostic>,
) {
    // MDE010: missing name
    if fm.name.is_none() && !has_file_title {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE010",
            Severity::Error,
            "Missing required frontmatter field: name",
            1,
            1,
        ));
    }

    // MDE011: missing kind
    if fm.kind.is_none() {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE011",
            Severity::Error,
            "Missing required frontmatter field: kind",
            1,
            1,
        ));
    }

    // MDE012: unknown kind (strict = error, compat = warning for legacy/corpus kinds)
    if let Some(ref kind) = fm.kind
        && !SPEC_KINDS.contains(&kind.as_str())
    {
        if LEGACY_KINDS.contains(&kind.as_str()) || CORPUS_KINDS.contains(&kind.as_str()) {
            // Historical but not current — warn in strict, skip in compat.
            if profile == LintProfile::Strict {
                let origin = if LEGACY_KINDS.contains(&kind.as_str()) {
                    "retired OpenProse vocabulary"
                } else {
                    "observed corpus vocabulary"
                };
                diagnostics.push(Diagnostic::new(
                        path, "MDW005", Severity::Warning,
                        format!("Component kind `{kind}` belongs to {origin}, not the current Contract Markdown spec"),
                        1, 1,
                    ));
            }
        } else {
            diagnostics.push(Diagnostic::new(
                path,
                "MDE012",
                Severity::Error,
                format!(
                    "Unknown component kind: `{kind}` (current spec: {}; legacy/corpus: {})",
                    SPEC_KINDS.join(", "),
                    LEGACY_KINDS
                        .iter()
                        .chain(CORPUS_KINDS.iter())
                        .copied()
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                1,
                1,
            ));
        }
    }

    // MDW002: unknown role
    if let Some(ref role) = fm.role
        && !SPEC_ROLES.contains(&role.as_str())
    {
        diagnostics.push(Diagnostic::new(
            path,
            "MDW002",
            Severity::Warning,
            format!(
                "Unknown component role: `{role}` (expected: {})",
                SPEC_ROLES.join(", ")
            ),
            1,
            1,
        ));
    }

    // MDE013: legacy program must have nodes/services
    if let Some(ref kind) = fm.kind
        && kind == "program"
        && fm.nodes.is_empty()
    {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE013",
            Severity::Error,
            "Program must declare `nodes:` or `services:` listing its components",
            1,
            1,
        ));
    }

    // MDW003: version missing (strict only: current spec does not mandate version)
    if fm.version.is_none() && profile == LintProfile::Strict {
        diagnostics.push(Diagnostic::new(
            path,
            "MDW003",
            Severity::Warning,
            "Missing version in frontmatter",
            1,
            1,
        ));
    }

    // MDW004: name contains spaces
    if let Some(ref name) = fm.name
        && name.contains(' ')
    {
        diagnostics.push(Diagnostic::new(
            path,
            "MDW004",
            Severity::Warning,
            format!("Component name `{name}` contains spaces; prefer kebab-case"),
            1,
            1,
        ));
    }

    // MDE014: current tests name a subject.
    if fm.kind.as_deref() == Some("test") && fm.subject.is_none() {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE014",
            Severity::Error,
            "Test must declare `subject:` frontmatter",
            1,
            1,
        ));
    }
}

fn has_file_title(body: &str) -> bool {
    body.lines().any(|line| {
        let trimmed = line.trim_start();
        trimmed
            .strip_prefix("# ")
            .is_some_and(|title| !title.trim().is_empty())
    })
}

// ── Markdown Body Parsing ───────────────────────────────────────────────────

fn classify_heading(name: &str, fm_nodes: &HashSet<String>) -> HeadingKind {
    // &-prefixed = state schema
    if name.starts_with('&') {
        return HeadingKind::StateSchema;
    }

    // Exact match to a declared node = always a component
    if fm_nodes.contains(&name.to_lowercase()) {
        return HeadingKind::Component;
    }

    // Starts with a digit = numbered step (documentation)
    if name.starts_with(|c: char| c.is_ascii_digit()) {
        return HeadingKind::Documentation;
    }

    // Contains spaces = almost certainly documentation
    // Exception: single-word PascalCase could be a schema name, but those
    // aren't components either (BriefAdherence, CurationAdherence, etc.)
    if name.contains(' ') {
        return HeadingKind::Documentation;
    }

    // PascalCase without hyphens = schema/type name, not a component
    // Components use kebab-case (game-solver, level-solver) or lowercase (oha, searcher)
    if name
        .chars()
        .next()
        .map(|c| c.is_ascii_uppercase())
        .unwrap_or(false)
        && !name.contains('-')
        && name.chars().any(|c| c.is_ascii_lowercase())
    {
        return HeadingKind::Documentation;
    }

    // kebab-case or lowercase identifiers = likely component
    let looks_like_component = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && name
            .chars()
            .next()
            .map(|c| c.is_ascii_lowercase())
            .unwrap_or(false);

    if looks_like_component {
        return HeadingKind::Component;
    }

    HeadingKind::Documentation
}

pub(crate) fn parse_markdown_body(
    path: &Path,
    body: &str,
    body_offset: usize,
    fm: &Frontmatter,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Vec<Heading>, ContractSections) {
    let mut headings = Vec::new();
    let mut sections = ContractSections::default();
    let fm_nodes: HashSet<String> = fm.nodes.iter().map(|n| n.to_lowercase()).collect();

    let mut current_heading: Option<Heading> = None;
    let mut current_section: Option<String> = None;
    let mut in_code_block = false;
    let mut code_block_content = String::new();

    for (idx, line) in body.lines().enumerate() {
        let line_num = body_offset + idx + 1;
        let trimmed = line.trim();

        // Track fenced code blocks
        if trimmed.starts_with("```") {
            if in_code_block {
                // Closing — parse fields if inside a heading
                if let Some(ref mut h) = current_heading {
                    h.has_code_block = true;
                    for cb_line in code_block_content.lines() {
                        let cb_trimmed = cb_line.trim();
                        if let Some(colon_pos) = cb_trimmed.find(':') {
                            let field = cb_trimmed[..colon_pos].trim();
                            if !field.is_empty() {
                                h.code_block_fields.insert(field.to_lowercase());
                            }
                        }
                    }
                }
                in_code_block = false;
                code_block_content.clear();
            } else {
                in_code_block = true;
            }
            continue;
        }

        if in_code_block {
            code_block_content.push_str(line);
            code_block_content.push('\n');
            continue;
        }

        // ## heading
        if let Some(heading_text) = trimmed.strip_prefix("## ") {
            let heading_text = heading_text.trim();
            let heading_lower = heading_text.to_lowercase();

            // Flush pending heading
            if let Some(h) = current_heading.take() {
                headings.push(h);
            }

            if KNOWN_CONTRACT_SECTIONS.contains(&heading_lower.as_str()) {
                current_section = Some(heading_lower);
            } else {
                current_section = None;
                let kind = classify_heading(heading_text, &fm_nodes);
                if kind == HeadingKind::Component {
                    current_heading = Some(Heading {
                        name: heading_text.to_string(),
                        line: line_num,
                        kind,
                        has_code_block: false,
                        has_body_contract: false,
                        code_block_fields: HashSet::new(),
                    });
                }
            }
            continue;
        }

        // ### heading
        if let Some(heading_text) = trimmed.strip_prefix("### ") {
            let heading_lower = heading_text.trim().to_lowercase();
            if KNOWN_CONTRACT_SECTIONS.contains(&heading_lower.as_str()) {
                current_section = Some(heading_lower);
                continue;
            }

            if let Some(h) = current_heading.take() {
                headings.push(h);
            }

            let kind = classify_heading(heading_text.trim(), &fm_nodes);
            current_heading = Some(Heading {
                name: heading_text.trim().to_string(),
                line: line_num,
                kind,
                has_code_block: false,
                has_body_contract: false,
                code_block_fields: HashSet::new(),
            });
            current_section = None;
            continue;
        }

        // Bare contract section labels — recognized at top level or under ## Contract.
        // Support both block-style sections:
        //   requires:\n- item
        // and single-line clauses:
        //   requires: caller input description
        if !in_code_block && let Some((section_name, rest)) = trimmed.split_once(':') {
            let section_name = section_name.trim().to_lowercase();
            if KNOWN_CONTRACT_SECTIONS.contains(&section_name.as_str()) {
                current_section = Some(section_name.clone());
                let rest = rest.trim();
                if !rest.is_empty() {
                    if let Some(ref mut heading) = current_heading {
                        heading.has_body_contract = true;
                    } else {
                        push_contract_item(
                            &mut sections,
                            &section_name,
                            ContractItem {
                                text: rest.to_string(),
                                line: line_num,
                            },
                        );
                    }
                }
                continue;
            }
        }

        if let Some(ref section) = current_section {
            let item_text = if let Some(item_text) = trimmed.strip_prefix("- ") {
                Some(item_text)
            } else if !trimmed.is_empty() {
                Some(trimmed)
            } else {
                None
            };

            if let Some(item_text) = item_text {
                if let Some(ref mut heading) = current_heading {
                    heading.has_body_contract = true;
                } else {
                    push_contract_item(
                        &mut sections,
                        section,
                        ContractItem {
                            text: item_text.to_string(),
                            line: line_num,
                        },
                    );
                }
            }
        }
    }

    // Flush trailing heading
    if let Some(h) = current_heading {
        headings.push(h);
    }

    if in_code_block {
        diagnostics.push(Diagnostic::new(
            path,
            "MDE020",
            Severity::Error,
            "Unterminated fenced code block",
            body_offset + body.lines().count(),
            1,
        ));
    }

    (headings, sections)
}

fn push_contract_item(sections: &mut ContractSections, section: &str, item: ContractItem) {
    match section {
        "requires" => sections.requires.push(item),
        "context" => sections.context.push(item),
        "ensures" => sections.ensures.push(item),
        "maintains" => sections.maintains.push(item),
        "parameters" => sections.parameters.push(item),
        "returns" => sections.returns.push(item),
        "errors" => sections.errors.push(item),
        "invariants" => sections.invariants.push(item),
        "strategies" => sections.strategies.push(item),
        "environment" => sections.environment.push(item),
        "fixtures" => sections.fixtures.push(item),
        "expects" => sections.expects.push(item),
        "expects not" | "expects-not" => sections.expects_not.push(item),
        _ => {}
    }
}

// ── Contract Validation ─────────────────────────────────────────────────────

fn validate_contracts(
    path: &Path,
    fm: &Frontmatter,
    sections: &ContractSections,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for item in &sections.requires {
        if item.text.trim().is_empty() {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW010",
                Severity::Warning,
                "Empty requires clause",
                item.line,
                1,
            ));
        }
    }

    for item in &sections.context {
        if item.text.trim().is_empty() {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW010",
                Severity::Warning,
                "Empty context clause",
                item.line,
                1,
            ));
        }
    }

    for item in &sections.ensures {
        if item.text.trim().is_empty() {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW010",
                Severity::Warning,
                "Empty ensures clause",
                item.line,
                1,
            ));
        }
    }

    for item in &sections.maintains {
        if item.text.trim().is_empty() {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW010",
                Severity::Warning,
                "Empty maintains clause",
                item.line,
                1,
            ));
        }
    }

    for item in &sections.returns {
        if item.text.trim().is_empty() {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW010",
                Severity::Warning,
                "Empty returns clause",
                item.line,
                1,
            ));
        }
    }

    // Hedging language in ensures
    for item in &sections.ensures {
        let lower = item.text.to_lowercase();
        if lower.starts_with("should ")
            || lower.contains(" should ")
            || lower.starts_with("might ")
            || lower.contains(" might ")
            || lower.starts_with("may ")
            || lower.contains(" may ")
        {
            diagnostics.push(Diagnostic::new(
                path, "MDW011", Severity::Warning,
                "Ensures clause uses hedging language (should/might/may); ensures are obligations, not suggestions",
                item.line, 1,
            ));
        }
    }

    for item in &sections.strategies {
        if item.text.trim().len() < 10 {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW012",
                Severity::Warning,
                "Strategy clause may be too terse to guide model behavior",
                item.line,
                1,
            ));
        }
    }

    // MDW014: callable/mounted render without an output contract.
    let kind = fm.kind.as_deref().unwrap_or("");
    if (kind == "service" || kind == "program-node")
        && sections.ensures.is_empty()
        && fm.ensures.is_empty()
    {
        diagnostics.push(Diagnostic::new(
            path, "MDW014", Severity::Warning,
            format!("Component of kind `{kind}` has no ensures clauses (neither in frontmatter nor ## ensures section)"),
            1, 1,
        ));
    }
    if kind == "function" && sections.returns.is_empty() {
        diagnostics.push(Diagnostic::new(
            path,
            "MDW014",
            Severity::Warning,
            "Function has no returns section",
            1,
            1,
        ));
    }
    if (kind == "responsibility" || kind == "gateway") && sections.maintains.is_empty() {
        diagnostics.push(Diagnostic::new(
            path,
            "MDW014",
            Severity::Warning,
            format!("Component of kind `{kind}` has no maintains section"),
            1,
            1,
        ));
    }

    // MDW015: legacy program without requires (inputs never specified)
    if kind == "program" && sections.requires.is_empty() && fm.requires.is_empty() {
        diagnostics.push(Diagnostic::new(
            path,
            "MDW015",
            Severity::Warning,
            "Program has no requires clauses — callers won't know what inputs to provide",
            1,
            1,
        ));
    }
}

// ── Heading Validation ──────────────────────────────────────────────────────

fn validate_headings(
    path: &Path,
    _fm: &Frontmatter,
    headings: &[Heading],
    diagnostics: &mut Vec<Diagnostic>,
) {
    // Duplicate component names
    let mut seen: HashMap<String, usize> = HashMap::new();
    for h in headings {
        if h.kind != HeadingKind::Component {
            continue;
        }
        let lower = h.name.to_lowercase();
        if let Some(prev_line) = seen.insert(lower, h.line) {
            diagnostics.push(Diagnostic::new(
                path,
                "MDE030",
                Severity::Error,
                format!(
                    "Duplicate component name `{}` (first at line {})",
                    h.name, prev_line
                ),
                h.line,
                1,
            ));
        }
    }

    // Component without an explicit contract body or code block.
    for h in headings {
        if h.kind == HeadingKind::Component && !h.has_code_block && !h.has_body_contract {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW020",
                Severity::Warning,
                format!(
                    "Component `{}` has no fenced code block or body contract defining its contract",
                    h.name
                ),
                h.line,
                1,
            ));
        }
    }

    // Component code block missing role
    for h in headings {
        if h.kind == HeadingKind::Component
            && h.has_code_block
            && !h.code_block_fields.contains("role")
        {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW021",
                Severity::Warning,
                format!("Component `{}` code block does not declare a role", h.name),
                h.line,
                1,
            ));
        }
    }
}

// ── Cross-validation ────────────────────────────────────────────────────────

fn cross_validate(
    path: &Path,
    fm: &Frontmatter,
    headings: &[Heading],
    multi_file: bool,
    diagnostics: &mut Vec<Diagnostic>,
) {
    if fm.kind.as_deref() != Some("program") {
        return;
    }

    let component_names: HashSet<String> = headings
        .iter()
        .filter(|h| h.kind == HeadingKind::Component)
        .map(|h| h.name.to_lowercase())
        .collect();

    // MDE040: node declared but not in body (only single-file mode when the
    // body actually defines inline components).
    if !multi_file && !component_names.is_empty() {
        for node in &fm.nodes {
            let lower = node.to_lowercase();
            if !component_names.contains(&lower) {
                diagnostics.push(Diagnostic::new(
                    path, "MDE040", Severity::Error,
                    format!("Node `{node}` declared in frontmatter but not defined as an inline ##/### component in body"),
                    1, 1,
                ));
            }
        }
    }

    // MDW030: component in body but not in frontmatter nodes
    let fm_nodes: HashSet<String> = fm.nodes.iter().map(|n| n.to_lowercase()).collect();
    for h in headings {
        if h.kind != HeadingKind::Component {
            continue;
        }
        let lower = h.name.to_lowercase();
        if !fm_nodes.contains(&lower) {
            diagnostics.push(Diagnostic::new(
                path,
                "MDW030",
                Severity::Warning,
                format!(
                    "Component `{}` defined in body but not listed in frontmatter nodes/services",
                    h.name
                ),
                h.line,
                1,
            ));
        }
    }
}

// ── Multi-file Program Directory ────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
pub fn current_lint_program_dir(
    dir: &Path,
    profile: LintProfile,
) -> Result<Vec<CurrentLintResult>> {
    let mut results = Vec::new();
    let mut root_path = None;
    let mut root_nodes = Vec::new();

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            let result = current_lint_source_inner(&path, &content, profile, true);

            if content.contains("\nkind: program") || content.starts_with("---\nkind: program") {
                root_path = Some(path.clone());
                let (fm, _) = parse_frontmatter(&path, &content, &mut Vec::new());
                root_nodes = fm.nodes.clone();
            }

            results.push(result);
        }
    }

    // MDE050: no root program file
    if root_path.is_none() && !results.is_empty() {
        let dir_path = dir.to_path_buf();
        results.push(CurrentLintResult {
            path: dir_path.clone(),
            diagnostics: vec![Diagnostic::new(
                &dir_path,
                "MDE050",
                Severity::Error,
                "No root program file found (no file with `kind: program`)",
                1,
                1,
            )],
        });
    }

    // MDE051: node file missing
    if let Some(ref rp) = root_path {
        let existing_files: HashSet<String> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let p = e.path();
                if p.extension().and_then(|ext| ext.to_str()) == Some("md") {
                    p.file_stem().map(|s| s.to_string_lossy().to_string())
                } else {
                    None
                }
            })
            .collect();

        let root_content = std::fs::read_to_string(rp).unwrap_or_default();
        let root_fm = {
            let (fm, _) = parse_frontmatter(rp, &root_content, &mut Vec::new());
            fm
        };

        // Skip MDE051 for programs that define services implicitly:
        // - ### Execution present → services created via call statements
        // - No ### headings at all → pure contract program, VM manages all services
        let has_execution_block = root_content
            .lines()
            .any(|line| line.trim().eq_ignore_ascii_case("### execution"));
        let has_any_h3 = root_content
            .lines()
            .any(|line| line.trim().starts_with("### "));

        if !has_execution_block && has_any_h3 {
            // Multi-file program: services must exist as files or use: imports
            let use_basenames: HashSet<String> = root_fm
                .use_deps
                .iter()
                .filter_map(|dep| dep.rsplit('/').next())
                .map(|s| s.to_string())
                .collect();

            for node in &root_nodes {
                if use_basenames.contains(node) {
                    continue; // Resolved via use: import, not local directory
                }
                if !existing_files.contains(node) {
                    results.push(CurrentLintResult {
                        path: rp.clone(),
                        diagnostics: vec![Diagnostic::new(
                            rp,
                            "MDE051",
                            Severity::Error,
                            format!(
                                "Node `{node}` listed in program but no `{node}.md` file found"
                            ),
                            1,
                            1,
                        )],
                    });
                }
            }
        }
    }

    Ok(results)
}

// ── Spec Discovery ──────────────────────────────────────────────────────────

/// Observation from a corpus of Markdown files: vocabulary not documented in the spec.
#[derive(Clone, Debug, Default)]
pub struct SpecDiscovery {
    /// Frontmatter keys not in SPEC_FRONTMATTER_KEYS, with file count
    pub undocumented_keys: BTreeMap<String, BTreeSet<String>>,
    /// kind: values not in SPEC_KINDS
    pub undocumented_kinds: BTreeMap<String, BTreeSet<String>>,
    /// role: values not in SPEC_ROLES
    pub undocumented_roles: BTreeMap<String, BTreeSet<String>>,
    /// ### heading patterns classified as Documentation (potential spec gap)
    pub doc_heading_patterns: BTreeMap<String, BTreeSet<String>>,
    /// Contract section names found that aren't in the known set
    pub undocumented_sections: BTreeMap<String, BTreeSet<String>>,
    /// Total files analyzed
    pub file_count: usize,
}

impl std::fmt::Display for SpecDiscovery {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(
            f,
            "=== OpenProse Spec Discovery Report ({} files) ===\n",
            self.file_count
        )?;

        if !self.undocumented_kinds.is_empty() {
            writeln!(f, "## Undocumented `kind:` values\n")?;
            writeln!(f, "The spec defines: {}", SPEC_KINDS.join(", "))?;
            writeln!(f, "The corpus also uses:\n")?;
            for (kind, files) in &self.undocumented_kinds {
                writeln!(
                    f,
                    "  `{kind}` ({} files): {}",
                    files.len(),
                    files.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
                )?;
            }
            writeln!(f)?;
        }

        if !self.undocumented_keys.is_empty() {
            writeln!(f, "## Undocumented frontmatter keys\n")?;
            writeln!(
                f,
                "The spec defines: {}\n",
                SPEC_FRONTMATTER_KEYS.join(", ")
            )?;
            for (key, files) in &self.undocumented_keys {
                writeln!(f, "  `{key}` ({} files)", files.len())?;
            }
            writeln!(f)?;
        }

        if !self.undocumented_roles.is_empty() {
            writeln!(f, "## Undocumented `role:` values\n")?;
            writeln!(f, "The spec defines: {}\n", SPEC_ROLES.join(", "))?;
            for (role, files) in &self.undocumented_roles {
                writeln!(f, "  `{role}` ({} files)", files.len())?;
            }
            writeln!(f)?;
        }

        if !self.undocumented_sections.is_empty() {
            writeln!(f, "## Potential undocumented contract sections\n")?;
            writeln!(
                f,
                "The linter recognizes: {}\n",
                KNOWN_CONTRACT_SECTIONS.join(", ")
            )?;
            for (section, files) in &self.undocumented_sections {
                writeln!(
                    f,
                    "  `### {section}` ({} files): {}",
                    files.len(),
                    files.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
                )?;
            }
            writeln!(f)?;
        }

        if !self.doc_heading_patterns.is_empty() {
            writeln!(f, "## Documentation heading patterns\n")?;
            writeln!(
                f,
                "These are not lint errors. Review them when promoting a recurring heading into the language surface.\n"
            )?;
            for (heading, files) in self.doc_heading_patterns.iter().take(20) {
                writeln!(
                    f,
                    "  `### {heading}` ({} files): {}",
                    files.len(),
                    files.iter().take(3).cloned().collect::<Vec<_>>().join(", ")
                )?;
            }
            if self.doc_heading_patterns.len() > 20 {
                writeln!(
                    f,
                    "  ... {} more heading pattern(s)",
                    self.doc_heading_patterns.len() - 20
                )?;
            }
            writeln!(f)?;
        }

        Ok(())
    }
}

/// Analyze a set of Markdown files and report vocabulary not in the spec.
#[cfg(not(target_arch = "wasm32"))]
pub fn discover_spec_gaps(targets: &[PathBuf]) -> Result<SpecDiscovery> {
    let files = collect_current_files(targets)?;
    let mut discovery = SpecDiscovery {
        file_count: files.len(),
        ..Default::default()
    };

    for file in &files {
        let content =
            std::fs::read_to_string(file).with_context(|| format!("read {}", file.display()))?;
        let filename = file
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        let (fm, body_start) = parse_frontmatter(file, &content, &mut Vec::new());

        // Undocumented frontmatter keys
        for key in fm.all_keys.keys() {
            if !SPEC_FRONTMATTER_KEYS.contains(&key.as_str()) {
                discovery
                    .undocumented_keys
                    .entry(key.clone())
                    .or_default()
                    .insert(filename.clone());
            }
        }

        // Undocumented kinds
        if let Some(ref kind) = fm.kind
            && !SPEC_KINDS.contains(&kind.as_str())
        {
            discovery
                .undocumented_kinds
                .entry(kind.clone())
                .or_default()
                .insert(filename.clone());
        }

        // Undocumented roles
        if let Some(ref role) = fm.role
            && !SPEC_ROLES.contains(&role.as_str())
        {
            discovery
                .undocumented_roles
                .entry(role.clone())
                .or_default()
                .insert(filename.clone());
        }

        // Heading patterns
        let body = content
            .lines()
            .skip(body_start)
            .collect::<Vec<_>>()
            .join("\n");
        let fm_nodes: HashSet<String> = fm.nodes.iter().map(|n| n.to_lowercase()).collect();
        for line in body.lines() {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix("### ") {
                let heading = heading.trim();
                let heading_lower = normalize_heading(heading);
                if KNOWN_CONTRACT_SECTIONS.contains(&heading_lower.as_str()) {
                    continue;
                }

                let kind = classify_heading(heading, &fm_nodes);
                if kind == HeadingKind::Documentation {
                    // Categorize the pattern
                    let pattern = if heading.starts_with(|c: char| c.is_ascii_digit()) {
                        "numbered step".to_string()
                    } else if heading.starts_with('&') {
                        "state schema".to_string()
                    } else {
                        heading.to_string()
                    };
                    if looks_like_contract_section_candidate(heading) {
                        discovery
                            .undocumented_sections
                            .entry(heading_lower)
                            .or_default()
                            .insert(filename.clone());
                    }
                    discovery
                        .doc_heading_patterns
                        .entry(pattern)
                        .or_default()
                        .insert(filename.clone());
                }
            }
        }
    }

    Ok(discovery)
}

fn normalize_heading(heading: &str) -> String {
    heading
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn looks_like_contract_section_candidate(heading: &str) -> bool {
    let heading = heading.trim();
    !heading.is_empty()
        && heading.len() <= 80
        && heading
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
        && heading
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '/' | '&'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_current_content() {
        let source = "---\nname: test\nkind: program\nnodes: [a, b]\n---\n# Test\n";
        assert!(looks_like_current(source));
    }

    #[test]
    fn rejects_non_current_content() {
        assert!(!looks_like_current("agent foo:\n  model: sonnet\n"));
        assert!(!looks_like_current("---\nname: test\n---\n")); // no kind:
    }

    #[test]
    fn markdown_paths_route_to_current_linter_even_when_malformed() {
        assert!(should_lint_as_current(
            Path::new("broken.md"),
            "# Missing Frontmatter\n"
        ));
        assert!(!should_lint_as_current(
            Path::new("legacy.prose"),
            "session \"x\"\n"
        ));
    }

    #[test]
    fn missing_frontmatter() {
        let source = "# Just a heading\nSome text\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE001"));
    }

    #[test]
    fn unterminated_frontmatter() {
        let source = "---\nname: test\nkind: program\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE002"));
    }

    #[test]
    fn missing_name() {
        let source = "---\nkind: program\nnodes: [a]\n---\n\n### a\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE010"));
    }

    #[test]
    fn file_title_is_name_fallback() {
        let source = "---\nkind: responsibility\nid: fallback-title\n---\n# Fallback Title\n\n### Maintains\n\n- `state`: current state\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDE010"),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn missing_kind() {
        let source = "---\nname: test\n---\n# Test\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE011"));
    }

    #[test]
    fn unknown_kind_error() {
        let source = "---\nname: test\nkind: widget\n---\n# Test\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE012"));
    }

    #[test]
    fn driver_kind_accepted_in_compat() {
        let source = "---\nname: test\nkind: driver\nversion: 0.1.0\n---\n# Test\n";
        let result = current_lint_source(Path::new("test.md"), source);
        // No error in compat mode for corpus kinds
        assert!(!result.diagnostics.iter().any(|d| d.code == "MDE012"));
    }

    #[test]
    fn current_openprose_kinds_are_accepted_in_strict() {
        let cases = [
            (
                "responsibility",
                "---\nname: risk-radar\nkind: responsibility\nversion: 0.15.0\nid: 067NC4KG01RG50R40M30E20918\n---\n\n### Requires\n\n- `signals`: account signals\n\n### Maintains\n\n- `risk`: current account risk\n",
            ),
            (
                "function",
                "---\nname: summarize\nkind: function\nversion: 0.15.0\n---\n\n### Parameters\n\n- `text`: input text\n\n### Returns\n\n- `summary`: concise summary\n",
            ),
            (
                "gateway",
                "---\nname: intake\nkind: gateway\nversion: 0.15.0\n---\n\n### Continuity\n\n- external-driven\n\n### Receives\n\n- POST /events\n\n### Maintains\n\n- `events`: latest incoming events\n\n### Emits\n\n- risk-radar\n",
            ),
            (
                "pattern",
                "---\nname: worker-critic\nkind: pattern\nversion: 0.15.0\n---\n\n### Slots\n\n- `worker`: produces a draft\n\n### Config\n\n- `max_rounds`: 3\n\n### Delegation\n\n```prose\ncall worker\n```\n",
            ),
            (
                "test",
                "---\nname: test-summarize\nkind: test\nversion: 0.15.0\nsubject: summarize\n---\n\n### Fixtures\n\n- `text`: input text\n\n### Expects\n\n- `summary`: exists\n\n### Expects Not\n\n- `summary`: invents citations\n",
            ),
        ];

        for (kind, source) in cases {
            let result = current_lint_source_with_profile(
                Path::new("current.prose.md"),
                source,
                LintProfile::Strict,
            );
            assert!(
                !result.diagnostics.iter().any(|d| d.code == "MDE012"),
                "kind {kind} should be accepted: {:?}",
                result.diagnostics
            );
        }
    }

    #[test]
    fn current_contract_sections_are_not_classified_as_components() {
        let source = "\
---
name: current-sections
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E20918
---

### Description

Human summary.

### Goal

Keep the account risk model current.

### Requires

- `signals`: account signals

### Context

- `style-guide`: read-only style guidance for the render

### Maintains

- `risk`: current account risk

#### score

Material risk score.

### Parameters

- `ignored`: only valid for functions, but still a known section.

### Returns

- `ignored`: only valid for functions, but still a known section.

### Continuity

- input-driven

### Errors

- `missing-signals`: no input signals

### Invariants

- never expose secrets

### Strategies

- prefer corroborated signals

### Environment

- `API_TOKEN`: account API token

### Runtime

- `model`: sonnet

### Skills

- document-skills:pdf

### Tools

- `cli:gh`: GitHub CLI

### Shape

- `self`: score risk

### Execution

```prose
return risk
```

### Fixtures

- `signals`: fixture

### Expects

- `risk`: exists

### Expects Not

- `risk`: leaks secrets

### Slots

- `worker`: worker slot

### Config

- `max_rounds`: 3

### Delegation

```prose
call worker
```

### Schedule

- */5 * * * *

### Receives

- POST /events

### Emits

- current-sections

### Payload

- JSON event body
";
        let result = current_lint_source_with_profile(
            Path::new("current-sections.prose.md"),
            source,
            LintProfile::Strict,
        );
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDW020"),
            "current sections should not be fake components: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn discovery_treats_context_as_documented_contract_section() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("context.prose.md");
        fs::write(
            &path,
            "\
---
name: context-test
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E20918
---

### Context

- durable setup for this responsibility

### Maintains

- `state`: current state
",
        )
        .unwrap();

        let discovery = discover_spec_gaps(&[path]).unwrap();
        assert!(
            !discovery.undocumented_sections.contains_key("context"),
            "Context is an official section and should not be reported as drift: {discovery:#?}"
        );
        assert!(
            !discovery.doc_heading_patterns.contains_key("Context"),
            "Context is an official section, not a documentation heading pattern: {discovery:#?}"
        );

        let rendered = discovery.to_string();
        assert!(
            !rendered.contains("### context"),
            "rendered discovery should not include known Context as drift: {rendered}"
        );
    }

    #[test]
    fn context_after_maintains_preserves_facets_and_later_sections() {
        let source = "\
---
name: context-after-maintains
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E20918
---

### Maintains

- `answer`: answer grounded in declared inputs.

#### evidence

Material evidence supporting the answer.

### Context

- `style-guide`: `docs/style-guide.md` at the compiled source revision.

### Strategies

- quote the context only when it directly clarifies the answer.
";
        let result = current_lint_source_with_profile(
            Path::new("context-after-maintains.prose.md"),
            source,
            LintProfile::Strict,
        );
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDW014"),
            "context after maintains should not hide maintains/facets: {:?}",
            result.diagnostics
        );
        assert!(
            result
                .diagnostics
                .iter()
                .all(|d| d.code != "MDW020" && d.code != "MDW030"),
            "context and facet headings should not become components: {:?}",
            result.diagnostics
        );

        let mut parse_diags = Vec::new();
        let (frontmatter, body_start) = parse_frontmatter(
            Path::new("context-after-maintains.prose.md"),
            source,
            &mut parse_diags,
        );
        let body = source
            .lines()
            .skip(body_start)
            .collect::<Vec<_>>()
            .join("\n");
        let (_headings, sections) = parse_markdown_body(
            Path::new("context-after-maintains.prose.md"),
            &body,
            body_start,
            &frontmatter,
            &mut parse_diags,
        );
        assert_eq!(
            sections.context.len(),
            1,
            "post-Maintains Context must be parsed as a Context section"
        );
        assert!(
            sections.context[0].text.contains("style-guide"),
            "Context item should stay in sections.context: {:?}",
            sections.context
        );
        assert_eq!(
            sections.strategies.len(),
            1,
            "later Strategies must remain its own section"
        );
        assert!(
            !sections.maintains.iter().any(|item| {
                item.text.contains("style-guide") || item.text.contains("quote the context")
            }),
            "Context/Strategies text must not leak into Maintains: {:?}",
            sections.maintains
        );
    }

    #[test]
    fn context_does_not_satisfy_required_output_contracts() {
        let responsibility = "\
---
name: context-only-responsibility
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E20918
---

### Context

- `answer`: tempting but read-only orientation, not maintained truth.
";
        let responsibility_result = current_lint_source_with_profile(
            Path::new("context-only-responsibility.prose.md"),
            responsibility,
            LintProfile::Strict,
        );
        assert!(
            responsibility_result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW014" && d.message.contains("maintains")),
            "Context must not satisfy a responsibility's Maintains contract: {:?}",
            responsibility_result.diagnostics
        );

        let function = "\
---
name: context-only-function
kind: function
version: 0.15.0
---

### Context

- `summary`: tempting but read-only orientation, not a return value.
";
        let function_result = current_lint_source_with_profile(
            Path::new("context-only-function.prose.md"),
            function,
            LintProfile::Strict,
        );
        assert!(
            function_result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW014" && d.message.contains("returns")),
            "Context must not satisfy a function's Returns contract: {:?}",
            function_result.diagnostics
        );
    }

    #[test]
    fn program_without_nodes() {
        let source = "---\nname: test\nkind: program\n---\n# Test\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE013"));
    }

    #[test]
    fn duplicate_frontmatter_key() {
        let source = "---\nname: test\nkind: program\nname: other\nnodes: [a]\n---\n# Test\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE003"));
    }

    #[test]
    fn nested_yaml_not_flagged_as_unknown() {
        let source = "---\nname: test\nkind: program-node\nversion: 0.1.0\nstate:\n  reads: [&Foo]\n  writes: [&Bar]\n---\n# Test\n";
        let result = current_lint_source(Path::new("test.md"), source);
        // reads/writes should NOT appear as unknown keys (they're nested under state:)
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW001" && d.message.contains("reads")),
            "reads should not be flagged: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn hedging_in_ensures() {
        let source = "---\nname: test\nkind: service\n---\n# Test\n\n## ensures\n\n- result should be correct\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDW011"));
    }

    #[test]
    fn state_schema_heading_not_treated_as_component() {
        let source = "---\nname: test\nkind: program\nnodes: [solver]\nversion: 0.1.0\n---\n\n### solver\n\n```\nrole: leaf\n```\n\n### &GameState\n\n```\nlevel: number\n```\n";
        let result = current_lint_source(Path::new("test.md"), source);
        // &GameState should not trigger MDW030 (not in nodes)
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW030" && d.message.contains("GameState")),
            "state schema should not be flagged as unlisted component: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn doc_heading_not_treated_as_component() {
        let source = "---\nname: test\nkind: program\nnodes: [solver]\nversion: 0.1.0\n---\n\n### solver\n\n```\nrole: leaf\n```\n\n### When to use direct delegation\n\nSome docs here.\n";
        let result = current_lint_source(Path::new("test.md"), source);
        // Documentation heading should not trigger MDW030
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW030" && d.message.contains("When")),
            "doc heading should not be flagged: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn second_level_component_headings_are_recognized() {
        let source = "---\nname: compact\nkind: program\nservices: [review, polish]\nversion: 0.1.0\n---\n\n## review\n\nrequires:\n- draft: input\n\nensures:\n- feedback: notes\n\n## polish\n\nrequires:\n- draft: input\n- feedback: notes\n\nensures:\n- final: output\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDE040"),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDW020"),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn inline_component_contracts_do_not_satisfy_program_requires() {
        let source = "---\nname: compact\nkind: program\nservices: [review]\nversion: 0.1.0\n---\n\n## review\n\nrequires:\n- draft: input\n\nensures:\n- feedback: notes\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            result.diagnostics.iter().any(|d| d.code == "MDW015"),
            "expected MDW015, got: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn single_line_body_requires_are_recognized() {
        let source = "---\nname: compact\nkind: program\nservices: [review]\nversion: 0.1.0\n---\n\nrequires: draft provided by caller\nensures: reviewed draft returned\n\n## review\n\nrequires:\n- draft: input\n\nensures:\n- feedback: notes\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDW015"),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn persist_frontmatter_key_is_accepted() {
        let source = "---\nname: editor\nkind: service\npersist: true\nversion: 0.1.0\n---\n\nrequires:\n- draft: text\n\nensures:\n- edited: revision\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW001" && d.message.contains("persist")),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn subject_frontmatter_key_is_accepted_for_tests() {
        let source = "---\nname: test-summarizer\nkind: test\nsubject: summarizer\nversion: 0.1.0\n---\n\nfixtures:\n- topic: ai\n\nexpects:\n- summary: mentions ai\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|d| d.code == "MDW001" && d.message.contains("subject")),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn program_without_inline_components_is_allowed() {
        let source = "---\nname: imported\nkind: program\nservices: [researcher, writer]\nversion: 0.1.0\n---\n\nrequires:\n- topic: thing to study\n\nensures:\n- report: final summary\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            !result.diagnostics.iter().any(|d| d.code == "MDE040"),
            "unexpected diagnostics: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn valid_program_no_errors() {
        let source = "\
---
name: deep-research
kind: program
version: 0.1.0
nodes: [researcher, critic]
---

# Deep Research

### researcher

```
role: leaf
use: \"researcher\"
requires from caller:
  - topic to research
produces for caller:
  - findings with sources
```

### critic

```
role: leaf
use: \"critic\"
requires from caller:
  - findings to evaluate
produces for caller:
  - evaluation with scores
```
";
        let result = current_lint_source(Path::new("test.md"), source);
        let errors: Vec<_> = result
            .diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        assert!(errors.is_empty(), "unexpected errors: {:?}", errors);
    }

    #[test]
    fn node_not_defined_in_body() {
        let source = "---\nname: test\nkind: program\nnodes: [a, b, missing]\nversion: 0.1.0\n---\n\n### a\n\n```\nrole: leaf\n```\n\n### b\n\n```\nrole: leaf\n```\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(
            result.diagnostics.iter().any(|d| d.code == "MDE040"),
            "expected MDE040, got: {:?}",
            result.diagnostics
        );
    }

    #[test]
    fn duplicate_component_name() {
        let source = "---\nname: test\nkind: program\nnodes: [a]\nversion: 0.1.0\n---\n\n### a\n\n```\nrole: leaf\n```\n\n### a\n\n```\nrole: leaf\n```\n";
        let result = current_lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "MDE030"));
    }

    #[test]
    fn directory_with_multiple_program_roots_is_not_a_single_program_dir() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("one.md"),
            "---\nname: one\nkind: program\nservices: [worker]\n---\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("two.md"),
            "---\nname: two\nkind: program\nservices: [worker]\n---\n",
        )
        .unwrap();

        assert!(!is_program_dir(dir.path()));
    }

    #[test]
    fn directory_with_one_program_root_is_a_program_dir() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("index.md"),
            "---\nname: grouped\nkind: program\nservices: [worker]\n---\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("worker.md"),
            "---\nname: worker\nkind: service\n---\n",
        )
        .unwrap();

        assert!(is_program_dir(dir.path()));
    }

    #[test]
    fn openprose_main_source_surfaces_are_supported() {
        let root = crate::spec::reference_open_prose_root();
        assert!(
            root.exists(),
            "reference OpenProse root not found at {}",
            root.display()
        );

        let results = current_lint_paths_with_profile(
            std::slice::from_ref(&root),
            crate::profile::LintProfile::Strict,
        )
        .unwrap();
        let unsupported_surfaces: Vec<_> = results
            .iter()
            .flat_map(|result| result.diagnostics.iter())
            .filter(|diagnostic| matches!(diagnostic.code, "MDE012" | "MDW001" | "MDW020"))
            .map(|diagnostic| {
                format!(
                    "{}:{}:{} {} {}",
                    diagnostic.path.display(),
                    diagnostic.line,
                    diagnostic.column,
                    diagnostic.code,
                    diagnostic.message
                )
            })
            .collect();

        assert!(
            unsupported_surfaces.is_empty(),
            "OpenProse main contains source surfaces unsupported by openprose-lint: {unsupported_surfaces:#?}"
        );
    }
}
