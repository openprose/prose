//! Parses the compiler spec markdown to generate linter vocabulary.
//!
//! Extracts from the colocated OpenProse spec checkout:
//! - Agent property names and known model values
//! - Permission types and values
//! - Block/statement keywords
//!
//! The generated file is written to OUT_DIR/spec_vocab.rs and included
//! by src/lint.rs at compile time. Update the parent prose checkout to update
//! vocabulary.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let spec_candidates = [
        "../../skills/open-prose/compiler/index.prose.md",
        "../../skills/open-prose/v0/compiler.md",
        "../../skills/open-prose/compiler.md",
        "spec-snapshot/openprose/skills/open-prose/compiler/index.prose.md",
        "spec-snapshot/openprose/skills/open-prose/v0/compiler.md",
        "spec-snapshot/openprose/skills/open-prose/compiler.md",
    ];

    for candidate in &spec_candidates {
        println!("cargo:rerun-if-changed={candidate}");
    }

    let spec_path = spec_candidates
        .iter()
        .map(Path::new)
        .find(|path| path.exists());

    let Some(spec_path) = spec_path else {
        // Spec not available (e.g. crate built outside the full OpenProse
        // checkout) — use empty defaults.
        // The hardcoded fallbacks in lint.rs will be used.
        eprintln!(
            "cargo:warning=No compiler spec found in known locations, using fallback vocabulary"
        );
        write_fallback();
        return;
    };

    let spec = match fs::read_to_string(spec_path) {
        Ok(s) => s,
        Err(_) => {
            // Spec not available — use empty defaults.
            // The hardcoded fallbacks in lint.rs will be used.
            eprintln!(
                "cargo:warning=Spec not found at {}, using fallback vocabulary",
                spec_path.display()
            );
            write_fallback();
            return;
        }
    };

    let models = extract_models(&spec);
    let agent_props = extract_agent_properties(&spec);
    let permission_types = extract_table_column(&spec, "#### Permission Types", 0);
    let permission_values = extract_table_column(&spec, "#### Permission Values", 0)
        .into_iter()
        .filter(|v| v != "Array") // "Array" is a description, not a value
        .collect::<BTreeSet<_>>();

    let out_dir = env::var("OUT_DIR").unwrap();
    let out_path = Path::new(&out_dir).join("spec_vocab.rs");

    let code = format!(
        r#"// Auto-generated from compiler spec — do not edit manually.
// Re-run `cargo build` after updating the OpenProse spec checkout.

pub const SPEC_MODELS: &[&str] = &[{models}];
pub const SPEC_AGENT_PROPERTIES: &[&str] = &[{agent_props}];
pub const SPEC_PERMISSION_TYPES: &[&str] = &[{perm_types}];
pub const SPEC_PERMISSION_VALUES: &[&str] = &[{perm_values}];
"#,
        models = format_str_slice(&models),
        agent_props = format_str_slice(&agent_props),
        perm_types = format_str_slice(&permission_types),
        perm_values = format_str_slice(&permission_values),
    );

    fs::write(&out_path, code).expect("failed to write spec_vocab.rs");
}

fn write_fallback() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let out_path = Path::new(&out_dir).join("spec_vocab.rs");
    fs::write(
        &out_path,
        r#"// Fallback — colocated spec not available.
pub const SPEC_MODELS: &[&str] = &[];
pub const SPEC_AGENT_PROPERTIES: &[&str] = &[];
pub const SPEC_PERMISSION_TYPES: &[&str] = &[];
pub const SPEC_PERMISSION_VALUES: &[&str] = &[];
"#,
    )
    .expect("failed to write fallback spec_vocab.rs");
}

/// Extract model names from the agent property table.
/// Looks for: | `model` | identifier | `sonnet`, `opus`, `haiku` | ...
fn extract_models(spec: &str) -> BTreeSet<String> {
    let mut models = BTreeSet::new();
    for line in spec.lines() {
        if line.contains("`model`") && line.contains("identifier") {
            // Parse the Values column: `sonnet`, `opus`, `haiku`
            let cols: Vec<&str> = line.split('|').collect();
            if let Some(values_col) = cols.get(3) {
                for val in values_col.split(',') {
                    let val = val.trim().trim_matches('`').trim();
                    if !val.is_empty()
                        && val
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                    {
                        models.insert(val.to_string());
                    }
                }
            }
        }
    }
    models
}

/// Extract agent property names from the property table.
/// Looks for rows like: | `model` | identifier | ...
fn extract_agent_properties(spec: &str) -> BTreeSet<String> {
    let mut props = BTreeSet::new();
    let mut in_agent_table = false;

    for line in spec.lines() {
        // Detect the agent property table by its header
        if line.contains("| Property") && line.contains("| Type") && line.contains("| Values") {
            in_agent_table = true;
            continue;
        }
        // Table separator
        if in_agent_table && line.starts_with("| -") {
            continue;
        }
        // End of table
        if in_agent_table && !line.starts_with('|') {
            in_agent_table = false;
            continue;
        }
        if in_agent_table {
            let cols: Vec<&str> = line.split('|').collect();
            if let Some(prop_col) = cols.get(1) {
                let prop = prop_col.trim().trim_matches('`').trim();
                if !prop.is_empty() && prop != "Property" {
                    props.insert(prop.to_string());
                }
            }
        }
    }
    props
}

/// Extract the first column of a markdown table that follows a given heading.
fn extract_table_column(spec: &str, heading: &str, col_index: usize) -> BTreeSet<String> {
    let mut values = BTreeSet::new();
    let mut found_heading = false;
    let mut in_table = false;

    for line in spec.lines() {
        if line.trim() == heading {
            found_heading = true;
            continue;
        }
        if !found_heading {
            continue;
        }
        // Skip until we hit a table
        if !in_table {
            if line.starts_with('|') && !line.starts_with("| -") {
                // Check if this is the header row
                if line.contains("| -")
                    || line.to_lowercase().contains("type")
                    || line.to_lowercase().contains("value")
                {
                    in_table = true;
                    continue;
                }
                in_table = true;
                // This might be a data row already
            } else if line.starts_with("| -") {
                in_table = true;
                continue;
            } else if found_heading && !line.trim().is_empty() && !line.starts_with('|') {
                // Non-table content after heading — skip blank lines
                if !line.trim().is_empty() && !line.starts_with('|') {
                    continue;
                }
            }
        }
        if in_table {
            if line.starts_with("| -") {
                continue; // separator
            }
            if !line.starts_with('|') {
                break; // end of table
            }
            let cols: Vec<&str> = line.split('|').collect();
            if let Some(col) = cols.get(col_index + 1) {
                let val = col.trim().trim_matches('`').trim();
                if !val.is_empty()
                    && val != "Type"
                    && val != "Value"
                    && val
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                {
                    values.insert(val.to_string());
                }
            }
        }
    }
    values
}

fn format_str_slice(set: &BTreeSet<String>) -> String {
    set.iter()
        .map(|s| format!("\"{}\"", s))
        .collect::<Vec<_>>()
        .join(", ")
}
