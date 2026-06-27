use crate::current_lint::{ContractSections, Frontmatter, parse_frontmatter, parse_markdown_body};
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const CAPABILITY_SCHEMA_JSON: &str = include_str!("../specs/conformance-capability-schema.json");

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CapabilityReport {
    pub vocab_version: String,
    pub program: String,
    pub requires: CapabilityRequirements,
    pub implied_substrate: SubstrateRequirements,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_check: Option<RuntimeCompatibilityReport>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CapabilityRequirements {
    #[serde(rename = "workspace-bindings")]
    pub workspace_bindings: bool,
    #[serde(rename = "copy-on-return")]
    pub copy_on_return: bool,
    #[serde(rename = "state-markers")]
    pub state_markers: bool,
    #[serde(rename = "error-signaling")]
    pub error_signaling: bool,
    #[serde(rename = "dependency-scheduling")]
    pub dependency_scheduling: bool,
    pub parallel: bool,
    pub environment: EnvironmentRequirement,
    pub delegation: bool,
    #[serde(rename = "persistence-execution")]
    pub persistence_execution: bool,
    #[serde(rename = "persistence-project")]
    pub persistence_project: bool,
    #[serde(rename = "persistence-user")]
    pub persistence_user: bool,
    #[serde(rename = "ask-user")]
    pub ask_user: bool,
    #[serde(rename = "run-inputs")]
    pub run_inputs: bool,
    #[serde(rename = "test-execution")]
    pub test_execution: bool,
    #[serde(rename = "test-evaluation")]
    pub test_evaluation: bool,
    pub resume: bool,
    #[serde(rename = "context-boundary")]
    pub context_boundary: bool,
    #[serde(rename = "secret-hygiene")]
    pub secret_hygiene: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct EnvironmentRequirement {
    pub required: bool,
    pub vars: Vec<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SubstrateRequirements {
    pub subagents: bool,
    #[serde(rename = "file-io")]
    pub file_io: bool,
    #[serde(rename = "tool-exec")]
    pub tool_exec: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct RuntimeCompatibilityReport {
    pub subject: String,
    pub compatible: bool,
    pub blocking: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CapabilitySchema {
    meta: CapabilitySchemaMeta,
    capabilities: BTreeMap<String, CapabilitySpec>,
}

#[derive(Debug, Deserialize)]
struct CapabilitySchemaMeta {
    vocab_version: String,
}

#[derive(Debug, Deserialize)]
struct CapabilitySpec {
    #[serde(default)]
    depends_on: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RuntimeManifest {
    vocab_version: String,
    subject: String,
    supports: BTreeMap<String, RuntimeCapabilitySupport>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum SupportMode {
    Unsupported,
    Incidental,
    Adapted,
    Native,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum VerificationStatus {
    #[default]
    Unverified,
    SelfDeclared,
    Certified,
}

#[derive(Debug, Deserialize)]
struct RuntimeCapabilitySupport {
    mode: SupportMode,
    #[serde(default)]
    verification: VerificationStatus,
    #[allow(dead_code)]
    #[serde(default)]
    constraints: Option<serde_json::Value>,
    #[allow(dead_code)]
    #[serde(default)]
    notes: Option<String>,
}

static CAPABILITY_SCHEMA: OnceLock<CapabilitySchema> = OnceLock::new();

pub fn capability_report_for_target(target: &Path) -> Result<CapabilityReport> {
    let path = resolve_program_target(target)?;
    let source = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    capability_report_from_source(&path, &source)
}

pub fn capability_report_for_target_with_runtime(
    target: &Path,
    runtime_manifest_path: &Path,
) -> Result<CapabilityReport> {
    let mut report = capability_report_for_target(target)?;
    report.runtime_check = Some(compare_with_runtime(&report, runtime_manifest_path)?);
    Ok(report)
}

pub fn capability_report_from_source(path: &Path, source: &str) -> Result<CapabilityReport> {
    let mut diagnostics = Vec::new();
    let (frontmatter, body_start) = parse_frontmatter(path, source, &mut diagnostics);
    let body = if body_start < source.lines().count() {
        source
            .lines()
            .skip(body_start)
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };
    let (_headings, sections) =
        parse_markdown_body(path, &body, body_start, &frontmatter, &mut diagnostics);

    build_report(path, source, &frontmatter, &sections)
}

fn build_report(
    path: &Path,
    source: &str,
    frontmatter: &Frontmatter,
    sections: &ContractSections,
) -> Result<CapabilityReport> {
    let schema = capability_schema();
    validate_schema_capabilities(schema)?;

    let env_vars = environment_vars(frontmatter, sections);
    let requirements = caller_requirements(frontmatter, sections);
    let has_calls = source.lines().any(|line| {
        let trimmed = line.trim_start();
        trimmed.starts_with("call ") || trimmed.contains(" = call ")
    });
    let executable_kind = matches!(
        frontmatter.kind.as_deref(),
        Some("responsibility")
            | Some("function")
            | Some("gateway")
            | Some("test")
            | Some("program")
            | Some("program-node")
            | Some("service")
    );
    let core_runtime = executable_kind || has_calls || !frontmatter.nodes.is_empty();
    let dependency_scheduling = matches!(
        frontmatter.kind.as_deref(),
        Some("responsibility") | Some("gateway") | Some("test")
    ) || !frontmatter.nodes.is_empty()
        || has_calls;
    let run_inputs = requirements.iter().any(|item| is_run_input(item));
    let ask_user = !requirements.is_empty();
    let test_execution = matches!(frontmatter.kind.as_deref(), Some("test"));
    let test_evaluation = test_execution
        && (!sections.expects.is_empty()
            || !sections.expects_not.is_empty()
            || source.lines().any(|line| {
                let trimmed = line.trim_start().to_ascii_lowercase();
                trimmed.starts_with("expects:") || trimmed.starts_with("expects-not:")
            }));
    let context_boundary = !sections.context.is_empty()
        || source.lines().any(|line| {
            let trimmed = line.trim_start().to_ascii_lowercase();
            trimmed.starts_with("context:")
        });
    let delegation = frontmatter.all_keys.contains_key("delegates")
        || source.contains("\nDelegate:")
        || source.starts_with("Delegate:")
        || source.contains("\nRequest:")
        || source.starts_with("Request:");
    let (persistence_execution, persistence_project, persistence_user) =
        infer_persistence(frontmatter);
    let resume = frontmatter.all_keys.contains_key("resume");
    let environment = EnvironmentRequirement {
        required: !env_vars.is_empty(),
        vars: env_vars,
    };
    let requires = CapabilityRequirements {
        workspace_bindings: core_runtime,
        copy_on_return: core_runtime,
        state_markers: core_runtime,
        error_signaling: core_runtime,
        dependency_scheduling,
        parallel: false,
        environment: EnvironmentRequirement {
            required: environment.required,
            vars: environment.vars.clone(),
        },
        delegation,
        persistence_execution,
        persistence_project,
        persistence_user,
        ask_user,
        run_inputs,
        test_execution,
        test_evaluation,
        resume,
        context_boundary,
        secret_hygiene: environment.required,
    };
    let provenance = requirement_provenance(schema, &requires)?;
    let implied_substrate = implied_substrate(&provenance);

    Ok(CapabilityReport {
        vocab_version: schema.meta.vocab_version.clone(),
        program: frontmatter
            .name
            .clone()
            .or_else(|| {
                path.file_stem()
                    .map(|stem| stem.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| path.display().to_string()),
        requires,
        implied_substrate,
        runtime_check: None,
    })
}

fn compare_with_runtime(
    report: &CapabilityReport,
    runtime_manifest_path: &Path,
) -> Result<RuntimeCompatibilityReport> {
    let schema = capability_schema();
    validate_schema_capabilities(schema)?;
    let manifest = load_runtime_manifest(runtime_manifest_path)?;
    validate_runtime_manifest(schema, &manifest)?;

    let provenance = requirement_provenance(schema, &report.requires)?;
    let mut blocking = Vec::new();
    let mut warnings = Vec::new();

    for (capability, required_by) in provenance {
        let context = capability_context(&capability, &required_by);
        let support = match manifest.supports.get(&capability) {
            Some(support) => support,
            None => {
                blocking.push(format!(
                    "runtime subject `{}` does not declare required capability `{}`{}",
                    manifest.subject, capability, context
                ));
                continue;
            }
        };

        match support.mode {
            SupportMode::Unsupported => blocking.push(format!(
                "runtime subject `{}` does not support required capability `{}`{}",
                manifest.subject, capability, context
            )),
            SupportMode::Incidental => blocking.push(format!(
                "runtime subject `{}` only supports required capability `{}` incidentally{}",
                manifest.subject, capability, context
            )),
            SupportMode::Adapted | SupportMode::Native => match support.verification {
                VerificationStatus::Certified => {}
                VerificationStatus::SelfDeclared => warnings.push(format!(
                    "required capability `{}` is only self-declared by `{}`{}",
                    capability, manifest.subject, context
                )),
                VerificationStatus::Unverified => warnings.push(format!(
                    "required capability `{}` is unverified for `{}`{}",
                    capability, manifest.subject, context
                )),
            },
        }
    }

    Ok(RuntimeCompatibilityReport {
        subject: manifest.subject,
        compatible: blocking.is_empty(),
        blocking,
        warnings,
    })
}

fn capability_context(capability: &str, required_by: &BTreeSet<String>) -> String {
    if required_by.len() == 1 && required_by.contains(capability) {
        return String::new();
    }

    let via = required_by
        .iter()
        .filter(|name| name.as_str() != capability)
        .cloned()
        .collect::<Vec<_>>();

    if via.is_empty() {
        String::new()
    } else {
        format!(" (required via {})", via.join(", "))
    }
}

fn load_runtime_manifest(path: &Path) -> Result<RuntimeManifest> {
    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))
}

fn validate_runtime_manifest(schema: &CapabilitySchema, manifest: &RuntimeManifest) -> Result<()> {
    if manifest.vocab_version != schema.meta.vocab_version {
        bail!(
            "runtime manifest vocab_version {} does not match schema vocab_version {}",
            manifest.vocab_version,
            schema.meta.vocab_version
        );
    }

    for capability in manifest.supports.keys() {
        if !schema.capabilities.contains_key(capability) {
            bail!("runtime manifest declares unknown capability: {capability}");
        }
    }

    for (capability, support) in &manifest.supports {
        if support.mode == SupportMode::Unsupported {
            continue;
        }
        let Some(spec) = schema.capabilities.get(capability) else {
            bail!("runtime manifest declares unknown capability: {capability}");
        };
        for dependency in &spec.depends_on {
            match manifest.supports.get(dependency) {
                Some(dep_support) if dep_support.mode != SupportMode::Unsupported => {}
                _ => bail!(
                    "runtime manifest invalid: capability `{}` is {:?} but dependency `{}` is unsupported or undeclared",
                    capability,
                    support.mode,
                    dependency
                ),
            }
        }
    }

    Ok(())
}

fn capability_schema() -> &'static CapabilitySchema {
    CAPABILITY_SCHEMA.get_or_init(|| {
        serde_json::from_str(CAPABILITY_SCHEMA_JSON).expect("parse capability schema")
    })
}

fn validate_schema_capabilities(schema: &CapabilitySchema) -> Result<()> {
    const REQUIRED_CAPABILITIES: &[&str] = &[
        "subagents",
        "file-io",
        "tool-exec",
        "workspace-bindings",
        "copy-on-return",
        "state-markers",
        "error-signaling",
        "dependency-scheduling",
        "parallel",
        "environment",
        "delegation",
        "persistence-execution",
        "persistence-project",
        "persistence-user",
        "ask-user",
        "run-inputs",
        "test-execution",
        "test-evaluation",
        "resume",
        "context-boundary",
        "secret-hygiene",
    ];

    for capability in REQUIRED_CAPABILITIES {
        if !schema.capabilities.contains_key(*capability) {
            bail!("capability schema missing required capability: {capability}");
        }
    }

    Ok(())
}

fn requirement_provenance(
    schema: &CapabilitySchema,
    requires: &CapabilityRequirements,
) -> Result<BTreeMap<String, BTreeSet<String>>> {
    let direct = direct_required_capabilities(requires);
    let mut provenance: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();

    for capability in &direct {
        provenance
            .entry(capability.clone())
            .or_default()
            .insert(capability.clone());
        collect_dependency_provenance(schema, capability, capability, &mut provenance)?;
    }

    Ok(provenance)
}

fn collect_dependency_provenance(
    schema: &CapabilitySchema,
    capability: &str,
    root_required: &str,
    provenance: &mut BTreeMap<String, BTreeSet<String>>,
) -> Result<()> {
    let spec = schema
        .capabilities
        .get(capability)
        .with_context(|| format!("unknown capability in schema: {capability}"))?;

    for dependency in &spec.depends_on {
        let inserted = provenance
            .entry(dependency.clone())
            .or_default()
            .insert(root_required.to_string());
        if inserted {
            collect_dependency_provenance(schema, dependency, root_required, provenance)?;
        }
    }

    Ok(())
}

fn direct_required_capabilities(requires: &CapabilityRequirements) -> BTreeSet<String> {
    let mut caps = BTreeSet::new();

    if requires.workspace_bindings {
        caps.insert("workspace-bindings".to_string());
    }
    if requires.copy_on_return {
        caps.insert("copy-on-return".to_string());
    }
    if requires.state_markers {
        caps.insert("state-markers".to_string());
    }
    if requires.error_signaling {
        caps.insert("error-signaling".to_string());
    }
    if requires.dependency_scheduling {
        caps.insert("dependency-scheduling".to_string());
    }
    if requires.parallel {
        caps.insert("parallel".to_string());
    }
    if requires.environment.required {
        caps.insert("environment".to_string());
    }
    if requires.delegation {
        caps.insert("delegation".to_string());
    }
    if requires.persistence_execution {
        caps.insert("persistence-execution".to_string());
    }
    if requires.persistence_project {
        caps.insert("persistence-project".to_string());
    }
    if requires.persistence_user {
        caps.insert("persistence-user".to_string());
    }
    if requires.ask_user {
        caps.insert("ask-user".to_string());
    }
    if requires.run_inputs {
        caps.insert("run-inputs".to_string());
    }
    if requires.test_execution {
        caps.insert("test-execution".to_string());
    }
    if requires.test_evaluation {
        caps.insert("test-evaluation".to_string());
    }
    if requires.resume {
        caps.insert("resume".to_string());
    }
    if requires.context_boundary {
        caps.insert("context-boundary".to_string());
    }
    if requires.secret_hygiene {
        caps.insert("secret-hygiene".to_string());
    }

    caps
}

fn implied_substrate(provenance: &BTreeMap<String, BTreeSet<String>>) -> SubstrateRequirements {
    SubstrateRequirements {
        subagents: provenance.contains_key("subagents"),
        file_io: provenance.contains_key("file-io"),
        tool_exec: provenance.contains_key("tool-exec"),
    }
}

fn resolve_program_target(target: &Path) -> Result<PathBuf> {
    if target.is_file() {
        return target
            .canonicalize()
            .with_context(|| format!("canonicalize {}", target.display()));
    }

    if !target.is_dir() {
        bail!("target does not exist: {}", target.display());
    }

    for index_name in ["index.prose.md", "index.md"] {
        let index = target.join(index_name);
        if index.is_file() {
            return index
                .canonicalize()
                .with_context(|| format!("canonicalize {}", index.display()));
        }
    }

    let mut candidates = Vec::new();
    for entry in fs::read_dir(target).with_context(|| format!("read {}", target.display()))? {
        let path = entry?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let source =
            fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let mut diagnostics = Vec::new();
        let (frontmatter, _) = parse_frontmatter(&path, &source, &mut diagnostics);
        if matches!(
            frontmatter.kind.as_deref(),
            Some("responsibility")
                | Some("function")
                | Some("gateway")
                | Some("test")
                | Some("program")
        ) {
            candidates.push(path);
        }
    }

    match candidates.len() {
        0 => bail!(
            "could not find an index.prose.md, index.md, or OpenProse root in {}",
            target.display()
        ),
        1 => candidates[0]
            .canonicalize()
            .with_context(|| format!("canonicalize {}", candidates[0].display())),
        _ => bail!(
            "multiple OpenProse roots found in {}; pass a file path instead",
            target.display()
        ),
    }
}

fn caller_requirements(frontmatter: &Frontmatter, sections: &ContractSections) -> Vec<String> {
    if frontmatter.kind.as_deref() == Some("test") {
        return Vec::new();
    }
    if !sections.parameters.is_empty() {
        return sections
            .parameters
            .iter()
            .map(|item| item.text.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect();
    }
    if !sections.requires.is_empty() {
        return sections
            .requires
            .iter()
            .map(|item| item.text.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect();
    }

    frontmatter
        .requires
        .iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn environment_vars(frontmatter: &Frontmatter, sections: &ContractSections) -> Vec<String> {
    let items: Vec<String> = if !sections.environment.is_empty() {
        sections
            .environment
            .iter()
            .map(|item| item.text.clone())
            .collect()
    } else {
        frontmatter.environment.clone()
    };

    let mut vars = BTreeSet::new();
    for item in items {
        let var = item
            .split(':')
            .next()
            .unwrap_or(&item)
            .trim()
            .trim_matches('"')
            .trim_matches('`');
        if !var.is_empty() {
            vars.insert(var.to_string());
        }
    }
    vars.into_iter().collect()
}

fn infer_persistence(frontmatter: &Frontmatter) -> (bool, bool, bool) {
    let persist = frontmatter.persist.as_deref().unwrap_or_default();
    let imported_project_memory = frontmatter
        .use_deps
        .iter()
        .any(|dep| dep.rsplit('/').next() == Some("project-memory"));
    let imported_user_memory = frontmatter
        .use_deps
        .iter()
        .any(|dep| dep.rsplit('/').next() == Some("user-memory"));

    let execution = matches!(persist, "execution" | "run" | "session");
    let project = persist == "project" || imported_project_memory;
    let user = persist == "user" || imported_user_memory;
    (execution, project, user)
}

fn is_run_input(requirement: &str) -> bool {
    let lower = requirement.to_ascii_lowercase();
    lower.contains(": run") || lower.contains(": run[]")
}

#[cfg(test)]
mod tests {
    use super::{
        capability_report_for_target_with_runtime, capability_report_from_source,
        compare_with_runtime,
    };
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    #[test]
    fn infers_environment_and_interaction_requirements() {
        let source = include_str!("../fixtures/briefing/with-imports.md");
        let report =
            capability_report_from_source(Path::new("fixtures/briefing/with-imports.md"), source)
                .unwrap();

        assert_eq!(report.program, "daily-delivery");
        assert!(report.requires.workspace_bindings);
        assert!(report.requires.copy_on_return);
        assert!(report.requires.state_markers);
        assert!(report.requires.error_signaling);
        assert!(report.requires.dependency_scheduling);
        assert!(report.requires.ask_user);
        assert!(!report.requires.run_inputs);
        assert!(report.requires.environment.required);
        assert_eq!(
            report.requires.environment.vars,
            vec![
                "SLACK_BOT_TOKEN".to_string(),
                "SLACK_WEBHOOK_URL".to_string()
            ]
        );
        assert!(report.requires.secret_hygiene);
        assert!(report.implied_substrate.subagents);
        assert!(report.implied_substrate.file_io);
        assert!(report.implied_substrate.tool_exec);
    }

    #[test]
    fn infers_test_execution_and_evaluation() {
        let source = r#"---
name: test-summarizer
kind: test
subject: summarizer
---

### Fixtures

- `topic`: recent developments in quantum error correction

### Expects

- `summary`: covers at least three concrete developments

### Expects Not

- `summary`: invents citations
"#;
        let report =
            capability_report_from_source(Path::new("test-summarizer.prose.md"), source).unwrap();

        assert_eq!(report.program, "test-summarizer");
        assert!(report.requires.test_execution);
        assert!(report.requires.test_evaluation);
        assert!(!report.requires.context_boundary);
        assert!(!report.requires.ask_user);
        assert!(report.implied_substrate.subagents);
        assert!(report.implied_substrate.file_io);
    }

    #[test]
    fn infers_context_boundary_from_context_section() {
        let source = r#"---
name: context-grounded-summary
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E20918
---

### Context

- `style-guide`: `docs/style-guide.md` at the compiled source revision

### Maintains

- `summary`: concise current summary matching the style guide
"#;
        let report =
            capability_report_from_source(Path::new("context-grounded-summary.prose.md"), source)
                .unwrap();

        assert!(report.requires.context_boundary);
        assert!(!report.requires.ask_user);
        assert!(report.implied_substrate.subagents);
        assert!(report.implied_substrate.file_io);
    }

    #[test]
    fn infers_project_persistence_from_frontmatter() {
        let source = r#"---
name: project-memory
kind: function
persist: project
---

### Parameters

- `topic`: memory topic

### Returns

- `memory`: durable project memory
"#;
        let report =
            capability_report_from_source(Path::new("project-memory.prose.md"), source).unwrap();

        assert!(report.requires.persistence_project);
        assert!(!report.requires.persistence_execution);
        assert!(!report.requires.persistence_user);
        assert!(report.implied_substrate.file_io);
    }

    #[test]
    fn infers_run_inputs_from_requires_clause() {
        let source = r#"---
name: run-input-demo
kind: program
services: [worker]
---

requires:
- task: run the task payload from caller bindings
- attachments: run[] caller attachments
"#;
        let report = capability_report_from_source(Path::new("run-input-demo.md"), source).unwrap();

        assert!(report.requires.ask_user);
        assert!(report.requires.run_inputs);
        assert!(report.implied_substrate.subagents);
        assert!(report.implied_substrate.file_io);
    }

    #[test]
    fn runtime_check_flags_missing_subagents() {
        let source = include_str!("../fixtures/briefing/with-imports.md");
        let report =
            capability_report_from_source(Path::new("fixtures/briefing/with-imports.md"), source)
                .unwrap();

        let temp = tempdir().unwrap();
        let manifest_path = temp.path().join("pi-no-extensions.json");
        fs::write(
            &manifest_path,
            r#"{
  "vocab_version": "0.1.0",
  "subject": "pi --no-extensions",
  "supports": {
    "subagents": { "mode": "unsupported", "verification": "self-declared" },
    "file-io": { "mode": "native", "verification": "self-declared" },
    "tool-exec": { "mode": "native", "verification": "self-declared" },
    "workspace-bindings": { "mode": "unsupported", "verification": "self-declared" },
    "copy-on-return": { "mode": "unsupported", "verification": "self-declared" },
    "state-markers": { "mode": "unsupported", "verification": "self-declared" },
    "error-signaling": { "mode": "unsupported", "verification": "self-declared" },
    "dependency-scheduling": { "mode": "unsupported", "verification": "self-declared" },
    "parallel": { "mode": "unsupported", "verification": "self-declared" },
    "environment": { "mode": "unsupported", "verification": "self-declared" },
    "delegation": { "mode": "unsupported", "verification": "self-declared" },
    "persistence-execution": { "mode": "unsupported", "verification": "self-declared" },
    "persistence-project": { "mode": "unsupported", "verification": "self-declared" },
    "persistence-user": { "mode": "unsupported", "verification": "self-declared" },
    "ask-user": { "mode": "native", "verification": "self-declared" },
    "run-inputs": { "mode": "unsupported", "verification": "self-declared" },
    "test-execution": { "mode": "unsupported", "verification": "self-declared" },
    "test-evaluation": { "mode": "unsupported", "verification": "self-declared" },
    "resume": { "mode": "unsupported", "verification": "self-declared" },
    "secret-hygiene": { "mode": "unsupported", "verification": "self-declared" }
  }
}"#,
        )
        .unwrap();

        let runtime = compare_with_runtime(&report, &manifest_path).unwrap();
        assert!(!runtime.compatible);
        assert!(
            runtime
                .blocking
                .iter()
                .any(|line| line.contains("subagents"))
        );
    }

    #[test]
    fn target_report_with_runtime_attaches_runtime_check() {
        let temp = tempdir().unwrap();
        let manifest_path = temp.path().join("runtime.json");
        fs::write(
            &manifest_path,
            r#"{
  "vocab_version": "0.1.0",
  "subject": "certified-demo",
  "supports": {
    "subagents": { "mode": "native", "verification": "certified" },
    "file-io": { "mode": "native", "verification": "certified" },
    "tool-exec": { "mode": "native", "verification": "certified" },
    "workspace-bindings": { "mode": "native", "verification": "certified" },
    "copy-on-return": { "mode": "native", "verification": "certified" },
    "state-markers": { "mode": "native", "verification": "certified" },
    "error-signaling": { "mode": "native", "verification": "certified" },
    "dependency-scheduling": { "mode": "native", "verification": "certified" },
    "parallel": { "mode": "unsupported", "verification": "certified" },
    "environment": { "mode": "native", "verification": "certified" },
    "delegation": { "mode": "unsupported", "verification": "certified" },
    "persistence-execution": { "mode": "unsupported", "verification": "certified" },
    "persistence-project": { "mode": "unsupported", "verification": "certified" },
    "persistence-user": { "mode": "unsupported", "verification": "certified" },
    "ask-user": { "mode": "native", "verification": "certified" },
    "run-inputs": { "mode": "unsupported", "verification": "certified" },
    "test-execution": { "mode": "unsupported", "verification": "certified" },
    "test-evaluation": { "mode": "unsupported", "verification": "certified" },
    "resume": { "mode": "unsupported", "verification": "certified" },
    "secret-hygiene": { "mode": "native", "verification": "certified" }
  }
}"#,
        )
        .unwrap();

        let report = capability_report_for_target_with_runtime(
            Path::new("fixtures/briefing/with-imports.md"),
            &manifest_path,
        )
        .unwrap();

        let runtime = report.runtime_check.unwrap();
        assert!(runtime.compatible);
        assert!(runtime.blocking.is_empty());
    }
}
