use crate::spec::{default_spec_source, repo_root};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path};
use std::sync::OnceLock;

const ADAPTER_SCHEMA_JSON: &str = include_str!("../specs/adapter-manifest-schema.json");
const CANONICAL_OPENPROSE_SOURCE_URL: &str = "https://github.com/openprose/prose.git";

#[derive(Debug, Serialize)]
pub struct AdapterValidationReport {
    pub schema_version: String,
    pub adapter_id: String,
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AdapterSchema {
    pub(crate) meta: AdapterSchemaMeta,
    pub(crate) program_formats: Vec<String>,
    pub(crate) channel_roles: Vec<String>,
    pub(crate) attachment_kinds: Vec<String>,
    pub(crate) phases: BTreeMap<String, AdapterPhaseRequirements>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AdapterSchemaMeta {
    pub(crate) schema_version: String,
    pub(crate) spec_ref: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AdapterPhaseRequirements {
    pub(crate) required_for_formats: Vec<String>,
    pub(crate) required_files: Vec<String>,
    pub(crate) required_attachments: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct AdapterManifest {
    pub(crate) schema_version: String,
    pub(crate) adapter_id: String,
    pub(crate) subject: String,
    #[serde(default)]
    pub(crate) runtime_manifest: Option<String>,
    pub(crate) source: String,
    #[serde(rename = "sourceUrl")]
    pub(crate) source_url: String,
    pub(crate) spec_ref: String,
    pub(crate) skill_root: String,
    pub(crate) supported_program_formats: Vec<String>,
    pub(crate) phases: BTreeMap<String, AdapterPhase>,
    #[serde(default)]
    pub(crate) notes: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct AdapterPhase {
    pub(crate) channels: Vec<AdapterChannel>,
    pub(crate) attachments: Vec<AdapterAttachment>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct AdapterChannel {
    pub(crate) name: String,
    pub(crate) role: String,
    pub(crate) files: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct AdapterAttachment {
    pub(crate) kind: String,
    pub(crate) channel: String,
    pub(crate) label: String,
}

static ADAPTER_SCHEMA: OnceLock<AdapterSchema> = OnceLock::new();

pub(crate) fn load_adapter_manifest(path: &Path) -> Result<(std::path::PathBuf, AdapterManifest)> {
    let manifest_path = path
        .canonicalize()
        .with_context(|| format!("canonicalize {}", path.display()))?;
    let source = fs::read_to_string(&manifest_path)
        .with_context(|| format!("read {}", manifest_path.display()))?;
    let manifest: AdapterManifest = serde_json::from_str(&source)
        .with_context(|| format!("parse {}", manifest_path.display()))?;
    Ok((manifest_path, manifest))
}

pub fn validate_adapter_manifest(path: &Path) -> Result<AdapterValidationReport> {
    let (manifest_path, manifest) = load_adapter_manifest(path)?;
    let schema = adapter_schema();

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    validate_manifest(
        schema,
        &manifest,
        &manifest_path,
        &mut errors,
        &mut warnings,
    )?;

    Ok(AdapterValidationReport {
        schema_version: schema.meta.schema_version.clone(),
        adapter_id: manifest.adapter_id,
        valid: errors.is_empty(),
        errors,
        warnings,
    })
}

fn adapter_schema() -> &'static AdapterSchema {
    ADAPTER_SCHEMA
        .get_or_init(|| serde_json::from_str(ADAPTER_SCHEMA_JSON).expect("parse adapter schema"))
}

fn validate_manifest(
    schema: &AdapterSchema,
    manifest: &AdapterManifest,
    manifest_path: &Path,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if manifest.schema_version != schema.meta.schema_version {
        errors.push(format!(
            "schema_version {} does not match supported schema_version {}",
            manifest.schema_version, schema.meta.schema_version
        ));
    }
    if manifest.adapter_id.trim().is_empty() {
        errors.push("adapter_id must not be empty".to_string());
    }
    if manifest.subject.trim().is_empty() {
        errors.push("subject must not be empty".to_string());
    }
    if manifest.source.trim().is_empty() {
        errors.push("source must not be empty".to_string());
    }
    if manifest.source_url.trim().is_empty() {
        errors.push("sourceUrl must not be empty".to_string());
    }
    if manifest.spec_ref.trim().is_empty() {
        errors.push("spec_ref must not be empty".to_string());
    }
    if manifest.skill_root.trim().is_empty() {
        errors.push("skill_root must not be empty".to_string());
    }

    let spec = default_spec_source()?;
    let expected_spec_ref = format!("{}@{}", spec.repo, spec.pinned_commit);

    if manifest.source != spec.repo {
        errors.push(format!(
            "source {} does not match pinned spec repo {}",
            manifest.source, spec.repo
        ));
    }
    if manifest.source_url != CANONICAL_OPENPROSE_SOURCE_URL {
        errors.push(format!(
            "sourceUrl {} does not match pinned OpenProse sourceUrl {}",
            manifest.source_url, CANONICAL_OPENPROSE_SOURCE_URL
        ));
    }
    if manifest.spec_ref != expected_spec_ref {
        errors.push(format!(
            "spec_ref {} does not match pinned repo spec_ref {}",
            manifest.spec_ref, expected_spec_ref
        ));
    }
    if manifest.skill_root != spec.paths.root {
        errors.push(format!(
            "skill_root {} does not match pinned spec root {}",
            manifest.skill_root, spec.paths.root
        ));
    }
    if schema.meta.spec_ref != expected_spec_ref {
        warnings.push(format!(
            "adapter schema spec_ref {} differs from pinned repo spec_ref {}",
            schema.meta.spec_ref, expected_spec_ref
        ));
    }
    if manifest.spec_ref != schema.meta.spec_ref {
        warnings.push(format!(
            "adapter spec_ref {} differs from adapter schema spec_ref {}",
            manifest.spec_ref, schema.meta.spec_ref
        ));
    }

    if let Some(runtime_manifest) = &manifest.runtime_manifest {
        let runtime_path = manifest_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(runtime_manifest);
        if !runtime_path.exists() {
            errors.push(format!(
                "runtime_manifest path does not exist relative to manifest: {}",
                runtime_manifest
            ));
        }
    }

    if manifest.supported_program_formats.is_empty() {
        errors.push("supported_program_formats must not be empty".to_string());
    }

    let allowed_formats: BTreeSet<&str> =
        schema.program_formats.iter().map(String::as_str).collect();
    let declared_formats: BTreeSet<&str> = manifest
        .supported_program_formats
        .iter()
        .map(String::as_str)
        .collect();
    for format in &manifest.supported_program_formats {
        if !allowed_formats.contains(format.as_str()) {
            errors.push(format!("unsupported program format: {}", format));
        }
    }

    let allowed_roles: BTreeSet<&str> = schema.channel_roles.iter().map(String::as_str).collect();
    let allowed_attachments: BTreeSet<&str> =
        schema.attachment_kinds.iter().map(String::as_str).collect();
    let allowed_phases: BTreeSet<&str> = schema.phases.keys().map(String::as_str).collect();

    let skill_root = spec.resolve_root(&repo_root());

    for phase_name in manifest.phases.keys() {
        if !allowed_phases.contains(phase_name.as_str()) {
            errors.push(format!("unsupported phase: {}", phase_name));
        }
    }

    for (phase_name, requirements) in &schema.phases {
        let phase_required = requirements
            .required_for_formats
            .iter()
            .any(|format| declared_formats.contains(format.as_str()));
        if phase_required && !manifest.phases.contains_key(phase_name) {
            errors.push(format!(
                "missing required phase `{}` for formats {}",
                phase_name,
                requirements.required_for_formats.join(", ")
            ));
        }
    }

    for (phase_name, phase) in &manifest.phases {
        if phase.channels.is_empty() {
            errors.push(format!(
                "phase `{}` must declare at least one channel",
                phase_name
            ));
            continue;
        }

        let mut channel_names = BTreeSet::new();
        let mut phase_files = BTreeSet::new();
        for channel in &phase.channels {
            if channel.name.trim().is_empty() {
                errors.push(format!(
                    "phase `{}` has a channel with empty name",
                    phase_name
                ));
            }
            if !channel_names.insert(channel.name.clone()) {
                errors.push(format!(
                    "phase `{}` has duplicate channel name `{}`",
                    phase_name, channel.name
                ));
            }
            if !allowed_roles.contains(channel.role.as_str()) {
                errors.push(format!(
                    "phase `{}` uses unsupported channel role `{}`",
                    phase_name, channel.role
                ));
            }
            if channel.files.is_empty() {
                errors.push(format!(
                    "phase `{}` channel `{}` must list at least one file",
                    phase_name, channel.name
                ));
            }

            for file in &channel.files {
                if !is_valid_relative_path(file) {
                    errors.push(format!(
                        "phase `{}` references invalid file path `{}`",
                        phase_name, file
                    ));
                    continue;
                }
                if !phase_files.insert(file.clone()) {
                    warnings.push(format!(
                        "phase `{}` references file `{}` more than once",
                        phase_name, file
                    ));
                }
                let local_path = skill_root.join(file);
                if !local_path.exists() {
                    errors.push(format!(
                        "phase `{}` references missing OpenProse file `{}`",
                        phase_name, file
                    ));
                }
            }
        }

        let Some(requirements) = schema.phases.get(phase_name) else {
            continue;
        };
        for required_file in &requirements.required_files {
            if !phase_files.contains(required_file) {
                errors.push(format!(
                    "phase `{}` must include required file `{}`",
                    phase_name, required_file
                ));
            }
        }

        let available_channels: BTreeSet<&str> =
            phase.channels.iter().map(|c| c.name.as_str()).collect();
        let mut attachment_kinds = BTreeSet::new();
        for attachment in &phase.attachments {
            if !allowed_attachments.contains(attachment.kind.as_str()) {
                errors.push(format!(
                    "phase `{}` uses unsupported attachment kind `{}`",
                    phase_name, attachment.kind
                ));
            }
            if attachment.label.trim().is_empty() {
                errors.push(format!(
                    "phase `{}` attachment `{}` must have a non-empty label",
                    phase_name, attachment.kind
                ));
            }
            if !available_channels.contains(attachment.channel.as_str()) {
                errors.push(format!(
                    "phase `{}` attachment `{}` references unknown channel `{}`",
                    phase_name, attachment.kind, attachment.channel
                ));
            }
            if !attachment_kinds.insert(attachment.kind.clone()) {
                warnings.push(format!(
                    "phase `{}` declares attachment kind `{}` more than once",
                    phase_name, attachment.kind
                ));
            }
        }

        for required_attachment in &requirements.required_attachments {
            if !attachment_kinds.contains(required_attachment) {
                errors.push(format!(
                    "phase `{}` must declare attachment kind `{}`",
                    phase_name, required_attachment
                ));
            }
        }
    }

    if manifest.notes.as_deref().unwrap_or("").trim().is_empty() {
        warnings.push(
            "notes is empty; include a short explanation of the adapter strategy".to_string(),
        );
    }

    Ok(())
}

fn is_valid_relative_path(path: &str) -> bool {
    if path.trim().is_empty()
        || path.starts_with('/')
        || path.contains('*')
        || path.contains('?')
        || path.contains('[')
        || path.contains(']')
        || path.contains("\\")
    {
        return false;
    }

    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return false;
    }

    for component in candidate.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::{is_valid_relative_path, validate_adapter_manifest};
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    fn write_modified_example(path: &Path, from: &str, to: &str) {
        let source = fs::read_to_string("specs/adapters/pi-v1-md.json").unwrap();
        let updated = source.replacen(from, to, 1);
        fs::write(path, updated).unwrap();
    }

    #[test]
    fn valid_relative_paths_are_accepted() {
        assert!(is_valid_relative_path("forme.md"));
        assert!(is_valid_relative_path("state/filesystem.md"));
        assert!(is_valid_relative_path("guidance/system-prompt.md"));
    }

    #[test]
    fn invalid_relative_paths_are_rejected() {
        assert!(!is_valid_relative_path("/tmp/forme.md"));
        assert!(!is_valid_relative_path("../forme.md"));
        assert!(!is_valid_relative_path("skills/open-prose/*.md"));
    }

    #[test]
    fn example_pi_adapter_validates() {
        let report = validate_adapter_manifest(Path::new("specs/adapters/pi-v1-md.json")).unwrap();
        assert!(report.valid, "errors: {:?}", report.errors);
    }

    #[test]
    fn example_codex_adapter_validates() {
        let report =
            validate_adapter_manifest(Path::new("specs/adapters/codex-v1-md.json")).unwrap();
        assert!(report.valid, "errors: {:?}", report.errors);
    }

    #[test]
    fn example_claude_code_adapter_validates() {
        let report =
            validate_adapter_manifest(Path::new("specs/adapters/claude-code-v1-md.json")).unwrap();
        assert!(report.valid, "errors: {:?}", report.errors);
    }

    #[test]
    fn missing_forme_file_is_rejected() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad-adapter.json");
        fs::write(
            &path,
            r#"{
  "schema_version": "0.1.0",
  "adapter_id": "bad-adapter",
  "subject": "broken test adapter",
  "source": "openprose/prose",
  "sourceUrl": "https://github.com/openprose/prose.git",
  "spec_ref": "openprose/prose@HEAD",
  "skill_root": "skills/open-prose",
  "supported_program_formats": ["v1-multi-service"],
  "phases": {
    "wire-v1": {
      "channels": [
        {
          "name": "initial-user",
          "role": "user",
          "files": ["prose.md"]
        }
      ],
      "attachments": [
        {
          "kind": "program",
          "channel": "initial-user",
          "label": "target_program"
        }
      ]
    },
    "execute-v1": {
      "channels": [
        {
          "name": "initial-user",
          "role": "user",
          "files": ["prose.md", "state/filesystem.md"]
        }
      ],
      "attachments": [
        {
          "kind": "manifest",
          "channel": "initial-user",
          "label": "wired_manifest"
        }
      ]
    },
    "subagent-v1": {
      "channels": [
        {
          "name": "initial-user",
          "role": "user",
          "files": ["primitives/session.md"]
        }
      ],
      "attachments": [
        { "kind": "service-definition", "channel": "initial-user", "label": "service_definition" },
        { "kind": "inputs", "channel": "initial-user", "label": "input_bindings" },
        { "kind": "workspace", "channel": "initial-user", "label": "workspace_path" },
        { "kind": "output-instructions", "channel": "initial-user", "label": "output_contract" }
      ]
    }
  },
  "notes": "broken on purpose"
}"#,
        )
        .unwrap();

        let report = validate_adapter_manifest(&path).unwrap();
        assert!(!report.valid);
        assert!(report.errors.iter().any(|line| line.contains("forme.md")));
    }

    #[test]
    fn non_openprose_source_is_rejected() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad-source.json");
        write_modified_example(
            &path,
            "\"source\": \"openprose/prose\"",
            "\"source\": \"someone-else/prose\"",
        );

        let report = validate_adapter_manifest(&path).unwrap();
        assert!(!report.valid);
        assert!(
            report
                .errors
                .iter()
                .any(|line| line.contains("pinned spec repo"))
        );
    }

    #[test]
    fn non_canonical_source_url_is_rejected() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad-source-url.json");
        write_modified_example(
            &path,
            "\"sourceUrl\": \"https://github.com/openprose/prose.git\"",
            "\"sourceUrl\": \"https://example.com/openprose/prose.git\"",
        );

        let report = validate_adapter_manifest(&path).unwrap();
        assert!(!report.valid);
        assert!(
            report
                .errors
                .iter()
                .any(|line| line.contains("pinned OpenProse sourceUrl"))
        );
    }
}
