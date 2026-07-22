use serde_json::Value;
use std::path::Path;
use std::process::Command;

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .args(args)
        .output()
        .unwrap()
}

fn parse_json(output: &std::process::Output) -> Value {
    assert!(output.status.success(), "status: {:?}", output.status);
    serde_json::from_slice(&output.stdout).unwrap()
}

fn parse_json_any_status(output: &std::process::Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn capabilities_reports_environment_and_interaction_for_program() {
    let output = run(&["capabilities", "fixtures/briefing/with-imports.md"]);
    let json = parse_json(&output);

    assert_eq!(json["program"], "daily-delivery");
    assert_eq!(json["requires"]["workspace-bindings"], true);
    assert_eq!(json["requires"]["copy-on-return"], true);
    assert_eq!(json["requires"]["state-markers"], true);
    assert_eq!(json["requires"]["error-signaling"], true);
    assert_eq!(json["requires"]["dependency-scheduling"], true);
    assert_eq!(json["requires"]["ask-user"], true);
    assert_eq!(json["requires"]["run-inputs"], false);
    assert_eq!(json["requires"]["environment"]["required"], true);
    assert_eq!(
        json["requires"]["environment"]["vars"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(json["requires"]["secret-hygiene"], true);
    assert_eq!(json["implied_substrate"]["subagents"], true);
    assert_eq!(json["implied_substrate"]["file-io"], true);
    assert_eq!(json["implied_substrate"]["tool-exec"], true);
}

#[test]
fn capabilities_reports_test_requirements() {
    let output = run(&["capabilities", "fixtures/current/test-summarizer.prose.md"]);
    let json = parse_json(&output);

    assert_eq!(json["program"], "test-summarizer");
    assert_eq!(json["requires"]["test-execution"], true);
    assert_eq!(json["requires"]["test-evaluation"], true);
    assert_eq!(json["requires"]["ask-user"], false);
}

#[test]
fn capabilities_accepts_program_directory_targets() {
    let dir = Path::new("../../skills/open-prose/examples/competitor-activity/src");
    let output = run(&["capabilities", dir.to_str().unwrap()]);
    let json = parse_json(&output);

    assert_eq!(json["program"], "competitor-activity-monitor");
    assert_eq!(json["requires"]["workspace-bindings"], true);
}

#[test]
fn capabilities_runtime_check_warns_when_runtime_lacks_subagents() {
    let output = run(&[
        "capabilities",
        "--runtime-manifest",
        "specs/runtime-subjects/pi-no-extensions-self-declared.json",
        "fixtures/briefing/with-imports.md",
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json_any_status(&output);

    assert_eq!(json["runtime_check"]["subject"], "pi --no-extensions");
    assert_eq!(json["runtime_check"]["compatible"], false);
    assert!(
        json["runtime_check"]["blocking"]
            .as_array()
            .unwrap()
            .iter()
            .any(|line| line.as_str().unwrap().contains("subagents"))
    );
}

#[test]
fn capabilities_runtime_check_accepts_claude_manifest_shape() {
    let output = run(&[
        "capabilities",
        "--runtime-manifest",
        "specs/runtime-subjects/claude-code-self-declared.json",
        "fixtures/briefing/with-imports.md",
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json_any_status(&output);

    assert_eq!(
        json["runtime_check"]["subject"],
        "Claude Code (raw CLI, no OpenProse adapter)"
    );
    assert_eq!(json["runtime_check"]["compatible"], false);
    assert!(
        json["runtime_check"]["blocking"]
            .as_array()
            .unwrap()
            .iter()
            .any(|line| line.as_str().unwrap().contains("incidental"))
    );
}
