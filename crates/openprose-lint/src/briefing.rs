use crate::current_lint::{
    self, ContractSections, Frontmatter, parse_frontmatter, parse_markdown_body,
};
use crate::diag::Severity;
use crate::profile::LintProfile;
use std::collections::HashMap;
use std::fmt::Write;
use std::path::Path;

/// Generate a preflight briefing for an OpenProse Markdown program.
///
/// The briefing is a versioned markdown block (~200 tokens) designed to be
/// read by a Prose-Complete VM agent alongside the spec files. It contains
/// pre-parsed structural analysis: contract, service resolution, feature
/// flags, and a diagnostic summary.
pub fn generate_briefing(path: &Path, source: &str) -> String {
    let mut diags = Vec::new();
    let (fm, body_start) = parse_frontmatter(path, source, &mut diags);

    let body = if body_start < source.lines().count() {
        source
            .lines()
            .skip(body_start)
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };

    // parse_markdown_body returns (Vec<Heading>, ContractSections) — we only need sections
    let sections: ContractSections =
        parse_markdown_body(path, &body, body_start, &fm, &mut diags).1;

    // Run the full lint to get diagnostic counts
    let lint_result =
        current_lint::current_lint_source_with_profile(path, source, LintProfile::Compat);
    let errors = lint_result
        .diagnostics
        .iter()
        .filter(|d| d.severity == Severity::Error)
        .count();
    let warnings = lint_result
        .diagnostics
        .iter()
        .filter(|d| d.severity == Severity::Warning)
        .count();

    let mut out = String::new();
    write_header(&mut out, &fm);
    write_contract(&mut out, &fm, &sections);
    write_services(&mut out, &fm, source, path);
    write_features(&mut out, &fm, &sections, source);
    write_diagnostics(&mut out, errors, warnings);
    out
}

fn write_header(out: &mut String, fm: &Frontmatter) {
    let name = fm.name.as_deref().unwrap_or("unnamed");
    let kind = fm.kind.as_deref().unwrap_or("unknown");
    let service_count = fm.nodes.len();
    let import_count = fm.use_deps.len();

    writeln!(out, "<!-- openprose-lint briefing v1 -->").unwrap();
    writeln!(out, "## {name}").unwrap();
    writeln!(
        out,
        "kind: {kind} | services: {service_count} | imports: {import_count}"
    )
    .unwrap();
}

fn write_contract(out: &mut String, fm: &Frontmatter, sections: &ContractSections) {
    writeln!(out).unwrap();
    writeln!(out, "### contract").unwrap();

    write_contract_section(out, "requires", &sections.requires, &fm.requires);
    write_contract_section(out, "ensures", &sections.ensures, &fm.ensures);
    write_contract_section(out, "errors", &sections.errors, &[]);

    if sections.environment.is_empty() {
        writeln!(out, "environment: (none)").unwrap();
    } else {
        writeln!(out, "environment:").unwrap();
        for item in &sections.environment {
            let var_name = item.text.split(':').next().unwrap_or(&item.text).trim();
            writeln!(out, "- {var_name}").unwrap();
        }
    }
}

fn write_contract_section(
    out: &mut String,
    name: &str,
    body_items: &[crate::current_lint::ContractItem],
    fm_items: &[String],
) {
    if !body_items.is_empty() {
        writeln!(out, "{name}:").unwrap();
        for item in body_items {
            writeln!(out, "- {}", item.text).unwrap();
        }
    } else if !fm_items.is_empty() {
        writeln!(out, "{name}:").unwrap();
        for item in fm_items {
            writeln!(out, "- {item}").unwrap();
        }
    } else {
        writeln!(out, "{name}: (none)").unwrap();
    }
}

fn write_services(out: &mut String, fm: &Frontmatter, source: &str, path: &Path) {
    writeln!(out).unwrap();
    writeln!(out, "### services").unwrap();

    let use_map: HashMap<String, String> = fm
        .use_deps
        .iter()
        .filter_map(|dep| {
            let basename = dep.rsplit('/').next()?;
            Some((basename.to_string(), dep.clone()))
        })
        .collect();

    let has_execution = source
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("### execution"));
    let has_any_h3 = source.lines().any(|line| line.trim().starts_with("### "));

    // Check for local service files in same dir and services/ subdir
    let parent = path.parent();

    for service in &fm.nodes {
        if let Some(import_path) = use_map.get(service.as_str()) {
            writeln!(out, "{service} \u{2192} use: {import_path}").unwrap();
        } else if let Some(dir) = parent {
            let same_dir = dir.join(format!("{service}.md"));
            let services_subdir = dir.join("services").join(format!("{service}.md"));
            if same_dir.exists() {
                writeln!(out, "{service} \u{2192} local (./{service}.md)").unwrap();
            } else if services_subdir.exists() {
                writeln!(out, "{service} \u{2192} local (services/{service}.md)").unwrap();
            } else if has_execution {
                writeln!(out, "{service} \u{2192} inline").unwrap();
            } else if !has_any_h3 {
                writeln!(out, "{service} \u{2192} vm-managed").unwrap();
            } else {
                writeln!(out, "{service} \u{2192} unresolved").unwrap();
            }
        } else if has_execution {
            writeln!(out, "{service} \u{2192} inline").unwrap();
        } else if !has_any_h3 {
            writeln!(out, "{service} \u{2192} vm-managed").unwrap();
        } else {
            writeln!(out, "{service} \u{2192} unresolved").unwrap();
        }
    }
}

fn write_features(out: &mut String, fm: &Frontmatter, sections: &ContractSections, source: &str) {
    let has_env = !sections.environment.is_empty();
    let has_use = !fm.use_deps.is_empty();

    let has_run_inputs = sections.requires.iter().any(|item| {
        let lower = item.text.to_lowercase();
        lower.contains(": run") || lower.contains(": run[]")
    });

    let has_execution = source
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("### execution"));

    writeln!(out).unwrap();
    writeln!(out, "### features").unwrap();
    writeln!(
        out,
        "environment: {} | use-imports: {} | run-inputs: {} | execution-block: {}",
        yn(has_env),
        yn(has_use),
        yn(has_run_inputs),
        yn(has_execution)
    )
    .unwrap();
}

fn write_diagnostics(out: &mut String, errors: usize, warnings: usize) {
    writeln!(out).unwrap();
    writeln!(out, "### diagnostics").unwrap();
    writeln!(out, "{errors} errors, {warnings} warnings").unwrap();
}

fn yn(b: bool) -> &'static str {
    if b { "yes" } else { "no" }
}
