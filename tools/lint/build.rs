//! Parses the compiler spec markdown to generate linter vocabulary.
//!
//! Extracts from the co-located compiler.md spec:
//! - Agent property names and known model values
//! - Permission types and values
//!
//! The generated file is written to OUT_DIR/spec_vocab.rs and included
//! by src/lint.rs at compile time.

use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Resolve compiler.md relative to this crate's position in the repo:
    // tools/lint/build.rs → skills/open-prose/compiler.md
    let spec_path = Path::new("../../skills/open-prose/compiler.md");

    println!("cargo:rerun-if-changed={}", spec_path.display());

    let spec = match fs::read_to_string(spec_path) {
        Ok(s) => s,
        Err(_) => {
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
        .filter(|v| v != "Array")
        .collect::<BTreeSet<_>>();

    let out_dir = env::var("OUT_DIR").unwrap();
    let out_path = Path::new(&out_dir).join("spec_vocab.rs");

    let code = format!(
        r#"// Auto-generated from compiler.md — do not edit manually.

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
        r#"// Fallback — compiler.md not found.
pub const SPEC_MODELS: &[&str] = &[];
pub const SPEC_AGENT_PROPERTIES: &[&str] = &[];
pub const SPEC_PERMISSION_TYPES: &[&str] = &[];
pub const SPEC_PERMISSION_VALUES: &[&str] = &[];
"#,
    )
    .expect("failed to write fallback spec_vocab.rs");
}

fn extract_models(spec: &str) -> BTreeSet<String> {
    let mut models = BTreeSet::new();
    for line in spec.lines() {
        if line.contains("`model`") && line.contains("identifier") {
            let cols: Vec<&str> = line.split('|').collect();
            if cols.len() >= 4 {
                for val in cols[3].split(',') {
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

fn extract_agent_properties(spec: &str) -> BTreeSet<String> {
    let mut props = BTreeSet::new();
    let mut in_agent_table = false;

    for line in spec.lines() {
        if line.contains("| Property")
            && line.contains("| Type")
            && line.contains("| Values")
        {
            in_agent_table = true;
            continue;
        }
        if in_agent_table && line.starts_with("| -") {
            continue;
        }
        if in_agent_table && !line.starts_with('|') {
            in_agent_table = false;
            continue;
        }
        if in_agent_table {
            let cols: Vec<&str> = line.split('|').collect();
            if cols.len() >= 2 {
                let prop = cols[1].trim().trim_matches('`').trim();
                if !prop.is_empty() && prop != "Property" {
                    props.insert(prop.to_string());
                }
            }
        }
    }
    props
}

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
        if !in_table {
            if line.starts_with('|') {
                in_table = true;
                if line.starts_with("| -") {
                    // separator row — skip without extracting values
                }
                continue;
            } else if !line.trim().is_empty() {
                continue;
            }
        }
        if in_table {
            if line.starts_with("| -") {
                continue;
            }
            if !line.starts_with('|') {
                break;
            }
            let cols: Vec<&str> = line.split('|').collect();
            if cols.len() > col_index + 1 {
                let val = cols[col_index + 1].trim().trim_matches('`').trim();
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
        .map(|s| format!("\"{s}\""))
        .collect::<Vec<_>>()
        .join(", ")
}
