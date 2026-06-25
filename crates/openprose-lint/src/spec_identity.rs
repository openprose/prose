use crate::spec_source::SpecSource;
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

const SUPPORTED_SCHEMA: &str = "openprose.spec-identity";
const SUPPORTED_SCHEMA_VERSION: u32 = 1;
const BASE_REQUIRED_ARTIFACTS: &[&str] =
    &["SKILL.md", "contract-markdown.md", "forme.md", "prose.md"];
const RUNTIME_CONTRACT_2_ARTIFACTS: &[&str] = &["prosescript.md", "responsibility-runtime.md"];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SpecIdentityManifest {
    pub schema: String,
    pub schema_version: u32,
    pub spec_id: String,
    pub source: SourceIdentity,
    pub skill: SkillIdentity,
    #[serde(default)]
    pub packages: BTreeMap<String, String>,
    pub artifacts: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SourceIdentity {
    pub repo: String,
    #[serde(default)]
    pub commit: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SkillIdentity {
    pub version: String,
    pub runtime_contract: u32,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SpecIdentityOptions {
    pub root: Option<PathBuf>,
    pub git_repo: Option<PathBuf>,
    pub expected_repo: Option<String>,
    pub expected_commit: Option<String>,
    pub package_jsons: Vec<PathBuf>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SpecIdentityReport {
    pub valid: bool,
    pub manifest: PathBuf,
    pub root: PathBuf,
    pub checks: Vec<SpecIdentityCheck>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub source_capabilities: Vec<SpecSourceCapability>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SpecIdentityCheck {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SpecSourceCapability {
    pub id: String,
    pub path: String,
    pub present: bool,
    pub detail: String,
}

#[derive(Clone, Debug, Deserialize)]
struct PackageJson {
    name: String,
    version: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct SkillDocumentIdentity {
    version: Option<String>,
    runtime_contract: Option<u32>,
}

impl SpecIdentityReport {
    fn new(manifest: PathBuf, root: PathBuf) -> Self {
        Self {
            valid: true,
            manifest,
            root,
            checks: Vec::new(),
            source_capabilities: Vec::new(),
        }
    }

    fn check(&mut self, name: impl Into<String>, passed: bool, detail: impl Into<String>) {
        if !passed {
            self.valid = false;
        }
        self.checks.push(SpecIdentityCheck {
            name: name.into(),
            passed,
            detail: detail.into(),
        });
    }

    fn source_capability(
        &mut self,
        id: impl Into<String>,
        path: impl Into<String>,
        present: bool,
        detail: impl Into<String>,
    ) {
        self.source_capabilities.push(SpecSourceCapability {
            id: id.into(),
            path: path.into(),
            present,
            detail: detail.into(),
        });
    }
}

pub fn verify_spec_identity(
    manifest_path: &Path,
    options: SpecIdentityOptions,
) -> Result<SpecIdentityReport> {
    let manifest_path = manifest_path
        .canonicalize()
        .with_context(|| format!("canonicalize {}", manifest_path.display()))?;
    let root = match &options.root {
        Some(root) => root
            .canonicalize()
            .with_context(|| format!("canonicalize {}", root.display()))?,
        None => manifest_path
            .parent()
            .expect("canonicalized manifest has a parent")
            .to_path_buf(),
    };
    let manifest = load_manifest(&manifest_path)?;
    let mut report = SpecIdentityReport::new(manifest_path, root.clone());

    validate_manifest_shape(&manifest, &mut report);
    verify_source_repo(&manifest, &options, &mut report);
    verify_required_artifacts(&manifest, &mut report);
    verify_artifacts(&manifest, &root, &mut report);
    verify_skill_document(&manifest, &root, &mut report);
    let git_toplevel = verify_git_root(&root, &options, &mut report)?;
    verify_expected_commit(&manifest, &options, &mut report)?;
    verify_git_artifacts(
        &manifest,
        &root,
        git_toplevel.as_deref(),
        &options,
        &mut report,
    )?;
    verify_packages(&manifest, &options.package_jsons, &mut report)?;

    Ok(report)
}

pub fn verify_spec_source_identity(
    spec: &SpecSource,
    repo_root: &Path,
) -> Result<SpecIdentityReport> {
    let registry_path = repo_root.join("specs").join(format!("{}.json", spec.id));
    let root = spec
        .resolve_root(repo_root)
        .canonicalize()
        .with_context(|| format!("canonicalize spec root for {}", spec.id))?;
    let mut report = SpecIdentityReport::new(registry_path, root.clone());

    report.check(
        "identity.mode",
        true,
        if spec.uses_package_checkout(repo_root) {
            "registry-synthesized package snapshot identity; no upstream version_manifest configured"
        } else {
            "registry-synthesized source identity; no upstream version_manifest configured"
        },
    );
    report.check(
        "source.repo.expected",
        !spec.repo.trim().is_empty(),
        format!("registry={}", spec.repo),
    );
    discover_registry_source_capabilities(spec, &root, &mut report);

    if spec.uses_package_checkout(repo_root) {
        if let Some(package_path) = &spec.package_source_path {
            report.check(
                "source.package_snapshot",
                true,
                format!("package_source_path={package_path}"),
            );
        }
        verify_registry_live_artifacts(spec, &root, &mut report);
        return Ok(report);
    }

    let git_repo = spec.primary_checkout(repo_root);
    let toplevel = git_toplevel(&git_repo)?;
    report.check(
        "git.root",
        root.starts_with(&toplevel),
        format!(
            "root={}, git_toplevel={}",
            root.display(),
            toplevel.display()
        ),
    );

    let actual_head = git_head(&git_repo)?;
    let expected_commit = effective_registry_commit(spec, &actual_head);
    report.check(
        "git.head",
        actual_head == expected_commit,
        format!(
            "git HEAD={actual_head}, expected={}{}",
            spec.pinned_commit,
            if spec.pinned_commit == "HEAD" {
                format!(" (resolved {expected_commit})")
            } else {
                String::new()
            }
        ),
    );

    if !root.starts_with(&toplevel) {
        return Ok(report);
    }
    let root_relative = root
        .strip_prefix(&toplevel)
        .with_context(|| format!("strip git root prefix from {}", root.display()))?;

    for relative in registry_identity_artifacts(spec) {
        let artifact_name = format!("artifact:{relative}");
        let path = match checked_artifact_path(&root, &relative) {
            Ok(path) => path,
            Err(error) => {
                report.check(artifact_name, false, error.to_string());
                continue;
            }
        };
        let live_digest = match artifact_digest(&path) {
            Ok(digest) => {
                report.check(
                    artifact_name,
                    true,
                    format!("registry artifact digest {digest}"),
                );
                digest
            }
            Err(error) => {
                report.check(artifact_name, false, error.to_string());
                continue;
            }
        };

        let git_name = format!("git.artifact:{relative}");
        let worktree_relative = match safe_join(root_relative, &relative) {
            Ok(path) => path,
            Err(error) => {
                report.check(git_name, false, error.to_string());
                continue;
            }
        };
        let git_path = match git_tree_path(&worktree_relative) {
            Ok(path) => path,
            Err(error) => {
                report.check(git_name, false, error.to_string());
                continue;
            }
        };
        match git_blob_digest(&git_repo, &expected_commit, &git_path) {
            Ok(actual) => report.check(
                git_name,
                digest_matches(&actual, &live_digest),
                format!(
                    "{}:{} expected {}, got {}",
                    expected_commit, git_path, live_digest, actual
                ),
            ),
            Err(error) => report.check(git_name, false, error.to_string()),
        }
    }

    Ok(report)
}

fn verify_registry_live_artifacts(spec: &SpecSource, root: &Path, report: &mut SpecIdentityReport) {
    for relative in registry_identity_artifacts(spec) {
        let artifact_name = format!("artifact:{relative}");
        let path = match checked_artifact_path(root, &relative) {
            Ok(path) => path,
            Err(error) => {
                report.check(artifact_name, false, error.to_string());
                continue;
            }
        };
        match artifact_digest(&path) {
            Ok(digest) => report.check(
                artifact_name,
                true,
                format!("package snapshot artifact digest {digest}"),
            ),
            Err(error) => report.check(artifact_name, false, error.to_string()),
        }
    }
}

fn effective_registry_commit(spec: &SpecSource, actual_head: &str) -> String {
    if spec.pinned_commit == "HEAD" {
        actual_head.to_string()
    } else {
        spec.pinned_commit.clone()
    }
}

fn registry_identity_artifacts(spec: &SpecSource) -> Vec<String> {
    let mut artifacts = BTreeSet::new();
    artifacts.insert("SKILL.md".to_string());
    artifacts.insert(spec.paths.vm_spec.clone());
    if let Some(path) = &spec.paths.compiler_spec {
        artifacts.insert(path.clone());
    }
    if let Some(path) = &spec.paths.forme_spec {
        artifacts.insert(path.clone());
    }
    if let Some(path) = &spec.paths.deps_spec {
        artifacts.insert(path.clone());
    }
    artifacts.into_iter().collect()
}

fn discover_registry_source_capabilities(
    spec: &SpecSource,
    root: &Path,
    report: &mut SpecIdentityReport,
) {
    let mut capabilities = vec![
        ("skill", "SKILL.md".to_string()),
        ("vm", spec.paths.vm_spec.clone()),
    ];
    if let Some(path) = &spec.paths.compiler_spec {
        capabilities.push(("compiler", path.clone()));
    } else {
        capabilities.push(("legacy_v0_compiler", "v0/compiler.md".to_string()));
    }
    if let Some(path) = &spec.paths.forme_spec {
        capabilities.push(("forme", path.clone()));
    }
    if let Some(path) = &spec.paths.deps_spec {
        capabilities.push(("deps", path.clone()));
    }
    capabilities.extend([
        ("contract_markdown", "contract-markdown.md".to_string()),
        ("prosescript", "prosescript.md".to_string()),
        (
            "responsibility_runtime",
            "responsibility-runtime.md".to_string(),
        ),
        ("reactor", "reactor.md".to_string()),
        ("examples", "examples".to_string()),
    ]);

    for (id, relative) in capabilities {
        let (present, detail) = probe_source_capability(root, &relative);
        report.source_capability(id, relative, present, detail);
    }
}

fn probe_source_capability(root: &Path, relative: &str) -> (bool, String) {
    let joined = match safe_join(root, relative) {
        Ok(path) => path,
        Err(error) => return (false, error.to_string()),
    };

    let mut current = root.to_path_buf();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => {
                current.push(part);
                let metadata = match fs::symlink_metadata(&current) {
                    Ok(metadata) => metadata,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        return (false, format!("missing {}", joined.display()));
                    }
                    Err(error) => return (false, format!("stat {}: {error}", current.display())),
                };
                if metadata.file_type().is_symlink() {
                    return (
                        false,
                        format!(
                            "capability path must not traverse a symlink: {}",
                            current.display()
                        ),
                    );
                }
            }
            Component::CurDir => {}
            _ => return (false, format!("capability path escapes root: {relative}")),
        }
    }

    let canonical = match joined.canonicalize() {
        Ok(path) => path,
        Err(error) => return (false, format!("canonicalize {}: {error}", joined.display())),
    };
    if !canonical.starts_with(root) {
        return (
            false,
            format!(
                "capability path resolves outside root: {} -> {}",
                joined.display(),
                canonical.display()
            ),
        );
    }

    let metadata = match fs::metadata(&joined) {
        Ok(metadata) => metadata,
        Err(error) => return (false, format!("stat {}: {error}", joined.display())),
    };
    let kind = if metadata.is_file() {
        "file"
    } else if metadata.is_dir() {
        "directory"
    } else {
        "special"
    };
    (true, format!("{kind} {}", joined.display()))
}

pub fn artifact_digest(path: &Path) -> Result<String> {
    let bytes = read_artifact_bytes(path)?;
    let digest = Sha256::digest(&bytes);
    Ok(format!("sha256:{digest:x}"))
}

fn digest_matches(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let diff = left
        .bytes()
        .zip(right.bytes())
        .fold(0_u8, |acc, (left, right)| acc | (left ^ right));
    matches!(diff, 0)
}

fn read_artifact_bytes(path: &Path) -> Result<Vec<u8>> {
    let metadata =
        fs::symlink_metadata(path).with_context(|| format!("stat {}", path.display()))?;
    if metadata.file_type().is_symlink() {
        bail!("artifact path must not be a symlink: {}", path.display());
    }
    fs::read(path).with_context(|| format!("read {}", path.display()))
}

fn load_manifest(path: &Path) -> Result<SpecIdentityManifest> {
    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let manifest: SpecIdentityManifest =
        serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))?;
    Ok(manifest)
}

fn validate_manifest_shape(manifest: &SpecIdentityManifest, report: &mut SpecIdentityReport) {
    report.check(
        "schema",
        manifest.schema == SUPPORTED_SCHEMA,
        format!("expected {SUPPORTED_SCHEMA}, got {}", manifest.schema),
    );
    report.check(
        "schema_version",
        manifest.schema_version == SUPPORTED_SCHEMA_VERSION,
        format!(
            "expected {}, got {}",
            SUPPORTED_SCHEMA_VERSION, manifest.schema_version
        ),
    );
    report.check(
        "spec_id",
        !manifest.spec_id.trim().is_empty(),
        format!("spec_id={}", manifest.spec_id),
    );
    report.check(
        "source.repo",
        !manifest.source.repo.trim().is_empty(),
        format!("source.repo={}", manifest.source.repo),
    );
    report.check(
        "skill.version",
        !manifest.skill.version.trim().is_empty(),
        format!("skill.version={}", manifest.skill.version),
    );
    report.check(
        "skill.runtime_contract",
        supported_runtime_contract(manifest.skill.runtime_contract),
        format!(
            "runtime_contract={} (supported: 1, 2)",
            manifest.skill.runtime_contract
        ),
    );
    report.check(
        "artifacts",
        !manifest.artifacts.is_empty(),
        format!("{} artifact(s)", manifest.artifacts.len()),
    );
}

fn verify_source_repo(
    manifest: &SpecIdentityManifest,
    options: &SpecIdentityOptions,
    report: &mut SpecIdentityReport,
) {
    if let Some(expected) = &options.expected_repo {
        report.check(
            "source.repo.expected",
            manifest.source.repo == *expected,
            format!("manifest={}, expected={expected}", manifest.source.repo),
        );
    } else {
        report.check(
            "source.repo.expected",
            false,
            "spec identity requires --expect-repo or spec registry repo identity",
        );
    }
}

fn verify_required_artifacts(manifest: &SpecIdentityManifest, report: &mut SpecIdentityReport) {
    for required in required_artifacts(manifest) {
        report.check(
            format!("artifact.required:{required}"),
            manifest.artifacts.contains_key(required),
            format!("required artifact {required}"),
        );
    }
}

fn required_artifacts(manifest: &SpecIdentityManifest) -> Vec<&'static str> {
    let mut required = BASE_REQUIRED_ARTIFACTS.to_vec();
    match manifest.skill.runtime_contract {
        1 => {}
        2 => required.extend_from_slice(RUNTIME_CONTRACT_2_ARTIFACTS),
        _ => {}
    }
    required
}

fn supported_runtime_contract(runtime_contract: u32) -> bool {
    matches!(runtime_contract, 1 | 2)
}

fn verify_artifacts(manifest: &SpecIdentityManifest, root: &Path, report: &mut SpecIdentityReport) {
    for (relative, expected) in &manifest.artifacts {
        let name = format!("artifact:{relative}");
        let path = match checked_artifact_path(root, relative) {
            Ok(path) => path,
            Err(error) => {
                report.check(name, false, error.to_string());
                continue;
            }
        };
        match artifact_digest(&path) {
            Ok(actual) => report.check(
                name,
                digest_matches(&actual, expected),
                format!("expected {expected}, got {actual}"),
            ),
            Err(error) => report.check(name, false, error.to_string()),
        }
    }
}

fn checked_artifact_path(root: &Path, relative: &str) -> Result<PathBuf> {
    let joined = safe_join(root, relative)?;
    let mut current = root.to_path_buf();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => {
                current.push(part);
                let metadata = fs::symlink_metadata(&current)
                    .with_context(|| format!("stat {}", current.display()))?;
                if metadata.file_type().is_symlink() {
                    bail!(
                        "artifact path must not traverse a symlink: {}",
                        current.display()
                    );
                }
            }
            Component::CurDir => {}
            _ => bail!("artifact path escapes root: {relative}"),
        }
    }

    let canonical = joined
        .canonicalize()
        .with_context(|| format!("canonicalize {}", joined.display()))?;
    if !canonical.starts_with(root) {
        bail!(
            "artifact path resolves outside root: {} -> {}",
            joined.display(),
            canonical.display()
        );
    }

    let metadata = fs::metadata(&joined).with_context(|| format!("stat {}", joined.display()))?;
    if !metadata.is_file() {
        bail!("artifact path must be a regular file: {}", joined.display());
    }

    Ok(joined)
}

fn verify_skill_document(
    manifest: &SpecIdentityManifest,
    root: &Path,
    report: &mut SpecIdentityReport,
) {
    if !manifest.artifacts.contains_key("SKILL.md") {
        report.check(
            "skill.document",
            false,
            "SKILL.md artifact is required to verify skill metadata",
        );
        return;
    }

    let path = match checked_artifact_path(root, "SKILL.md") {
        Ok(path) => path,
        Err(error) => {
            report.check("skill.document", false, error.to_string());
            return;
        }
    };
    match load_skill_document_identity(&path) {
        Ok(identity) => {
            let actual_version = identity.version.unwrap_or_default();
            report.check(
                "skill.version.document",
                actual_version == manifest.skill.version,
                format!(
                    "manifest={}, SKILL.md={actual_version}",
                    manifest.skill.version
                ),
            );
            let actual_contract = identity.runtime_contract.unwrap_or_default();
            report.check(
                "skill.runtime_contract.document",
                actual_contract == manifest.skill.runtime_contract,
                format!(
                    "manifest={}, SKILL.md={actual_contract}",
                    manifest.skill.runtime_contract
                ),
            );
        }
        Err(error) => report.check("skill.document", false, error.to_string()),
    }
}

fn verify_git_root(
    root: &Path,
    options: &SpecIdentityOptions,
    report: &mut SpecIdentityReport,
) -> Result<Option<PathBuf>> {
    let Some(repo) = &options.git_repo else {
        return Ok(None);
    };

    let toplevel = git_toplevel(repo)?;
    report.check(
        "git.root",
        root.starts_with(&toplevel),
        format!(
            "root={}, git_toplevel={}",
            root.display(),
            toplevel.display()
        ),
    );
    Ok(Some(toplevel))
}

fn verify_expected_commit(
    manifest: &SpecIdentityManifest,
    options: &SpecIdentityOptions,
    report: &mut SpecIdentityReport,
) -> Result<()> {
    if let Some(expected) = &options.expected_commit {
        if options.git_repo.is_none() {
            report.check(
                "git.repo",
                false,
                "--expect-commit requires --git-repo so the commit can be checked",
            );
        }
        if let Some(manifest_commit) = &manifest.source.commit {
            report.check(
                "source.commit",
                manifest_commit == expected,
                format!("manifest={manifest_commit}, expected={expected}"),
            );
        } else {
            report.check(
                "source.commit",
                true,
                format!("manifest omitted commit; external expected commit={expected}"),
            );
        }
    }

    if let Some(repo) = &options.git_repo {
        let actual = git_head(repo)?;
        let expected = options
            .expected_commit
            .as_deref()
            .or(manifest.source.commit.as_deref());
        match expected {
            Some(expected) => report.check(
                "git.head",
                actual == expected,
                format!("git HEAD={actual}, expected={expected}"),
            ),
            None => report.check(
                "git.head",
                true,
                format!("git HEAD={actual}; no expected commit supplied"),
            ),
        }
    }

    Ok(())
}

fn verify_git_artifacts(
    manifest: &SpecIdentityManifest,
    root: &Path,
    git_toplevel: Option<&Path>,
    options: &SpecIdentityOptions,
    report: &mut SpecIdentityReport,
) -> Result<()> {
    let Some(repo) = &options.git_repo else {
        return Ok(());
    };
    let expected_commit = options
        .expected_commit
        .as_deref()
        .or(manifest.source.commit.as_deref());
    let Some(expected_commit) = expected_commit else {
        report.check(
            "git.commit",
            false,
            "git artifact proof requires --expect-commit or source.commit",
        );
        return Ok(());
    };
    let Some(toplevel) = git_toplevel else {
        return Ok(());
    };
    if !root.starts_with(toplevel) {
        return Ok(());
    }

    let root_relative = root
        .strip_prefix(toplevel)
        .with_context(|| format!("strip git root prefix from {}", root.display()))?;
    for (relative, expected) in &manifest.artifacts {
        let name = format!("git.artifact:{relative}");
        let Ok(worktree_relative) = safe_join(root_relative, relative) else {
            report.check(name, false, "artifact path escapes root");
            continue;
        };
        let git_path = match git_tree_path(&worktree_relative) {
            Ok(path) => path,
            Err(error) => {
                report.check(name, false, error.to_string());
                continue;
            }
        };
        match git_blob_digest(repo, expected_commit, &git_path) {
            Ok(actual) => report.check(
                name,
                digest_matches(&actual, expected),
                format!("{expected_commit}:{git_path} expected {expected}, got {actual}"),
            ),
            Err(error) => report.check(name, false, error.to_string()),
        }
    }
    Ok(())
}

fn verify_packages(
    manifest: &SpecIdentityManifest,
    package_jsons: &[PathBuf],
    report: &mut SpecIdentityReport,
) -> Result<()> {
    let mut seen = BTreeMap::new();
    for path in package_jsons {
        let source =
            fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let package: PackageJson =
            serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))?;
        seen.insert(package.name.clone(), package.version.clone());
        let name = format!("package:{}@{}", package.name, package.version);
        match manifest.packages.get(&package.name) {
            Some(expected) => report.check(
                name,
                expected == &package.version,
                format!("manifest={expected}, package.json={}", package.version),
            ),
            None => report.check(name, false, "package missing from manifest"),
        }
    }
    for (name, expected) in &manifest.packages {
        if !seen.contains_key(name) {
            report.check(
                format!("package:{name}"),
                false,
                format!(
                    "manifest declares {name}@{expected}, but no matching package.json was supplied"
                ),
            );
        }
    }
    Ok(())
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf> {
    let path = Path::new(relative);
    if path.is_absolute() {
        bail!("artifact path must be relative: {relative}");
    }
    let mut joined = root.to_path_buf();
    for component in path.components() {
        match component {
            Component::Normal(part) => joined.push(part),
            Component::CurDir => {}
            _ => bail!("artifact path escapes root: {relative}"),
        }
    }
    Ok(joined)
}

fn load_skill_document_identity(path: &Path) -> Result<SkillDocumentIdentity> {
    let source = String::from_utf8(read_artifact_bytes(path)?)
        .with_context(|| format!("{} is not UTF-8", path.display()))?;
    let mut lines = source.lines();
    if lines.next().map(str::trim) != Some("---") {
        bail!("SKILL.md is missing YAML frontmatter");
    }

    let mut identity = SkillDocumentIdentity::default();
    for line in lines {
        let line = line.trim();
        if line == "---" {
            return Ok(identity);
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        match key.trim() {
            "version" => identity.version = Some(clean_frontmatter_scalar(value)),
            "runtime_contract" => {
                let value = clean_frontmatter_scalar(value);
                identity.runtime_contract = Some(
                    value
                        .parse()
                        .with_context(|| format!("parse runtime_contract={value}"))?,
                );
            }
            _ => {}
        }
    }
    bail!("SKILL.md frontmatter is not closed")
}

fn clean_frontmatter_scalar(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

fn git_toplevel(repo: &Path) -> Result<PathBuf> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .arg("rev-parse")
        .arg("--show-toplevel")
        .output()
        .with_context(|| format!("run git rev-parse --show-toplevel in {}", repo.display()))?;
    if !output.status.success() {
        bail!(
            "git rev-parse --show-toplevel failed in {}: {}",
            repo.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let path = String::from_utf8(output.stdout)
        .context("git output was not UTF-8")?
        .trim()
        .to_string();
    PathBuf::from(path)
        .canonicalize()
        .with_context(|| format!("canonicalize git toplevel for {}", repo.display()))
}

fn git_tree_path(path: &Path) -> Result<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let Some(part) = part.to_str() else {
                    bail!("git path component is not UTF-8: {}", path.display());
                };
                parts.push(part);
            }
            Component::CurDir => {}
            _ => bail!("git path escapes repository: {}", path.display()),
        }
    }
    Ok(parts.join("/"))
}

fn git_blob_digest(repo: &Path, commit: &str, path: &str) -> Result<String> {
    let spec = format!("{commit}:{path}");
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .arg("show")
        .arg(&spec)
        .output()
        .with_context(|| format!("run git show {spec} in {}", repo.display()))?;
    if !output.status.success() {
        bail!(
            "git show failed for {} in {}: {}",
            spec,
            repo.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let digest = Sha256::digest(&output.stdout);
    Ok(format!("sha256:{digest:x}"))
}

fn git_head(repo: &Path) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .arg("rev-parse")
        .arg("HEAD")
        .output()
        .with_context(|| format!("run git rev-parse in {}", repo.display()))?;
    if !output.status.success() {
        bail!(
            "git rev-parse failed in {}: {}",
            repo.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(String::from_utf8(output.stdout)
        .context("git output was not UTF-8")?
        .trim()
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        SpecIdentityOptions, artifact_digest, verify_spec_identity, verify_spec_source_identity,
    };
    use crate::spec_source::{SpecPaths, SpecSource};
    use serde_json::json;
    use std::fs;
    use std::os::unix::fs as unix_fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use tempfile::tempdir;

    fn write_skill(root: &Path, contract_text: &str) {
        write_skill_with_metadata(root, "0.15.0", 2, contract_text);
    }

    fn write_registry_skill(root: &Path) {
        fs::create_dir_all(root.join("v0")).unwrap();
        fs::write(
            root.join("SKILL.md"),
            "---\nname: open-prose\ndescription: registry source\n---\n",
        )
        .unwrap();
        fs::write(root.join("prose.md"), "Prose VM\n").unwrap();
        fs::write(root.join("forme.md"), "Forme\n").unwrap();
        fs::write(root.join("deps.md"), "Deps\n").unwrap();
        fs::write(root.join("v0/compiler.md"), "Compiler\n").unwrap();
    }

    fn write_registry_skill_without_compiler(root: &Path) {
        fs::create_dir_all(root).unwrap();
        fs::write(
            root.join("SKILL.md"),
            "---\nname: open-prose\ndescription: registry source\n---\n",
        )
        .unwrap();
        fs::write(root.join("prose.md"), "Prose VM\n").unwrap();
        fs::write(root.join("forme.md"), "Forme\n").unwrap();
        fs::write(root.join("deps.md"), "Deps\n").unwrap();
    }

    fn write_skill_with_metadata(
        root: &Path,
        version: &str,
        runtime_contract: u32,
        contract_text: &str,
    ) {
        fs::create_dir_all(root).unwrap();
        fs::write(
            root.join("SKILL.md"),
            format!(
                "---\nname: open-prose\nversion: {version}\nruntime_contract: {runtime_contract}\n---\n"
            ),
        )
        .unwrap();
        fs::write(root.join("contract-markdown.md"), contract_text).unwrap();
        fs::write(root.join("prose.md"), "Prose VM\n").unwrap();
        fs::write(root.join("forme.md"), "Forme\n").unwrap();
        fs::write(root.join("prosescript.md"), "ProseScript\n").unwrap();
        fs::write(root.join("reactor.md"), "Reactor\n").unwrap();
        fs::write(
            root.join("responsibility-runtime.md"),
            "Responsibility Runtime\n",
        )
        .unwrap();
    }

    fn write_manifest(root: &Path, package_version: &str) -> PathBuf {
        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.15.0",
                "runtime_contract": 2
            },
            "packages": {
                "@openprose/reactor": package_version
            },
            "artifacts": {
                "SKILL.md": artifact_digest(&root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&root.join("contract-markdown.md")).unwrap(),
                "prose.md": artifact_digest(&root.join("prose.md")).unwrap(),
                "forme.md": artifact_digest(&root.join("forme.md")).unwrap(),
                "prosescript.md": artifact_digest(&root.join("prosescript.md")).unwrap(),
                "reactor.md": artifact_digest(&root.join("reactor.md")).unwrap(),
                "responsibility-runtime.md": artifact_digest(&root.join("responsibility-runtime.md")).unwrap()
            }
        });
        let path = root.join("spec-version.json");
        fs::write(&path, serde_json::to_string_pretty(&manifest).unwrap()).unwrap();
        path
    }

    fn write_manifest_without_packages(root: &Path) -> PathBuf {
        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.15.0",
                "runtime_contract": 2
            },
            "packages": {},
            "artifacts": {
                "SKILL.md": artifact_digest(&root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&root.join("contract-markdown.md")).unwrap(),
                "prose.md": artifact_digest(&root.join("prose.md")).unwrap(),
                "forme.md": artifact_digest(&root.join("forme.md")).unwrap(),
                "prosescript.md": artifact_digest(&root.join("prosescript.md")).unwrap(),
                "reactor.md": artifact_digest(&root.join("reactor.md")).unwrap(),
                "responsibility-runtime.md": artifact_digest(&root.join("responsibility-runtime.md")).unwrap()
            }
        });
        let path = root.join("spec-version.json");
        fs::write(&path, serde_json::to_string_pretty(&manifest).unwrap()).unwrap();
        path
    }

    fn git(repo: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout).unwrap().trim().to_string()
    }

    fn commit(repo: &Path, message: &str) -> String {
        git(repo, &["add", "."]);
        git(repo, &["commit", "-m", message]);
        git(repo, &["rev-parse", "HEAD"])
    }

    fn registry_spec(commit: String) -> SpecSource {
        SpecSource {
            id: "openprose".to_string(),
            repo: "openprose/prose".to_string(),
            source_path: "reference/openprose-prose".to_string(),
            package_source_path: None,
            pinned_commit: commit,
            paths: SpecPaths {
                root: "skills/open-prose".to_string(),
                compiler_spec: Some("v0/compiler.md".to_string()),
                vm_spec: "prose.md".to_string(),
                forme_spec: Some("forme.md".to_string()),
                deps_spec: Some("deps.md".to_string()),
                version_manifest: None,
                conformance_manifest: None,
            },
        }
    }

    fn registry_spec_without_compiler(commit: String) -> SpecSource {
        SpecSource {
            id: "openprose".to_string(),
            repo: "openprose/prose".to_string(),
            source_path: "reference/openprose-prose".to_string(),
            package_source_path: None,
            pinned_commit: commit,
            paths: SpecPaths {
                root: "skills/open-prose".to_string(),
                compiler_spec: None,
                vm_spec: "prose.md".to_string(),
                forme_spec: Some("forme.md".to_string()),
                deps_spec: Some("deps.md".to_string()),
                version_manifest: None,
                conformance_manifest: None,
            },
        }
    }

    fn registry_spec_with_package_snapshot() -> SpecSource {
        SpecSource {
            id: "openprose".to_string(),
            repo: "openprose/prose".to_string(),
            source_path: "missing-parent-checkout".to_string(),
            package_source_path: Some("spec-snapshot/openprose".to_string()),
            pinned_commit: "HEAD".to_string(),
            paths: SpecPaths {
                root: "skills/open-prose".to_string(),
                compiler_spec: Some("compiler/index.prose.md".to_string()),
                vm_spec: "prose.md".to_string(),
                forme_spec: Some("forme.md".to_string()),
                deps_spec: Some("deps.md".to_string()),
                version_manifest: None,
                conformance_manifest: None,
            },
        }
    }

    fn write_package_snapshot_skill(root: &Path) {
        fs::create_dir_all(root.join("compiler")).unwrap();
        fs::write(
            root.join("SKILL.md"),
            "---\nname: open-prose\ndescription: package snapshot\n---\n",
        )
        .unwrap();
        fs::write(root.join("prose.md"), "Prose VM\n").unwrap();
        fs::write(root.join("forme.md"), "Forme\n").unwrap();
        fs::write(root.join("deps.md"), "Deps\n").unwrap();
        fs::write(root.join("compiler/index.prose.md"), "Compiler\n").unwrap();
    }

    #[test]
    fn verifies_two_pinned_git_commits_without_manifest_self_reference() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("prose");
        let skill_root = repo.join("skills/open-prose");
        fs::create_dir_all(&skill_root).unwrap();
        git(dir.path(), &["init", "prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);

        write_skill(&skill_root, "contract one\n");
        let manifest_a = write_manifest_without_packages(&skill_root);
        let commit_a = commit(&repo, "contract one");

        let report = verify_spec_identity(
            &manifest_a,
            SpecIdentityOptions {
                root: Some(skill_root.clone()),
                git_repo: Some(repo.clone()),
                expected_repo: Some("openprose/prose".to_string()),
                expected_commit: Some(commit_a.clone()),
                package_jsons: vec![],
            },
        )
        .unwrap();
        assert!(report.valid, "{report:#?}");

        write_skill(&skill_root, "contract two\n");
        let manifest_b = write_manifest_without_packages(&skill_root);
        let commit_b = commit(&repo, "contract two");
        let report = verify_spec_identity(
            &manifest_b,
            SpecIdentityOptions {
                root: Some(skill_root.clone()),
                git_repo: Some(repo.clone()),
                expected_repo: Some("openprose/prose".to_string()),
                expected_commit: Some(commit_b),
                package_jsons: vec![],
            },
        )
        .unwrap();
        assert!(report.valid, "{report:#?}");

        let report = verify_spec_identity(
            &manifest_b,
            SpecIdentityOptions {
                root: Some(skill_root),
                git_repo: Some(repo),
                expected_repo: Some("openprose/prose".to_string()),
                expected_commit: Some(commit_a),
                package_jsons: vec![],
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "git.head" && !check.passed)
        );
    }

    #[test]
    fn verifies_registry_identity_from_package_snapshot_without_git_checkout() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("spec-snapshot/openprose/skills/open-prose");
        write_package_snapshot_skill(&skill_root);
        let spec = registry_spec_with_package_snapshot();

        let report = verify_spec_source_identity(&spec, dir.path()).unwrap();
        assert!(report.valid, "{report:#?}");
        assert!(report.checks.iter().any(|check| {
            check.name == "identity.mode"
                && check.passed
                && check.detail.contains("package snapshot")
        }));
        assert!(report.checks.iter().any(|check| {
            check.name == "source.package_snapshot"
                && check.passed
                && check.detail.contains("spec-snapshot/openprose")
        }));
        assert!(
            report
                .checks
                .iter()
                .any(|check| { check.name == "artifact:compiler/index.prose.md" && check.passed })
        );
        assert!(
            !report
                .checks
                .iter()
                .any(|check| check.name.starts_with("git."))
        );
    }

    #[test]
    fn verifies_registry_source_identity_without_upstream_manifest() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("reference/openprose-prose");
        let skill_root = repo.join("skills/open-prose");
        git(dir.path(), &["init", "reference/openprose-prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);
        write_registry_skill(&skill_root);
        let commit = commit(&repo, "registry source");
        let spec = registry_spec(commit);

        let report = verify_spec_source_identity(&spec, dir.path()).unwrap();
        assert!(report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "identity.mode" && check.passed)
        );
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "git.artifact:v0/compiler.md" && check.passed)
        );
        assert!(report.source_capabilities.iter().any(|capability| {
            capability.id == "compiler" && capability.path == "v0/compiler.md" && capability.present
        }));
        assert!(
            report
                .source_capabilities
                .iter()
                .any(|capability| { capability.id == "contract_markdown" && !capability.present })
        );
    }

    #[test]
    fn registry_source_identity_does_not_require_undeclared_compiler_artifact() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("reference/openprose-prose");
        let skill_root = repo.join("skills/open-prose");
        git(dir.path(), &["init", "reference/openprose-prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);
        write_registry_skill_without_compiler(&skill_root);
        let commit = commit(&repo, "registry source without compiler");
        let spec = registry_spec_without_compiler(commit);

        let report = verify_spec_source_identity(&spec, dir.path()).unwrap();
        assert!(report.valid, "{report:#?}");
        assert!(!report.checks.iter().any(|check| {
            check.name == "artifact:v0/compiler.md" || check.name == "git.artifact:v0/compiler.md"
        }));
        assert!(report.source_capabilities.iter().any(|capability| {
            capability.id == "legacy_v0_compiler"
                && capability.path == "v0/compiler.md"
                && !capability.present
        }));
    }

    #[test]
    fn rejects_dirty_registry_source_identity_bytes_not_present_in_pinned_commit() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("reference/openprose-prose");
        let skill_root = repo.join("skills/open-prose");
        git(dir.path(), &["init", "reference/openprose-prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);
        write_registry_skill(&skill_root);
        let commit = commit(&repo, "registry source");

        fs::write(skill_root.join("prose.md"), "dirty prose\n").unwrap();
        let spec = registry_spec(commit);
        let report = verify_spec_source_identity(&spec, dir.path()).unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "git.artifact:prose.md" && !check.passed)
        );
    }

    #[test]
    fn rejects_dirty_artifact_bytes_not_present_in_pinned_commit() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("prose");
        let skill_root = repo.join("skills/open-prose");
        fs::create_dir_all(&skill_root).unwrap();
        git(dir.path(), &["init", "prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);

        write_skill(&skill_root, "committed contract\n");
        let _committed_manifest = write_manifest_without_packages(&skill_root);
        let commit = commit(&repo, "committed contract");

        fs::write(skill_root.join("contract-markdown.md"), "dirty contract\n").unwrap();
        let dirty_manifest = write_manifest_without_packages(&skill_root);
        let report = verify_spec_identity(
            &dirty_manifest,
            SpecIdentityOptions {
                root: Some(skill_root),
                git_repo: Some(repo),
                expected_repo: Some("openprose/prose".to_string()),
                expected_commit: Some(commit),
                package_jsons: vec![],
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report.checks.iter().any(|check| {
                check.name == "git.artifact:contract-markdown.md" && !check.passed
            })
        );
    }

    #[test]
    fn verifies_package_json_versions_against_bundled_skill_manifest() {
        for version in ["0.3.0", "0.3.1"] {
            let dir = tempdir().unwrap();
            let package_root = dir.path().join("node_modules/@openprose/reactor");
            let skill_root = package_root.join("skill/open-prose");
            write_skill(&skill_root, "contract package\n");
            let manifest = write_manifest(&skill_root, version);
            fs::write(
                package_root.join("package.json"),
                serde_json::to_string_pretty(&json!({
                    "name": "@openprose/reactor",
                    "version": version
                }))
                .unwrap(),
            )
            .unwrap();

            let report = verify_spec_identity(
                &manifest,
                SpecIdentityOptions {
                    root: Some(skill_root),
                    expected_repo: Some("openprose/prose".to_string()),
                    package_jsons: vec![package_root.join("package.json")],
                    ..SpecIdentityOptions::default()
                },
            )
            .unwrap();
            assert!(report.valid, "{report:#?}");
        }
    }

    #[test]
    fn rejects_missing_expected_repo_identity_in_direct_mode() {
        let dir = tempdir().unwrap();
        let package_root = dir.path().join("node_modules/@openprose/reactor");
        let skill_root = package_root.join("skill/open-prose");
        write_skill(&skill_root, "contract package\n");
        let manifest = write_manifest(&skill_root, "0.3.1");
        fs::write(
            package_root.join("package.json"),
            serde_json::to_string_pretty(&json!({
                "name": "@openprose/reactor",
                "version": "0.3.1"
            }))
            .unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest,
            SpecIdentityOptions {
                root: Some(skill_root),
                package_jsons: vec![package_root.join("package.json")],
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| { check.name == "source.repo.expected" && !check.passed })
        );
    }

    #[test]
    fn rejects_tampered_artifacts_and_package_version_mismatch() {
        let dir = tempdir().unwrap();
        let package_root = dir.path().join("node_modules/@openprose/reactor");
        let skill_root = package_root.join("skill/open-prose");
        write_skill(&skill_root, "contract package\n");
        let manifest = write_manifest(&skill_root, "0.3.1");
        fs::write(skill_root.join("contract-markdown.md"), "tampered\n").unwrap();
        fs::write(
            package_root.join("package.json"),
            serde_json::to_string_pretty(&json!({
                "name": "@openprose/reactor",
                "version": "9.9.9"
            }))
            .unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                package_jsons: vec![package_root.join("package.json")],
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "artifact:contract-markdown.md" && !check.passed)
        );
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "package:@openprose/reactor@9.9.9" && !check.passed)
        );
    }

    #[test]
    fn rejects_artifact_root_outside_pinned_git_checkout() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("prose");
        let repo_skill_root = repo.join("skills/open-prose");
        let external_skill_root = dir.path().join("external/skills/open-prose");
        git(dir.path(), &["init", "prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);

        write_skill(&repo_skill_root, "contract from repo\n");
        let commit = commit(&repo, "contract from repo");
        write_skill(&external_skill_root, "contract outside repo\n");
        let external_manifest = write_manifest_without_packages(&external_skill_root);

        let report = verify_spec_identity(
            &external_manifest,
            SpecIdentityOptions {
                root: Some(external_skill_root),
                git_repo: Some(repo),
                expected_repo: Some("openprose/prose".to_string()),
                expected_commit: Some(commit),
                package_jsons: vec![],
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "git.root" && !check.passed)
        );
    }

    #[test]
    fn rejects_wrong_expected_repo_identity() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("prose");
        let skill_root = repo.join("skills/open-prose");
        git(dir.path(), &["init", "prose"]);
        git(&repo, &["config", "user.email", "agent@example.invalid"]);
        git(&repo, &["config", "user.name", "Agent"]);

        write_skill(&skill_root, "contract\n");
        let manifest = write_manifest_without_packages(&skill_root);
        let commit = commit(&repo, "contract");

        let report = verify_spec_identity(
            &manifest,
            SpecIdentityOptions {
                root: Some(skill_root),
                git_repo: Some(repo),
                expected_repo: Some("wrong/prose".to_string()),
                expected_commit: Some(commit),
                package_jsons: vec![],
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "source.repo.expected" && !check.passed)
        );
    }

    #[test]
    fn rejects_expected_commit_without_git_repo() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("skills/open-prose");
        write_skill(&skill_root, "contract\n");
        let manifest = write_manifest_without_packages(&skill_root);

        let report = verify_spec_identity(
            &manifest,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_commit: Some("0123456789abcdef".to_string()),
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "git.repo" && !check.passed)
        );
    }

    #[test]
    fn rejects_skill_document_metadata_mismatch() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("skills/open-prose");
        write_skill_with_metadata(&skill_root, "0.15.0", 2, "contract\n");
        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.16.0",
                "runtime_contract": 1
            },
            "packages": {},
            "artifacts": {
                "SKILL.md": artifact_digest(&skill_root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&skill_root.join("contract-markdown.md")).unwrap(),
                "prose.md": artifact_digest(&skill_root.join("prose.md")).unwrap(),
                "forme.md": artifact_digest(&skill_root.join("forme.md")).unwrap()
            }
        });
        let manifest_path = skill_root.join("spec-version.json");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest_path,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| { check.name == "skill.version.document" && !check.passed })
        );
        assert!(
            report
                .checks
                .iter()
                .any(|check| { check.name == "skill.runtime_contract.document" && !check.passed })
        );
    }

    #[test]
    fn rejects_unknown_future_runtime_contract() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("skills/open-prose");
        write_skill_with_metadata(&skill_root, "0.15.0", 3, "contract\n");
        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.15.0",
                "runtime_contract": 3
            },
            "packages": {},
            "artifacts": {
                "SKILL.md": artifact_digest(&skill_root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&skill_root.join("contract-markdown.md")).unwrap(),
                "prose.md": artifact_digest(&skill_root.join("prose.md")).unwrap(),
                "forme.md": artifact_digest(&skill_root.join("forme.md")).unwrap(),
                "prosescript.md": artifact_digest(&skill_root.join("prosescript.md")).unwrap(),
                "responsibility-runtime.md": artifact_digest(&skill_root.join("responsibility-runtime.md")).unwrap()
            }
        });
        let manifest_path = skill_root.join("spec-version.json");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest_path,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "skill.runtime_contract" && !check.passed)
        );
    }

    #[test]
    fn rejects_symlink_artifacts_that_leave_direct_mode_root() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("skill/open-prose");
        let outside_root = dir.path().join("outside");
        fs::create_dir_all(&skill_root).unwrap();
        fs::create_dir_all(&outside_root).unwrap();
        fs::write(
            outside_root.join("SKILL.md"),
            "---\nname: open-prose\nversion: 0.15.0\nruntime_contract: 2\n---\n",
        )
        .unwrap();
        unix_fs::symlink(outside_root.join("SKILL.md"), skill_root.join("SKILL.md")).unwrap();
        fs::write(skill_root.join("contract-markdown.md"), "contract\n").unwrap();
        fs::write(skill_root.join("prose.md"), "Prose VM\n").unwrap();
        fs::write(skill_root.join("forme.md"), "Forme\n").unwrap();
        fs::write(skill_root.join("prosescript.md"), "ProseScript\n").unwrap();
        fs::write(
            skill_root.join("responsibility-runtime.md"),
            "Responsibility Runtime\n",
        )
        .unwrap();

        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.15.0",
                "runtime_contract": 2
            },
            "packages": {},
            "artifacts": {
                "SKILL.md": artifact_digest(&outside_root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&skill_root.join("contract-markdown.md")).unwrap(),
                "prose.md": artifact_digest(&skill_root.join("prose.md")).unwrap(),
                "forme.md": artifact_digest(&skill_root.join("forme.md")).unwrap(),
                "prosescript.md": artifact_digest(&skill_root.join("prosescript.md")).unwrap(),
                "responsibility-runtime.md": artifact_digest(&skill_root.join("responsibility-runtime.md")).unwrap()
            }
        });
        let manifest_path = skill_root.join("spec-version.json");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest_path,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| { check.name == "artifact:SKILL.md" && !check.passed })
        );
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "skill.document" && !check.passed)
        );
    }

    #[test]
    fn rejects_symlinked_artifact_directories_that_leave_direct_mode_root() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("skill/open-prose");
        let outside_root = dir.path().join("outside");
        write_skill(&skill_root, "contract\n");
        fs::create_dir_all(&outside_root).unwrap();
        fs::write(outside_root.join("extra.md"), "outside\n").unwrap();
        unix_fs::symlink(&outside_root, skill_root.join("linked")).unwrap();

        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.15.0",
                "runtime_contract": 2
            },
            "packages": {},
            "artifacts": {
                "SKILL.md": artifact_digest(&skill_root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&skill_root.join("contract-markdown.md")).unwrap(),
                "prose.md": artifact_digest(&skill_root.join("prose.md")).unwrap(),
                "forme.md": artifact_digest(&skill_root.join("forme.md")).unwrap(),
                "prosescript.md": artifact_digest(&skill_root.join("prosescript.md")).unwrap(),
                "responsibility-runtime.md": artifact_digest(&skill_root.join("responsibility-runtime.md")).unwrap(),
                "linked/extra.md": artifact_digest(&outside_root.join("extra.md")).unwrap()
            }
        });
        let manifest_path = skill_root.join("spec-version.json");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest_path,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(report.checks.iter().any(|check| {
            check.name == "artifact:linked/extra.md"
                && !check.passed
                && check.detail.contains("must not traverse a symlink")
        }));
    }

    #[test]
    fn rejects_declared_package_without_matching_package_json() {
        let dir = tempdir().unwrap();
        let skill_root = dir.path().join("skill/open-prose");
        write_skill(&skill_root, "contract package\n");
        let manifest = write_manifest(&skill_root, "0.3.1");

        let report = verify_spec_identity(
            &manifest,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(!report.valid, "{report:#?}");
        assert!(
            report
                .checks
                .iter()
                .any(|check| check.name == "package:@openprose/reactor" && !check.passed)
        );
    }

    #[test]
    fn verifies_expanded_language_surface_artifacts_for_reactor_transition() {
        let dir = tempdir().unwrap();
        let package_root = dir.path().join("node_modules/@openprose/reactor");
        let skill_root = package_root.join("skill/open-prose");
        write_skill(&skill_root, "contract markdown\n");
        fs::write(skill_root.join("prosescript.md"), "ProseScript\n").unwrap();
        fs::write(skill_root.join("reactor.md"), "Reactor\n").unwrap();
        fs::write(
            skill_root.join("responsibility-runtime.md"),
            "Responsibility Runtime\n",
        )
        .unwrap();
        fs::write(
            package_root.join("package.json"),
            serde_json::to_string_pretty(&json!({
                "name": "@openprose/reactor",
                "version": "0.3.1"
            }))
            .unwrap(),
        )
        .unwrap();

        let manifest = json!({
            "schema": "openprose.spec-identity",
            "schema_version": 1,
            "spec_id": "openprose",
            "source": {
                "repo": "openprose/prose"
            },
            "skill": {
                "version": "0.15.0",
                "runtime_contract": 2
            },
            "packages": {
                "@openprose/reactor": "0.3.1"
            },
            "artifacts": {
                "SKILL.md": artifact_digest(&skill_root.join("SKILL.md")).unwrap(),
                "contract-markdown.md": artifact_digest(&skill_root.join("contract-markdown.md")).unwrap(),
                "forme.md": artifact_digest(&skill_root.join("forme.md")).unwrap(),
                "prose.md": artifact_digest(&skill_root.join("prose.md")).unwrap(),
                "prosescript.md": artifact_digest(&skill_root.join("prosescript.md")).unwrap(),
                "reactor.md": artifact_digest(&skill_root.join("reactor.md")).unwrap(),
                "responsibility-runtime.md": artifact_digest(&skill_root.join("responsibility-runtime.md")).unwrap()
            }
        });
        let manifest_path = skill_root.join("spec-version.json");
        fs::write(
            &manifest_path,
            serde_json::to_string_pretty(&manifest).unwrap(),
        )
        .unwrap();

        let report = verify_spec_identity(
            &manifest_path,
            SpecIdentityOptions {
                root: Some(skill_root),
                expected_repo: Some("openprose/prose".to_string()),
                package_jsons: vec![package_root.join("package.json")],
                ..SpecIdentityOptions::default()
            },
        )
        .unwrap();
        assert!(report.valid, "{report:#?}");
        for artifact in [
            "artifact:forme.md",
            "artifact:prosescript.md",
            "artifact:reactor.md",
            "artifact:responsibility-runtime.md",
        ] {
            assert!(
                report
                    .checks
                    .iter()
                    .any(|check| check.name == artifact && check.passed),
                "missing passed check for {artifact}: {report:#?}"
            );
        }
    }
}
