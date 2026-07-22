use crate::adapter::validate_adapter_manifest;
use crate::adapter_dogfood::{AdapterDogfoodOptions, DogfoodInput, dogfood_adapter_manifest};
use crate::capabilities::{
    capability_report_for_target, capability_report_for_target_with_runtime,
};
use crate::conformance::run_conformance;
use crate::current_lint;
use crate::lint::{
    count_diagnostics as count_legacy_diagnostics,
    lint_paths_with_profile as lint_legacy_paths_with_profile,
};
use crate::profile::LintProfile;
use crate::spec::{
    conformance_manifest_for, default_spec_source, list_spec_sources, load_spec_source,
    reference_conformance_manifest, repo_root, vendored_conformance_manifest,
};
use crate::spec_identity::{
    SpecIdentityOptions, verify_spec_identity, verify_spec_source_identity,
};
use anyhow::Result;
use std::path::PathBuf;

pub fn run(args: impl IntoIterator<Item = String>) -> Result<i32> {
    let mut args: Vec<String> = args.into_iter().collect();

    if args.len() == 1 && is_help_flag(&args[0]) {
        print_usage();
        return Ok(0);
    }

    if args.len() == 1 && is_version_flag(&args[0]) {
        print_version();
        return Ok(0);
    }

    // true-up:anchor id=command-surface
    let command = if let Some(first) = args.first() {
        if is_retired_private_lint_alias(first) {
            print_usage();
            return Ok(2);
        }

        if first == "lint"
            || first == "lint-legacy"
            || first == "discover"
            || first == "conformance"
            || first == "capabilities"
            || first == "adapter"
            || first == "specs"
            || first == "briefing"
        {
            args.remove(0)
        } else {
            "lint".to_string()
        }
    } else {
        "lint".to_string()
    };

    match command.as_str() {
        "lint" => run_current_lint(args, command.as_str()),
        "lint-legacy" => run_legacy_lint(args),
        "discover" => run_discover(args),
        "briefing" => run_briefing(args),
        "conformance" => run_conformance_command(args),
        "capabilities" => run_capabilities_command(args),
        "adapter" => run_adapter_command(args),
        "specs" => run_specs_command(args),
        _ => {
            print_usage();
            Ok(2)
        }
    }
}

fn is_help_flag(arg: &str) -> bool {
    arg == "--help" || arg == "-h"
}

fn is_version_flag(arg: &str) -> bool {
    arg == "--version" || arg == "-V"
}

fn is_retired_private_lint_alias(arg: &str) -> bool {
    arg == ["lint", "-", "v", "0"].concat() || arg == ["lint", "-", "v", "2"].concat()
}

fn print_version() {
    println!(env!("CARGO_PKG_VERSION"));
}

fn print_usage() {
    eprintln!(
        "Usage:\n  \
         openprose-lint lint [--profile strict|compat] [--program-dir] <file-or-directory> [...]\n  \
         openprose-lint briefing <file.md> [...]              — preflight briefing for VM agent\n  \
         openprose-lint discover <file-or-directory> [...]   — spec gap discovery report\n  \
         openprose-lint conformance [--spec name] [--manifest path] [--profile strict|compat]\n  \
         openprose-lint capabilities [--runtime-manifest path] <file-or-directory>\n  \
         openprose-lint adapter validate <manifest.json>\n  \
         openprose-lint adapter dogfood <manifest.json> <program-path> [--input name=value] [--input-file name=path] [--expect-binding service/output] [--test-root path]\n  \
         openprose-lint specs\n  \
         openprose-lint specs verify [--spec name | --manifest path] [--root path] [--git-repo path] [--expect-repo repo] [--expect-commit sha] [--package-json path]\n  \
         \n  \
         Legacy:\n  \
         openprose-lint lint-legacy [--profile strict|compat] <file.prose-or-directory> [...]"
    );
}

fn print_current_lint_usage(invoked_as: &str) {
    eprintln!(
        "Usage: openprose-lint {invoked_as} [--profile strict|compat] [--program-dir] <file-or-directory> [...]"
    );
}

fn print_legacy_lint_usage() {
    eprintln!(
        "Usage: openprose-lint lint-legacy [--profile strict|compat] <file.prose-or-directory> [...]"
    );
}
// true-up:end

fn print_discover_usage() {
    eprintln!("Usage: openprose-lint discover <file-or-directory> [...]");
}

fn print_conformance_usage() {
    eprintln!(
        "Usage: openprose-lint conformance [--spec name] [--manifest path] [--profile strict|compat]"
    );
}

fn print_capabilities_usage() {
    eprintln!("Usage: openprose-lint capabilities [--runtime-manifest path] <file-or-directory>");
}

fn print_adapter_usage() {
    eprintln!(
        "Usage:\n  \
         openprose-lint adapter validate <manifest.json>\n  \
         openprose-lint adapter dogfood <manifest.json> <program-path> [--input name=value] [--input-file name=path] [--expect-binding service/output] [--test-root path]"
    );
}

fn print_briefing_usage() {
    eprintln!("Usage: openprose-lint briefing <file.md> [...]");
}

fn print_specs_usage() {
    eprintln!(
        "Usage:\n  \
         openprose-lint specs\n  \
         openprose-lint specs verify [--spec name | --manifest path] [--root path] [--git-repo path] [--expect-repo repo] [--expect-commit sha] [--package-json path]"
    );
}

fn run_legacy_lint(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_legacy_lint_usage();
        return Ok(0);
    }

    let mut profile = LintProfile::default();
    let mut targets = Vec::new();
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        if arg == "--profile" {
            let Some(value) = iter.next() else {
                eprintln!("openprose-lint: missing value for --profile");
                return Ok(2);
            };
            profile = value.parse()?;
            continue;
        }
        targets.push(arg);
    }

    if targets.is_empty() {
        print_legacy_lint_usage();
        return Ok(2);
    }

    let targets = targets.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    let results = lint_legacy_paths_with_profile(&targets, profile)?;

    if results.is_empty() {
        eprintln!("openprose-lint: no legacy .prose files found");
        return Ok(2);
    }

    for result in &results {
        if result.diagnostics.is_empty() {
            println!("{}: ok", result.path.display());
            continue;
        }

        for diagnostic in &result.diagnostics {
            println!(
                "{}:{}:{} {} {} {}",
                diagnostic.path.display(),
                diagnostic.line,
                diagnostic.column,
                diagnostic.severity,
                diagnostic.code,
                diagnostic.message
            );
        }
    }

    let counts = count_legacy_diagnostics(&results);
    println!(
        "\nprofile: {}\n{} error(s), {} warning(s) across {} file(s)",
        profile,
        counts.errors,
        counts.warnings,
        results.len()
    );

    Ok(if counts.errors > 0 { 1 } else { 0 })
}

fn run_current_lint(args: Vec<String>, invoked_as: &str) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_current_lint_usage(invoked_as);
        return Ok(0);
    }

    let mut profile = LintProfile::default();
    let mut targets = Vec::new();
    let mut program_dir = false;
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--profile" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --profile");
                    return Ok(2);
                };
                profile = value.parse()?;
            }
            "--program-dir" => {
                program_dir = true;
            }
            _ => targets.push(arg),
        }
    }

    if targets.is_empty() {
        print_current_lint_usage(invoked_as);
        return Ok(2);
    }

    let target_paths: Vec<PathBuf> = targets.into_iter().map(PathBuf::from).collect();

    let results = if program_dir {
        // Lint as a multi-file program directory
        let mut all = Vec::new();
        for path in &target_paths {
            if path.is_dir() {
                all.extend(current_lint::current_lint_program_dir(path, profile)?);
            } else {
                eprintln!(
                    "openprose-lint: --program-dir requires a directory, got {}",
                    path.display()
                );
                return Ok(2);
            }
        }
        all
    } else {
        current_lint::current_lint_paths_with_profile(&target_paths, profile)?
    };

    if results.is_empty() {
        eprintln!("openprose-lint: no current OpenProse .md files found");
        return Ok(2);
    }

    let mut total_errors = 0usize;
    let mut total_warnings = 0usize;

    for result in &results {
        if result.diagnostics.is_empty() {
            println!("{}: ok", result.path.display());
            continue;
        }

        for diagnostic in &result.diagnostics {
            match diagnostic.severity {
                crate::diag::Severity::Error => total_errors += 1,
                crate::diag::Severity::Warning => total_warnings += 1,
            }
            println!(
                "{}:{}:{} {} {} {}",
                diagnostic.path.display(),
                diagnostic.line,
                diagnostic.column,
                diagnostic.severity,
                diagnostic.code,
                diagnostic.message
            );
        }
    }

    println!(
        "\nprofile: {}\n{} error(s), {} warning(s) across {} file(s)",
        profile,
        total_errors,
        total_warnings,
        results.len()
    );

    Ok(if total_errors > 0 { 1 } else { 0 })
}

fn run_discover(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_discover_usage();
        return Ok(0);
    }

    let targets: Vec<PathBuf> = args.into_iter().map(PathBuf::from).collect();

    if targets.is_empty() {
        print_discover_usage();
        return Ok(2);
    }

    let discovery = current_lint::discover_spec_gaps(&targets)?;
    println!("{discovery}");
    Ok(0)
}

fn run_conformance_command(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_conformance_usage();
        return Ok(0);
    }

    let mut profile = None;
    let mut manifest = None;
    let mut spec_id = None;
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--profile" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --profile");
                    return Ok(2);
                };
                profile = Some(value.parse()?);
            }
            "--manifest" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --manifest");
                    return Ok(2);
                };
                manifest = Some(PathBuf::from(value));
            }
            "--spec" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --spec");
                    return Ok(2);
                };
                spec_id = Some(value);
            }
            _ => {
                print_conformance_usage();
                return Ok(2);
            }
        }
    }

    if manifest.is_some() && spec_id.is_some() {
        eprintln!("openprose-lint: --manifest and --spec are mutually exclusive");
        return Ok(2);
    }

    let manifest = if let Some(path) = manifest {
        path
    } else if let Some(id) = &spec_id {
        conformance_manifest_for(id)?
    } else if let Some(path) = reference_conformance_manifest() {
        path
    } else if let Some(path) = vendored_conformance_manifest() {
        path
    } else {
        let spec = default_spec_source()?;
        eprintln!(
            "openprose-lint: default spec '{}' has no conformance manifest configured; use --spec or --manifest",
            spec.id
        );
        return Ok(2);
    };

    let report = run_conformance(&manifest, profile)?;

    if let Some(id) = &spec_id {
        println!("spec: {id}");
    }
    println!("manifest: {}", report.manifest.display());
    for run in &report.runs {
        if run.passed() {
            println!("{} [{}]: ok", run.id, run.profile);
            continue;
        }

        println!("{} [{}]: mismatch", run.id, run.profile);
        println!("  file: {}", run.path.display());
        println!("  expected: {}", format_signatures(&run.expected));
        println!("  actual:   {}", format_signatures(&run.actual));
    }

    println!(
        "\n{} case/profile run(s), {} mismatch(es)",
        report.run_count(),
        report.failure_count()
    );

    Ok(if report.failure_count() > 0 { 1 } else { 0 })
}

fn run_capabilities_command(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_capabilities_usage();
        return Ok(0);
    }

    let mut runtime_manifest = None;
    let mut targets = Vec::new();
    let mut iter = args.into_iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--runtime-manifest" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --runtime-manifest");
                    return Ok(2);
                };
                runtime_manifest = Some(PathBuf::from(value));
            }
            _ => targets.push(PathBuf::from(arg)),
        }
    }

    if targets.len() != 1 {
        print_capabilities_usage();
        return Ok(2);
    }

    let report = if let Some(manifest) = runtime_manifest {
        capability_report_for_target_with_runtime(&targets[0], &manifest)?
    } else {
        capability_report_for_target(&targets[0])?
    };
    let exit_code = report
        .runtime_check
        .as_ref()
        .map(|runtime| if runtime.compatible { 0 } else { 1 })
        .unwrap_or(0);
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(exit_code)
}

fn run_adapter_command(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_adapter_usage();
        return Ok(0);
    }

    let Some((subcommand, rest)) = args.split_first() else {
        print_adapter_usage();
        return Ok(2);
    };

    match subcommand.as_str() {
        "validate" => {
            if rest.len() != 1 {
                print_adapter_usage();
                return Ok(2);
            }
            let report = validate_adapter_manifest(&PathBuf::from(&rest[0]))?;
            let exit_code = if report.valid { 0 } else { 1 };
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(exit_code)
        }
        "dogfood" => {
            let mut positionals = Vec::new();
            let mut inputs = Vec::new();
            let mut expected_binding = None;
            let mut test_root = None;
            let mut iter = rest.iter();

            while let Some(arg) = iter.next() {
                match arg.as_str() {
                    "--input" => {
                        let Some(value) = iter.next() else {
                            eprintln!("openprose-lint: missing value for --input");
                            return Ok(2);
                        };
                        let Some((name, content)) = value.split_once('=') else {
                            eprintln!("openprose-lint: --input expects name=value");
                            return Ok(2);
                        };
                        inputs.push(DogfoodInput {
                            name: name.to_string(),
                            content: content.to_string(),
                        });
                    }
                    "--input-file" => {
                        let Some(value) = iter.next() else {
                            eprintln!("openprose-lint: missing value for --input-file");
                            return Ok(2);
                        };
                        let Some((name, file_path)) = value.split_once('=') else {
                            eprintln!("openprose-lint: --input-file expects name=path");
                            return Ok(2);
                        };
                        let content =
                            std::fs::read_to_string(file_path).map_err(anyhow::Error::from)?;
                        inputs.push(DogfoodInput {
                            name: name.to_string(),
                            content,
                        });
                    }
                    "--expect-binding" => {
                        let Some(value) = iter.next() else {
                            eprintln!("openprose-lint: missing value for --expect-binding");
                            return Ok(2);
                        };
                        expected_binding = Some(value.clone());
                    }
                    "--test-root" => {
                        let Some(value) = iter.next() else {
                            eprintln!("openprose-lint: missing value for --test-root");
                            return Ok(2);
                        };
                        test_root = Some(PathBuf::from(value));
                    }
                    _ => positionals.push(arg.clone()),
                }
            }

            if positionals.len() != 2 {
                print_adapter_usage();
                return Ok(2);
            }

            let report = dogfood_adapter_manifest(
                &PathBuf::from(&positionals[0]),
                &PathBuf::from(&positionals[1]),
                AdapterDogfoodOptions {
                    inputs,
                    expected_binding,
                    test_root,
                },
            )?;
            let exit_code = if report.succeeded { 0 } else { 1 };
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(exit_code)
        }
        _ => {
            print_adapter_usage();
            Ok(2)
        }
    }
}

fn run_specs_command(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_specs_usage();
        return Ok(0);
    }

    if let Some((subcommand, rest)) = args.split_first() {
        return match subcommand.as_str() {
            "verify" => run_specs_verify(rest),
            _ => {
                print_specs_usage();
                Ok(2)
            }
        };
    }

    let specs = list_spec_sources()?;
    if specs.is_empty() {
        println!("No spec sources found. Create JSON files in specs/ directory.");
        return Ok(0);
    }
    println!("Available spec sources:");
    for id in &specs {
        println!("  {id}");
    }
    Ok(0)
}

fn run_specs_verify(args: &[String]) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_specs_usage();
        return Ok(0);
    }

    let mut spec_id = None;
    let mut manifest = None;
    let mut root = None;
    let mut git_repo = None;
    let mut expected_repo = None;
    let mut expected_commit = None;
    let mut package_jsons = Vec::new();
    let mut iter = args.iter();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--spec" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --spec");
                    return Ok(2);
                };
                spec_id = Some(value.clone());
            }
            "--manifest" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --manifest");
                    return Ok(2);
                };
                manifest = Some(PathBuf::from(value));
            }
            "--root" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --root");
                    return Ok(2);
                };
                root = Some(PathBuf::from(value));
            }
            "--git-repo" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --git-repo");
                    return Ok(2);
                };
                git_repo = Some(PathBuf::from(value));
            }
            "--expect-repo" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --expect-repo");
                    return Ok(2);
                };
                expected_repo = Some(value.clone());
            }
            "--expect-commit" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --expect-commit");
                    return Ok(2);
                };
                expected_commit = Some(value.clone());
            }
            "--package-json" => {
                let Some(value) = iter.next() else {
                    eprintln!("openprose-lint: missing value for --package-json");
                    return Ok(2);
                };
                package_jsons.push(PathBuf::from(value));
            }
            _ => {
                print_specs_usage();
                return Ok(2);
            }
        }
    }

    if spec_id.is_some() && manifest.is_some() {
        eprintln!("openprose-lint: --spec and --manifest are mutually exclusive");
        return Ok(2);
    }

    let (manifest, options) = if let Some(id) = spec_id {
        if root.is_some()
            || git_repo.is_some()
            || expected_repo.is_some()
            || expected_commit.is_some()
            || !package_jsons.is_empty()
        {
            eprintln!(
                "openprose-lint: --spec supplies --root, --git-repo, --expect-repo, and --expect-commit from specs/<name>.json"
            );
            return Ok(2);
        }
        let spec = load_spec_source(&id)?;
        let repo_root = repo_root();
        let Some(manifest) = spec.resolve_version_manifest(&repo_root) else {
            let report = verify_spec_source_identity(&spec, &repo_root)?;
            let exit_code = if report.valid { 0 } else { 1 };
            println!("{}", serde_json::to_string_pretty(&report)?);
            return Ok(exit_code);
        };
        let git_repo = if spec.uses_package_checkout(&repo_root) {
            None
        } else {
            Some(spec.primary_checkout(&repo_root))
        };
        (
            manifest,
            SpecIdentityOptions {
                root: Some(spec.resolve_root(&repo_root)),
                git_repo,
                expected_repo: Some(spec.repo),
                expected_commit: Some(spec.pinned_commit),
                package_jsons: vec![],
            },
        )
    } else {
        let Some(manifest) = manifest else {
            print_specs_usage();
            return Ok(2);
        };
        (
            manifest,
            SpecIdentityOptions {
                root,
                git_repo,
                expected_repo,
                expected_commit,
                package_jsons,
            },
        )
    };

    let report = verify_spec_identity(&manifest, options)?;
    let exit_code = if report.valid { 0 } else { 1 };
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(exit_code)
}

fn run_briefing(args: Vec<String>) -> Result<i32> {
    if args.iter().any(|arg| is_help_flag(arg)) {
        print_briefing_usage();
        return Ok(0);
    }

    let targets: Vec<PathBuf> = args.into_iter().map(PathBuf::from).collect();

    if targets.is_empty() {
        print_briefing_usage();
        return Ok(2);
    }

    for target in &targets {
        if target.is_file() {
            let source = std::fs::read_to_string(target)?;
            print!("{}", crate::briefing::generate_briefing(target, &source));
        } else if target.is_dir() {
            let mut first = true;
            for entry in std::fs::read_dir(target)? {
                let path = entry?.path();
                if path.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                let source = std::fs::read_to_string(&path)?;
                if !crate::current_lint::looks_like_current(&source) {
                    continue;
                }
                if source.contains("\nkind: program") || source.starts_with("---\nkind: program") {
                    if !first {
                        println!();
                    }
                    print!("{}", crate::briefing::generate_briefing(&path, &source));
                    first = false;
                }
            }
        }
    }

    Ok(0)
}

fn format_signatures(signatures: &[crate::conformance::DiagnosticSignature]) -> String {
    if signatures.is_empty() {
        return "none".to_string();
    }

    signatures
        .iter()
        .map(|signature| format!("{} {}", signature.severity, signature.code))
        .collect::<Vec<_>>()
        .join(", ")
}
