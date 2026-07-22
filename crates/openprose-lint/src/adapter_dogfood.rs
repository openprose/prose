use crate::adapter::{
    AdapterManifest, AdapterPhase, load_adapter_manifest, validate_adapter_manifest,
};
use crate::spec::{default_spec_source, repo_root};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct DogfoodInput {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Default)]
pub struct AdapterDogfoodOptions {
    pub inputs: Vec<DogfoodInput>,
    pub expected_binding: Option<String>,
    pub test_root: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
pub struct AdapterDogfoodReport {
    pub schema_version: String,
    pub adapter_id: String,
    pub subject: String,
    pub valid_adapter: bool,
    pub succeeded: bool,
    pub test_root: String,
    pub working_directory: String,
    pub entry_point: String,
    pub run_id: String,
    pub input_names: Vec<String>,
    pub expected_binding: Option<String>,
    pub expected_binding_exists: bool,
    pub expected_binding_nonempty: bool,
    pub expected_binding_reported: bool,
    pub expected_binding_bytes: Option<u64>,
    pub state_complete: bool,
    pub wire_exit_code: Option<i32>,
    pub execute_exit_code: Option<i32>,
    pub wire_hook_events_observed: usize,
    pub execute_hook_events_observed: usize,
    pub observed_execute_tool_uses: BTreeMap<String, usize>,
    pub observed_subagent_requests: Vec<String>,
    pub output_mediation_observed: bool,
    pub subagents_used: Vec<String>,
    pub wire_response_text: Option<String>,
    pub execute_response_text: Option<String>,
    pub wire_response_json: Option<Value>,
    pub execute_response_json: Option<Value>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub artifacts: BTreeMap<String, String>,
}

#[derive(Debug)]
struct StagedProgram {
    program_dir: PathBuf,
    entry_rel: PathBuf,
}

#[derive(Debug, Default)]
struct PhaseResponse {
    assistant_texts: Vec<String>,
    final_text: Option<String>,
    final_json: Option<Value>,
    tool_uses: Vec<String>,
    subagent_requests: Vec<String>,
    hook_events_observed: usize,
}

#[derive(Debug, Clone)]
struct WiredManifest {
    returns: Vec<ManifestReturn>,
    services: Vec<ManifestService>,
    execution_order: Vec<String>,
}

#[derive(Debug, Clone)]
struct ManifestReturn {
    name: String,
    from_service: Option<String>,
}

#[derive(Debug, Clone)]
struct ManifestService {
    name: String,
    source: PathBuf,
    workspace: PathBuf,
    inputs: Vec<ManifestBinding>,
    outputs: Vec<ManifestOutput>,
}

#[derive(Debug, Clone)]
struct ManifestBinding {
    name: String,
    path: PathBuf,
}

#[derive(Debug, Clone)]
struct ManifestOutput {
    name: String,
    workspace_path: PathBuf,
    public_path: Option<PathBuf>,
}

#[derive(Debug)]
struct CodexExecRequest<'a> {
    working_directory: &'a Path,
    developer_instructions: &'a str,
    prompt: &'a str,
    out_path: &'a Path,
    err_path: &'a Path,
    last_message_path: Option<&'a Path>,
    sandbox: &'a str,
}

#[derive(Debug)]
struct HermesChatRequest<'a> {
    working_directory: &'a Path,
    prompt: &'a str,
    out_path: &'a Path,
    err_path: &'a Path,
    export_path: &'a Path,
    toolsets: &'a str,
    source: &'a str,
}

pub fn dogfood_adapter_manifest(
    manifest_path: &Path,
    target: &Path,
    options: AdapterDogfoodOptions,
) -> Result<AdapterDogfoodReport> {
    let validation = validate_adapter_manifest(manifest_path)?;
    let (_, manifest) = load_adapter_manifest(manifest_path)?;
    let test_root = match options.test_root.as_ref() {
        Some(path) => path.clone(),
        None => create_test_root()?,
    };
    fs::create_dir_all(&test_root)
        .with_context(|| format!("create test root {}", test_root.display()))?;
    clear_generated_test_root_artifacts(&test_root)?;

    let staged = stage_program(target, &test_root)?;
    let run_id = generate_run_id()?;
    let expected_binding = options.expected_binding.clone();
    let expected_binding_rel = expected_binding.as_deref().map(normalize_expected_binding);

    let mut report = AdapterDogfoodReport {
        schema_version: validation.schema_version.clone(),
        adapter_id: manifest.adapter_id.clone(),
        subject: manifest.subject.clone(),
        valid_adapter: validation.valid,
        succeeded: false,
        test_root: test_root.display().to_string(),
        working_directory: staged.program_dir.display().to_string(),
        entry_point: staged.entry_rel.display().to_string(),
        run_id: run_id.clone(),
        input_names: options
            .inputs
            .iter()
            .map(|input| input.name.clone())
            .collect(),
        expected_binding,
        expected_binding_exists: false,
        expected_binding_nonempty: false,
        expected_binding_reported: false,
        expected_binding_bytes: None,
        state_complete: false,
        wire_exit_code: None,
        execute_exit_code: None,
        wire_hook_events_observed: 0,
        execute_hook_events_observed: 0,
        observed_execute_tool_uses: BTreeMap::new(),
        observed_subagent_requests: Vec::new(),
        output_mediation_observed: false,
        subagents_used: Vec::new(),
        wire_response_text: None,
        execute_response_text: None,
        wire_response_json: None,
        execute_response_json: None,
        errors: Vec::new(),
        warnings: validation.warnings,
        artifacts: BTreeMap::new(),
    };

    if !validation.valid {
        report.errors.extend(validation.errors);
        return Ok(report);
    }

    if manifest.adapter_id == "codex-v1-md" {
        return dogfood_codex_manifest(
            &manifest,
            &staged,
            &run_id,
            &options,
            expected_binding_rel.as_deref(),
            &test_root,
            report,
        );
    }

    if manifest.adapter_id == "hermes-v1-md" {
        return dogfood_hermes_manifest(
            &manifest,
            &staged,
            &run_id,
            &options,
            expected_binding_rel.as_deref(),
            &test_root,
            report,
        );
    }

    if manifest.adapter_id != "claude-code-v1-md" {
        report.errors.push(format!(
            "adapter dogfood currently supports claude-code-v1-md, codex-v1-md, and hermes-v1-md only; got {}",
            manifest.adapter_id
        ));
        return Ok(report);
    }

    let wire_system_append = render_system_append(&manifest, "wire-v1")?;
    let execute_system_append = render_system_append(&manifest, "execute-v1")?;

    let wire_prompt = build_wire_prompt(&manifest, &staged, &run_id)?;
    let execute_prompt = build_execute_prompt(
        &manifest,
        &staged,
        &run_id,
        &options.inputs,
        expected_binding_rel.as_deref(),
    )?;

    let meta_path = test_root.join("meta.json");
    let wire_system_append_path = test_root.join("wire-system-append.txt");
    let execute_system_append_path = test_root.join("execute-system-append.txt");
    let wire_prompt_path = test_root.join("wire-prompt.txt");
    let execute_prompt_path = test_root.join("execute-prompt.txt");
    let wire_script_path = test_root.join("wire.sh");
    let execute_script_path = test_root.join("execute.sh");
    let wire_out_path = test_root.join("wire.out");
    let wire_err_path = test_root.join("wire.err");
    let wire_exit_path = test_root.join("wire.exit");
    let execute_out_path = test_root.join("execute.out");
    let execute_err_path = test_root.join("execute.err");
    let execute_exit_path = test_root.join("execute.exit");

    fs::write(&wire_system_append_path, &wire_system_append)
        .with_context(|| format!("write {}", wire_system_append_path.display()))?;
    fs::write(&execute_system_append_path, &execute_system_append)
        .with_context(|| format!("write {}", execute_system_append_path.display()))?;
    fs::write(&wire_prompt_path, &wire_prompt)
        .with_context(|| format!("write {}", wire_prompt_path.display()))?;
    fs::write(&execute_prompt_path, &execute_prompt)
        .with_context(|| format!("write {}", execute_prompt_path.display()))?;
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&serde_json::json!({
            "test_root": test_root,
            "program_dir": staged.program_dir,
            "entry_point": staged.entry_rel,
            "run_id": run_id,
            "adapter_id": manifest.adapter_id,
        }))?,
    )
    .with_context(|| format!("write {}", meta_path.display()))?;

    let wire_script = build_claude_script(
        &staged.program_dir,
        &wire_system_append_path,
        &wire_prompt_path,
        &wire_out_path,
        &wire_err_path,
        &wire_exit_path,
    );
    let execute_script = build_claude_script(
        &staged.program_dir,
        &execute_system_append_path,
        &execute_prompt_path,
        &execute_out_path,
        &execute_err_path,
        &execute_exit_path,
    );
    fs::write(&wire_script_path, wire_script)
        .with_context(|| format!("write {}", wire_script_path.display()))?;
    fs::write(&execute_script_path, execute_script)
        .with_context(|| format!("write {}", execute_script_path.display()))?;

    report.artifacts.insert(
        "system_append".to_string(),
        wire_system_append_path.display().to_string(),
    );
    report.artifacts.insert(
        "wire_system_append".to_string(),
        wire_system_append_path.display().to_string(),
    );
    report.artifacts.insert(
        "execute_system_append".to_string(),
        execute_system_append_path.display().to_string(),
    );
    report.artifacts.insert(
        "wire_prompt".to_string(),
        wire_prompt_path.display().to_string(),
    );
    report.artifacts.insert(
        "execute_prompt".to_string(),
        execute_prompt_path.display().to_string(),
    );
    report.artifacts.insert(
        "wire_script".to_string(),
        wire_script_path.display().to_string(),
    );
    report.artifacts.insert(
        "execute_script".to_string(),
        execute_script_path.display().to_string(),
    );
    report
        .artifacts
        .insert("meta".to_string(), meta_path.display().to_string());
    report
        .artifacts
        .insert("wire_log".to_string(), wire_out_path.display().to_string());
    report.artifacts.insert(
        "execute_log".to_string(),
        execute_out_path.display().to_string(),
    );

    let wire_status = Command::new("bash")
        .arg(&wire_script_path)
        .status()
        .with_context(|| format!("run {}", wire_script_path.display()))?;
    report.wire_exit_code = Some(wire_status.code().unwrap_or(-1));

    let run_dir = staged.program_dir.join(".prose").join("runs").join(&run_id);
    let manifest_output_path = run_dir.join("manifest.md");
    let state_path = run_dir.join("state.md");
    report
        .artifacts
        .insert("run_dir".to_string(), run_dir.display().to_string());
    report.artifacts.insert(
        "manifest".to_string(),
        manifest_output_path.display().to_string(),
    );
    report
        .artifacts
        .insert("state".to_string(), state_path.display().to_string());

    if report.wire_exit_code != Some(0) {
        report.errors.push(format!(
            "wire phase exited with status {}",
            report.wire_exit_code.unwrap_or(-1)
        ));
        return Ok(report);
    }

    let wire_response = load_phase_response(&wire_out_path)?;
    report.wire_response_text = wire_response.final_text.clone();
    report.wire_response_json = wire_response.final_json.clone();
    report.wire_hook_events_observed = wire_response.hook_events_observed;
    if report.wire_hook_events_observed > 0 {
        report.warnings.push(format!(
            "wire phase observed {} Claude hook start event(s); Claude CLI environment is not fully isolated",
            report.wire_hook_events_observed
        ));
    }

    if !manifest_output_path.exists() {
        report.errors.push(format!(
            "wire phase did not produce manifest {}",
            manifest_output_path.display()
        ));
        return Ok(report);
    }

    validate_wire_phase_response(
        &wire_response,
        &staged.program_dir,
        &run_id,
        &manifest_output_path,
        &mut report,
    );
    if !report.errors.is_empty() {
        return Ok(report);
    }

    let execute_status = Command::new("bash")
        .arg(&execute_script_path)
        .status()
        .with_context(|| format!("run {}", execute_script_path.display()))?;
    report.execute_exit_code = Some(execute_status.code().unwrap_or(-1));

    let execute_response = load_phase_response(&execute_out_path)?;
    report.execute_response_text = execute_response.final_text.clone();
    report.execute_response_json = execute_response.final_json.clone();
    report.execute_hook_events_observed = execute_response.hook_events_observed;
    if report.execute_hook_events_observed > 0 {
        report.warnings.push(format!(
            "execute phase observed {} Claude hook start event(s); Claude CLI environment is not fully isolated",
            report.execute_hook_events_observed
        ));
    }
    report.observed_execute_tool_uses = count_tool_uses(&execute_response.tool_uses);
    report.observed_subagent_requests = dedupe_strings(&execute_response.subagent_requests);
    report.output_mediation_observed = execute_response
        .assistant_texts
        .iter()
        .any(|text| looks_like_output_mediation(text));

    if report.execute_exit_code != Some(0) {
        report.errors.push(format!(
            "execute phase exited with status {}",
            report.execute_exit_code.unwrap_or(-1)
        ));
    }

    validate_execute_phase_response(
        &execute_response,
        &staged.program_dir,
        &run_id,
        expected_binding_rel.as_deref(),
        &mut report,
    );

    if state_path.exists() {
        let state = fs::read_to_string(&state_path)
            .with_context(|| format!("read {}", state_path.display()))?;
        report.state_complete = state_has_success_end_marker(&state);
        if !report.state_complete {
            report
                .errors
                .push("state.md does not contain a successful ---end marker".to_string());
        }
    } else {
        report.errors.push(format!(
            "execute phase did not produce state file {}",
            state_path.display()
        ));
    }

    if let Some(expected_rel) = expected_binding_rel {
        let expected_path = run_dir.join(expected_rel);
        report.artifacts.insert(
            "expected_binding".to_string(),
            expected_path.display().to_string(),
        );
        report.expected_binding_exists = expected_path.exists();
        if !report.expected_binding_exists {
            report.errors.push(format!(
                "expected binding was not published: {}",
                expected_path.display()
            ));
        } else {
            let content = fs::read_to_string(&expected_path)
                .with_context(|| format!("read {}", expected_path.display()))?;
            let bytes = content.len() as u64;
            report.expected_binding_bytes = Some(bytes);
            report.expected_binding_nonempty = !content.trim().is_empty();
            if !report.expected_binding_nonempty {
                report.errors.push(format!(
                    "expected binding exists but is empty: {}",
                    expected_path.display()
                ));
            }
        }
    }

    report.succeeded = report.errors.is_empty();
    Ok(report)
}

fn stage_program(target: &Path, test_root: &Path) -> Result<StagedProgram> {
    let source = target
        .canonicalize()
        .with_context(|| format!("canonicalize {}", target.display()))?;
    let program_dir = test_root.join("program");
    if program_dir.exists() {
        fs::remove_dir_all(&program_dir)
            .with_context(|| format!("remove stale {}", program_dir.display()))?;
    }
    fs::create_dir_all(&program_dir)
        .with_context(|| format!("create {}", program_dir.display()))?;

    let entry_rel = if source.is_dir() {
        copy_tree(&source, &program_dir)?;
        let index = program_dir.join("index.md");
        if !index.exists() {
            bail!(
                "program directory {} must contain index.md for adapter dogfood",
                source.display()
            );
        }
        PathBuf::from("index.md")
    } else {
        let parent = source
            .parent()
            .with_context(|| format!("resolve parent for {}", source.display()))?;
        copy_tree(parent, &program_dir)?;
        PathBuf::from(
            source
                .file_name()
                .with_context(|| format!("resolve file name for {}", source.display()))?,
        )
    };

    Ok(StagedProgram {
        program_dir,
        entry_rel,
    })
}

fn copy_tree(source: &Path, destination: &Path) -> Result<()> {
    for entry in WalkDir::new(source) {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(source).with_context(|| {
            format!("strip prefix {} from {}", source.display(), path.display())
        })?;

        if relative.as_os_str().is_empty() {
            continue;
        }

        if relative.components().any(|component| {
            matches!(
                component.as_os_str().to_str(),
                Some(".git" | ".prose" | "target")
            )
        }) {
            continue;
        }

        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target).with_context(|| format!("create {}", target.display()))?;
            continue;
        }

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
        fs::copy(path, &target)
            .with_context(|| format!("copy {} -> {}", path.display(), target.display()))?;
    }
    Ok(())
}

fn create_test_root() -> Result<PathBuf> {
    // The nanosecond clock alone is not collision-free under parallel callers
    // (e.g. multiple dogfood tests on separate threads can observe the same
    // instant). Mix in the process id and a monotonic per-process counter so
    // every invocation gets a unique staging root. Regression coverage:
    // adapter_tests::create_test_root_is_unique_under_parallel_calls.
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .context("system clock before unix epoch")?
        .as_nanos();
    let pid = std::process::id();
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!("openprose-adapter-dogfood.{nonce}.{pid}.{seq}"));
    fs::create_dir_all(&root).with_context(|| format!("create {}", root.display()))?;
    Ok(root)
}

fn clear_generated_test_root_artifacts(test_root: &Path) -> Result<()> {
    for name in [
        "meta.json",
        "system-append.txt",
        "wire-system-append.txt",
        "execute-system-append.txt",
        "wire-prompt.txt",
        "execute-prompt.txt",
        "wire.sh",
        "execute.sh",
        "wire.out",
        "wire.err",
        "wire.exit",
        "wire-session.json",
        "execute.out",
        "execute.err",
        "execute.exit",
    ] {
        let path = test_root.join(name);
        if !path.exists() {
            continue;
        }
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .with_context(|| format!("remove stale {}", path.display()))?;
        } else {
            fs::remove_file(&path).with_context(|| format!("remove stale {}", path.display()))?;
        }
    }
    Ok(())
}

fn generate_run_id() -> Result<String> {
    let timestamp = Command::new("date")
        .arg("+%Y%m%d-%H%M%S")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            let seconds = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            format!("run-{seconds}")
        });
    let suffix = format!("{:06x}", std::process::id());
    Ok(format!("{timestamp}-{suffix}"))
}

fn build_wire_prompt(
    manifest: &AdapterManifest,
    staged: &StagedProgram,
    run_id: &str,
) -> Result<String> {
    let entry_path = staged.program_dir.join(&staged.entry_rel);
    let entry_source = fs::read_to_string(&entry_path)
        .with_context(|| format!("read {}", entry_path.display()))?;
    let wire_phase = phase(manifest, "wire-v1")?;
    let program_attachment = wire_phase
        .attachments
        .iter()
        .find(|attachment| attachment.kind == "program")
        .with_context(|| {
            format!(
                "adapter {} missing wire-v1 program attachment",
                manifest.adapter_id
            )
        })?;

    let entry_display = format!("./{}", staged.entry_rel.display());
    let mut prompt = format!(
        "OpenProse deterministic adapter dogfood for Claude Code.\n\nAdapter identity:\n- adapter_id: {}\n- source: {}\n- sourceUrl: {}\n- spec_ref: {}\n- skill_root: {}\n- phase: wire-v1\n- command_intent: prose run {}\n- working_directory: {}\n- run_id: {}\n\nClaude Code harness note:\n- When OpenProse specs refer to a Task tool for subagents, this harness uses the Agent tool instead.\n- In this phase, do not execute services yet. Only perform Forme wiring.\n\nRequired behavior:\n1. Load the exact Forme spec provided below.\n2. Read the entry program at {}.\n3. Resolve any referenced service files from the current working directory.\n4. Create .prose/runs/{}/program.md as a copy of {}.\n5. Create .prose/runs/{}/services/ with copies of each resolved service file.\n6. Write .prose/runs/{}/manifest.md as the Forme manifest for this program.\n7. Do not execute the program yet.\n8. Final response must be a single JSON object with keys: phase, manifest_path, copied_services, warnings.\n\nDo not search for OpenProse spec files. The exact pinned file content follows.\n\n",
        manifest.adapter_id,
        manifest.source,
        manifest.source_url,
        manifest.spec_ref,
        manifest.skill_root,
        entry_display,
        staged.program_dir.display(),
        run_id,
        entry_display,
        run_id,
        entry_display,
        run_id,
        run_id,
    );

    for (path, content) in read_phase_files(manifest, "wire-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }

    prompt.push_str(&render_attachment(
        &program_attachment.kind,
        &program_attachment.label,
        &entry_path.display().to_string(),
        &entry_source,
    ));
    prompt.push('\n');
    Ok(prompt)
}

fn build_execute_prompt(
    manifest: &AdapterManifest,
    staged: &StagedProgram,
    run_id: &str,
    inputs: &[DogfoodInput],
    expected_binding: Option<&Path>,
) -> Result<String> {
    let execute_phase = phase(manifest, "execute-v1")?;
    let manifest_attachment = execute_phase
        .attachments
        .iter()
        .find(|attachment| attachment.kind == "manifest")
        .with_context(|| {
            format!(
                "adapter {} missing execute-v1 manifest attachment",
                manifest.adapter_id
            )
        })?;

    let entry_display = format!("./{}", staged.entry_rel.display());
    let mut prompt = format!(
        "OpenProse deterministic adapter dogfood for Claude Code.\n\nAdapter identity:\n- adapter_id: {}\n- source: {}\n- sourceUrl: {}\n- spec_ref: {}\n- skill_root: {}\n- phase: execute-v1 + subagent-v1\n- command_intent: prose run {}\n- working_directory: {}\n- run_id: {}\n\nClaude Code harness note:\n- When OpenProse specs refer to a Task tool for subagents, use the Agent tool.\n- For every service subagent you spawn, prepend the exact session primitive provided below before the service definition.\n- If a subagent cannot directly persist a declared output file and instead returns the final content inline, the root VM must write that content into the service workspace itself, then publish it to the manifest-declared binding path.\n\n",
        manifest.adapter_id,
        manifest.source,
        manifest.source_url,
        manifest.spec_ref,
        manifest.skill_root,
        entry_display,
        staged.program_dir.display(),
        run_id,
    );

    if inputs.is_empty() {
        prompt.push_str("Pre-supplied caller input:\n- none\n\n");
    } else {
        prompt.push_str("Pre-supplied caller input:\n");
        for input in inputs {
            prompt.push_str(&format!(
                "- {}: provided below; write it to .prose/runs/{}/bindings/caller/{}.md before executing the manifest.\n",
                input.name, run_id, input.name
            ));
        }
        prompt.push('\n');
    }

    prompt.push_str("Required behavior:\n");
    prompt.push_str("1. Load the exact VM spec and filesystem state spec provided below.\n");
    prompt.push_str(&format!(
        "2. Load the manifest at .prose/runs/{}/manifest.md.\n",
        run_id
    ));
    prompt.push_str(&format!(
        "3. Create any missing run directories needed under .prose/runs/{}/.\n",
        run_id
    ));
    prompt.push_str("4. Write the caller binding file for each pre-supplied input.\n");
    prompt.push_str("5. Execute the manifest using filesystem state.\n");
    prompt.push_str("6. Use subagents for the service sessions.\n");
    prompt.push_str(
        "7. Publish the final program outputs to the manifest-declared public binding paths.\n",
    );
    if let Some(expected_binding) = expected_binding {
        prompt.push_str(&format!(
            "8. Ensure the expected published binding exists at {} and contains the final output content, not an empty placeholder.\n",
            expected_binding.display()
        ));
        prompt.push_str("9. Final response must be a single JSON object with keys: phase, run_id, subagents_used, final_report_path, state_path, published_outputs.\n\n");
    } else {
        prompt.push_str("8. Final response must be a single JSON object with keys: phase, run_id, subagents_used, final_report_path, state_path, published_outputs.\n\n");
    }
    prompt.push_str(
        "Do not search for OpenProse spec files. The exact pinned file content follows.\n\n",
    );

    for (path, content) in read_phase_files(manifest, "execute-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }
    for (path, content) in read_phase_files(manifest, "subagent-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }

    prompt.push_str(&render_attachment(
        &manifest_attachment.kind,
        &manifest_attachment.label,
        &format!(".prose/runs/{}/manifest.md", run_id),
        "(Load this file from disk at execution time.)",
    ));
    prompt.push_str("\n\n");

    for input in inputs {
        prompt.push_str(&render_attachment(
            "program-input",
            &input.name,
            &format!(".prose/runs/{}/bindings/caller/{}.md", run_id, input.name),
            &input.content,
        ));
        prompt.push_str("\n\n");
    }

    Ok(prompt)
}

fn build_codex_wire_prompt(
    manifest: &AdapterManifest,
    staged: &StagedProgram,
    run_id: &str,
) -> Result<String> {
    let entry_path = staged.program_dir.join(&staged.entry_rel);
    let entry_source = fs::read_to_string(&entry_path)
        .with_context(|| format!("read {}", entry_path.display()))?;
    let wire_phase = phase(manifest, "wire-v1")?;
    let program_attachment = wire_phase
        .attachments
        .iter()
        .find(|attachment| attachment.kind == "program")
        .with_context(|| {
            format!(
                "adapter {} missing wire-v1 program attachment",
                manifest.adapter_id
            )
        })?;

    let entry_display = format!("./{}", staged.entry_rel.display());
    let mut prompt = format!(
        "OpenProse deterministic adapter dogfood for Codex CLI.\n\nAdapter identity:\n- adapter_id: {}\n- source: {}\n- sourceUrl: {}\n- spec_ref: {}\n- skill_root: {}\n- phase: wire-v1\n- command_intent: prose run {}\n- working_directory: {}\n- run_id: {}\n\nCodex harness note:\n- Developer instructions already carry the pinned OpenProse guidance appendix for this phase.\n- In this phase, do not execute services yet. Only perform Forme wiring.\n\nRequired behavior:\n1. Load the exact Forme spec provided below.\n2. Read the entry program attachment.\n3. Resolve any referenced service files from the current working directory.\n4. Create .prose/runs/{}/program.md as a copy of {}.\n5. Create .prose/runs/{}/services/ with copies of each resolved service file.\n6. Write .prose/runs/{}/manifest.md as the Forme manifest for this program.\n7. Do not execute the program yet.\n8. Final response must be a single JSON object with keys: phase, manifest_path, copied_services, warnings.\n\nDo not search for OpenProse spec files. The exact pinned file content follows.\n\n",
        manifest.adapter_id,
        manifest.source,
        manifest.source_url,
        manifest.spec_ref,
        manifest.skill_root,
        entry_display,
        staged.program_dir.display(),
        run_id,
        run_id,
        entry_display,
        run_id,
        run_id,
    );

    for (path, content) in read_phase_files(manifest, "wire-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }

    prompt.push_str(&render_attachment(
        &program_attachment.kind,
        &program_attachment.label,
        &entry_path.display().to_string(),
        &entry_source,
    ));
    prompt.push('\n');
    Ok(prompt)
}

fn build_codex_service_prompt(
    manifest: &AdapterManifest,
    run_id: &str,
    service: &ManifestService,
    run_dir: &Path,
) -> Result<String> {
    let service_path = run_dir.join(&service.source);
    let service_source = fs::read_to_string(&service_path)
        .with_context(|| format!("read {}", service_path.display()))?;
    let workspace_path = run_relative_path(run_id, &service.workspace);

    let mut prompt = format!(
        "OpenProse deterministic service session for Codex CLI.\n\nService: {}\nRun ID: {}\n\nRequired behavior:\n1. Load the exact session primitive below.\n2. Read the service definition attachment and obey its requires/ensures contract.\n3. Read each input file path listed below to access your input data.\n4. Write all work to the provided workspace path.\n5. Write every declared ensures output to the exact workspace path listed below.\n6. If you cannot satisfy the contract, write __error.md in the workspace.\n7. Final response should be a short confirmation that names the outputs you wrote.\n\n",
        service.name, run_id,
    );

    for (path, content) in read_phase_files(manifest, "subagent-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }

    prompt.push_str(&render_attachment(
        "service-definition",
        "service_definition",
        &run_relative_path(run_id, &service.source)
            .display()
            .to_string(),
        &service_source,
    ));
    prompt.push_str("\n\n");

    let input_bindings = service
        .inputs
        .iter()
        .map(|binding| {
            format!(
                "- {}: {}",
                binding.name,
                run_relative_path(run_id, &binding.path).display()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    prompt.push_str(&render_attachment(
        "inputs",
        "input_bindings",
        "input-bindings.md",
        &input_bindings,
    ));
    prompt.push_str("\n\n");

    prompt.push_str(&render_attachment(
        "workspace",
        "workspace_path",
        &workspace_path.display().to_string(),
        &workspace_path.display().to_string(),
    ));
    prompt.push_str("\n\n");

    let output_instructions = service
        .outputs
        .iter()
        .map(|output| {
            format!(
                "- {}: {}",
                output.name,
                run_relative_path(run_id, &output.workspace_path).display()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    prompt.push_str(&render_attachment(
        "output-instructions",
        "output_contract",
        "output-contract.md",
        &output_instructions,
    ));
    prompt.push('\n');
    Ok(prompt)
}

fn build_hermes_wire_prompt(
    manifest: &AdapterManifest,
    staged: &StagedProgram,
    run_id: &str,
) -> Result<String> {
    let entry_path = staged.program_dir.join(&staged.entry_rel);
    let entry_source = fs::read_to_string(&entry_path)
        .with_context(|| format!("read {}", entry_path.display()))?;
    let wire_phase = phase(manifest, "wire-v1")?;
    let program_attachment = wire_phase
        .attachments
        .iter()
        .find(|attachment| attachment.kind == "program")
        .with_context(|| {
            format!(
                "adapter {} missing wire-v1 program attachment",
                manifest.adapter_id
            )
        })?;

    let entry_display = format!("./{}", staged.entry_rel.display());
    let mut prompt = format!(
        "OpenProse deterministic adapter dogfood for Hermes Agent CLI.\n\nAdapter identity:\n- adapter_id: {}\n- source: {}\n- sourceUrl: {}\n- spec_ref: {}\n- skill_root: {}\n- phase: wire-v1\n- command_intent: prose run {}\n- working_directory: {}\n- run_id: {}\n\nHermes harness note:\n- `hermes chat --help` exposes a single query channel (`-q/--query`) plus toolset selection; there is no CLI flag for a separate system or developer prompt append.\n- In this adapted path, every pinned OpenProse file for wire-v1 is injected inline through the user query below.\n- In this phase, do not execute services yet. Only perform Forme wiring.\n\nRequired behavior:\n1. Load the exact OpenProse files provided below.\n2. Read the entry program attachment.\n3. Resolve any referenced service files from the current working directory.\n4. Create .prose/runs/{}/program.md as a copy of {}.\n5. Create .prose/runs/{}/services/ with copies of each resolved service file.\n6. Write .prose/runs/{}/manifest.md as the Forme manifest for this program.\n7. Do not execute the program yet.\n8. Final response must be a single JSON object with keys: phase, manifest_path, copied_services, warnings.\n\nDo not search for OpenProse spec files. The exact pinned file content follows.\n\n",
        manifest.adapter_id,
        manifest.source,
        manifest.source_url,
        manifest.spec_ref,
        manifest.skill_root,
        entry_display,
        staged.program_dir.display(),
        run_id,
        run_id,
        entry_display,
        run_id,
        run_id,
    );

    for (path, content) in read_phase_files(manifest, "wire-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }

    prompt.push_str(&render_attachment(
        &program_attachment.kind,
        &program_attachment.label,
        &entry_path.display().to_string(),
        &entry_source,
    ));
    prompt.push('\n');
    Ok(prompt)
}

fn build_hermes_service_prompt(
    manifest: &AdapterManifest,
    run_id: &str,
    service: &ManifestService,
    run_dir: &Path,
) -> Result<String> {
    let service_path = run_dir.join(&service.source);
    let service_source = fs::read_to_string(&service_path)
        .with_context(|| format!("read {}", service_path.display()))?;
    let workspace_path = run_relative_path(run_id, &service.workspace);

    let mut prompt = format!(
        "OpenProse deterministic service session for Hermes Agent CLI.\n\nService: {}\nRun ID: {}\n\nHermes harness note:\n- This host-mediated proof launches one fresh `hermes chat -q` session per OpenProse service.\n- The subagent primitive below is provided as pinned context inside the user query because Hermes CLI does not expose a dedicated system/developer prompt append flag in `--help`.\n\nRequired behavior:\n1. Load the exact session primitive below.\n2. Read the service definition attachment and obey its requires/ensures contract.\n3. Read each input file path listed below to access your input data.\n4. Write all work to the provided workspace path.\n5. Write every declared ensures output to the exact workspace path listed below.\n6. If you cannot satisfy the contract, write __error.md in the workspace.\n7. Final response should be a short confirmation that names the outputs you wrote.\n\n",
        service.name, run_id,
    );

    for (path, content) in read_phase_files(manifest, "subagent-v1", Some("user"))? {
        prompt.push_str(&render_openprose_file(&path, &content));
        prompt.push_str("\n\n");
    }

    prompt.push_str(&render_attachment(
        "service-definition",
        "service_definition",
        &run_relative_path(run_id, &service.source)
            .display()
            .to_string(),
        &service_source,
    ));
    prompt.push_str("\n\n");

    let input_bindings = service
        .inputs
        .iter()
        .map(|binding| {
            format!(
                "- {}: {}",
                binding.name,
                run_relative_path(run_id, &binding.path).display()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    prompt.push_str(&render_attachment(
        "inputs",
        "input_bindings",
        "input-bindings.md",
        &input_bindings,
    ));
    prompt.push_str("\n\n");

    prompt.push_str(&render_attachment(
        "workspace",
        "workspace_path",
        &workspace_path.display().to_string(),
        &workspace_path.display().to_string(),
    ));
    prompt.push_str("\n\n");

    let output_instructions = service
        .outputs
        .iter()
        .map(|output| {
            format!(
                "- {}: {}",
                output.name,
                run_relative_path(run_id, &output.workspace_path).display()
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    prompt.push_str(&render_attachment(
        "output-instructions",
        "output_contract",
        "output-contract.md",
        &output_instructions,
    ));
    prompt.push('\n');
    Ok(prompt)
}

fn dogfood_hermes_manifest(
    manifest: &AdapterManifest,
    staged: &StagedProgram,
    run_id: &str,
    options: &AdapterDogfoodOptions,
    expected_binding_rel: Option<&Path>,
    test_root: &Path,
    mut report: AdapterDogfoodReport,
) -> Result<AdapterDogfoodReport> {
    let wire_prompt = build_hermes_wire_prompt(manifest, staged, run_id)?;

    let meta_path = test_root.join("meta.json");
    let wire_prompt_path = test_root.join("wire-prompt.txt");
    let wire_out_path = test_root.join("wire.out");
    let wire_err_path = test_root.join("wire.err");
    let wire_export_path = test_root.join("wire-session.json");
    let execute_out_path = test_root.join("execute.out");
    let execute_err_path = test_root.join("execute.err");

    fs::write(&wire_prompt_path, &wire_prompt)
        .with_context(|| format!("write {}", wire_prompt_path.display()))?;
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&json!({
            "test_root": test_root,
            "program_dir": staged.program_dir,
            "entry_point": staged.entry_rel,
            "run_id": run_id,
            "adapter_id": manifest.adapter_id,
            "strategy": "host-mediated-hermes-services"
        }))?,
    )
    .with_context(|| format!("write {}", meta_path.display()))?;

    report.artifacts.insert(
        "wire_prompt".to_string(),
        wire_prompt_path.display().to_string(),
    );
    report.artifacts.insert(
        "wire_session_export".to_string(),
        wire_export_path.display().to_string(),
    );
    report
        .artifacts
        .insert("meta".to_string(), meta_path.display().to_string());
    report
        .artifacts
        .insert("wire_log".to_string(), wire_out_path.display().to_string());
    report.artifacts.insert(
        "execute_log".to_string(),
        execute_out_path.display().to_string(),
    );

    report.wire_exit_code = Some(run_hermes_chat(HermesChatRequest {
        working_directory: &staged.program_dir,
        prompt: &wire_prompt,
        out_path: &wire_out_path,
        err_path: &wire_err_path,
        export_path: &wire_export_path,
        toolsets: "file,terminal,clarify",
        source: "tool",
    })?);

    let run_dir = staged.program_dir.join(".prose").join("runs").join(run_id);
    let manifest_output_path = run_dir.join("manifest.md");
    let state_path = run_dir.join("state.md");
    report
        .artifacts
        .insert("run_dir".to_string(), run_dir.display().to_string());
    report.artifacts.insert(
        "manifest".to_string(),
        manifest_output_path.display().to_string(),
    );
    report
        .artifacts
        .insert("state".to_string(), state_path.display().to_string());

    if report.wire_exit_code != Some(0) {
        report.errors.push(format!(
            "wire phase exited with status {}",
            report.wire_exit_code.unwrap_or(-1)
        ));
        return Ok(report);
    }

    let wire_response = load_phase_response(&wire_export_path)?;
    report.wire_response_text = wire_response.final_text.clone();
    report.wire_response_json = wire_response.final_json.clone();
    validate_wire_phase_response(
        &wire_response,
        &staged.program_dir,
        run_id,
        &manifest_output_path,
        &mut report,
    );
    if !report.errors.is_empty() {
        return Ok(report);
    }

    let wired_manifest = parse_wired_manifest(&manifest_output_path)?;
    write_caller_input_bindings(&run_dir, &options.inputs)?;

    let helpers_dir = run_dir.join("helpers");
    let subagent_logs_dir = run_dir.join("subagent-logs");
    let subagent_export_dir = run_dir.join("subagent-session-exports");
    fs::create_dir_all(&helpers_dir)
        .with_context(|| format!("create {}", helpers_dir.display()))?;
    fs::create_dir_all(&subagent_logs_dir)
        .with_context(|| format!("create {}", subagent_logs_dir.display()))?;
    fs::create_dir_all(&subagent_export_dir)
        .with_context(|| format!("create {}", subagent_export_dir.display()))?;
    report
        .artifacts
        .insert("helpers_dir".to_string(), helpers_dir.display().to_string());
    report.artifacts.insert(
        "subagent_logs_dir".to_string(),
        subagent_logs_dir.display().to_string(),
    );
    report.artifacts.insert(
        "subagent_export_dir".to_string(),
        subagent_export_dir.display().to_string(),
    );

    let mut execute_assistant_texts = Vec::new();
    let mut execute_tool_uses = Vec::new();
    let mut observed_subagents = Vec::new();

    for service in ordered_manifest_services(&wired_manifest) {
        let prompt = build_hermes_service_prompt(manifest, run_id, service, &run_dir)?;
        let prompt_path = helpers_dir.join(format!("{}.prompt.txt", service.name));
        let out_path = subagent_logs_dir.join(format!("{}.out", service.name));
        let err_path = subagent_logs_dir.join(format!("{}.err", service.name));
        let export_path = subagent_export_dir.join(format!("{}.json", service.name));
        fs::write(&prompt_path, &prompt)
            .with_context(|| format!("write {}", prompt_path.display()))?;

        let exit_code = run_hermes_chat(HermesChatRequest {
            working_directory: &staged.program_dir,
            prompt: &prompt,
            out_path: &out_path,
            err_path: &err_path,
            export_path: &export_path,
            toolsets: "file,terminal,clarify",
            source: "tool",
        })?;
        if exit_code != 0 {
            report.execute_exit_code = Some(exit_code);
            report.errors.push(format!(
                "service {} exited with status {}",
                service.name, exit_code
            ));
            return Ok(report);
        }

        observed_subagents.push(service.name.clone());
        let service_response = load_phase_response(&export_path)?;
        execute_assistant_texts.extend(service_response.assistant_texts.clone());
        execute_tool_uses.extend(service_response.tool_uses.clone());

        let error_path = run_dir.join(&service.workspace).join("__error.md");
        if error_path.exists() {
            let details = fs::read_to_string(&error_path)
                .with_context(|| format!("read {}", error_path.display()))?;
            report.execute_exit_code = Some(1);
            report.errors.push(format!(
                "service {} wrote __error.md at {}: {}",
                service.name,
                error_path.display(),
                details
                    .lines()
                    .next()
                    .unwrap_or("service signaled an error")
            ));
            return Ok(report);
        }

        publish_service_outputs(&run_dir, service)?;
    }

    write_codex_state_file(&state_path, &observed_subagents)
        .with_context(|| format!("write {}", state_path.display()))?;

    let (published_outputs, final_report_path) =
        synthesize_published_outputs(&wired_manifest, run_id, expected_binding_rel)?;
    let execute_json = json!({
        "phase": "execute-v1 + subagent-v1",
        "run_id": run_id,
        "state_path": run_relative_path(run_id, Path::new("state.md")).display().to_string(),
        "subagents_used": observed_subagents,
        "published_outputs": Value::Object(published_outputs),
        "final_report_path": final_report_path,
    });

    fs::write(
        &execute_out_path,
        serde_json::to_string_pretty(&execute_json)?,
    )
    .with_context(|| format!("write {}", execute_out_path.display()))?;
    fs::write(&execute_err_path, "")
        .with_context(|| format!("write {}", execute_err_path.display()))?;

    report.execute_exit_code = Some(0);
    report.execute_response_text = Some(serde_json::to_string(&execute_json)?);
    report.execute_response_json = Some(execute_json.clone());
    report.observed_execute_tool_uses = count_tool_uses(&execute_tool_uses);
    report.observed_subagent_requests = dedupe_strings(&observed_subagents);
    report.output_mediation_observed = true;
    report.warnings.push(
        "Hermes execute proof is host-mediated by openprose-lint: wire runs in Hermes, then each OpenProse service runs as its own child `hermes chat -q` session and the driver publishes declared outputs into bindings.".to_string(),
    );

    let execute_response = PhaseResponse {
        assistant_texts: execute_assistant_texts,
        final_text: report.execute_response_text.clone(),
        final_json: Some(execute_json),
        tool_uses: execute_tool_uses,
        subagent_requests: observed_subagents,
        hook_events_observed: 0,
    };

    validate_execute_phase_response(
        &execute_response,
        &staged.program_dir,
        run_id,
        expected_binding_rel,
        &mut report,
    );

    if state_path.exists() {
        let state = fs::read_to_string(&state_path)
            .with_context(|| format!("read {}", state_path.display()))?;
        report.state_complete = state_has_success_end_marker(&state);
        if !report.state_complete {
            report
                .errors
                .push("state.md does not contain a successful ---end marker".to_string());
        }
    } else {
        report.errors.push(format!(
            "execute phase did not produce state file {}",
            state_path.display()
        ));
    }

    if let Some(expected_rel) = expected_binding_rel {
        let expected_path = run_dir.join(expected_rel);
        report.artifacts.insert(
            "expected_binding".to_string(),
            expected_path.display().to_string(),
        );
        report.expected_binding_exists = expected_path.exists();
        if !report.expected_binding_exists {
            report.errors.push(format!(
                "expected binding was not published: {}",
                expected_path.display()
            ));
        } else {
            let content = fs::read_to_string(&expected_path)
                .with_context(|| format!("read {}", expected_path.display()))?;
            let bytes = content.len() as u64;
            report.expected_binding_bytes = Some(bytes);
            report.expected_binding_nonempty = !content.trim().is_empty();
            if !report.expected_binding_nonempty {
                report.errors.push(format!(
                    "expected binding exists but is empty: {}",
                    expected_path.display()
                ));
            }
        }
    }

    report.succeeded = report.errors.is_empty();
    Ok(report)
}

fn dogfood_codex_manifest(
    manifest: &AdapterManifest,
    staged: &StagedProgram,
    run_id: &str,
    options: &AdapterDogfoodOptions,
    expected_binding_rel: Option<&Path>,
    test_root: &Path,
    mut report: AdapterDogfoodReport,
) -> Result<AdapterDogfoodReport> {
    let wire_developer_append = render_role_append(manifest, "wire-v1", "developer")?;
    let wire_prompt = build_codex_wire_prompt(manifest, staged, run_id)?;

    let meta_path = test_root.join("meta.json");
    let wire_developer_append_path = test_root.join("wire-developer-append.txt");
    let wire_prompt_path = test_root.join("wire-prompt.txt");
    let wire_out_path = test_root.join("wire.out");
    let wire_err_path = test_root.join("wire.err");
    let wire_last_path = test_root.join("wire-last.txt");
    let execute_out_path = test_root.join("execute.out");
    let execute_err_path = test_root.join("execute.err");

    fs::write(&wire_developer_append_path, &wire_developer_append)
        .with_context(|| format!("write {}", wire_developer_append_path.display()))?;
    fs::write(&wire_prompt_path, &wire_prompt)
        .with_context(|| format!("write {}", wire_prompt_path.display()))?;
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&json!({
            "test_root": test_root,
            "program_dir": staged.program_dir,
            "entry_point": staged.entry_rel,
            "run_id": run_id,
            "adapter_id": manifest.adapter_id,
            "strategy": "host-mediated-codex-services"
        }))?,
    )
    .with_context(|| format!("write {}", meta_path.display()))?;

    report.artifacts.insert(
        "wire_developer_append".to_string(),
        wire_developer_append_path.display().to_string(),
    );
    report.artifacts.insert(
        "wire_prompt".to_string(),
        wire_prompt_path.display().to_string(),
    );
    report
        .artifacts
        .insert("meta".to_string(), meta_path.display().to_string());
    report
        .artifacts
        .insert("wire_log".to_string(), wire_out_path.display().to_string());
    report.artifacts.insert(
        "wire_last_message".to_string(),
        wire_last_path.display().to_string(),
    );
    report.artifacts.insert(
        "execute_log".to_string(),
        execute_out_path.display().to_string(),
    );

    report.wire_exit_code = Some(run_codex_exec(CodexExecRequest {
        working_directory: &staged.program_dir,
        developer_instructions: &wire_developer_append,
        prompt: &wire_prompt,
        out_path: &wire_out_path,
        err_path: &wire_err_path,
        last_message_path: Some(&wire_last_path),
        sandbox: "workspace-write",
    })?);

    let run_dir = staged.program_dir.join(".prose").join("runs").join(run_id);
    let manifest_output_path = run_dir.join("manifest.md");
    let state_path = run_dir.join("state.md");
    report
        .artifacts
        .insert("run_dir".to_string(), run_dir.display().to_string());
    report.artifacts.insert(
        "manifest".to_string(),
        manifest_output_path.display().to_string(),
    );
    report
        .artifacts
        .insert("state".to_string(), state_path.display().to_string());

    if report.wire_exit_code != Some(0) {
        report.errors.push(format!(
            "wire phase exited with status {}",
            report.wire_exit_code.unwrap_or(-1)
        ));
        return Ok(report);
    }

    let wire_response = load_phase_response(&wire_out_path)?;
    report.wire_response_text = wire_response.final_text.clone();
    report.wire_response_json = wire_response.final_json.clone();
    validate_wire_phase_response(
        &wire_response,
        &staged.program_dir,
        run_id,
        &manifest_output_path,
        &mut report,
    );
    if !report.errors.is_empty() {
        return Ok(report);
    }

    let wired_manifest = parse_wired_manifest(&manifest_output_path)?;
    write_caller_input_bindings(&run_dir, &options.inputs)?;

    let helpers_dir = run_dir.join("helpers");
    let subagent_logs_dir = run_dir.join("subagent-logs");
    let subagent_last_dir = run_dir.join("subagent-last");
    fs::create_dir_all(&helpers_dir)
        .with_context(|| format!("create {}", helpers_dir.display()))?;
    fs::create_dir_all(&subagent_logs_dir)
        .with_context(|| format!("create {}", subagent_logs_dir.display()))?;
    fs::create_dir_all(&subagent_last_dir)
        .with_context(|| format!("create {}", subagent_last_dir.display()))?;
    report
        .artifacts
        .insert("helpers_dir".to_string(), helpers_dir.display().to_string());
    report.artifacts.insert(
        "subagent_logs_dir".to_string(),
        subagent_logs_dir.display().to_string(),
    );
    report.artifacts.insert(
        "subagent_last_dir".to_string(),
        subagent_last_dir.display().to_string(),
    );

    let mut execute_assistant_texts = Vec::new();
    let mut execute_tool_uses = Vec::new();
    let mut observed_subagents = Vec::new();

    for service in ordered_manifest_services(&wired_manifest) {
        let prompt = build_codex_service_prompt(manifest, run_id, service, &run_dir)?;
        let prompt_path = helpers_dir.join(format!("{}.prompt.txt", service.name));
        let out_path = subagent_logs_dir.join(format!("{}.jsonl", service.name));
        let err_path = subagent_logs_dir.join(format!("{}.err", service.name));
        let last_path = subagent_last_dir.join(format!("{}.txt", service.name));
        fs::write(&prompt_path, &prompt)
            .with_context(|| format!("write {}", prompt_path.display()))?;

        let exit_code = run_codex_exec(CodexExecRequest {
            working_directory: &staged.program_dir,
            developer_instructions: "",
            prompt: &prompt,
            out_path: &out_path,
            err_path: &err_path,
            last_message_path: Some(&last_path),
            sandbox: "workspace-write",
        })?;
        if exit_code != 0 {
            report.execute_exit_code = Some(exit_code);
            report.errors.push(format!(
                "service {} exited with status {}",
                service.name, exit_code
            ));
            return Ok(report);
        }

        observed_subagents.push(service.name.clone());
        let service_response = load_phase_response(&out_path)?;
        execute_assistant_texts.extend(service_response.assistant_texts.clone());
        execute_tool_uses.extend(service_response.tool_uses.clone());

        let error_path = run_dir.join(&service.workspace).join("__error.md");
        if error_path.exists() {
            let details = fs::read_to_string(&error_path)
                .with_context(|| format!("read {}", error_path.display()))?;
            report.execute_exit_code = Some(1);
            report.errors.push(format!(
                "service {} wrote __error.md at {}: {}",
                service.name,
                error_path.display(),
                details
                    .lines()
                    .next()
                    .unwrap_or("service signaled an error")
            ));
            return Ok(report);
        }

        publish_service_outputs(&run_dir, service)?;
    }

    write_codex_state_file(&state_path, &observed_subagents)
        .with_context(|| format!("write {}", state_path.display()))?;

    let (published_outputs, final_report_path) =
        synthesize_published_outputs(&wired_manifest, run_id, expected_binding_rel)?;
    let execute_json = json!({
        "phase": "execute-v1 + subagent-v1",
        "run_id": run_id,
        "state_path": run_relative_path(run_id, Path::new("state.md")).display().to_string(),
        "subagents_used": observed_subagents,
        "published_outputs": Value::Object(published_outputs),
        "final_report_path": final_report_path,
    });

    fs::write(
        &execute_out_path,
        serde_json::to_string_pretty(&execute_json)?,
    )
    .with_context(|| format!("write {}", execute_out_path.display()))?;
    fs::write(&execute_err_path, "")
        .with_context(|| format!("write {}", execute_err_path.display()))?;

    report.execute_exit_code = Some(0);
    report.execute_response_text = Some(serde_json::to_string(&execute_json)?);
    report.execute_response_json = Some(execute_json.clone());
    report.observed_execute_tool_uses = count_tool_uses(&execute_tool_uses);
    report.observed_subagent_requests = dedupe_strings(&observed_subagents);
    report.output_mediation_observed = true;
    report.warnings.push(
        "Codex execute proof is host-mediated by openprose-lint: wire runs in Codex, then each OpenProse service runs as its own child `codex exec --ephemeral` session and the driver publishes declared outputs into bindings.".to_string(),
    );

    let execute_response = PhaseResponse {
        assistant_texts: execute_assistant_texts,
        final_text: report.execute_response_text.clone(),
        final_json: Some(execute_json),
        tool_uses: execute_tool_uses,
        subagent_requests: observed_subagents,
        hook_events_observed: 0,
    };

    validate_execute_phase_response(
        &execute_response,
        &staged.program_dir,
        run_id,
        expected_binding_rel,
        &mut report,
    );

    if state_path.exists() {
        let state = fs::read_to_string(&state_path)
            .with_context(|| format!("read {}", state_path.display()))?;
        report.state_complete = state_has_success_end_marker(&state);
        if !report.state_complete {
            report
                .errors
                .push("state.md does not contain a successful ---end marker".to_string());
        }
    } else {
        report.errors.push(format!(
            "execute phase did not produce state file {}",
            state_path.display()
        ));
    }

    if let Some(expected_rel) = expected_binding_rel {
        let expected_path = run_dir.join(expected_rel);
        report.artifacts.insert(
            "expected_binding".to_string(),
            expected_path.display().to_string(),
        );
        report.expected_binding_exists = expected_path.exists();
        if !report.expected_binding_exists {
            report.errors.push(format!(
                "expected binding was not published: {}",
                expected_path.display()
            ));
        } else {
            let content = fs::read_to_string(&expected_path)
                .with_context(|| format!("read {}", expected_path.display()))?;
            let bytes = content.len() as u64;
            report.expected_binding_bytes = Some(bytes);
            report.expected_binding_nonempty = !content.trim().is_empty();
            if !report.expected_binding_nonempty {
                report.errors.push(format!(
                    "expected binding exists but is empty: {}",
                    expected_path.display()
                ));
            }
        }
    }

    report.succeeded = report.errors.is_empty();
    Ok(report)
}

fn write_caller_input_bindings(run_dir: &Path, inputs: &[DogfoodInput]) -> Result<()> {
    let caller_dir = run_dir.join("bindings").join("caller");
    fs::create_dir_all(&caller_dir).with_context(|| format!("create {}", caller_dir.display()))?;

    for input in inputs {
        let path = caller_dir.join(format!("{}.md", input.name));
        fs::write(&path, &input.content).with_context(|| format!("write {}", path.display()))?;
    }

    Ok(())
}

fn publish_service_outputs(run_dir: &Path, service: &ManifestService) -> Result<()> {
    for output in &service.outputs {
        let workspace_output = run_dir.join(&output.workspace_path);
        let content = fs::read_to_string(&workspace_output)
            .with_context(|| format!("read {}", workspace_output.display()))?;
        if content.trim().is_empty() {
            bail!(
                "service {} produced an empty output at {}",
                service.name,
                workspace_output.display()
            );
        }

        if let Some(public_path) = &output.public_path {
            let target = run_dir.join(public_path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("create {}", parent.display()))?;
            }
            fs::write(&target, &content).with_context(|| format!("write {}", target.display()))?;
        }
    }

    Ok(())
}

fn synthesize_published_outputs(
    wired_manifest: &WiredManifest,
    run_id: &str,
    expected_binding_rel: Option<&Path>,
) -> Result<(serde_json::Map<String, Value>, String)> {
    let mut published_outputs = serde_json::Map::new();

    for return_value in &wired_manifest.returns {
        let public_output = find_public_output(wired_manifest, return_value)?;
        published_outputs.insert(
            return_value.name.clone(),
            Value::String(
                run_relative_path(run_id, public_output)
                    .display()
                    .to_string(),
            ),
        );
    }

    if published_outputs.is_empty() {
        if let Some(expected_binding_rel) = expected_binding_rel {
            published_outputs.insert(
                binding_name_from_path(expected_binding_rel),
                Value::String(
                    run_relative_path(run_id, expected_binding_rel)
                        .display()
                        .to_string(),
                ),
            );
        } else {
            bail!("wired manifest did not declare any caller returns");
        }
    }

    let final_report_path = if let Some(expected_binding_rel) = expected_binding_rel {
        run_relative_path(run_id, expected_binding_rel)
            .display()
            .to_string()
    } else {
        published_outputs
            .values()
            .find_map(Value::as_str)
            .map(str::to_string)
            .context("caller outputs did not contain any string paths")?
    };

    Ok((published_outputs, final_report_path))
}

fn binding_name_from_path(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "output".to_string())
}

fn find_public_output<'a>(
    wired_manifest: &'a WiredManifest,
    return_value: &ManifestReturn,
) -> Result<&'a PathBuf> {
    let mut matches = Vec::new();

    for service in &wired_manifest.services {
        if return_value
            .from_service
            .as_deref()
            .is_some_and(|service_name| service.name != service_name)
        {
            continue;
        }

        for output in &service.outputs {
            if output.name == return_value.name
                && let Some(public_path) = output.public_path.as_ref()
            {
                matches.push(public_path);
            }
        }
    }

    match matches.len() {
        1 => Ok(matches[0]),
        0 => bail!(
            "could not find a public binding for caller return `{}`{:?}",
            return_value.name,
            return_value.from_service
        ),
        _ => bail!(
            "caller return `{}` matched multiple public bindings; pin the `from service` source",
            return_value.name
        ),
    }
}

fn write_codex_state_file(path: &Path, observed_subagents: &[String]) -> Result<()> {
    let mut state = String::from("# OpenProse adapter dogfood state\n\n");
    if observed_subagents.is_empty() {
        state.push_str("- no services executed\n");
    } else {
        for service in observed_subagents {
            state.push_str(&format!("- complete: {}\n", service));
        }
    }
    state.push_str("\n---end execute-v1 + subagent-v1\n");
    fs::write(path, state).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

fn ordered_manifest_services(wired_manifest: &WiredManifest) -> Vec<&ManifestService> {
    if wired_manifest.execution_order.is_empty() {
        return wired_manifest.services.iter().collect();
    }

    let mut ordered = Vec::new();
    let mut seen = BTreeSet::new();

    for name in &wired_manifest.execution_order {
        if let Some(service) = wired_manifest
            .services
            .iter()
            .find(|service| service.name == *name)
            && seen.insert(service.name.clone())
        {
            ordered.push(service);
        }
    }

    for service in &wired_manifest.services {
        if seen.insert(service.name.clone()) {
            ordered.push(service);
        }
    }

    ordered
}

fn parse_wired_manifest(path: &Path) -> Result<WiredManifest> {
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Section {
        None,
        CallerInterface,
        ServiceInputs,
        ServiceOutputs,
        ExecutionOrder,
    }

    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let mut section = Section::None;
    let mut in_returns = false;
    let mut returns = Vec::new();
    let mut services = Vec::new();
    let mut execution_order = Vec::new();
    let mut current_service: Option<ManifestService> = None;

    for line in source.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed == "## Caller Interface" {
            if let Some(service) = current_service.take() {
                services.push(service);
            }
            section = Section::CallerInterface;
            in_returns = false;
            continue;
        }

        if trimmed == "## Graph" {
            if let Some(service) = current_service.take() {
                services.push(service);
            }
            section = Section::None;
            in_returns = false;
            continue;
        }

        if trimmed == "## Execution Order" {
            if let Some(service) = current_service.take() {
                services.push(service);
            }
            section = Section::ExecutionOrder;
            in_returns = false;
            continue;
        }

        if let Some(name) = trimmed.strip_prefix("### ") {
            if let Some(service) = current_service.take() {
                services.push(service);
            }
            current_service = Some(ManifestService {
                name: name.trim().to_string(),
                source: PathBuf::new(),
                workspace: PathBuf::new(),
                inputs: Vec::new(),
                outputs: Vec::new(),
            });
            section = Section::None;
            in_returns = false;
            continue;
        }

        if let Some(service) = current_service.as_mut() {
            if let Some(value) = trimmed.strip_prefix("source: ") {
                service.source = PathBuf::from(value.trim());
                continue;
            }
            if let Some(value) = trimmed.strip_prefix("workspace: ") {
                service.workspace = PathBuf::from(value.trim());
                continue;
            }
            if trimmed == "inputs:" {
                section = Section::ServiceInputs;
                continue;
            }
            if trimmed == "outputs:" {
                section = Section::ServiceOutputs;
                continue;
            }
            if trimmed.ends_with(':') {
                section = Section::None;
                continue;
            }

            match section {
                Section::ServiceInputs => {
                    if let Some((name, binding_path)) = parse_manifest_arrow(trimmed, "←") {
                        service.inputs.push(ManifestBinding {
                            name,
                            path: binding_path,
                        });
                    }
                }
                Section::ServiceOutputs => {
                    if let Some(public_output) = trimmed.strip_prefix("(public) ") {
                        if let Some((name, public_path)) = parse_manifest_arrow(public_output, "→")
                        {
                            if let Some(existing) = service
                                .outputs
                                .iter_mut()
                                .find(|output| output.name == name)
                            {
                                existing.public_path = Some(public_path);
                            } else {
                                service.outputs.push(ManifestOutput {
                                    name,
                                    workspace_path: PathBuf::new(),
                                    public_path: Some(public_path),
                                });
                            }
                        }
                    } else if let Some((name, workspace_path)) = parse_manifest_arrow(trimmed, "→")
                    {
                        if let Some(existing) = service
                            .outputs
                            .iter_mut()
                            .find(|output| output.name == name)
                        {
                            existing.workspace_path = workspace_path;
                        } else {
                            service.outputs.push(ManifestOutput {
                                name,
                                workspace_path,
                                public_path: None,
                            });
                        }
                    }
                }
                _ => {}
            }
            continue;
        }

        match section {
            Section::CallerInterface => {
                if trimmed == "returns:" {
                    in_returns = true;
                    continue;
                }
                if trimmed.ends_with(':') {
                    in_returns = false;
                    continue;
                }
                if in_returns
                    && let Some(return_value) =
                        trimmed.strip_prefix("- ").and_then(parse_manifest_return)
                {
                    returns.push(return_value);
                }
            }
            Section::ExecutionOrder => {
                if let Some(service_name) = parse_execution_order_line(trimmed) {
                    execution_order.push(service_name);
                }
            }
            _ => {}
        }
    }

    if let Some(service) = current_service.take() {
        services.push(service);
    }

    if services.is_empty() {
        bail!(
            "wired manifest {} did not contain any service graph nodes",
            path.display()
        );
    }

    for service in &services {
        if service.source.as_os_str().is_empty() {
            bail!("wired manifest service `{}` missing source", service.name);
        }
        if service.workspace.as_os_str().is_empty() {
            bail!(
                "wired manifest service `{}` missing workspace",
                service.name
            );
        }
        if service.outputs.is_empty() {
            bail!(
                "wired manifest service `{}` declared no outputs",
                service.name
            );
        }
        for output in &service.outputs {
            if output.workspace_path.as_os_str().is_empty() {
                bail!(
                    "wired manifest service `{}` output `{}` missing workspace path",
                    service.name,
                    output.name
                );
            }
        }
    }

    Ok(WiredManifest {
        returns,
        services,
        execution_order,
    })
}

fn parse_manifest_arrow(line: &str, arrow: &str) -> Option<(String, PathBuf)> {
    let (name, path) = line.split_once(arrow)?;
    let name = name.trim();
    let path = path.trim();
    if name.is_empty() || path.is_empty() {
        return None;
    }
    Some((name.to_string(), PathBuf::from(path)))
}

fn parse_manifest_return(line: &str) -> Option<ManifestReturn> {
    let left = line
        .split_once(':')
        .map(|(left, _)| left)
        .unwrap_or(line)
        .trim();
    if left.is_empty() {
        return None;
    }

    if let Some((name, from_service)) = left.split_once(" (from ") {
        return Some(ManifestReturn {
            name: name.trim().to_string(),
            from_service: from_service
                .trim()
                .strip_suffix(')')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
        });
    }

    Some(ManifestReturn {
        name: left.to_string(),
        from_service: None,
    })
}

fn parse_execution_order_line(line: &str) -> Option<String> {
    let (index, rest) = line.split_once('.')?;
    if !index.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    rest.split_whitespace()
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn run_codex_exec(request: CodexExecRequest<'_>) -> Result<i32> {
    for path in [
        Some(request.out_path),
        Some(request.err_path),
        request.last_message_path,
    ] {
        let Some(path) = path else {
            continue;
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
    }

    let mut command = Command::new("codex");
    command
        .arg("exec")
        .arg("--skip-git-repo-check")
        .arg("--ephemeral")
        .arg("--json")
        .arg("--color")
        .arg("never")
        .arg("-s")
        .arg(request.sandbox)
        .arg("-c")
        .arg(format!(
            "developer_instructions={}",
            serde_json::to_string(request.developer_instructions)?
        ));

    if let Some(last_message_path) = request.last_message_path {
        command.arg("-o").arg(last_message_path);
    }

    let mut child = command
        .arg("-")
        .current_dir(request.working_directory)
        .stdin(Stdio::piped())
        .stdout(
            fs::File::create(request.out_path)
                .with_context(|| format!("create {}", request.out_path.display()))?,
        )
        .stderr(
            fs::File::create(request.err_path)
                .with_context(|| format!("create {}", request.err_path.display()))?,
        )
        .spawn()
        .with_context(|| format!("run codex in {}", request.working_directory.display()))?;

    child
        .stdin
        .as_mut()
        .context("open codex stdin")?
        .write_all(request.prompt.as_bytes())
        .context("write codex prompt")?;
    drop(child.stdin.take());

    let status = child.wait().context("wait for codex exec")?;
    Ok(status.code().unwrap_or(-1))
}

fn run_hermes_chat(request: HermesChatRequest<'_>) -> Result<i32> {
    for path in [request.out_path, request.err_path, request.export_path] {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
        }
    }

    let stdout = fs::File::create(request.out_path)
        .with_context(|| format!("create {}", request.out_path.display()))?;
    let stderr = fs::File::create(request.err_path)
        .with_context(|| format!("create {}", request.err_path.display()))?;

    let status = Command::new("hermes")
        .arg("chat")
        .arg("-Q")
        .arg("--yolo")
        .arg("--source")
        .arg(request.source)
        .arg("-t")
        .arg(request.toolsets)
        .arg("-q")
        .arg(request.prompt)
        .current_dir(request.working_directory)
        .stdout(stdout)
        .stderr(stderr)
        .status()
        .with_context(|| format!("run hermes in {}", request.working_directory.display()))?;

    if !status.success() {
        return Ok(status.code().unwrap_or(-1));
    }

    let stdout_text = fs::read_to_string(request.out_path)
        .with_context(|| format!("read {}", request.out_path.display()))?;
    let session_id = extract_hermes_session_id(&stdout_text).with_context(|| {
        format!(
            "extract Hermes session id from {}",
            request.out_path.display()
        )
    })?;

    let export_status = Command::new("hermes")
        .arg("sessions")
        .arg("export")
        .arg("--session-id")
        .arg(&session_id)
        .arg(request.export_path)
        .current_dir(request.working_directory)
        .status()
        .with_context(|| format!("export Hermes session {}", session_id))?;
    if !export_status.success() {
        bail!(
            "Hermes session export for {} exited with status {}",
            session_id,
            export_status.code().unwrap_or(-1)
        );
    }

    Ok(0)
}

fn extract_hermes_session_id(stdout_text: &str) -> Result<String> {
    stdout_text
        .lines()
        .rev()
        .find_map(|line| line.trim().strip_prefix("session_id: "))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .context("missing `session_id: ...` line in Hermes stdout")
}

fn build_claude_script(
    program_dir: &Path,
    system_append_path: &Path,
    prompt_path: &Path,
    out_path: &Path,
    err_path: &Path,
    exit_path: &Path,
) -> String {
    let program_dir = shell_quote(&program_dir.to_string_lossy());
    let system_append_path = shell_quote(&system_append_path.to_string_lossy());
    let prompt_path = shell_quote(&prompt_path.to_string_lossy());
    let out_path = shell_quote(&out_path.to_string_lossy());
    let err_path = shell_quote(&err_path.to_string_lossy());
    let exit_path = shell_quote(&exit_path.to_string_lossy());

    format!(
        "#!/usr/bin/env bash\nset -euo pipefail\ncd {}\nAPPEND=$(cat {})\nset +e\ncat {} | claude --print --verbose --output-format stream-json --dangerously-skip-permissions --no-session-persistence --allowedTools 'Read Write Edit Bash Agent' --append-system-prompt \"$APPEND\" > {} 2> {}\nSTATUS=$?\nset -e\nprintf '%s\\n' \"$STATUS\" > {}\nexit \"$STATUS\"\n",
        program_dir, system_append_path, prompt_path, out_path, err_path, exit_path,
    )
}

fn render_role_append(manifest: &AdapterManifest, phase_name: &str, role: &str) -> Result<String> {
    let spec = default_spec_source()?;
    let skill_root = spec.resolve_root(&repo_root());
    let phase = phase(manifest, phase_name)?;
    let mut rendered = Vec::new();

    for channel in &phase.channels {
        if channel.role != role {
            continue;
        }
        for file in &channel.files {
            let content = fs::read_to_string(skill_root.join(file))
                .with_context(|| format!("read {}", skill_root.join(file).display()))?;
            rendered
                .push(content.replace("{OPENPROSE_SKILL_DIR}", &skill_root.display().to_string()));
        }
    }

    Ok(rendered.join("\n\n"))
}

fn render_system_append(manifest: &AdapterManifest, phase_name: &str) -> Result<String> {
    render_role_append(manifest, phase_name, "system")
}

fn read_phase_files(
    manifest: &AdapterManifest,
    phase_name: &str,
    role_filter: Option<&str>,
) -> Result<Vec<(String, String)>> {
    let spec = default_spec_source()?;
    let skill_root = spec.resolve_root(&repo_root());
    let phase = phase(manifest, phase_name)?;
    let mut files = Vec::new();

    for channel in &phase.channels {
        if role_filter.is_some_and(|role| channel.role != role) {
            continue;
        }
        for file in &channel.files {
            let content = fs::read_to_string(skill_root.join(file))
                .with_context(|| format!("read {}", skill_root.join(file).display()))?;
            files.push((file.clone(), content));
        }
    }

    Ok(files)
}

fn phase<'a>(manifest: &'a AdapterManifest, phase_name: &str) -> Result<&'a AdapterPhase> {
    manifest.phases.get(phase_name).with_context(|| {
        format!(
            "adapter {} missing phase {}",
            manifest.adapter_id, phase_name
        )
    })
}

fn normalize_expected_binding(value: &str) -> PathBuf {
    if value.starts_with("bindings/") {
        return PathBuf::from(value);
    }
    let mut path = PathBuf::from("bindings");
    for segment in value.split('/') {
        if segment.is_empty() {
            continue;
        }
        path.push(segment);
    }
    if path.extension().is_none() {
        path.set_extension("md");
    }
    path
}

fn shell_quote(value: &str) -> String {
    let mut quoted = String::from("'");
    for ch in value.chars() {
        if ch == '\'' {
            quoted.push_str("'\"'\"'");
        } else {
            quoted.push(ch);
        }
    }
    quoted.push('\'');
    quoted
}

fn load_phase_response(path: &Path) -> Result<PhaseResponse> {
    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let trimmed = source.trim();
    if !trimmed.is_empty()
        && let Ok(value) = serde_json::from_str::<Value>(trimmed)
        && value.get("messages").and_then(Value::as_array).is_some()
    {
        return Ok(parse_hermes_phase_export(&value));
    }

    let file = fs::File::open(path).with_context(|| format!("read {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut response = PhaseResponse::default();

    for line in reader.lines() {
        let line = line.with_context(|| format!("read line from {}", path.display()))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        match value.get("type").and_then(Value::as_str) {
            Some("system")
                if value.get("subtype").and_then(Value::as_str) == Some("hook_started") =>
            {
                response.hook_events_observed += 1;
            }
            Some("assistant") => parse_claude_phase_event(&value, &mut response),
            Some("item.completed") => parse_codex_phase_event(&value, &mut response),
            _ => {}
        }
    }

    response.final_json = response
        .final_text
        .as_deref()
        .and_then(extract_json_object_from_text);
    Ok(response)
}

fn parse_hermes_phase_export(value: &Value) -> PhaseResponse {
    let mut response = PhaseResponse::default();
    let Some(messages) = value.get("messages").and_then(Value::as_array) else {
        return response;
    };

    for message in messages {
        match message.get("role").and_then(Value::as_str) {
            Some("assistant") => parse_hermes_phase_message(message, &mut response),
            Some("tool") => {}
            _ => {}
        }
    }

    response.final_json = response
        .final_text
        .as_deref()
        .and_then(extract_json_object_from_text);
    response
}

fn parse_hermes_phase_message(message: &Value, response: &mut PhaseResponse) {
    if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
        for tool_call in tool_calls {
            let Some(name) = tool_call
                .get("function")
                .and_then(|function| function.get("name"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            response.tool_uses.push(name.to_string());
        }
    }

    let Some(text) = message.get("content").and_then(Value::as_str) else {
        return;
    };
    if text.trim().is_empty() {
        return;
    }
    response.assistant_texts.push(text.to_string());
    response.final_text = Some(text.to_string());
}

fn parse_claude_phase_event(value: &Value, response: &mut PhaseResponse) {
    let parent_tool_use_id = value.get("parent_tool_use_id").and_then(Value::as_str);
    let Some(content_items) = value
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for item in content_items {
        if item.get("type").and_then(Value::as_str) != Some("tool_use") {
            continue;
        }
        let Some(name) = item.get("name").and_then(Value::as_str) else {
            continue;
        };
        response.tool_uses.push(name.to_string());
        if name == "Agent"
            && let Some(service_name) = extract_agent_service_name(item)
        {
            response.subagent_requests.push(service_name);
        }
    }

    let text = content_items
        .iter()
        .filter_map(|item| {
            (item.get("type").and_then(Value::as_str) == Some("text"))
                .then(|| item.get("text").and_then(Value::as_str))
                .flatten()
                .map(str::to_string)
        })
        .collect::<Vec<_>>()
        .join("\n");

    if text.trim().is_empty() {
        return;
    }

    response.assistant_texts.push(text.clone());
    if parent_tool_use_id.is_none() {
        response.final_text = Some(text);
    }
}

fn parse_codex_phase_event(value: &Value, response: &mut PhaseResponse) {
    let Some(item) = value.get("item") else {
        return;
    };

    match item.get("type").and_then(Value::as_str) {
        Some("agent_message") => {
            let Some(text) = item.get("text").and_then(Value::as_str) else {
                return;
            };
            if text.trim().is_empty() {
                return;
            }
            response.assistant_texts.push(text.to_string());
            response.final_text = Some(text.to_string());
        }
        Some("command_execution") => response.tool_uses.push("command_execution".to_string()),
        Some("file_change") => response.tool_uses.push("file_change".to_string()),
        _ => {}
    }
}

fn extract_json_object_from_text(text: &str) -> Option<Value> {
    let trimmed = text.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed)
        && value.is_object()
    {
        return Some(value);
    }

    for block in trimmed.split("```").skip(1).step_by(2) {
        let block = block.trim();
        let block = block
            .strip_prefix("json")
            .map(str::trim_start)
            .unwrap_or(block);
        if let Ok(value) = serde_json::from_str::<Value>(block)
            && value.is_object()
        {
            return Some(value);
        }
    }

    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}'))
        && start < end
    {
        let candidate = &trimmed[start..=end];
        if let Ok(value) = serde_json::from_str::<Value>(candidate)
            && value.is_object()
        {
            return Some(value);
        }
    }

    None
}

fn validate_wire_phase_response(
    response: &PhaseResponse,
    program_dir: &Path,
    run_id: &str,
    manifest_output_path: &Path,
    report: &mut AdapterDogfoodReport,
) {
    let Some(value) = response.final_json.as_ref() else {
        report
            .errors
            .push("wire phase did not return a final JSON object".to_string());
        return;
    };

    if !value
        .get("phase")
        .and_then(Value::as_str)
        .is_some_and(|phase| phase_names_match(phase, "wire-v1"))
    {
        report
            .errors
            .push("wire phase response JSON must contain phase=wire-v1".to_string());
    }

    let expected_manifest = run_relative_path(run_id, Path::new("manifest.md"));
    let Some(reported_manifest_path) = value.get("manifest_path").and_then(Value::as_str) else {
        report
            .errors
            .push("wire phase response JSON missing manifest_path".to_string());
        return;
    };

    report.artifacts.insert(
        "wire_reported_manifest".to_string(),
        reported_manifest_path.to_string(),
    );

    if !reported_path_matches(reported_manifest_path, &expected_manifest, program_dir) {
        report.errors.push(format!(
            "wire phase reported manifest_path {}, expected {}",
            reported_manifest_path,
            expected_manifest.display()
        ));
    }

    if !manifest_output_path.exists() {
        report.errors.push(format!(
            "wire phase reported manifest_path but file does not exist: {}",
            manifest_output_path.display()
        ));
    }

    match value.get("copied_services").and_then(Value::as_array) {
        Some(services) if !services.is_empty() => {}
        _ => report.errors.push(
            "wire phase response JSON must include a non-empty copied_services array".to_string(),
        ),
    }

    if let Some(warnings) = value.get("warnings").and_then(Value::as_array) {
        for warning in warnings.iter().filter_map(Value::as_str) {
            report.warnings.push(format!("wire response: {warning}"));
        }
    } else {
        report
            .errors
            .push("wire phase response JSON missing warnings array".to_string());
    }
}

fn validate_execute_phase_response(
    response: &PhaseResponse,
    program_dir: &Path,
    run_id: &str,
    expected_binding_rel: Option<&Path>,
    report: &mut AdapterDogfoodReport,
) {
    let Some(value) = response.final_json.as_ref() else {
        report
            .errors
            .push("execute phase did not return a final JSON object".to_string());
        return;
    };

    if !value
        .get("phase")
        .and_then(Value::as_str)
        .is_some_and(|phase| phase_names_match(phase, "execute-v1 + subagent-v1"))
    {
        report.errors.push(
            "execute phase response JSON must contain phase=execute-v1 + subagent-v1".to_string(),
        );
    }

    if value.get("run_id").and_then(Value::as_str) != Some(run_id) {
        report.errors.push(format!(
            "execute phase response JSON reported run_id {:?}, expected {}",
            value.get("run_id").and_then(Value::as_str),
            run_id
        ));
    }

    let expected_state = run_relative_path(run_id, Path::new("state.md"));
    match value.get("state_path").and_then(Value::as_str) {
        Some(state_path) => {
            report
                .artifacts
                .insert("execute_reported_state".to_string(), state_path.to_string());
            if !reported_path_matches(state_path, &expected_state, program_dir) {
                report.errors.push(format!(
                    "execute phase reported state_path {}, expected {}",
                    state_path,
                    expected_state.display()
                ));
            }
        }
        None => report
            .errors
            .push("execute phase response JSON missing state_path".to_string()),
    }

    match value.get("subagents_used").and_then(Value::as_array) {
        Some(subagents) if !subagents.is_empty() => {
            report.subagents_used = subagents
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect();
            if report.subagents_used.is_empty() {
                report.errors.push(
                    "execute phase response JSON subagents_used did not contain any strings"
                        .to_string(),
                );
            }
        }
        _ => report.errors.push(
            "execute phase response JSON must include a non-empty subagents_used array".to_string(),
        ),
    }

    if report.observed_subagent_requests.is_empty() {
        report.errors.push(
            "execute phase stream-json did not show any Agent tool_use events for subagents"
                .to_string(),
        );
    } else {
        let reported = report
            .subagents_used
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>();
        let observed = report
            .observed_subagent_requests
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>();
        if !report.subagents_used.is_empty() && reported != observed {
            report.errors.push(format!(
                "execute phase reported subagents_used {:?}, but stream-json showed Agent requests {:?}",
                report.subagents_used, report.observed_subagent_requests
            ));
        }
    }

    match value.get("published_outputs").and_then(Value::as_object) {
        Some(outputs) if !outputs.is_empty() => {
            for (name, path_value) in outputs {
                let Some(path) = path_value.as_str() else {
                    report.errors.push(format!(
                        "execute phase response JSON published_outputs[{name}] must be a string path"
                    ));
                    continue;
                };
                report
                    .artifacts
                    .insert(format!("reported_output::{name}"), path.to_string());
                validate_reported_output_file(
                    &format!("execute phase published output {name}"),
                    path,
                    program_dir,
                    report,
                );
            }

            if let Some(expected_binding_rel) = expected_binding_rel {
                let expected_run_path = run_relative_path(run_id, expected_binding_rel);
                report.expected_binding_reported = outputs.values().any(|path_value| {
                    path_value.as_str().is_some_and(|path| {
                        reported_path_matches(path, &expected_run_path, program_dir)
                    })
                });
                if !report.expected_binding_reported {
                    report.errors.push(format!(
                        "execute phase response JSON did not report expected binding {}",
                        expected_run_path.display()
                    ));
                }
            }
        }
        _ => report.errors.push(
            "execute phase response JSON must include a non-empty published_outputs object"
                .to_string(),
        ),
    }

    if let Some(final_report_path) = value.get("final_report_path").and_then(Value::as_str) {
        report.artifacts.insert(
            "execute_reported_final_report".to_string(),
            final_report_path.to_string(),
        );
        validate_reported_output_file(
            "execute phase final_report_path",
            final_report_path,
            program_dir,
            report,
        );
        if let Some(expected_binding_rel) = expected_binding_rel {
            let expected_run_path = run_relative_path(run_id, expected_binding_rel);
            if !reported_path_matches(final_report_path, &expected_run_path, program_dir) {
                report.errors.push(format!(
                    "execute phase reported final_report_path {}, expected {}",
                    final_report_path,
                    expected_run_path.display()
                ));
            }
        }
    } else {
        report
            .errors
            .push("execute phase response JSON missing final_report_path".to_string());
    }
}

fn run_relative_path(run_id: &str, relative: &Path) -> PathBuf {
    PathBuf::from(".prose")
        .join("runs")
        .join(run_id)
        .join(relative)
}

fn count_tool_uses(tool_uses: &[String]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for tool in tool_uses {
        *counts.entry(tool.clone()).or_insert(0) += 1;
    }
    counts
}

fn dedupe_strings(values: &[String]) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut deduped = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            deduped.push(value.clone());
        }
    }
    deduped
}

fn extract_agent_service_name(item: &Value) -> Option<String> {
    let input = item.get("input")?;
    input
        .get("description")
        .and_then(Value::as_str)
        .and_then(parse_agent_service_name_from_description)
        .or_else(|| {
            input
                .get("prompt")
                .and_then(Value::as_str)
                .and_then(parse_agent_service_name_from_prompt)
        })
}

fn parse_agent_service_name_from_description(description: &str) -> Option<String> {
    description
        .trim()
        .strip_prefix("OpenProse service: ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn parse_agent_service_name_from_prompt(prompt: &str) -> Option<String> {
    prompt
        .lines()
        .find_map(|line| line.trim().strip_prefix("name:"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn phase_names_match(reported: &str, expected: &str) -> bool {
    reported
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        == expected
            .chars()
            .filter(|ch| !ch.is_whitespace())
            .collect::<String>()
}

fn resolve_reported_path(reported: &str, program_dir: &Path) -> Option<PathBuf> {
    let trimmed = reported.trim();
    if trimmed.is_empty() {
        return None;
    }

    let relative = trimmed.trim_start_matches("./");
    if relative.is_empty() {
        return None;
    }

    let path = Path::new(relative);
    if path.is_absolute() {
        return path.starts_with(program_dir).then(|| path.to_path_buf());
    }

    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return None;
    }

    Some(program_dir.join(path))
}

fn validate_reported_output_file(
    label: &str,
    reported: &str,
    program_dir: &Path,
    report: &mut AdapterDogfoodReport,
) {
    let Some(path) = resolve_reported_path(reported, program_dir) else {
        report.errors.push(format!(
            "{label} must resolve to a path inside the staged program: {reported}"
        ));
        return;
    };

    if !path.exists() {
        report
            .errors
            .push(format!("{label} missing on disk: {}", path.display()));
        return;
    }

    match fs::read_to_string(&path) {
        Ok(content) if !content.trim().is_empty() => {}
        Ok(_) => report
            .errors
            .push(format!("{label} exists but is empty: {}", path.display())),
        Err(error) => report.errors.push(format!(
            "{label} could not be read from {}: {error}",
            path.display()
        )),
    }
}

fn reported_path_matches(reported: &str, expected: &Path, program_dir: &Path) -> bool {
    resolve_reported_path(reported, program_dir)
        .is_some_and(|reported_path| reported_path == program_dir.join(expected))
}

fn state_has_success_end_marker(state: &str) -> bool {
    state
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .and_then(|line| line.trim().strip_prefix("---end "))
        .is_some_and(|value| !value.trim().is_empty())
}

fn looks_like_output_mediation(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    (lower.contains("returned") && lower.contains("inline") && lower.contains("persist"))
        || lower.contains("blocked from writing")
        || lower.contains("publish it to the final binding")
}

fn render_openprose_file(path: &str, content: &str) -> String {
    format!(
        "<openprose_file path=\"{}\">\n{}\n</openprose_file>",
        path, content
    )
}

fn render_attachment(kind: &str, label: &str, path: &str, content: &str) -> String {
    format!(
        "<attachment kind=\"{}\" label=\"{}\" path=\"{}\">\n{}\n</attachment>",
        kind, label, path, content
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn example_manifest() -> AdapterManifest {
        load_adapter_manifest(Path::new("specs/adapters/claude-code-v1-md.json"))
            .unwrap()
            .1
    }

    #[test]
    fn create_test_root_is_unique_under_parallel_calls() {
        use std::collections::HashSet;
        use std::sync::{Arc, Mutex};
        use std::thread;

        // Many threads racing on create_test_root must never collide on the
        // same staging directory. Guards the parallel-dogfood-test flake where
        // a nanosecond-only nonce produced duplicate roots.
        let seen = Arc::new(Mutex::new(HashSet::new()));
        let mut handles = Vec::new();
        for _ in 0..16 {
            let seen = Arc::clone(&seen);
            handles.push(thread::spawn(move || {
                for _ in 0..32 {
                    let root = create_test_root().unwrap();
                    let inserted = seen.lock().unwrap().insert(root.clone());
                    assert!(inserted, "duplicate test root: {}", root.display());
                    let _ = fs::remove_dir_all(&root);
                }
            }));
        }
        for handle in handles {
            handle.join().unwrap();
        }
        assert_eq!(seen.lock().unwrap().len(), 16 * 32);
    }

    #[test]
    fn system_append_renders_skill_root_placeholder() {
        let manifest = example_manifest();
        let append = render_system_append(&manifest, "wire-v1").unwrap();
        assert!(append.contains("# OpenProse VM System Prompt"));
        assert!(!append.contains("{OPENPROSE_SKILL_DIR}"));
    }

    #[test]
    fn wire_prompt_contains_forme_and_program_attachment() {
        let manifest = example_manifest();
        let root = tempdir().unwrap();
        let staged =
            stage_program(Path::new("fixtures/adapter/parallel-reviews"), root.path()).unwrap();

        let prompt = build_wire_prompt(&manifest, &staged, "test-run").unwrap();
        assert!(prompt.contains("<openprose_file path=\"forme.md\">"));
        assert!(prompt.contains("<attachment kind=\"program\" label=\"target_program\""));
        assert!(prompt.contains("parallel-reviews"));
    }

    #[test]
    fn execute_prompt_contains_session_primitive_and_input_attachment() {
        let manifest = example_manifest();
        let root = tempdir().unwrap();
        let staged =
            stage_program(Path::new("fixtures/adapter/parallel-reviews"), root.path()).unwrap();
        let prompt = build_execute_prompt(
            &manifest,
            &staged,
            "test-run",
            &[DogfoodInput {
                name: "code".to_string(),
                content: "print('hi')\n".to_string(),
            }],
            Some(Path::new("bindings/synthesizer/report.md")),
        )
        .unwrap();

        assert!(prompt.contains("<openprose_file path=\"primitives/session.md\">"));
        assert!(prompt.contains("<attachment kind=\"program-input\" label=\"code\""));
        assert!(prompt.contains("bindings/synthesizer/report.md"));
        assert!(prompt.contains("returns the final content inline"));
    }

    #[test]
    fn expected_binding_normalization_adds_bindings_prefix_and_extension() {
        assert_eq!(
            normalize_expected_binding("synthesizer/report"),
            PathBuf::from("bindings/synthesizer/report.md")
        );
        assert_eq!(
            normalize_expected_binding("bindings/synthesizer/report.md"),
            PathBuf::from("bindings/synthesizer/report.md")
        );
    }

    #[test]
    fn extract_json_object_parses_fenced_json_after_prose() {
        let text = "Done.\n\n```json\n{\"ok\":true,\"path\":\"bindings/x.md\"}\n```\n";
        let json = extract_json_object_from_text(text).unwrap();
        assert_eq!(json["ok"], Value::Bool(true));
        assert_eq!(json["path"], Value::String("bindings/x.md".to_string()));
    }

    #[test]
    fn load_phase_response_reads_last_root_assistant_json_and_tool_use_evidence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("execute.out");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"system\",\"subtype\":\"hook_started\"}\n",
                "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"Agent\",\"input\":{\"description\":\"Security review\",\"prompt\":\"---\\nname: security-reviewer\\n---\"}}]}}\n",
                "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"warming up\"}]}}\n",
                "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"done\\n```json\\n{\\\"phase\\\":\\\"execute-v1 + subagent-v1\\\"}\\n```\"}]}}\n",
                "{\"type\":\"assistant\",\"parent_tool_use_id\":\"toolu_sub\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"```json\\n{\\\"phase\\\":\\\"subagent-only\\\"}\\n```\"}]}}\n"
            ),
        )
        .unwrap();

        let response = load_phase_response(&path).unwrap();
        assert_eq!(response.hook_events_observed, 1);
        assert_eq!(response.assistant_texts.len(), 3);
        assert_eq!(response.tool_uses, vec!["Agent"]);
        assert_eq!(response.subagent_requests, vec!["security-reviewer"]);
        assert_eq!(
            response.final_json.unwrap()["phase"],
            "execute-v1 + subagent-v1"
        );
    }

    #[test]
    fn load_phase_response_reads_hermes_export_json_and_tool_evidence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("wire-session.json");
        fs::write(
            &path,
            concat!(
                "{\"messages\":[",
                "{\"role\":\"assistant\",\"content\":\"\",\"tool_calls\":[{\"function\":{\"name\":\"read_file\",\"arguments\":\"{}\"}},{\"function\":{\"name\":\"write_file\",\"arguments\":\"{}\"}}]},",
                "{\"role\":\"assistant\",\"content\":\"{\\\"phase\\\":\\\"wire-v1\\\",\\\"manifest_path\\\":\\\".prose/runs/test/manifest.md\\\",\\\"copied_services\\\":[\\\"svc\\\"],\\\"warnings\\\":[]}\"}",
                "]}"
            ),
        )
        .unwrap();

        let response = load_phase_response(&path).unwrap();
        assert_eq!(response.assistant_texts.len(), 1);
        assert_eq!(response.tool_uses, vec!["read_file", "write_file"]);
        assert_eq!(response.final_json.unwrap()["phase"], "wire-v1");
    }

    #[test]
    fn load_phase_response_reads_codex_agent_message_json_and_event_evidence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("wire.out");
        fs::write(
            &path,
            concat!(
                "{\"type\":\"thread.started\",\"thread_id\":\"t\"}\n",
                "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_0\",\"type\":\"agent_message\",\"text\":\"warming up\"}}\n",
                "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"command_execution\",\"command\":\"/usr/bin/bash -lc pwd\",\"aggregated_output\":\"/tmp\\n\",\"exit_code\":0,\"status\":\"completed\"}}\n",
                "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_2\",\"type\":\"file_change\",\"changes\":[{\"path\":\"/tmp/run/manifest.md\",\"kind\":\"add\"}],\"status\":\"completed\"}}\n",
                "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_3\",\"type\":\"agent_message\",\"text\":\"{\\\"phase\\\":\\\"wire-v1\\\",\\\"manifest_path\\\":\\\".prose/runs/test/manifest.md\\\",\\\"copied_services\\\":[\\\"svc\\\"],\\\"warnings\\\":[]}\"}}\n"
            ),
        )
        .unwrap();

        let response = load_phase_response(&path).unwrap();
        assert_eq!(response.assistant_texts.len(), 2);
        assert_eq!(response.tool_uses, vec!["command_execution", "file_change"]);
        assert_eq!(response.final_json.unwrap()["phase"], "wire-v1");
    }

    #[test]
    fn build_claude_script_quotes_paths_and_preserves_allowed_tools() {
        let script = build_claude_script(
            Path::new("/tmp/a dir/with'single/program"),
            Path::new("/tmp/system append.txt"),
            Path::new("/tmp/prompt file.txt"),
            Path::new("/tmp/out file.txt"),
            Path::new("/tmp/err file.txt"),
            Path::new("/tmp/exit file.txt"),
        );

        assert!(script.contains("claude --print --verbose --output-format stream-json"));
        assert!(script.contains("--allowedTools 'Read Write Edit Bash Agent'"));
        assert!(script.contains("cd '/tmp/a dir/with'\"'\"'single/program'"));
        assert!(script.contains("APPEND=$(cat '/tmp/system append.txt')"));
        assert!(script.contains("cat '/tmp/prompt file.txt' | claude"));
    }

    #[test]
    fn phase_names_match_ignores_whitespace() {
        assert!(phase_names_match(
            "execute-v1+subagent-v1",
            "execute-v1 + subagent-v1"
        ));
        assert!(phase_names_match(" wire-v1 ", "wire-v1"));
        assert!(!phase_names_match("execute-v1", "wire-v1"));
    }

    #[test]
    fn shell_quote_escapes_single_quotes_and_dollar_signs() {
        assert_eq!(shell_quote("a'b$c"), "'a'\"'\"'b$c'");
    }

    #[test]
    fn extract_hermes_session_id_reads_last_session_line() {
        let stdout = "noise\nsession_id: first\nmore noise\nsession_id: second\n";
        assert_eq!(extract_hermes_session_id(stdout).unwrap(), "second");
    }

    #[test]
    fn stage_program_clears_stale_program_dir_contents() {
        let dir = tempdir().unwrap();
        let stale_root = dir.path().join("program");
        fs::create_dir_all(stale_root.join(".prose/runs/old-run")).unwrap();
        fs::write(stale_root.join("stale.txt"), "stale").unwrap();
        fs::write(
            stale_root.join(".prose/runs/old-run/state.md"),
            "stale state",
        )
        .unwrap();

        let staged =
            stage_program(Path::new("fixtures/adapter/parallel-reviews"), dir.path()).unwrap();

        assert_eq!(staged.entry_rel, PathBuf::from("index.md"));
        assert!(!staged.program_dir.join("stale.txt").exists());
        assert!(!staged.program_dir.join(".prose").exists());
        assert!(staged.program_dir.join("index.md").exists());
    }

    #[test]
    fn clear_generated_test_root_artifacts_removes_stale_logs() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("wire-system-append.txt"),
            "stale wire append",
        )
        .unwrap();
        fs::write(
            dir.path().join("execute-system-append.txt"),
            "stale execute append",
        )
        .unwrap();
        fs::write(dir.path().join("wire.out"), "stale wire").unwrap();
        fs::write(dir.path().join("execute.out"), "stale execute").unwrap();
        fs::write(dir.path().join("meta.json"), "{}").unwrap();

        clear_generated_test_root_artifacts(dir.path()).unwrap();

        assert!(!dir.path().join("wire-system-append.txt").exists());
        assert!(!dir.path().join("execute-system-append.txt").exists());
        assert!(!dir.path().join("wire.out").exists());
        assert!(!dir.path().join("execute.out").exists());
        assert!(!dir.path().join("meta.json").exists());
    }

    #[test]
    fn validate_execute_phase_response_rejects_missing_reported_output() {
        let dir = tempdir().unwrap();
        let program_dir = dir.path().join("program");
        let run_dir = program_dir.join(".prose/runs/run-123");
        fs::create_dir_all(run_dir.join("bindings/synthesizer")).unwrap();
        fs::create_dir_all(run_dir.join("bindings/security-reviewer")).unwrap();
        fs::write(
            run_dir.join("bindings/synthesizer/report.md"),
            "real report\n",
        )
        .unwrap();

        let response = PhaseResponse {
            final_json: Some(serde_json::json!({
                "phase": "execute-v1 + subagent-v1",
                "run_id": "run-123",
                "state_path": ".prose/runs/run-123/state.md",
                "subagents_used": ["security-reviewer"],
                "published_outputs": {
                    "report": ".prose/runs/run-123/bindings/synthesizer/report.md",
                    "security-findings": ".prose/runs/run-123/bindings/security-reviewer/security-findings.md"
                },
                "final_report_path": ".prose/runs/run-123/bindings/synthesizer/report.md"
            })),
            subagent_requests: vec!["security-reviewer".to_string()],
            tool_uses: vec!["Agent".to_string(), "Write".to_string()],
            ..PhaseResponse::default()
        };
        let mut report = AdapterDogfoodReport {
            schema_version: "0.1.0".to_string(),
            adapter_id: "claude-code-v1-md".to_string(),
            subject: "test".to_string(),
            valid_adapter: true,
            succeeded: false,
            test_root: dir.path().display().to_string(),
            working_directory: program_dir.display().to_string(),
            entry_point: "index.md".to_string(),
            run_id: "run-123".to_string(),
            input_names: Vec::new(),
            expected_binding: Some("synthesizer/report".to_string()),
            expected_binding_exists: false,
            expected_binding_nonempty: false,
            expected_binding_reported: false,
            expected_binding_bytes: None,
            state_complete: false,
            wire_exit_code: Some(0),
            execute_exit_code: Some(0),
            wire_hook_events_observed: 0,
            execute_hook_events_observed: 0,
            observed_execute_tool_uses: count_tool_uses(&response.tool_uses),
            observed_subagent_requests: dedupe_strings(&response.subagent_requests),
            output_mediation_observed: false,
            subagents_used: Vec::new(),
            wire_response_text: None,
            execute_response_text: None,
            wire_response_json: None,
            execute_response_json: None,
            errors: Vec::new(),
            warnings: Vec::new(),
            artifacts: BTreeMap::new(),
        };

        validate_execute_phase_response(
            &response,
            &program_dir,
            "run-123",
            Some(Path::new("bindings/synthesizer/report.md")),
            &mut report,
        );

        assert!(report.errors.iter().any(|error| {
            error.contains("security-findings") && error.contains("missing on disk")
        }));
        assert!(report.expected_binding_reported);
    }

    #[test]
    fn state_end_marker_must_be_last_nonempty_line() {
        assert!(state_has_success_end_marker(
            "step\n---end 2026-04-16T14:35:00Z\n"
        ));
        assert!(!state_has_success_end_marker(
            "step\n---end 2026-04-16T14:35:00Z\nextra\n"
        ));
        assert!(!state_has_success_end_marker("```\n---end fake\n```\n"));
    }
}
