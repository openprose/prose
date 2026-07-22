use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Path mappings within a spec source checkout.
/// All paths are relative to `root` within the source checkout directory.
#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct SpecPaths {
    pub root: String,
    #[serde(default)]
    pub compiler_spec: Option<String>,
    pub vm_spec: String,
    #[serde(default)]
    pub forme_spec: Option<String>,
    #[serde(default)]
    pub deps_spec: Option<String>,
    #[serde(default)]
    pub version_manifest: Option<String>,
    #[serde(default)]
    pub conformance_manifest: Option<String>,
}

/// A spec source configuration — one per JSON file in `specs/`.
#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct SpecSource {
    pub id: String,
    pub repo: String,
    #[serde(rename = "source_path", alias = "submodule_path")]
    pub source_path: String,
    #[serde(default)]
    pub package_source_path: Option<String>,
    pub pinned_commit: String,
    pub paths: SpecPaths,
}

impl SpecSource {
    /// Load a spec source from a JSON file.
    pub fn from_file(path: &Path) -> Result<Self> {
        let source =
            fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let spec: Self =
            serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))?;
        spec.validate()?;
        Ok(spec)
    }

    /// Load all spec sources from a directory.
    pub fn load_all(dir: &Path) -> Result<Vec<Self>> {
        let mut specs = Vec::new();
        for entry in fs::read_dir(dir).with_context(|| format!("read dir {}", dir.display()))? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json")
                && looks_like_spec_source_file(&path)?
            {
                specs.push(Self::from_file(&path)?);
            }
        }
        specs.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(specs)
    }

    /// Find a spec source by id from a directory.
    pub fn find(dir: &Path, id: &str) -> Result<Self> {
        let path = dir.join(format!("{id}.json"));
        if path.exists() {
            return Self::from_file(&path);
        }
        // Fallback: scan all files for matching id
        for spec in Self::load_all(dir)? {
            if spec.id == id {
                return Ok(spec);
            }
        }
        bail!("spec source not found: {id}")
    }

    fn validate(&self) -> Result<()> {
        if self.id.is_empty() {
            bail!("spec source id is empty");
        }
        if self.repo.is_empty() {
            bail!("spec source repo is empty");
        }
        if self.source_path.is_empty() {
            bail!("spec source source_path is empty");
        }
        validate_source_relative_path("source_path", &self.source_path)?;
        if self
            .package_source_path
            .as_deref()
            .is_some_and(str::is_empty)
        {
            bail!("spec source package_source_path is empty");
        }
        if let Some(package_source_path) = &self.package_source_path {
            validate_checkout_relative_path("package_source_path", package_source_path)?;
        }
        if self.pinned_commit.is_empty() {
            bail!("spec source pinned_commit is empty");
        }
        if self.paths.root.is_empty() {
            bail!("spec source paths.root is empty");
        }
        validate_checkout_relative_path("paths.root", &self.paths.root)?;
        if self.paths.vm_spec.is_empty() {
            bail!("spec source paths.vm_spec is empty");
        }
        validate_checkout_relative_path("paths.vm_spec", &self.paths.vm_spec)?;
        validate_optional_checkout_relative_path("paths.compiler_spec", &self.paths.compiler_spec)?;
        validate_optional_checkout_relative_path("paths.forme_spec", &self.paths.forme_spec)?;
        validate_optional_checkout_relative_path("paths.deps_spec", &self.paths.deps_spec)?;
        validate_optional_checkout_relative_path(
            "paths.version_manifest",
            &self.paths.version_manifest,
        )?;
        validate_optional_checkout_relative_path(
            "paths.conformance_manifest",
            &self.paths.conformance_manifest,
        )?;
        Ok(())
    }

    /// Resolve the primary checkout declared by `source_path`.
    pub fn primary_checkout(&self, repo_root: &Path) -> PathBuf {
        repo_root.join(&self.source_path)
    }

    /// Resolve the packaged snapshot checkout, if one is declared.
    pub fn package_checkout(&self, repo_root: &Path) -> Option<PathBuf> {
        self.package_source_path
            .as_ref()
            .map(|path| repo_root.join(path))
    }

    /// Resolve the source checkout to use for reading spec files.
    ///
    /// Local repository builds prefer the same checkout that contains the crate.
    /// Packaged Cargo builds fall back to a vendored snapshot so the crate does
    /// not need files outside the package.
    pub fn source_checkout(&self, repo_root: &Path) -> PathBuf {
        let primary = self.primary_checkout(repo_root);
        if primary.join(&self.paths.root).exists() {
            return primary;
        }

        if let Some(package) = self.package_checkout(repo_root)
            && package.join(&self.paths.root).exists()
        {
            return package;
        }

        primary
    }

    pub fn uses_package_checkout(&self, repo_root: &Path) -> bool {
        self.package_checkout(repo_root)
            .is_some_and(|package| self.source_checkout(repo_root) == package)
    }

    /// Resolve the absolute path to the spec root within the selected checkout.
    pub fn resolve_root(&self, repo_root: &Path) -> PathBuf {
        self.source_checkout(repo_root).join(&self.paths.root)
    }

    /// Resolve absolute path to the compiler spec.
    ///
    /// Current OpenProse checkouts keep the compiler under `compiler/index.prose.md`.
    /// Older spec registries may still spell it explicitly as `v0/compiler.md`
    /// or `compiler.md`.
    pub fn resolve_compiler_spec(&self, repo_root: &Path) -> PathBuf {
        self.resolve_root(repo_root).join(
            self.paths
                .compiler_spec
                .as_deref()
                .unwrap_or("compiler/index.prose.md"),
        )
    }

    /// Resolve absolute path to the VM spec.
    pub fn resolve_vm_spec(&self, repo_root: &Path) -> PathBuf {
        self.resolve_root(repo_root).join(&self.paths.vm_spec)
    }

    /// Resolve absolute path to the Forme spec, if configured.
    pub fn resolve_forme_spec(&self, repo_root: &Path) -> Option<PathBuf> {
        self.paths
            .forme_spec
            .as_ref()
            .map(|p| self.resolve_root(repo_root).join(p))
    }

    /// Resolve absolute path to the deps spec, if configured.
    pub fn resolve_deps_spec(&self, repo_root: &Path) -> Option<PathBuf> {
        self.paths
            .deps_spec
            .as_ref()
            .map(|p| self.resolve_root(repo_root).join(p))
    }

    /// Resolve absolute path to the version manifest, if configured.
    pub fn resolve_version_manifest(&self, repo_root: &Path) -> Option<PathBuf> {
        self.paths
            .version_manifest
            .as_ref()
            .map(|p| self.resolve_root(repo_root).join(p))
    }

    /// Resolve absolute path to the conformance manifest, if configured.
    pub fn resolve_conformance_manifest(&self, repo_root: &Path) -> Option<PathBuf> {
        self.paths
            .conformance_manifest
            .as_ref()
            .map(|p| self.resolve_root(repo_root).join(p))
    }

    /// Whether this spec source has a conformance manifest configured.
    pub fn has_conformance(&self) -> bool {
        self.paths.conformance_manifest.is_some()
    }
}

fn validate_source_relative_path(label: &str, value: &str) -> Result<()> {
    validate_relative_path(label, value, true)
}

fn validate_checkout_relative_path(label: &str, value: &str) -> Result<()> {
    validate_relative_path(label, value, false)
}

fn validate_optional_checkout_relative_path(label: &str, value: &Option<String>) -> Result<()> {
    if let Some(value) = value {
        if value.is_empty() {
            bail!("spec source {label} is empty");
        }
        validate_checkout_relative_path(label, value)?;
    }
    Ok(())
}

fn validate_relative_path(label: &str, value: &str, allow_parent: bool) -> Result<()> {
    let path = Path::new(value);
    if path.is_absolute() {
        bail!("spec source {label} must be relative: {value}");
    }

    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir if allow_parent => {}
            Component::ParentDir => {
                bail!("spec source {label} must not escape source root: {value}")
            }
            _ => bail!("spec source {label} must be a relative path: {value}"),
        }
    }

    Ok(())
}

fn looks_like_spec_source_file(path: &Path) -> Result<bool> {
    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let value: Value =
        serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))?;
    let Some(object) = value.as_object() else {
        return Ok(false);
    };

    let has_spec_identity = object.contains_key("id")
        && (object.contains_key("repo")
            || object.contains_key("source_path")
            || object.contains_key("submodule_path")
            || object.contains_key("pinned_commit")
            || object.contains_key("paths"));
    Ok(has_spec_identity)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as IoWrite;

    fn sample_spec_json() -> &'static str {
        r#"{
            "id": "example",
            "repo": "example/prose",
            "source_path": "reference/example-prose",
            "package_source_path": "spec-snapshot/example-prose",
            "pinned_commit": "229c6f3491ddb850fa3d38edc2c56f56e9c9fb33",
            "paths": {
                "root": "skills/open-prose",
                "compiler_spec": "compiler.md",
                "vm_spec": "prose.md",
                "version_manifest": "spec-version.json",
                "conformance_manifest": "conformance/manifest.json"
            }
        }"#
    }

    #[test]
    fn parse_spec_source_from_json() {
        let spec: SpecSource = serde_json::from_str(sample_spec_json()).unwrap();
        assert_eq!(spec.id, "example");
        assert_eq!(spec.repo, "example/prose");
        assert_eq!(spec.source_path, "reference/example-prose");
        assert_eq!(
            spec.package_source_path.as_deref(),
            Some("spec-snapshot/example-prose")
        );
        assert_eq!(spec.paths.root, "skills/open-prose");
        assert_eq!(spec.paths.compiler_spec.as_deref(), Some("compiler.md"));
        assert_eq!(
            spec.paths.conformance_manifest.as_deref(),
            Some("conformance/manifest.json")
        );
    }

    #[test]
    fn resolve_paths_from_repo_root() {
        let spec: SpecSource = serde_json::from_str(sample_spec_json()).unwrap();
        let root = Path::new("/repo");

        assert_eq!(
            spec.resolve_root(root),
            PathBuf::from("/repo/reference/example-prose/skills/open-prose")
        );
        assert_eq!(
            spec.resolve_compiler_spec(root),
            PathBuf::from("/repo/reference/example-prose/skills/open-prose/compiler.md")
        );
        assert_eq!(
            spec.resolve_conformance_manifest(root),
            Some(PathBuf::from(
                "/repo/reference/example-prose/skills/open-prose/conformance/manifest.json"
            ))
        );
        assert_eq!(spec.resolve_forme_spec(root), None);
        assert_eq!(spec.resolve_deps_spec(root), None);
    }

    #[test]
    fn falls_back_to_packaged_snapshot_when_parent_checkout_is_absent() {
        let dir = tempfile::tempdir().unwrap();
        let snapshot = dir
            .path()
            .join("spec-snapshot/example-prose/skills/open-prose");
        fs::create_dir_all(&snapshot).unwrap();
        fs::write(snapshot.join("prose.md"), "spec").unwrap();

        let spec: SpecSource = serde_json::from_str(sample_spec_json()).unwrap();
        assert_eq!(
            spec.source_checkout(dir.path()),
            dir.path().join("spec-snapshot/example-prose")
        );
        assert!(spec.uses_package_checkout(dir.path()));
        assert_eq!(spec.resolve_vm_spec(dir.path()), snapshot.join("prose.md"));
    }

    #[test]
    fn from_file_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("example.json");
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(sample_spec_json().as_bytes()).unwrap();

        let spec = SpecSource::from_file(&path).unwrap();
        assert_eq!(spec.id, "example");
    }

    #[test]
    fn load_all_from_directory() {
        let dir = tempfile::tempdir().unwrap();

        let mut f1 = fs::File::create(dir.path().join("example.json")).unwrap();
        f1.write_all(sample_spec_json().as_bytes()).unwrap();

        let openprose_json = sample_spec_json().replace("example", "openprose");
        let mut f2 = fs::File::create(dir.path().join("openprose.json")).unwrap();
        f2.write_all(openprose_json.as_bytes()).unwrap();

        let mut schema = fs::File::create(dir.path().join("adapter-manifest-schema.json")).unwrap();
        schema
            .write_all(
                br#"{
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "title": "Adapter manifest schema",
                    "type": "object"
                }"#,
            )
            .unwrap();

        let specs = SpecSource::load_all(dir.path()).unwrap();
        assert_eq!(specs.len(), 2);
        assert_eq!(specs[0].id, "example");
        assert_eq!(specs[1].id, "openprose");
    }

    #[test]
    fn load_all_rejects_malformed_spec_source_candidate() {
        let dir = tempfile::tempdir().unwrap();
        let mut file = fs::File::create(dir.path().join("broken.json")).unwrap();
        file.write_all(
            br#"{
                "id": "broken",
                "paths": {
                    "root": "skills/open-prose",
                    "vm_spec": "prose.md"
                }
            }"#,
        )
        .unwrap();

        let error = SpecSource::load_all(dir.path()).unwrap_err();
        assert!(error.to_string().contains("parse"));
    }

    #[test]
    fn find_by_id() {
        let dir = tempfile::tempdir().unwrap();
        let mut f = fs::File::create(dir.path().join("example.json")).unwrap();
        f.write_all(sample_spec_json().as_bytes()).unwrap();

        let spec = SpecSource::find(dir.path(), "example").unwrap();
        assert_eq!(spec.id, "example");
    }

    #[test]
    fn find_missing_id_fails() {
        let dir = tempfile::tempdir().unwrap();
        let result = SpecSource::find(dir.path(), "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn validation_rejects_empty_id() {
        let json = sample_spec_json().replace(r#""id": "example""#, r#""id": """#);
        let spec: SpecSource = serde_json::from_str(&json).unwrap();
        assert!(spec.validate().is_err());
    }

    #[test]
    fn validation_rejects_empty_repo() {
        let json = sample_spec_json().replace(r#""repo": "example/prose""#, r#""repo": """#);
        let spec: SpecSource = serde_json::from_str(&json).unwrap();
        assert!(spec.validate().is_err());
    }

    #[test]
    fn validation_rejects_package_source_path_that_escapes_package() {
        for bad_path in ["/abs/spec-snapshot", "../spec-snapshot"] {
            let json = sample_spec_json().replace(
                r#""package_source_path": "spec-snapshot/example-prose""#,
                &format!(r#""package_source_path": "{bad_path}""#),
            );
            let spec: SpecSource = serde_json::from_str(&json).unwrap();
            let error = spec.validate().unwrap_err().to_string();
            assert!(
                error.contains("package_source_path"),
                "unexpected error for {bad_path}: {error}"
            );
        }
    }

    #[test]
    fn validation_allows_parent_source_path_for_colocated_monorepo_crate() {
        let json = sample_spec_json().replace(
            r#""source_path": "reference/example-prose""#,
            r#""source_path": "../..""#,
        );
        let spec: SpecSource = serde_json::from_str(&json).unwrap();
        spec.validate().unwrap();
    }

    #[test]
    fn validation_rejects_absolute_source_path() {
        let json = sample_spec_json().replace(
            r#""source_path": "reference/example-prose""#,
            r#""source_path": "/tmp/example-prose""#,
        );
        let spec: SpecSource = serde_json::from_str(&json).unwrap();
        let error = spec.validate().unwrap_err().to_string();
        assert!(error.contains("source_path"), "unexpected error: {error}");
    }

    #[test]
    fn validation_rejects_paths_that_escape_checkout_root() {
        for (needle, replacement, label) in [
            (
                r#""root": "skills/open-prose""#,
                r#""root": "../skills/open-prose""#,
                "paths.root",
            ),
            (
                r#""compiler_spec": "compiler.md""#,
                r#""compiler_spec": "../compiler.md""#,
                "paths.compiler_spec",
            ),
            (
                r#""vm_spec": "prose.md""#,
                r#""vm_spec": "/tmp/prose.md""#,
                "paths.vm_spec",
            ),
        ] {
            let json = sample_spec_json().replace(needle, replacement);
            let spec: SpecSource = serde_json::from_str(&json).unwrap();
            let error = spec.validate().unwrap_err().to_string();
            assert!(
                error.contains(label),
                "unexpected error for {label}: {error}"
            );
        }
    }

    #[test]
    fn parse_current_openprose_layout() {
        let json = r#"{
            "id": "openprose",
            "repo": "openprose/prose",
            "source_path": "reference/openprose-prose",
            "package_source_path": "spec-snapshot/openprose",
            "pinned_commit": "abc1234",
            "paths": {
                "root": "skills/open-prose",
                "vm_spec": "prose.md",
                "forme_spec": "forme.md",
                "deps_spec": "deps.md"
            }
        }"#;
        let spec: SpecSource = serde_json::from_str(json).unwrap();
        assert_eq!(spec.id, "openprose");
        assert_eq!(
            spec.package_source_path.as_deref(),
            Some("spec-snapshot/openprose")
        );
        assert!(spec.paths.compiler_spec.is_none());
        assert!(spec.paths.conformance_manifest.is_none());
        assert!(spec.paths.version_manifest.is_none());
        assert!(!spec.has_conformance());

        let root = Path::new("/repo");
        assert_eq!(
            spec.resolve_compiler_spec(root),
            PathBuf::from(
                "/repo/reference/openprose-prose/skills/open-prose/compiler/index.prose.md"
            )
        );
        assert_eq!(
            spec.resolve_forme_spec(root),
            Some(PathBuf::from(
                "/repo/reference/openprose-prose/skills/open-prose/forme.md"
            ))
        );
        assert_eq!(
            spec.resolve_deps_spec(root),
            Some(PathBuf::from(
                "/repo/reference/openprose-prose/skills/open-prose/deps.md"
            ))
        );
        assert!(spec.resolve_conformance_manifest(root).is_none());
        assert!(spec.resolve_version_manifest(root).is_none());
    }

    #[test]
    fn accepts_legacy_submodule_path_alias() {
        let json = r#"{
            "id": "openprose",
            "repo": "openprose/prose",
            "submodule_path": "reference/openprose-prose",
            "pinned_commit": "abc1234",
            "paths": {
                "root": "skills/open-prose",
                "vm_spec": "prose.md"
            }
        }"#;
        let spec: SpecSource = serde_json::from_str(json).unwrap();
        assert_eq!(spec.source_path, "reference/openprose-prose");
    }

    #[test]
    fn non_json_files_ignored_in_load_all() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("README.md"), "not a spec").unwrap();
        let mut f = fs::File::create(dir.path().join("example.json")).unwrap();
        f.write_all(sample_spec_json().as_bytes()).unwrap();

        let specs = SpecSource::load_all(dir.path()).unwrap();
        assert_eq!(specs.len(), 1);
    }
}
