use std::fs;
use std::process::Command;

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .args(args)
        .output()
        .unwrap()
}

#[test]
fn top_level_help_exits_successfully() {
    let output = run(&["--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Usage:"), "stderr: {stderr}");
    assert!(
        stderr.contains("openprose-lint lint [--profile strict|compat] [--program-dir]"),
        "stderr: {stderr}"
    );
    assert!(stderr.contains("Legacy:"), "stderr: {stderr}");
    assert!(
        stderr.contains("openprose-lint capabilities"),
        "stderr: {stderr}"
    );
    assert!(
        stderr.contains("openprose-lint adapter validate"),
        "stderr: {stderr}"
    );
    assert!(
        stderr.contains("openprose-lint adapter dogfood"),
        "stderr: {stderr}"
    );
    assert!(
        stderr.contains("openprose-lint specs verify"),
        "stderr: {stderr}"
    );
    assert!(stderr.contains("--test-root path"), "stderr: {stderr}");
}

#[test]
fn top_level_version_exits_successfully() {
    let output = run(&["--version"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert_eq!(stdout.trim(), env!("CARGO_PKG_VERSION"));
}

#[test]
fn lint_help_exits_successfully() {
    let output = run(&["lint", "--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Usage: openprose-lint lint [--profile strict|compat] [--program-dir]"),
        "stderr: {stderr}"
    );
}

#[test]
fn private_generation_suffix_is_not_a_public_alias() {
    for private_alias in [["lint", "-", "v", "0"], ["lint", "-", "v", "2"]]
        .into_iter()
        .map(|parts| parts.concat())
    {
        let output = run(&[private_alias.as_str(), "--help"]);
        assert_eq!(output.status.code(), Some(2), "status: {:?}", output.status);

        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            !stderr.contains(&private_alias) && !stderr.contains("compatibility alias"),
            "stderr should not teach private generation command names: {stderr}"
        );
    }
}

#[test]
fn legacy_lint_help_exits_successfully() {
    let output = run(&["lint-legacy", "--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Usage: openprose-lint lint-legacy"),
        "stderr: {stderr}"
    );
}

#[test]
fn lint_command_lints_current_markdown_programs() {
    let output = run(&["lint", "fixtures/briefing/single-file.md"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("single-file.md: ok"), "stdout: {stdout}");
}

#[test]
fn lint_command_reports_parser_errors_for_explicit_invalid_markdown_files()
-> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let path = dir.path().join("invalid.md");
    fs::write(&path, "# Missing Frontmatter\n")?;

    let path_arg = path.to_str().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "temp path is not UTF-8")
    })?;
    let output = run(&["lint", path_arg]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stdout.contains("MDE001 Missing YAML frontmatter"),
        "stdout: {stdout}"
    );
    assert!(
        !stderr.contains("no current OpenProse .md files found"),
        "stderr: {stderr}"
    );
    Ok(())
}

#[test]
fn lint_command_reports_parser_errors_for_invalid_program_directory_members()
-> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    fs::write(
        dir.path().join("index.md"),
        "---\nname: grouped\nkind: program\nnodes: [worker]\n---\n",
    )?;
    fs::write(dir.path().join("worker.md"), "# Missing Frontmatter\n")?;

    let dir_arg = dir.path().to_str().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "temp path is not UTF-8")
    })?;
    let output = run(&["lint", dir_arg]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("worker.md:1:1 error MDE001 Missing YAML frontmatter"),
        "stdout: {stdout}"
    );
    Ok(())
}

#[test]
fn default_command_lints_current_markdown_programs() {
    let output = run(&["fixtures/briefing/single-file.md"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("single-file.md: ok"), "stdout: {stdout}");
}

#[test]
fn legacy_lint_command_lints_prose_programs() {
    let output = run(&["lint-legacy", "fixtures/valid/basic.prose"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("basic.prose: ok"), "stdout: {stdout}");
}

#[test]
fn capabilities_help_exits_successfully() {
    let output = run(&["capabilities", "--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Usage: openprose-lint capabilities [--runtime-manifest path]"),
        "stderr: {stderr}"
    );
}

#[test]
fn adapter_help_exits_successfully() {
    let output = run(&["adapter", "--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("openprose-lint adapter validate <manifest.json>"),
        "stderr: {stderr}"
    );
    assert!(
        stderr.contains("openprose-lint adapter dogfood <manifest.json> <program-path>"),
        "stderr: {stderr}"
    );
}

#[test]
fn specs_help_exits_successfully() {
    let output = run(&["specs", "--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("openprose-lint specs"), "stderr: {stderr}");
    assert!(
        stderr.contains("openprose-lint specs verify"),
        "stderr: {stderr}"
    );
    assert!(stderr.contains("--expect-repo repo"), "stderr: {stderr}");
    assert!(stderr.contains("--package-json path"), "stderr: {stderr}");
}
