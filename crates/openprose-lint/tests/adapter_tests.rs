use serde_json::{Value, json};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use tempfile::tempdir;

/// The host-mediated dogfood tests each install a fake host binary (`codex`,
/// `hermes`, ...) onto a per-test `PATH` and drive the real `openprose-lint`
/// binary against it. The fake hosts are `set -euo pipefail` bash scripts that
/// fork/exec heavily and read process-global env (e.g. `FAKE_HERMES_EXPORT_DIR`).
/// Running several of these concurrently under cargo's parallel test harness
/// intermittently corrupted a host's wire phase (`wire phase exited with status
/// 1`, "unexpected service:"). They are serialized through this mutex so each
/// host-mediated proof gets a clean, uncontended environment. Regression guard
/// for that flake.
static HOST_MEDIATED_DOGFOOD: Mutex<()> = Mutex::new(());

fn host_mediated_dogfood_guard() -> MutexGuard<'static, ()> {
    HOST_MEDIATED_DOGFOOD
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .args(args)
        .output()
        .unwrap()
}

fn parse_json(output: &std::process::Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn adapter_validate_accepts_pi_example() {
    let output = run(&["adapter", "validate", "specs/adapters/pi-v1-md.json"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let json = parse_json(&output);
    assert_eq!(json["adapter_id"], "pi-v1-md");
    assert_eq!(json["valid"], true);
}

#[test]
fn adapter_validate_accepts_codex_example() {
    let output = run(&["adapter", "validate", "specs/adapters/codex-v1-md.json"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let json = parse_json(&output);
    assert_eq!(json["adapter_id"], "codex-v1-md");
    assert_eq!(json["valid"], true);
}

#[test]
fn adapter_validate_accepts_claude_code_example() {
    let output = run(&[
        "adapter",
        "validate",
        "specs/adapters/claude-code-v1-md.json",
    ]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let json = parse_json(&output);
    assert_eq!(json["adapter_id"], "claude-code-v1-md");
    assert_eq!(json["valid"], true);
}

#[test]
fn adapter_validate_accepts_hermes_example() {
    let output = run(&["adapter", "validate", "specs/adapters/hermes-v1-md.json"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let json = parse_json(&output);
    assert_eq!(json["adapter_id"], "hermes-v1-md");
    assert_eq!(json["valid"], true);
}

#[test]
fn adapter_validate_rejects_invalid_manifest() {
    let output = run(&[
        "adapter",
        "validate",
        "specs/runtime-subjects/pi-no-extensions-self-declared.json",
    ]);
    assert_eq!(output.status.code(), Some(1));

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("parse") || stderr.contains("schema") || output.stdout.is_empty());
}

#[test]
fn adapter_dogfood_help_exits_successfully() {
    let output = run(&["adapter", "dogfood", "--help"]);
    assert!(output.status.success(), "status: {:?}", output.status);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("adapter dogfood"), "stderr: {stderr}");
    assert!(stderr.contains("--expect-binding"), "stderr: {stderr}");
    assert!(stderr.contains("--test-root"), "stderr: {stderr}");
}

#[test]
fn adapter_dogfood_requires_manifest_and_program() {
    let output = run(&[
        "adapter",
        "dogfood",
        "specs/adapters/claude-code-v1-md.json",
    ]);
    assert_eq!(output.status.code(), Some(2));

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("adapter dogfood"), "stderr: {stderr}");
}

#[test]
fn adapter_dogfood_uses_phase_specific_system_append_files() {
    let dir = tempdir().unwrap();
    let bin_dir = dir.path().join("bin");
    let capture_dir = dir.path().join("capture");
    fs::create_dir_all(&bin_dir).unwrap();
    fs::create_dir_all(&capture_dir).unwrap();

    let fake_claude_path = bin_dir.join("claude");
    fs::write(
        &fake_claude_path,
        r#"#!/usr/bin/env bash
set -euo pipefail

PROMPT=$(cat)
APPEND=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --append-system-prompt)
      APPEND="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

PHASE=$(printf '%s\n' "$PROMPT" | grep '^- phase:' | head -n1 | sed 's/^- phase: //')
RUN_ID=$(printf '%s\n' "$PROMPT" | grep '^- run_id:' | head -n1 | sed 's/^- run_id: //')
CAPTURE_DIR=${OPENPROSE_DOGFOOD_TEST_CAPTURE_DIR:?}

case "$PHASE" in
  "wire-v1")
    printf '%s' "$APPEND" > "$CAPTURE_DIR/wire-append.txt"
    mkdir -p ".prose/runs/$RUN_ID"
    printf 'manifest\n' > ".prose/runs/$RUN_ID/manifest.md"
    cat <<EOF
{"type":"assistant","message":{"content":[{"type":"text","text":"{\"phase\":\"wire-v1\",\"manifest_path\":\".prose/runs/$RUN_ID/manifest.md\",\"copied_services\":[\"synthesizer\"],\"warnings\":[]}"}]}}
EOF
    ;;
  "execute-v1 + subagent-v1")
    printf '%s' "$APPEND" > "$CAPTURE_DIR/execute-append.txt"
    mkdir -p ".prose/runs/$RUN_ID/bindings/synthesizer"
    printf 'report\n' > ".prose/runs/$RUN_ID/bindings/synthesizer/report.md"
    printf '\n---end execute-v1 + subagent-v1\n' > ".prose/runs/$RUN_ID/state.md"
    cat <<EOF
{"type":"assistant","parent_tool_use_id":"toolu_sub","message":{"content":[{"type":"text","text":"subagent finished"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Agent","id":"toolu_sub","input":{"description":"OpenProse service: synthesizer"}},{"type":"tool_use","name":"Write","id":"toolu_write","input":{}},{"type":"text","text":"{\"phase\":\"execute-v1 + subagent-v1\",\"run_id\":\"$RUN_ID\",\"state_path\":\".prose/runs/$RUN_ID/state.md\",\"subagents_used\":[\"synthesizer\"],\"published_outputs\":{\"report\":\".prose/runs/$RUN_ID/bindings/synthesizer/report.md\"},\"final_report_path\":\".prose/runs/$RUN_ID/bindings/synthesizer/report.md\"}"}]}}
EOF
    ;;
  *)
    echo "unexpected phase: $PHASE" >&2
    exit 1
    ;;
esac
"#,
    )
    .unwrap();
    let mut permissions = fs::metadata(&fake_claude_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&fake_claude_path, permissions).unwrap();

    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let manifest_template =
        fs::read_to_string(repo_root.join("specs/adapters/claude-code-v1-md.json")).unwrap();
    let mut manifest: Value = serde_json::from_str(&manifest_template).unwrap();
    manifest["runtime_manifest"] = Value::String(
        repo_root
            .join("specs/runtime-subjects/claude-code-self-declared.json")
            .display()
            .to_string(),
    );
    manifest["phases"]["execute-v1"]["channels"][0]["files"] = json!(["primitives/session.md"]);

    let manifest_path = dir.path().join("claude-dogfood-test.json");
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .unwrap();

    let path = format!(
        "{}:{}",
        bin_dir.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .current_dir(repo_root)
        .env("PATH", path)
        .env("OPENPROSE_DOGFOOD_TEST_CAPTURE_DIR", &capture_dir)
        .args([
            "adapter",
            "dogfood",
            manifest_path.to_str().unwrap(),
            "fixtures/adapter/parallel-reviews",
            "--input-file",
            "code=tests/fixtures/get_user_records.py",
            "--expect-binding",
            "synthesizer/report",
        ])
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "status: {:?}\nstderr:\n{}\nstdout:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout),
    );

    let json = parse_json(&output);
    assert_eq!(json["succeeded"], true, "report: {json}");
    assert!(
        json["warnings"].as_array().unwrap().is_empty(),
        "report: {json}"
    );
    assert_eq!(json["observed_subagent_requests"], json!(["synthesizer"]));
    assert!(
        json["artifacts"]["wire_system_append"]
            .as_str()
            .unwrap()
            .ends_with("wire-system-append.txt")
    );
    assert!(
        json["artifacts"]["execute_system_append"]
            .as_str()
            .unwrap()
            .ends_with("execute-system-append.txt")
    );

    let wire_append = fs::read_to_string(capture_dir.join("wire-append.txt")).unwrap();
    let execute_append = fs::read_to_string(capture_dir.join("execute-append.txt")).unwrap();

    assert!(wire_append.contains("# OpenProse VM System Prompt"));
    assert!(wire_append.contains("Contract Markdown"));
    assert!(execute_append.contains("# The Render's Harness Contract"));
    assert!(!execute_append.contains("# OpenProse VM System Prompt"));
    assert_ne!(wire_append, execute_append);
}

#[test]
fn adapter_dogfood_supports_codex_host_mediated_path() {
    let _guard = host_mediated_dogfood_guard();
    let dir = tempdir().unwrap();
    let bin_dir = dir.path().join("bin");
    fs::create_dir_all(&bin_dir).unwrap();

    let fake_codex_path = bin_dir.join("codex");
    fs::write(
        &fake_codex_path,
        r##"#!/usr/bin/env bash
set -euo pipefail

PROMPT=$(cat)
LAST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output-last-message)
      LAST="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# bash substring, NOT `printf "$PROMPT" | grep -q` (SIGPIPE under pipefail; see hermes script).
if [[ "$PROMPT" == *"- phase: wire-v1"* ]]; then
  RUN_ID=$(printf '%s\n' "$PROMPT" | grep '^- run_id:' | head -n1 | sed 's/^- run_id: //')
  mkdir -p ".prose/runs/$RUN_ID/services"
  cp index.md ".prose/runs/$RUN_ID/program.md"
  cp security-reviewer.md ".prose/runs/$RUN_ID/services/security-reviewer.md"
  cp perf-reviewer.md ".prose/runs/$RUN_ID/services/perf-reviewer.md"
  cp style-reviewer.md ".prose/runs/$RUN_ID/services/style-reviewer.md"
  cp synthesizer.md ".prose/runs/$RUN_ID/services/synthesizer.md"
  cat > ".prose/runs/$RUN_ID/manifest.md" <<EOF
# Manifest: parallel-reviews

Generated by Forme at 2026-04-17T03:00:00Z
Source: ./index.md

---

## Caller Interface

requires:
- code (from user): the code to review

returns:
- report (from synthesizer): unified code review report with issues prioritized by severity

---

## Graph

### security-reviewer

source: services/security-reviewer.md
workspace: workspace/security-reviewer/

inputs:
  code ← bindings/caller/code.md

outputs:
  security-findings → workspace/security-reviewer/security-findings.md
  (public) security-findings → bindings/security-reviewer/security-findings.md

errors:
  none declared

---

### perf-reviewer

source: services/perf-reviewer.md
workspace: workspace/perf-reviewer/

inputs:
  code ← bindings/caller/code.md

outputs:
  perf-findings → workspace/perf-reviewer/perf-findings.md
  (public) perf-findings → bindings/perf-reviewer/perf-findings.md

errors:
  none declared

---

### style-reviewer

source: services/style-reviewer.md
workspace: workspace/style-reviewer/

inputs:
  code ← bindings/caller/code.md

outputs:
  style-findings → workspace/style-reviewer/style-findings.md
  (public) style-findings → bindings/style-reviewer/style-findings.md

errors:
  none declared

---

### synthesizer

source: services/synthesizer.md
workspace: workspace/synthesizer/

inputs:
  security-findings ← bindings/security-reviewer/security-findings.md
  perf-findings ← bindings/perf-reviewer/perf-findings.md
  style-findings ← bindings/style-reviewer/style-findings.md

outputs:
  report → workspace/synthesizer/report.md
  (public) report → bindings/synthesizer/report.md

errors:
  none declared

---

## Execution Order

1. security-reviewer (depends on: caller)
2. perf-reviewer (depends on: caller)
3. style-reviewer (depends on: caller)
4. synthesizer (depends on: security-reviewer, perf-reviewer, style-reviewer)

Parallelizable: security-reviewer, perf-reviewer, style-reviewer

## Environment

No environment variables declared by resolved services.

## Warnings

- None.
EOF
  printf '%s' "{\"phase\":\"wire-v1\",\"manifest_path\":\".prose/runs/$RUN_ID/manifest.md\",\"copied_services\":[\".prose/runs/$RUN_ID/services/security-reviewer.md\",\".prose/runs/$RUN_ID/services/perf-reviewer.md\",\".prose/runs/$RUN_ID/services/style-reviewer.md\",\".prose/runs/$RUN_ID/services/synthesizer.md\"],\"warnings\":[]}" > "$LAST"
  cat <<EOF
{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"/usr/bin/bash -lc pwd","aggregated_output":"$(pwd)\\n","exit_code":0,"status":"completed"}}
{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"$(pwd)/.prose/runs/$RUN_ID/manifest.md","kind":"add"}],"status":"completed"}}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\"phase\":\"wire-v1\",\"manifest_path\":\".prose/runs/$RUN_ID/manifest.md\",\"copied_services\":[\".prose/runs/$RUN_ID/services/security-reviewer.md\",\".prose/runs/$RUN_ID/services/perf-reviewer.md\",\".prose/runs/$RUN_ID/services/style-reviewer.md\",\".prose/runs/$RUN_ID/services/synthesizer.md\"],\"warnings\":[]}"}}
EOF
  exit 0
fi

RUN_ID=$(printf '%s\n' "$PROMPT" | sed -n 's/^Run ID: //p' | head -n1)
SERVICE=$(printf '%s\n' "$PROMPT" | sed -n 's/^Service: //p' | head -n1)
case "$SERVICE" in
  "security-reviewer")
    OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/security-reviewer/security-findings.md"
    OUTPUT_LABEL="security-findings"
    OUTPUT_BODY="# Security Findings\n\n- High: SQL injection.\n"
    ;;
  "perf-reviewer")
    OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/perf-reviewer/perf-findings.md"
    OUTPUT_LABEL="perf-findings"
    OUTPUT_BODY="# Performance Findings\n\n- High: quadratic nested loop.\n"
    ;;
  "style-reviewer")
    OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/style-reviewer/style-findings.md"
    OUTPUT_LABEL="style-findings"
    OUTPUT_BODY="# Style Findings\n\n- Low: readability issues.\n"
    ;;
  "synthesizer")
    OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/synthesizer/report.md"
    OUTPUT_LABEL="report"
    OUTPUT_BODY="# Unified Code Review Report\n\n- synthesized\n"
    ;;
  *)
    echo "unexpected service: $SERVICE" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$OUTPUT_PATH")"
printf '%b' "$OUTPUT_BODY" > "$OUTPUT_PATH"
printf 'Service complete: %s\n\nOutputs written:\n- `%s`: `%s`\n' "$SERVICE" "$OUTPUT_LABEL" "$OUTPUT_PATH" > "$LAST"
cat <<EOF
{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"/usr/bin/bash -lc \"printf done\"","aggregated_output":"done","exit_code":0,"status":"completed"}}
{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"$(pwd)/$OUTPUT_PATH","kind":"add"}],"status":"completed"}}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Service complete: $SERVICE"}}
EOF
"##,
    )
    .unwrap();
    let mut permissions = fs::metadata(&fake_codex_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&fake_codex_path, permissions).unwrap();

    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = format!(
        "{}:{}",
        bin_dir.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .current_dir(repo_root)
        .env("PATH", path)
        .args([
            "adapter",
            "dogfood",
            "specs/adapters/codex-v1-md.json",
            "fixtures/adapter/parallel-reviews",
            "--input-file",
            "code=tests/fixtures/get_user_records.py",
            "--expect-binding",
            "synthesizer/report",
        ])
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "status: {:?}\nstderr:\n{}\nstdout:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout),
    );

    let json = parse_json(&output);
    assert_eq!(json["succeeded"], true, "report: {json}");
    assert_eq!(
        json["observed_subagent_requests"],
        json!([
            "security-reviewer",
            "perf-reviewer",
            "style-reviewer",
            "synthesizer"
        ])
    );
    assert_eq!(json["observed_execute_tool_uses"]["command_execution"], 4);
    assert_eq!(json["observed_execute_tool_uses"]["file_change"], 4);
    assert_eq!(json["expected_binding_exists"], true, "report: {json}");
    assert_eq!(json["expected_binding_nonempty"], true, "report: {json}");
    assert_eq!(json["state_complete"], true, "report: {json}");
    assert!(
        json["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|warning| warning
                .as_str()
                .is_some_and(|text| text.contains("host-mediated"))),
        "report: {json}"
    );
    assert!(
        json["artifacts"]["wire_developer_append"]
            .as_str()
            .unwrap()
            .ends_with("wire-developer-append.txt")
    );
}

#[test]
fn adapter_dogfood_supports_hermes_host_mediated_path() {
    let _guard = host_mediated_dogfood_guard();
    let dir = tempdir().unwrap();
    let bin_dir = dir.path().join("bin");
    let export_dir = dir.path().join("exports");
    fs::create_dir_all(&bin_dir).unwrap();
    fs::create_dir_all(&export_dir).unwrap();

    let fake_hermes_path = bin_dir.join("hermes");
    fs::write(
        &fake_hermes_path,
        r##"#!/usr/bin/env bash
set -euo pipefail

EXPORT_DIR=${FAKE_HERMES_EXPORT_DIR:?}

if [[ "$1" == "chat" ]]; then
  shift
  QUERY=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -q|--query)
        QUERY="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done

  RUN_ID=$(printf '%s\n' "$QUERY" | sed -n 's/^- run_id: //p; s/^Run ID: //p' | head -n1)
  SERVICE=$(printf '%s\n' "$QUERY" | sed -n 's/^Service: //p' | head -n1)

  # bash substring, NOT `printf "$QUERY" | grep -q`: under `set -o pipefail`,
  # grep -q quits on the early match and SIGPIPEs printf (still writing the large
  # prompt), making this condition intermittently false under load -> the wire
  # branch is skipped and the script dies with "unexpected service:".
  if [[ "$QUERY" == *"- phase: wire-v1"* ]]; then
    SESSION_ID="wire-session"
    mkdir -p ".prose/runs/$RUN_ID/services"
    cp index.md ".prose/runs/$RUN_ID/program.md"
    cp security-reviewer.md ".prose/runs/$RUN_ID/services/security-reviewer.md"
    cp perf-reviewer.md ".prose/runs/$RUN_ID/services/perf-reviewer.md"
    cp style-reviewer.md ".prose/runs/$RUN_ID/services/style-reviewer.md"
    cp synthesizer.md ".prose/runs/$RUN_ID/services/synthesizer.md"
    cat > ".prose/runs/$RUN_ID/manifest.md" <<EOF
# Manifest: parallel-reviews

Generated by Forme at 2026-04-17T03:00:00Z
Source: ./index.md

---

## Caller Interface
requires:
- code (from user): the code to review

returns:
- report (from synthesizer): unified code review report with issues prioritized by severity

---

## Graph

### security-reviewer
source: services/security-reviewer.md
workspace: workspace/security-reviewer/
inputs:
  code ← bindings/caller/code.md
outputs:
  security-findings → workspace/security-reviewer/security-findings.md
  (public) security-findings → bindings/security-reviewer/security-findings.md
errors:
  none declared

---

### perf-reviewer
source: services/perf-reviewer.md
workspace: workspace/perf-reviewer/
inputs:
  code ← bindings/caller/code.md
outputs:
  perf-findings → workspace/perf-reviewer/perf-findings.md
  (public) perf-findings → bindings/perf-reviewer/perf-findings.md
errors:
  none declared

---

### style-reviewer
source: services/style-reviewer.md
workspace: workspace/style-reviewer/
inputs:
  code ← bindings/caller/code.md
outputs:
  style-findings → workspace/style-reviewer/style-findings.md
  (public) style-findings → bindings/style-reviewer/style-findings.md
errors:
  none declared

---

### synthesizer
source: services/synthesizer.md
workspace: workspace/synthesizer/
inputs:
  security-findings ← bindings/security-reviewer/security-findings.md
  perf-findings ← bindings/perf-reviewer/perf-findings.md
  style-findings ← bindings/style-reviewer/style-findings.md
outputs:
  report → workspace/synthesizer/report.md
  (public) report → bindings/synthesizer/report.md
errors:
  none declared

---

## Execution Order
1. security-reviewer (depends on: caller)
2. perf-reviewer (depends on: caller)
3. style-reviewer (depends on: caller)
4. synthesizer (depends on: security-reviewer, perf-reviewer, style-reviewer)

Parallelizable: security-reviewer, perf-reviewer, style-reviewer

## Environment
No environment variables declared by resolved services.

## Warnings
- None.
EOF
    cat > "$EXPORT_DIR/$SESSION_ID.json" <<EOF
{"messages":[
  {"role":"assistant","content":"","tool_calls":[{"function":{"name":"read_file","arguments":"{}"}},{"function":{"name":"write_file","arguments":"{}"}}]},
  {"role":"assistant","content":"{\"phase\":\"wire-v1\",\"manifest_path\":\".prose/runs/$RUN_ID/manifest.md\",\"copied_services\":[\".prose/runs/$RUN_ID/services/security-reviewer.md\",\".prose/runs/$RUN_ID/services/perf-reviewer.md\",\".prose/runs/$RUN_ID/services/style-reviewer.md\",\".prose/runs/$RUN_ID/services/synthesizer.md\"],\"warnings\":[]}"}
]}
EOF
    printf 'session_id: %s\n' "$SESSION_ID"
    exit 0
  fi

  case "$SERVICE" in
    "security-reviewer")
      SESSION_ID="security-session"
      OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/security-reviewer/security-findings.md"
      OUTPUT_BODY="# Security Findings\n\n- High: SQL injection.\n"
      ;;
    "perf-reviewer")
      SESSION_ID="perf-session"
      OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/perf-reviewer/perf-findings.md"
      OUTPUT_BODY="# Performance Findings\n\n- High: quadratic nested loop.\n"
      ;;
    "style-reviewer")
      SESSION_ID="style-session"
      OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/style-reviewer/style-findings.md"
      OUTPUT_BODY="# Style Findings\n\n- Low: readability issues.\n"
      ;;
    "synthesizer")
      SESSION_ID="synth-session"
      OUTPUT_PATH=".prose/runs/$RUN_ID/workspace/synthesizer/report.md"
      OUTPUT_BODY="# Unified Code Review Report\n\n- synthesized\n"
      ;;
    *)
      echo "unexpected service: $SERVICE" >&2
      exit 1
      ;;
  esac

  mkdir -p "$(dirname "$OUTPUT_PATH")"
  printf '%b' "$OUTPUT_BODY" > "$OUTPUT_PATH"
  cat > "$EXPORT_DIR/$SESSION_ID.json" <<EOF
{"messages":[
  {"role":"assistant","content":"","tool_calls":[{"function":{"name":"read_file","arguments":"{}"}},{"function":{"name":"write_file","arguments":"{}"}}]},
  {"role":"assistant","content":"Service complete: $SERVICE"}
]}
EOF
  printf 'session_id: %s\n' "$SESSION_ID"
  exit 0
fi

if [[ "$1" == "sessions" && "$2" == "export" ]]; then
  SESSION_ID=""
  OUTPUT_PATH=""
  shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --session-id)
        SESSION_ID="$2"
        shift 2
        ;;
      *)
        OUTPUT_PATH="$1"
        shift
        ;;
    esac
  done
  cp "$EXPORT_DIR/$SESSION_ID.json" "$OUTPUT_PATH"
  exit 0
fi

echo "unsupported fake hermes invocation: $*" >&2
exit 1
"##,
    )
    .unwrap();
    let mut permissions = fs::metadata(&fake_hermes_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&fake_hermes_path, permissions).unwrap();

    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = format!(
        "{}:{}",
        bin_dir.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .current_dir(repo_root)
        .env("PATH", path)
        .env("FAKE_HERMES_EXPORT_DIR", &export_dir)
        .args([
            "adapter",
            "dogfood",
            "specs/adapters/hermes-v1-md.json",
            "fixtures/adapter/parallel-reviews",
            "--input-file",
            "code=tests/fixtures/get_user_records.py",
            "--expect-binding",
            "synthesizer/report",
        ])
        .output()
        .unwrap();

    assert!(
        output.status.success(),
        "status: {:?}\nstderr:\n{}\nstdout:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout),
    );

    let json = parse_json(&output);
    assert_eq!(json["succeeded"], true, "report: {json}");
    assert_eq!(
        json["observed_subagent_requests"],
        json!([
            "security-reviewer",
            "perf-reviewer",
            "style-reviewer",
            "synthesizer"
        ])
    );
    assert_eq!(json["observed_execute_tool_uses"]["read_file"], 4);
    assert_eq!(json["observed_execute_tool_uses"]["write_file"], 4);
    assert_eq!(json["expected_binding_exists"], true, "report: {json}");
    assert_eq!(json["expected_binding_nonempty"], true, "report: {json}");
    assert_eq!(json["state_complete"], true, "report: {json}");
    assert!(
        json["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|warning| warning
                .as_str()
                .is_some_and(|text| text.contains("host-mediated"))),
        "report: {json}"
    );
    assert!(
        json["artifacts"]["wire_session_export"]
            .as_str()
            .unwrap()
            .ends_with("wire-session.json")
    );
}
