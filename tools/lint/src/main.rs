use anyhow::Result;
use openprose_lint::lint_legacy::{count_diagnostics, lint_paths_with_profile};
use openprose_lint::lint;
use openprose_lint::profile::LintProfile;
use std::path::PathBuf;

fn main() -> Result<()> {
    let code = run(std::env::args().skip(1))?;
    std::process::exit(code);
}

fn run(args: impl IntoIterator<Item = String>) -> Result<i32> {
    let args: Vec<String> = args.into_iter().collect();

    let command = if let Some(first) = args.first() {
        match first.as_str() {
            "lint" | "lint-md" | "discover" | "help" | "--help" | "-h" => first.clone(),
            _ => "lint".to_string(),
        }
    } else {
        print_usage();
        return Ok(0);
    };

    let rest: Vec<String> = if ["lint", "lint-md", "discover", "help", "--help", "-h"]
        .contains(&args.first().map(|s| s.as_str()).unwrap_or(""))
    {
        args[1..].to_vec()
    } else {
        args
    };

    match command.as_str() {
        "lint" => run_lint(rest),
        "lint-md" => run_lint_md(rest),
        "discover" => run_discover(rest),
        _ => {
            print_usage();
            Ok(0)
        }
    }
}

fn print_usage() {
    eprintln!(
        "openprose-lint — deterministic linter for OpenProse programs\n\
         \n\
         Usage:\n  \
         openprose-lint lint [--profile strict|compat] <path> [...]       v1 .prose files\n  \
         openprose-lint lint-md [--profile strict|compat] <path> [...]    .md programs\n  \
         openprose-lint discover <path> [...]                             spec gap report\n\
         \n\
         The linter auto-detects multi-file program directories.\n\
         \n\
         Profiles:\n  \
         compat (default)  Warnings for legacy/compatibility constructs\n  \
         strict            Errors for anything not in the current spec\n\
         \n\
         Exit codes:\n  \
         0  No errors\n  \
         1  One or more errors\n  \
         2  CLI usage error"
    );
}

fn parse_lint_args(args: Vec<String>) -> Result<(LintProfile, Vec<PathBuf>), i32> {
    let mut profile = LintProfile::default();
    let mut targets = Vec::new();
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--profile" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --profile");
                    return Err(2);
                };
                profile = value.parse().map_err(|e| {
                    eprintln!("openprose-lint: {e}");
                    2
                })?;
            }
            _ => targets.push(PathBuf::from(arg)),
        }
    }

    if targets.is_empty() {
        return Err(2);
    }

    Ok((profile, targets))
}

fn run_lint(args: Vec<String>) -> Result<i32> {
    let (profile, targets) = match parse_lint_args(args) {
        Ok(v) => v,
        Err(code) => {
            eprintln!("Usage: openprose-lint lint [--profile strict|compat] <path> [...]");
            return Ok(code);
        }
    };

    let results = lint_paths_with_profile(&targets, profile)?;

    if results.is_empty() {
        eprintln!("openprose-lint: no .prose files found");
        return Ok(2);
    }

    for result in &results {
        if result.diagnostics.is_empty() {
            continue;
        }
        for d in &result.diagnostics {
            println!(
                "{}:{}:{} {} {} {}",
                d.path.display(), d.line, d.column, d.severity, d.code, d.message
            );
        }
    }

    let counts = count_diagnostics(&results);
    println!(
        "\n{} file(s), {} error(s), {} warning(s) [profile: {}]",
        results.len(), counts.errors, counts.warnings, profile
    );

    Ok(if counts.errors > 0 { 1 } else { 0 })
}

fn run_lint_md(args: Vec<String>) -> Result<i32> {
    let (profile, targets) = match parse_lint_args(args) {
        Ok(v) => v,
        Err(code) => {
            eprintln!("Usage: openprose-lint lint-md [--profile strict|compat] <path> [...]");
            return Ok(code);
        }
    };

    let results = lint::lint_paths_with_profile(&targets, profile)?;

    if results.is_empty() {
        eprintln!("openprose-lint: no .md program files found");
        return Ok(2);
    }

    let mut total_errors = 0usize;
    let mut total_warnings = 0usize;

    for result in &results {
        if result.diagnostics.is_empty() {
            continue;
        }
        for d in &result.diagnostics {
            match d.severity {
                openprose_lint::Severity::Error => total_errors += 1,
                openprose_lint::Severity::Warning => total_warnings += 1,
            }
            println!(
                "{}:{}:{} {} {} {}",
                d.path.display(), d.line, d.column, d.severity, d.code, d.message
            );
        }
    }

    println!(
        "\n{} file(s), {} error(s), {} warning(s) [profile: {}]",
        results.len(), total_errors, total_warnings, profile
    );

    Ok(if total_errors > 0 { 1 } else { 0 })
}

fn run_discover(args: Vec<String>) -> Result<i32> {
    let targets: Vec<PathBuf> = args.into_iter().map(PathBuf::from).collect();

    if targets.is_empty() {
        eprintln!("Usage: openprose-lint discover <path> [...]");
        return Ok(2);
    }

    let discovery = lint::discover_spec_gaps(&targets)?;
    println!("{discovery}");
    Ok(0)
}
