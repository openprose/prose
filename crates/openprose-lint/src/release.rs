use crate::conformance::ConformanceReport;
use crate::spec_source::SpecSource;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct ReleaseManifest {
    pub schema_version: u32,
    pub linter: LinterInfo,
    pub spec_source: SpecSourceInfo,
    pub conformance: ConformanceResults,
    pub build: BuildInfo,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct LinterInfo {
    pub name: String,
    pub version: String,
    pub git_sha: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct SpecSourceInfo {
    pub id: String,
    pub repo: String,
    pub pinned_commit: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct ProfileResult {
    pub passed: bool,
    pub cases: usize,
    pub failures: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct ConformanceResults {
    pub strict: Option<ProfileResult>,
    pub compat: Option<ProfileResult>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct BuildInfo {
    pub timestamp: String,
    pub rust_version: String,
    pub profile: String,
}

impl ReleaseManifest {
    /// Build a release manifest from a spec source and conformance report.
    pub fn from_conformance(
        spec: &SpecSource,
        report: &ConformanceReport,
        linter_version: &str,
        git_sha: &str,
        rust_version: &str,
        timestamp: &str,
    ) -> Self {
        let mut strict = None;
        let mut compat = None;

        let strict_runs: Vec<_> = report
            .runs
            .iter()
            .filter(|r| r.profile == crate::profile::LintProfile::Strict)
            .collect();
        let compat_runs: Vec<_> = report
            .runs
            .iter()
            .filter(|r| r.profile == crate::profile::LintProfile::Compat)
            .collect();

        if !strict_runs.is_empty() {
            let failures = strict_runs.iter().filter(|r| !r.passed()).count();
            strict = Some(ProfileResult {
                passed: failures == 0,
                cases: strict_runs.len(),
                failures,
            });
        }

        if !compat_runs.is_empty() {
            let failures = compat_runs.iter().filter(|r| !r.passed()).count();
            compat = Some(ProfileResult {
                passed: failures == 0,
                cases: compat_runs.len(),
                failures,
            });
        }

        Self {
            schema_version: 1,
            linter: LinterInfo {
                name: "openprose-lint".to_string(),
                version: linter_version.to_string(),
                git_sha: git_sha.to_string(),
            },
            spec_source: SpecSourceInfo {
                id: spec.id.clone(),
                repo: spec.repo.clone(),
                pinned_commit: spec.pinned_commit.clone(),
            },
            conformance: ConformanceResults { strict, compat },
            build: BuildInfo {
                timestamp: timestamp.to_string(),
                rust_version: rust_version.to_string(),
                profile: "release".to_string(),
            },
        }
    }

    /// The filename for this release manifest.
    pub fn filename(&self) -> String {
        let short_commit = if self.spec_source.pinned_commit.len() >= 7 {
            &self.spec_source.pinned_commit[..7]
        } else {
            &self.spec_source.pinned_commit
        };
        format!(
            "v{}-{}-{}.json",
            self.linter.version, self.spec_source.id, short_commit
        )
    }

    /// Write the manifest to a file.
    pub fn write_to(&self, dir: &Path) -> Result<std::path::PathBuf> {
        fs::create_dir_all(dir).with_context(|| format!("create dir {}", dir.display()))?;
        let path = dir.join(self.filename());
        let json =
            serde_json::to_string_pretty(self).with_context(|| "serialize release manifest")?;
        fs::write(&path, json).with_context(|| format!("write {}", path.display()))?;
        Ok(path)
    }

    /// Load a release manifest from a file.
    pub fn from_file(path: &Path) -> Result<Self> {
        let source =
            fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let manifest: Self =
            serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))?;
        Ok(manifest)
    }

    /// Whether all conformance profiles passed.
    pub fn all_passed(&self) -> bool {
        let strict_ok = self.conformance.strict.as_ref().is_none_or(|r| r.passed);
        let compat_ok = self.conformance.compat.as_ref().is_none_or(|r| r.passed);
        strict_ok && compat_ok
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conformance::{ConformanceReport, ConformanceRun, DiagnosticSignature};
    use crate::diag::Severity;
    use crate::profile::LintProfile;
    use crate::spec_source::{SpecPaths, SpecSource};
    use std::path::PathBuf;

    fn sample_spec() -> SpecSource {
        SpecSource {
            id: "openprose".to_string(),
            repo: "openprose/prose".to_string(),
            source_path: "reference/openprose-prose".to_string(),
            package_source_path: None,
            pinned_commit: "ce98a960530c08329e129c7824c18813380ecdbd".to_string(),
            paths: SpecPaths {
                root: "skills/open-prose".to_string(),
                compiler_spec: Some("compiler/index.prose.md".to_string()),
                vm_spec: "prose.md".to_string(),
                forme_spec: None,
                deps_spec: None,
                version_manifest: Some("spec-version.json".to_string()),
                conformance_manifest: Some("conformance/manifest.json".to_string()),
            },
        }
    }

    fn passing_report() -> ConformanceReport {
        ConformanceReport {
            manifest: PathBuf::from("test/manifest.json"),
            runs: vec![
                ConformanceRun {
                    id: "case-1".to_string(),
                    path: PathBuf::from("test/case1.prose"),
                    profile: LintProfile::Strict,
                    expected: vec![DiagnosticSignature {
                        severity: Severity::Error,
                        code: "OPE001".to_string(),
                    }],
                    actual: vec![DiagnosticSignature {
                        severity: Severity::Error,
                        code: "OPE001".to_string(),
                    }],
                },
                ConformanceRun {
                    id: "case-1".to_string(),
                    path: PathBuf::from("test/case1.prose"),
                    profile: LintProfile::Compat,
                    expected: vec![],
                    actual: vec![],
                },
            ],
        }
    }

    fn failing_report() -> ConformanceReport {
        ConformanceReport {
            manifest: PathBuf::from("test/manifest.json"),
            runs: vec![ConformanceRun {
                id: "case-1".to_string(),
                path: PathBuf::from("test/case1.prose"),
                profile: LintProfile::Strict,
                expected: vec![DiagnosticSignature {
                    severity: Severity::Error,
                    code: "OPE001".to_string(),
                }],
                actual: vec![],
            }],
        }
    }

    #[test]
    fn from_conformance_captures_results() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &passing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );

        assert_eq!(manifest.schema_version, 1);
        assert_eq!(manifest.linter.version, "0.2.0");
        assert_eq!(manifest.spec_source.id, "openprose");
        assert!(manifest.conformance.strict.as_ref().unwrap().passed);
        assert_eq!(manifest.conformance.strict.as_ref().unwrap().cases, 1);
        assert!(manifest.conformance.compat.as_ref().unwrap().passed);
        assert_eq!(manifest.conformance.compat.as_ref().unwrap().cases, 1);
    }

    #[test]
    fn from_conformance_captures_failures() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &failing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );

        assert!(!manifest.conformance.strict.as_ref().unwrap().passed);
        assert_eq!(manifest.conformance.strict.as_ref().unwrap().failures, 1);
        assert!(manifest.conformance.compat.is_none());
    }

    #[test]
    fn filename_format() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &passing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );

        assert_eq!(manifest.filename(), "v0.2.0-openprose-ce98a96.json");
    }

    #[test]
    fn all_passed_when_passing() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &passing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );
        assert!(manifest.all_passed());
    }

    #[test]
    fn all_passed_false_when_failing() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &failing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );
        assert!(!manifest.all_passed());
    }

    #[test]
    fn write_and_read_roundtrip() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &passing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );

        let dir = tempfile::tempdir().unwrap();
        let path = manifest.write_to(dir.path()).unwrap();
        assert!(path.exists());

        let loaded = ReleaseManifest::from_file(&path).unwrap();
        assert_eq!(manifest, loaded);
    }

    #[test]
    fn json_serialization_is_stable() {
        let manifest = ReleaseManifest::from_conformance(
            &sample_spec(),
            &passing_report(),
            "0.2.0",
            "abc1234",
            "1.85.0",
            "2026-03-19T15:00:00Z",
        );

        let json = serde_json::to_string_pretty(&manifest).unwrap();
        assert!(json.contains("\"schema_version\": 1"));
        assert!(json.contains("\"openprose\""));
        assert!(json.contains("\"passed\": true"));
    }
}
