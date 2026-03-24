use crate::diag::{Diagnostic, Severity};
use crate::profile::LintProfile;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

#[cfg(not(target_arch = "wasm32"))]
use anyhow::{Context, Result};

// ── Lint Result ──────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct LintResult {
    pub path: PathBuf,
    pub diagnostics: Vec<Diagnostic>,
}

// ── Frontmatter ──────────────────────────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub struct Frontmatter {
    pub name: Option<String>,
    pub kind: Option<String>,
    pub version: Option<String>,
    pub nodes: Vec<String>,
    pub role: Option<String>,
    pub api: Vec<String>,
    pub delegates: Vec<String>,
    pub prohibited: Vec<String>,
    pub slots: Vec<String>,
    pub requires: Vec<String>,
    pub ensures: Vec<String>,
    pub description: Option<String>,
    pub all_keys: HashMap<String, usize>, // key -> line number
}

// ── Contract Sections (Markdown body) ────────────────────────────────────

#[derive(Clone, Debug, Default)]
struct ContractSections {
    requires: Vec<ContractItem>,
    ensures: Vec<ContractItem>,
    errors: Vec<ContractItem>,
    invariants: Vec<ContractItem>,
    strategies: Vec<ContractItem>,
}

#[derive(Clone, Debug)]
struct ContractItem {
    text: String,
    line: usize,
}

// ── Heading classification ──────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq, Eq)]
enum HeadingKind {
    /// Executable component: matches a node name, or kebab-case identifier
    Component,
    /// State schema: prefixed with &
    StateSchema,
    /// Documentation/structural heading
    Documentation,
}

#[derive(Clone, Debug)]
struct Heading {
    name: String,
    line: usize,
    #[allow(dead_code)]
    level: u8, // 2 for ##, 3 for ###
    kind: HeadingKind,
    has_code_block: bool,
    code_block_fields: HashSet<String>,
}

// ── Known vocabulary (from spec) ────────────────────────────────────────────
// These are what the spec explicitly documents.

const SPEC_FRONTMATTER_KEYS: &[&str] = &[
    "name", "kind", "version", "description",
    "nodes", "services",
    "role", "api", "state", "shape",
    "requires", "ensures", "errors", "invariants", "strategies",
    "prohibited",
];

const SPEC_KINDS: &[&str] = &[
    "program", "program-node", "service",
];

const SPEC_ROLES: &[&str] = &[
    "orchestrator", "coordinator", "leaf",
];

const KNOWN_CONTRACT_SECTIONS: &[&str] = &[
    "requires", "ensures", "errors", "invariants", "strategies",
];

// ── Extended vocabulary (observed in press corpus, not yet in spec) ──────────

const CORPUS_FRONTMATTER_KEYS: &[&str] = &[
    // Delegation & state (used by all program-node files)
    "delegates", "reads", "writes", "components", "slots",
    // Shape sub-keys used at top level
    "self",
    // Driver/profile keys
    "author", "tags", "models", "drivers",
    // Code block field keys sometimes in frontmatter
    "capability", "principles", "given",
    // Misc
    "related", "purpose", "glossary",
];

const CORPUS_KINDS: &[&str] = &[
    "driver", "profile",
];

// ── Rule codes ──────────────────────────────────────────────────────────────
//
// V2E001–V2E009: structural (frontmatter delimiters)
// V2E010–V2E019: required frontmatter fields
// V2E020–V2E029: body structure
// V2E030–V2E039: component validation
// V2E040–V2E049: cross-validation (single-file)
// V2E050–V2E059: cross-validation (multi-file)
//
// V2W001–V2W009: frontmatter vocabulary
// V2W010–V2W019: contract quality
// V2W020–V2W029: component quality
// V2W030–V2W039: cross-validation warnings

// ── Public API ──────────────────────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_path(path: &Path) -> Result<LintResult> {
    lint_path_with_profile(path, LintProfile::Compat)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_path_with_profile(path: &Path, profile: LintProfile) -> Result<LintResult> {
    let source = std::fs::read_to_string(path)
        .with_context(|| format!("read {}", path.display()))?;
    Ok(lint_source_with_profile(path, &source, profile))
}

pub fn lint_source(path: &Path, source: &str) -> LintResult {
    lint_source_with_profile(path, source, LintProfile::Compat)
}

pub fn lint_source_with_profile(
    path: &Path,
    source: &str,
    profile: LintProfile,
) -> LintResult {
    lint_source_inner(path, source, profile, false)
}

fn lint_source_inner(
    path: &Path,
    source: &str,
    profile: LintProfile,
    multi_file: bool,
) -> LintResult {
    let mut diagnostics = Vec::new();

    let (frontmatter, body_start) = parse_frontmatter(path, source, &mut diagnostics);
    validate_frontmatter(path, &frontmatter, profile, &mut diagnostics);

    let body = if body_start < source.lines().count() {
        source.lines().skip(body_start).collect::<Vec<_>>().join("\n")
    } else {
        String::new()
    };

    let (headings, contract_sections) =
        parse_markdown_body(path, &body, body_start, &frontmatter, &mut diagnostics);

    validate_contracts(path, &frontmatter, &contract_sections, &mut diagnostics);
    validate_headings(path, &frontmatter, &headings, &mut diagnostics);
    cross_validate(path, &frontmatter, &headings, multi_file, &mut diagnostics);

    diagnostics.sort_by(|a, b| (a.line, a.column, &a.code).cmp(&(b.line, b.column, &b.code)));

    LintResult {
        path: path.to_path_buf(),
        diagnostics,
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub fn collect_files(targets: &[PathBuf]) -> Result<Vec<PathBuf>> {
    use walkdir::WalkDir;

    let mut files = Vec::new();
    for target in targets {
        if target.is_file() {
            if is_prose_md_file(target) {
                files.push(target.canonicalize()
                    .with_context(|| format!("canonicalize {}", target.display()))?);
            }
            continue;
        }
        if target.is_dir() {
            for entry in WalkDir::new(target)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
            {
                if is_prose_md_file(entry.path()) {
                    files.push(entry.path().canonicalize()
                        .with_context(|| format!("canonicalize {}", entry.path().display()))?);
                }
            }
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_paths_with_profile(
    targets: &[PathBuf],
    profile: LintProfile,
) -> Result<Vec<LintResult>> {
    let mut results = Vec::new();
    let mut handled_dirs: HashSet<PathBuf> = HashSet::new();

    for target in targets {
        if target.is_dir() {
            lint_dir_recursive(target, profile, &mut results, &mut handled_dirs)?;
        } else if target.is_file() && is_prose_md_file(target) {
            // Single file — check if its parent is a program dir
            if let Some(parent) = target.parent() {
                if is_program_dir(parent) && handled_dirs.insert(parent.to_path_buf()) {
                    results.extend(lint_program_dir(parent, profile)?);
                } else if !handled_dirs.contains(parent) {
                    results.push(lint_path_with_profile(target, profile)?);
                }
            } else {
                results.push(lint_path_with_profile(target, profile)?);
            }
        }
    }

    Ok(results)
}

/// Recursively discover program directories and standalone .md files.
#[cfg(not(target_arch = "wasm32"))]
fn lint_dir_recursive(
    dir: &Path,
    profile: LintProfile,
    results: &mut Vec<LintResult>,
    handled_dirs: &mut HashSet<PathBuf>,
) -> Result<()> {
    if is_program_dir(dir) {
        if handled_dirs.insert(dir.to_path_buf()) {
            results.extend(lint_program_dir(dir, profile)?);
        }
        return Ok(());
    }

    // Not a program dir — check subdirectories and standalone files
    let mut subdirs = Vec::new();
    let mut loose_files = Vec::new();

    for entry in std::fs::read_dir(dir)?.flatten() {
        let path = entry.path();
        if path.is_dir() && !path.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(true) {
            subdirs.push(path);
        } else if path.is_file() && is_prose_md_file(&path) {
            loose_files.push(path);
        }
    }

    // Recurse into subdirectories
    for subdir in subdirs {
        lint_dir_recursive(&subdir, profile, results, handled_dirs)?;
    }

    // Lint loose .md files in this directory (not part of any program dir)
    for file in loose_files {
        results.push(lint_path_with_profile(&file, profile)?);
    }

    Ok(())
}

/// Check if a directory is a multi-file program (contains a kind: program root).
#[cfg(not(target_arch = "wasm32"))]
fn is_program_dir(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path)
            && looks_like_prose_md(&content)
                && (content.contains("\nkind: program\n")
                    || content.contains("\nkind: program\r")
                    || content.starts_with("---\nkind: program\n"))
            {
                return true;
            }
    }
    false
}

// ── Detection ───────────────────────────────────────────────────────────────

pub fn is_prose_md_file(path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str());
    if ext != Some("md") {
        return false;
    }
    if let Ok(content) = std::fs::read_to_string(path) {
        return looks_like_prose_md(&content);
    }
    false
}

pub fn looks_like_prose_md(source: &str) -> bool {
    if !source.starts_with("---") {
        return false;
    }
    if let Some(end) = source[3..].find("\n---") {
        let frontmatter = &source[3..3 + end];
        frontmatter.lines().any(|line| line.trim().starts_with("kind:"))
    } else {
        false
    }
}

// ── Frontmatter Parsing ─────────────────────────────────────────────────────

fn parse_frontmatter(
    path: &Path,
    source: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> (Frontmatter, usize) {
    let mut fm = Frontmatter::default();

    if !source.starts_with("---") {
        diagnostics.push(Diagnostic::new(
            path, "V2E001", Severity::Error,
            "Missing YAML frontmatter (file must start with ---)",
            1, 1,
        ));
        return (fm, 0);
    }

    let after_open = &source[3..];
    let Some(end_pos) = after_open.find("\n---") else {
        diagnostics.push(Diagnostic::new(
            path, "V2E002", Severity::Error,
            "Unterminated YAML frontmatter (missing closing ---)",
            1, 1,
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
            if let Some(item) = trimmed.strip_prefix("- ") {
                // List item
                if in_list {
                    current_list.push(item.trim().to_string());
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
                && !CORPUS_FRONTMATTER_KEYS.contains(&key)
                && !key.contains(' ')
            {
                diagnostics.push(Diagnostic::new(
                    path, "V2W001", Severity::Warning,
                    format!("Unknown frontmatter key: `{key}`"),
                    line_num, 1,
                ));
            }

            // Flag keys in corpus but not in spec (informational in strict mode)
            // This is useful for spec discovery but not an error.

            // Check for duplicate top-level keys
            if let Some(prev_line) = fm.all_keys.insert(key.to_string(), line_num) {
                diagnostics.push(Diagnostic::new(
                    path, "V2E003", Severity::Error,
                    format!("Duplicate frontmatter key `{key}` (first at line {prev_line})"),
                    line_num, 1,
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
    if in_list
        && let Some(ref key) = current_top_key {
            apply_frontmatter_list(&mut fm, key, &current_list);
        }

    (fm, body_start)
}

fn apply_frontmatter_value(fm: &mut Frontmatter, key: &str, value: &str, items: &[String]) {
    match key {
        "name" => fm.name = Some(value.to_string()),
        "kind" => fm.kind = Some(value.to_string()),
        "version" => fm.version = Some(value.to_string()),
        "description" => fm.description = Some(value.to_string()),
        "role" => fm.role = Some(value.to_string()),
        "nodes" | "services" => {
            if !items.is_empty() {
                fm.nodes = items.to_vec();
            } else {
                fm.nodes = vec![value.to_string()];
            }
        }
        "api" => {
            if !items.is_empty() { fm.api = items.to_vec(); }
        }
        "delegates" => {
            if !items.is_empty() { fm.delegates = items.to_vec(); }
        }
        "prohibited" => {
            if !items.is_empty() {
                fm.prohibited = items.to_vec();
            } else if !value.is_empty() {
                fm.prohibited = value.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            }
        }
        "slots" => {
            if !items.is_empty() { fm.slots = items.to_vec(); }
        }
        _ => {}
    }
}

fn apply_frontmatter_list(fm: &mut Frontmatter, key: &str, items: &[String]) {
    match key {
        "nodes" | "services" => fm.nodes = items.to_vec(),
        "api" => fm.api = items.to_vec(),
        "delegates" => fm.delegates = items.to_vec(),
        "prohibited" => fm.prohibited = items.to_vec(),
        "slots" => fm.slots = items.to_vec(),
        "requires" => fm.requires = items.to_vec(),
        "ensures" => fm.ensures = items.to_vec(),
        _ => {}
    }
}

// ── Frontmatter Validation ──────────────────────────────────────────────────

fn validate_frontmatter(
    path: &Path,
    fm: &Frontmatter,
    profile: LintProfile,
    diagnostics: &mut Vec<Diagnostic>,
) {
    // V2E010: missing name
    if fm.name.is_none() {
        diagnostics.push(Diagnostic::new(
            path, "V2E010", Severity::Error,
            "Missing required frontmatter field: name",
            1, 1,
        ));
    }

    // V2E011: missing kind
    if fm.kind.is_none() {
        diagnostics.push(Diagnostic::new(
            path, "V2E011", Severity::Error,
            "Missing required frontmatter field: kind",
            1, 1,
        ));
    }

    // V2E012: unknown kind (strict = error, compat = warning for corpus kinds)
    if let Some(ref kind) = fm.kind
        && !SPEC_KINDS.contains(&kind.as_str()) {
            if CORPUS_KINDS.contains(&kind.as_str()) {
                // In corpus but not in spec — warn in strict, skip in compat
                if profile == LintProfile::Strict {
                    diagnostics.push(Diagnostic::new(
                        path, "V2W005", Severity::Warning,
                        format!("Component kind `{kind}` is used in the Press corpus but not documented in the spec"),
                        1, 1,
                    ));
                }
            } else {
                diagnostics.push(Diagnostic::new(
                    path, "V2E012", Severity::Error,
                    format!("Unknown component kind: `{kind}` (spec: {}; corpus: {})",
                        SPEC_KINDS.join(", "), CORPUS_KINDS.join(", ")),
                    1, 1,
                ));
            }
        }

    // V2W002: unknown role
    if let Some(ref role) = fm.role
        && !SPEC_ROLES.contains(&role.as_str()) {
            diagnostics.push(Diagnostic::new(
                path, "V2W002", Severity::Warning,
                format!("Unknown component role: `{role}` (expected: {})",
                    SPEC_ROLES.join(", ")),
                1, 1,
            ));
        }

    // V2E013: program must have nodes/services
    if let Some(ref kind) = fm.kind
        && kind == "program" && fm.nodes.is_empty() {
            diagnostics.push(Diagnostic::new(
                path, "V2E013", Severity::Error,
                "Program must declare `nodes:` or `services:` listing its components",
                1, 1,
            ));
        }

    // V2W003: version missing
    if fm.version.is_none() {
        diagnostics.push(Diagnostic::new(
            path, "V2W003", Severity::Warning,
            "Missing version in frontmatter",
            1, 1,
        ));
    }

    // V2W004: name contains spaces
    if let Some(ref name) = fm.name
        && name.contains(' ') {
            diagnostics.push(Diagnostic::new(
                path, "V2W004", Severity::Warning,
                format!("Component name `{name}` contains spaces; prefer kebab-case"),
                1, 1,
            ));
        }
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
    if name.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false)
        && !name.contains('-')
        && name.chars().any(|c| c.is_ascii_lowercase())
    {
        return HeadingKind::Documentation;
    }

    // kebab-case or lowercase identifiers = likely component
    let looks_like_component = !name.is_empty()
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && name.chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false);

    if looks_like_component {
        return HeadingKind::Component;
    }

    HeadingKind::Documentation
}

fn parse_markdown_body(
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

                // Extract contracts from inside code blocks.
                // The corpus puts requires:/ensures: inside ``` blocks
                // (often under ## Contract). Parse them as contract items.
                parse_code_block_contracts(
                    &code_block_content,
                    body_offset + idx.saturating_sub(code_block_content.lines().count()),
                    &mut sections,
                );

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
            let heading_lower = heading_text.to_lowercase();

            // Flush pending heading
            if let Some(h) = current_heading.take() {
                headings.push(h);
            }

            if KNOWN_CONTRACT_SECTIONS.contains(&heading_lower.as_str()) {
                current_section = Some(heading_lower);
            } else {
                current_section = None;
                // ## headings are structural — don't classify as components
            }
            continue;
        }

        // ### heading
        if let Some(heading_text) = trimmed.strip_prefix("### ") {
            if let Some(h) = current_heading.take() {
                headings.push(h);
            }

            let kind = classify_heading(heading_text.trim(), &fm_nodes);
            current_heading = Some(Heading {
                name: heading_text.trim().to_string(),
                line: line_num,
                level: 3,
                kind,
                has_code_block: false,
                code_block_fields: HashSet::new(),
            });
            current_section = None;
            continue;
        }

        // Bare contract section markers (e.g., `requires:` at top level without ## heading)
        // The test fixtures use this pattern: frontmatter, then `requires:\n- item`
        if current_heading.is_none() {
            let trimmed_lower = trimmed.to_lowercase();
            if trimmed_lower == "requires:" || trimmed_lower.starts_with("requires:") {
                current_section = Some("requires".to_string());
                continue;
            } else if trimmed_lower == "ensures:" || trimmed_lower.starts_with("ensures:") {
                current_section = Some("ensures".to_string());
                continue;
            } else if trimmed_lower == "errors:" || trimmed_lower.starts_with("errors:") {
                current_section = Some("errors".to_string());
                continue;
            } else if trimmed_lower == "invariants:" || trimmed_lower.starts_with("invariants:") {
                current_section = Some("invariants".to_string());
                continue;
            } else if trimmed_lower == "strategies:" || trimmed_lower.starts_with("strategies:") {
                current_section = Some("strategies".to_string());
                continue;
            }
        }

        // List items in contract sections
        if let Some(ref section) = current_section
            && let Some(item_text) = trimmed.strip_prefix("- ") {
                let item = ContractItem {
                    text: item_text.to_string(),
                    line: line_num,
                };
                match section.as_str() {
                    "requires" => sections.requires.push(item),
                    "ensures" => sections.ensures.push(item),
                    "errors" => sections.errors.push(item),
                    "invariants" => sections.invariants.push(item),
                    "strategies" => sections.strategies.push(item),
                    _ => {}
                }
            }
    }

    // Flush trailing heading
    if let Some(h) = current_heading {
        headings.push(h);
    }

    if in_code_block {
        diagnostics.push(Diagnostic::new(
            path, "V2E020", Severity::Error,
            "Unterminated fenced code block",
            body_offset + body.lines().count(), 1,
        ));
    }

    (headings, sections)
}

/// Extract requires:/ensures:/errors:/invariants:/strategies: from inside a
/// fenced code block. The corpus commonly puts contracts inside ``` blocks
/// under ## Contract rather than as ## requires/## ensures headings.
fn parse_code_block_contracts(
    content: &str,
    base_line: usize,
    sections: &mut ContractSections,
) {
    let mut current_key: Option<&str> = None;

    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        let line_num = base_line + idx + 1;

        // Top-level key (not indented, ends with colon)
        if !trimmed.is_empty() && !line.starts_with(' ') && !line.starts_with('\t') {
            if trimmed == "requires:" || trimmed.starts_with("requires:") {
                current_key = Some("requires");
                continue;
            } else if trimmed == "ensures:" || trimmed.starts_with("ensures:") {
                current_key = Some("ensures");
                continue;
            } else if trimmed == "errors:" || trimmed.starts_with("errors:") {
                current_key = Some("errors");
                continue;
            } else if trimmed == "invariants:" || trimmed.starts_with("invariants:") {
                current_key = Some("invariants");
                continue;
            } else if trimmed == "strategies:" || trimmed.starts_with("strategies:") {
                current_key = Some("strategies");
                continue;
            } else {
                // Some other top-level key — stop collecting for current section
                current_key = None;
                continue;
            }
        }

        // Indented line under a contract key — treat as a contract item
        if let Some(key) = current_key {
            if let Some(item_text) = trimmed.strip_prefix("- ") {
                let item = ContractItem {
                    text: item_text.to_string(),
                    line: line_num,
                };
                match key {
                    "requires" => sections.requires.push(item),
                    "ensures" => sections.ensures.push(item),
                    "errors" => sections.errors.push(item),
                    "invariants" => sections.invariants.push(item),
                    "strategies" => sections.strategies.push(item),
                    _ => {}
                }
            }
            // Non-list indented lines (continuation of previous item) — skip
        }
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
                path, "V2W010", Severity::Warning,
                "Empty requires clause",
                item.line, 1,
            ));
        }
    }

    for item in &sections.ensures {
        if item.text.trim().is_empty() {
            diagnostics.push(Diagnostic::new(
                path, "V2W010", Severity::Warning,
                "Empty ensures clause",
                item.line, 1,
            ));
        }
    }

    // Hedging language in ensures
    for item in &sections.ensures {
        let lower = item.text.to_lowercase();
        if lower.starts_with("should ") || lower.contains(" should ") ||
           lower.starts_with("might ") || lower.contains(" might ") ||
           lower.starts_with("may ") || lower.contains(" may ") {
            diagnostics.push(Diagnostic::new(
                path, "V2W011", Severity::Warning,
                "Ensures clause uses hedging language (should/might/may); ensures are obligations, not suggestions",
                item.line, 1,
            ));
        }
    }

    for item in &sections.strategies {
        if item.text.trim().len() < 10 {
            diagnostics.push(Diagnostic::new(
                path, "V2W012", Severity::Warning,
                "Strategy clause may be too terse to guide model behavior",
                item.line, 1,
            ));
        }
    }

    // V2W014: service/program-node without ensures (a component that guarantees nothing)
    let kind = fm.kind.as_deref().unwrap_or("");
    if (kind == "service" || kind == "program-node")
        && sections.ensures.is_empty()
        && fm.ensures.is_empty()
    {
        diagnostics.push(Diagnostic::new(
            path, "V2W014", Severity::Warning,
            format!("Component of kind `{kind}` has no ensures clauses (not found in frontmatter, ## ensures section, bare ensures:, or code block contracts)"),
            1, 1,
        ));
    }

    // V2W015: program without requires (inputs never specified)
    if kind == "program"
        && sections.requires.is_empty()
        && fm.requires.is_empty()
    {
        diagnostics.push(Diagnostic::new(
            path, "V2W015", Severity::Warning,
            "Program has no requires clauses — callers won't know what inputs to provide",
            1, 1,
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
                path, "V2E030", Severity::Error,
                format!("Duplicate component name `{}` (first at line {})", h.name, prev_line),
                h.line, 1,
            ));
        }
    }

    // Component without code block (only for actual components, not docs/state)
    for h in headings {
        if h.kind == HeadingKind::Component && !h.has_code_block {
            diagnostics.push(Diagnostic::new(
                path, "V2W020", Severity::Warning,
                format!("Component `{}` has no fenced code block defining its contract", h.name),
                h.line, 1,
            ));
        }
    }

    // Component code block missing role
    for h in headings {
        if h.kind == HeadingKind::Component && h.has_code_block && !h.code_block_fields.contains("role") {
            diagnostics.push(Diagnostic::new(
                path, "V2W021", Severity::Warning,
                format!("Component `{}` code block does not declare a role", h.name),
                h.line, 1,
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

    // V2E040: node declared but not in body (only single-file mode)
    if !multi_file {
        for node in &fm.nodes {
            let lower = node.to_lowercase();
            if !component_names.contains(&lower) {
                diagnostics.push(Diagnostic::new(
                    path, "V2E040", Severity::Error,
                    format!("Node `{node}` declared in frontmatter but not defined as a ### component in body"),
                    1, 1,
                ));
            }
        }
    }

    // V2W030: component in body but not in frontmatter nodes
    let fm_nodes: HashSet<String> = fm.nodes.iter().map(|n| n.to_lowercase()).collect();
    for h in headings {
        if h.kind != HeadingKind::Component {
            continue;
        }
        let lower = h.name.to_lowercase();
        if !fm_nodes.contains(&lower) {
            diagnostics.push(Diagnostic::new(
                path, "V2W030", Severity::Warning,
                format!("Component `{}` defined in body but not listed in frontmatter nodes/services", h.name),
                h.line, 1,
            ));
        }
    }
}

// ── Multi-file Program Directory ────────────────────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
pub fn lint_program_dir(
    dir: &Path,
    profile: LintProfile,
) -> Result<Vec<LintResult>> {
    let mut results = Vec::new();
    let mut root_path = None;
    let mut root_nodes = Vec::new();

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path)
            && looks_like_prose_md(&content) {
                let result = lint_source_inner(&path, &content, profile, true);

                if content.contains("\nkind: program") || content.starts_with("---\nkind: program") {
                    root_path = Some(path.clone());
                    let (fm, _) = parse_frontmatter(&path, &content, &mut Vec::new());
                    root_nodes = fm.nodes.clone();
                }

                results.push(result);
            }
    }

    // V2E050: no root program file
    if root_path.is_none() && !results.is_empty() {
        let dir_path = dir.to_path_buf();
        results.push(LintResult {
            path: dir_path.clone(),
            diagnostics: vec![Diagnostic::new(
                &dir_path, "V2E050", Severity::Error,
                "No root program file found (no file with `kind: program`)",
                1, 1,
            )],
        });
    }

    // V2E051: node file missing
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

        for node in &root_nodes {
            if !existing_files.contains(node) {
                results.push(LintResult {
                    path: rp.clone(),
                    diagnostics: vec![Diagnostic::new(
                        rp, "V2E051", Severity::Error,
                        format!("Node `{node}` listed in program but no `{node}.md` file found"),
                        1, 1,
                    )],
                });
            }
        }
    }

    Ok(results)
}

// ── Spec Discovery ──────────────────────────────────────────────────────────

/// Observation from a corpus of .md program files — patterns for the spec author to consider.
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
    /// role + delegates patterns observed (e.g., "leaf with empty delegates", "orchestrator with delegates")
    pub role_delegation_patterns: BTreeMap<String, usize>,
    /// api/prohibited overlap within the same component
    pub api_prohibited_overlaps: Vec<(String, Vec<String>)>,
    /// State variables that are read but never written (within a program dir)
    pub orphan_state_reads: Vec<(String, String)>,  // (program, state_var)
    /// State variables that are written but never read
    pub orphan_state_writes: Vec<(String, String)>,
    /// Total files analyzed
    pub file_count: usize,
}

impl std::fmt::Display for SpecDiscovery {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "=== Spec Discovery Report ({} files) ===\n", self.file_count)?;

        if !self.undocumented_kinds.is_empty() {
            writeln!(f, "## Undocumented `kind:` values\n")?;
            writeln!(f, "The spec defines: {}", SPEC_KINDS.join(", "))?;
            writeln!(f, "The corpus also uses:\n")?;
            for (kind, files) in &self.undocumented_kinds {
                writeln!(f, "  `{kind}` ({} files): {}", files.len(),
                    files.iter().take(3).cloned().collect::<Vec<_>>().join(", "))?;
            }
            writeln!(f)?;
        }

        if !self.undocumented_keys.is_empty() {
            writeln!(f, "## Undocumented frontmatter keys\n")?;
            writeln!(f, "The spec defines: {}\n", SPEC_FRONTMATTER_KEYS.join(", "))?;
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

        if !self.role_delegation_patterns.is_empty() {
            writeln!(f, "## Role ↔ delegation patterns\n")?;
            writeln!(f, "How `role:` correlates with `delegates:` in the corpus:\n")?;
            for (pattern, count) in &self.role_delegation_patterns {
                writeln!(f, "  {pattern}: {count} files")?;
            }
            writeln!(f)?;
        }

        if !self.api_prohibited_overlaps.is_empty() {
            writeln!(f, "## API / prohibited overlaps\n")?;
            writeln!(f, "Components where the same API appears in both `api:` and `prohibited:`:\n")?;
            for (file, apis) in &self.api_prohibited_overlaps {
                writeln!(f, "  {file}: {}", apis.join(", "))?;
            }
            writeln!(f)?;
        }

        if !self.orphan_state_reads.is_empty() || !self.orphan_state_writes.is_empty() {
            writeln!(f, "## State coherence observations\n")?;
            if !self.orphan_state_reads.is_empty() {
                writeln!(f, "State variables read but never written in the same program:\n")?;
                for (prog, var) in &self.orphan_state_reads {
                    writeln!(f, "  {prog}: reads `{var}` — no node writes it")?;
                }
                writeln!(f)?;
            }
            if !self.orphan_state_writes.is_empty() {
                writeln!(f, "State variables written but never read in the same program:\n")?;
                for (prog, var) in &self.orphan_state_writes {
                    writeln!(f, "  {prog}: writes `{var}` — no other node reads it")?;
                }
                writeln!(f)?;
            }
        }

        Ok(())
    }
}

/// Analyze a set of .md program files and report vocabulary not in the spec.
#[cfg(not(target_arch = "wasm32"))]
pub fn discover_spec_gaps(targets: &[PathBuf]) -> Result<SpecDiscovery> {
    let files = collect_files(targets)?;
    let mut discovery = SpecDiscovery { file_count: files.len(), ..Default::default() };

    for file in &files {
        let content = std::fs::read_to_string(file)
            .with_context(|| format!("read {}", file.display()))?;
        let filename = file.file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        let (fm, body_start) = parse_frontmatter(file, &content, &mut Vec::new());

        // Undocumented frontmatter keys
        for key in fm.all_keys.keys() {
            if !SPEC_FRONTMATTER_KEYS.contains(&key.as_str()) {
                discovery.undocumented_keys
                    .entry(key.clone())
                    .or_default()
                    .insert(filename.clone());
            }
        }

        // Undocumented kinds
        if let Some(ref kind) = fm.kind
            && !SPEC_KINDS.contains(&kind.as_str()) {
                discovery.undocumented_kinds
                    .entry(kind.clone())
                    .or_default()
                    .insert(filename.clone());
            }

        // Undocumented roles
        if let Some(ref role) = fm.role
            && !SPEC_ROLES.contains(&role.as_str()) {
                discovery.undocumented_roles
                    .entry(role.clone())
                    .or_default()
                    .insert(filename.clone());
            }

        // Heading patterns
        let body = content.lines().skip(body_start).collect::<Vec<_>>().join("\n");
        let fm_nodes: HashSet<String> = fm.nodes.iter().map(|n| n.to_lowercase()).collect();
        for line in body.lines() {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix("### ") {
                let kind = classify_heading(heading.trim(), &fm_nodes);
                if kind == HeadingKind::Documentation {
                    // Categorize the pattern
                    let pattern = if heading.trim().starts_with(|c: char| c.is_ascii_digit()) {
                        "numbered step".to_string()
                    } else if heading.trim().starts_with('&') {
                        "state schema".to_string()
                    } else {
                        heading.trim().to_string()
                    };
                    discovery.doc_heading_patterns
                        .entry(pattern)
                        .or_default()
                        .insert(filename.clone());
                }
            }
        }

        // Role ↔ delegation pattern
        if let Some(ref role) = fm.role {
            let has_delegates = !fm.delegates.is_empty()
                && fm.delegates.iter().any(|d| d != "[]" && !d.is_empty());
            let pattern = format!("{role} + {}", if has_delegates { "delegates" } else { "no delegates" });
            *discovery.role_delegation_patterns.entry(pattern).or_insert(0) += 1;
        }

        // API / prohibited overlap
        if !fm.api.is_empty() && !fm.prohibited.is_empty() {
            let api_set: HashSet<&str> = fm.api.iter().map(|s| s.as_str()).collect();
            let overlap: Vec<String> = fm.prohibited.iter()
                .filter(|p| api_set.contains(p.as_str()))
                .cloned()
                .collect();
            if !overlap.is_empty() {
                discovery.api_prohibited_overlaps.push((filename.clone(), overlap));
            }
        }
    }

    // State coherence: scan program directories for read/write mismatches
    // Group files by parent directory to find program boundaries
    let mut programs: BTreeMap<String, Vec<(String, Frontmatter)>> = BTreeMap::new();
    for file in &files {
        if let Some(parent) = file.parent()
            && is_program_dir(parent) {
                let prog_name = parent.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let content = std::fs::read_to_string(file)?;
                let (fm, _) = parse_frontmatter(file, &content, &mut Vec::new());
                let fname = file.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                programs.entry(prog_name).or_default().push((fname, fm));
            }
    }

    for (prog_name, components) in &programs {
        let mut all_reads: HashSet<String> = HashSet::new();
        let mut all_writes: HashSet<String> = HashSet::new();

        for (_fname, fm) in components {
            // Parse state reads/writes from the all_keys (they're nested under state:)
            // We already capture delegates — for state we need to look at the raw keys
            // For now, use the delegates field as a proxy, and check requires/ensures for & refs
            for req in &fm.requires {
                if req.contains('&') {
                    // Extract &VarName patterns
                    for word in req.split_whitespace() {
                        if word.starts_with('&') {
                            all_reads.insert(word.trim_matches(|c: char| !c.is_alphanumeric() && c != '&').to_string());
                        }
                    }
                }
            }
            for ens in &fm.ensures {
                if ens.contains('&') {
                    for word in ens.split_whitespace() {
                        if word.starts_with('&') {
                            all_writes.insert(word.trim_matches(|c: char| !c.is_alphanumeric() && c != '&').to_string());
                        }
                    }
                }
            }
        }

        for var in &all_reads {
            if !all_writes.contains(var) {
                discovery.orphan_state_reads.push((prog_name.clone(), var.clone()));
            }
        }
        for var in &all_writes {
            if !all_reads.contains(var) {
                discovery.orphan_state_writes.push((prog_name.clone(), var.clone()));
            }
        }
    }

    Ok(discovery)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_v2_content() {
        let source = "---\nname: test\nkind: program\nnodes: [a, b]\n---\n# Test\n";
        assert!(looks_like_prose_md(source));
    }

    #[test]
    fn rejects_non_v2_content() {
        assert!(!looks_like_prose_md("agent foo:\n  model: sonnet\n"));
        assert!(!looks_like_prose_md("---\nname: test\n---\n")); // no kind:
    }

    #[test]
    fn missing_frontmatter() {
        let source = "# Just a heading\nSome text\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E001"));
    }

    #[test]
    fn unterminated_frontmatter() {
        let source = "---\nname: test\nkind: program\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E002"));
    }

    #[test]
    fn missing_name() {
        let source = "---\nkind: program\nnodes: [a]\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E010"));
    }

    #[test]
    fn missing_kind() {
        let source = "---\nname: test\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E011"));
    }

    #[test]
    fn unknown_kind_error() {
        let source = "---\nname: test\nkind: widget\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E012"));
    }

    #[test]
    fn driver_kind_accepted_in_compat() {
        let source = "---\nname: test\nkind: driver\nversion: 0.1.0\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        // No error in compat mode for corpus kinds
        assert!(!result.diagnostics.iter().any(|d| d.code == "V2E012"));
    }

    #[test]
    fn program_without_nodes() {
        let source = "---\nname: test\nkind: program\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E013"));
    }

    #[test]
    fn duplicate_frontmatter_key() {
        let source = "---\nname: test\nkind: program\nname: other\nnodes: [a]\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E003"));
    }

    #[test]
    fn nested_yaml_not_flagged_as_unknown() {
        let source = "---\nname: test\nkind: program-node\nversion: 0.1.0\nstate:\n  reads: [&Foo]\n  writes: [&Bar]\n---\n# Test\n";
        let result = lint_source(Path::new("test.md"), source);
        // reads/writes should NOT appear as unknown keys (they're nested under state:)
        assert!(!result.diagnostics.iter().any(|d|
            d.code == "V2W001" && d.message.contains("reads")),
            "reads should not be flagged: {:?}", result.diagnostics);
    }

    #[test]
    fn hedging_in_ensures() {
        let source = "---\nname: test\nkind: service\n---\n# Test\n\n## ensures\n\n- result should be correct\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2W011"));
    }

    #[test]
    fn state_schema_heading_not_treated_as_component() {
        let source = "---\nname: test\nkind: program\nnodes: [solver]\nversion: 0.1.0\n---\n\n### solver\n\n```\nrole: leaf\n```\n\n### &GameState\n\n```\nlevel: number\n```\n";
        let result = lint_source(Path::new("test.md"), source);
        // &GameState should not trigger V2W030 (not in nodes)
        assert!(!result.diagnostics.iter().any(|d|
            d.code == "V2W030" && d.message.contains("GameState")),
            "state schema should not be flagged as unlisted component: {:?}", result.diagnostics);
    }

    #[test]
    fn doc_heading_not_treated_as_component() {
        let source = "---\nname: test\nkind: program\nnodes: [solver]\nversion: 0.1.0\n---\n\n### solver\n\n```\nrole: leaf\n```\n\n### When to use direct delegation\n\nSome docs here.\n";
        let result = lint_source(Path::new("test.md"), source);
        // Documentation heading should not trigger V2W030
        assert!(!result.diagnostics.iter().any(|d|
            d.code == "V2W030" && d.message.contains("When")),
            "doc heading should not be flagged: {:?}", result.diagnostics);
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
        let result = lint_source(Path::new("test.md"), source);
        let errors: Vec<_> = result.diagnostics.iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        assert!(errors.is_empty(), "unexpected errors: {:?}", errors);
    }

    #[test]
    fn node_not_defined_in_body() {
        let source = "---\nname: test\nkind: program\nnodes: [a, b, missing]\nversion: 0.1.0\n---\n\n### a\n\n```\nrole: leaf\n```\n\n### b\n\n```\nrole: leaf\n```\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E040"),
            "expected V2E040, got: {:?}", result.diagnostics);
    }

    #[test]
    fn duplicate_component_name() {
        let source = "---\nname: test\nkind: program\nnodes: [a]\nversion: 0.1.0\n---\n\n### a\n\n```\nrole: leaf\n```\n\n### a\n\n```\nrole: leaf\n```\n";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2E030"));
    }

    #[test]
    fn contracts_inside_code_blocks_are_parsed() {
        // The corpus pattern: ## Contract with requires/ensures inside a code block
        let source = "\
---
name: critic
kind: program-node
version: 0.1.0
---

# Critic

## Contract

```
requires:
  - result: the work product to evaluate
  - criteria: what constitutes acceptance

ensures:
  - Return a structured verdict
  - Issues are specific and actionable
```
";
        let result = lint_source(Path::new("test.md"), source);
        // Should NOT have V2W014 (missing ensures) because ensures are in the code block
        assert!(!result.diagnostics.iter().any(|d| d.code == "V2W014"),
            "should not flag missing ensures when they're in a code block: {:?}",
            result.diagnostics);
    }

    #[test]
    fn bare_toplevel_contracts_are_parsed() {
        // The fixtures pattern: requires/ensures as bare markdown after frontmatter
        let source = "\
---
name: uppercaser
kind: service
version: 0.1.0
---

requires:
- text: a piece of text

ensures:
- uppercased: the text converted to all uppercase
";
        let result = lint_source(Path::new("test.md"), source);
        assert!(!result.diagnostics.iter().any(|d| d.code == "V2W014"),
            "should not flag missing ensures when they're bare top-level: {:?}",
            result.diagnostics);
    }

    #[test]
    fn service_without_any_ensures_warns() {
        // No ensures anywhere — not in frontmatter, not in sections, not in code blocks
        let source = "\
---
name: bare-service
kind: service
version: 0.1.0
---

# Bare Service

Does stuff but makes no promises.
";
        let result = lint_source(Path::new("test.md"), source);
        assert!(result.diagnostics.iter().any(|d| d.code == "V2W014"),
            "expected V2W014 for service with no ensures: {:?}", result.diagnostics);
    }
}
