use crate::spec_source::{SpecPaths, SpecSource};
use anyhow::{Result, bail};
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct SpecSupport {
    #[serde(default)]
    default_spec: Option<String>,
}

/// The repo root at compile time.
pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// The specs registry directory.
pub fn specs_dir() -> PathBuf {
    repo_root().join("specs")
}

fn spec_support_path() -> PathBuf {
    repo_root().join("spec-support.json")
}

fn configured_default_spec() -> Option<String> {
    let path = spec_support_path();
    let source = fs::read_to_string(path).ok()?;
    let support: SpecSupport = serde_json::from_str(&source).ok()?;
    support.default_spec
}

/// Load the default spec source.
pub fn default_spec_source() -> Result<SpecSource> {
    let dir = specs_dir();
    if dir.exists() {
        if let Some(id) = configured_default_spec()
            && let Ok(spec) = SpecSource::find(&dir, &id)
        {
            return Ok(spec);
        }

        for preferred in ["openprose"] {
            if let Ok(spec) = SpecSource::find(&dir, preferred) {
                return Ok(spec);
            }
        }

        let specs = SpecSource::load_all(&dir)?;
        if let Some(spec) = specs.into_iter().next() {
            return Ok(spec);
        }
    }

    Ok(legacy_spec_source())
}

/// Load a named spec source from the registry.
pub fn load_spec_source(id: &str) -> Result<SpecSource> {
    SpecSource::find(&specs_dir(), id)
}

/// List all available spec source IDs.
pub fn list_spec_sources() -> Result<Vec<String>> {
    let dir = specs_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let specs = SpecSource::load_all(&dir)?;
    Ok(specs.into_iter().map(|s| s.id).collect())
}

/// Synthesize a SpecSource matching the current OpenProse layout.
fn legacy_spec_source() -> SpecSource {
    SpecSource {
        id: "openprose".to_string(),
        repo: "openprose/prose".to_string(),
        source_path: "../..".to_string(),
        package_source_path: Some("spec-snapshot/openprose".to_string()),
        pinned_commit: "unknown".to_string(),
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

// --- Legacy convenience functions (delegate to default spec source) ---

pub fn reference_spec_root() -> PathBuf {
    let spec = default_spec_source().unwrap_or_else(|_| legacy_spec_source());
    spec.source_checkout(&repo_root())
}

pub fn reference_open_prose_root() -> PathBuf {
    let spec = default_spec_source().unwrap_or_else(|_| legacy_spec_source());
    spec.resolve_root(&repo_root())
}

pub fn reference_compiler_spec() -> PathBuf {
    let spec = default_spec_source().unwrap_or_else(|_| legacy_spec_source());
    spec.resolve_compiler_spec(&repo_root())
}

pub fn reference_vm_spec() -> PathBuf {
    let spec = default_spec_source().unwrap_or_else(|_| legacy_spec_source());
    spec.resolve_vm_spec(&repo_root())
}

pub fn reference_spec_version_manifest() -> Option<PathBuf> {
    let spec = default_spec_source().unwrap_or_else(|_| legacy_spec_source());
    spec.resolve_version_manifest(&repo_root())
}

pub fn reference_conformance_manifest() -> Option<PathBuf> {
    let spec = default_spec_source().unwrap_or_else(|_| legacy_spec_source());
    spec.resolve_conformance_manifest(&repo_root())
}

/// Repo-vendored conformance manifest (self-contained, not tied to a submodule).
pub fn vendored_conformance_manifest() -> Option<PathBuf> {
    let path = repo_root().join("specs/conformance/manifest.json");
    path.exists().then_some(path)
}

/// Resolve the conformance manifest for a specific named spec.
pub fn conformance_manifest_for(spec_id: &str) -> Result<PathBuf> {
    let spec = load_spec_source(spec_id)?;
    match spec.resolve_conformance_manifest(&repo_root()) {
        Some(path) => Ok(path),
        None => bail!("spec source '{spec_id}' has no conformance manifest configured"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repo_root_exists() {
        assert!(repo_root().exists());
    }

    #[test]
    fn legacy_functions_resolve_to_existing_paths() {
        let root = reference_open_prose_root();
        assert!(root.to_string_lossy().contains("open-prose"));
    }

    #[test]
    fn default_spec_source_loads() {
        let spec = default_spec_source().unwrap();
        assert_eq!(spec.id, "openprose");
    }

    #[test]
    fn reference_optional_manifests_match_default_spec() {
        let spec = default_spec_source().unwrap();
        assert_eq!(
            reference_conformance_manifest().is_some(),
            spec.has_conformance()
        );
        assert_eq!(
            reference_spec_version_manifest().is_some(),
            spec.resolve_version_manifest(&repo_root()).is_some()
        );
    }

    #[test]
    fn conformance_manifest_for_named_spec() {
        let dir = specs_dir();
        if dir.exists()
            && let Ok(specs) = list_spec_sources()
        {
            for id in &specs {
                let spec = load_spec_source(id).unwrap();
                if spec.has_conformance() {
                    let path = conformance_manifest_for(id).unwrap();
                    assert!(path.to_string_lossy().contains("conformance"));
                }
            }
        }
    }

    #[test]
    fn conformance_manifest_for_spec_without_conformance_fails() {
        let dir = specs_dir();
        if dir.exists()
            && let Ok(specs) = list_spec_sources()
        {
            for id in &specs {
                let spec = load_spec_source(id).unwrap();
                if !spec.has_conformance() {
                    assert!(conformance_manifest_for(id).is_err());
                }
            }
        }
    }
}
