use crate::diag::Severity;
use crate::lint::lint_path_with_profile;
use crate::profile::LintProfile;
use anyhow::{Context, Result, bail};
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct ConformanceRun {
    pub id: String,
    pub path: PathBuf,
    pub profile: LintProfile,
    pub expected: Vec<DiagnosticSignature>,
    pub actual: Vec<DiagnosticSignature>,
}

impl ConformanceRun {
    pub fn passed(&self) -> bool {
        self.expected == self.actual
    }
}

#[derive(Clone, Debug)]
pub struct ConformanceReport {
    pub manifest: PathBuf,
    pub runs: Vec<ConformanceRun>,
}

impl ConformanceReport {
    pub fn run_count(&self) -> usize {
        self.runs.len()
    }

    pub fn failure_count(&self) -> usize {
        self.runs.iter().filter(|run| !run.passed()).count()
    }
}

#[derive(Clone, Debug, Deserialize)]
struct Manifest {
    schema_version: u32,
    language: String,
    default_profile: String,
    cases: Vec<Case>,
}

#[derive(Clone, Debug, Deserialize)]
struct Case {
    id: String,
    path: String,
    #[serde(default)]
    description: Option<String>,
    expect: ExpectationMap,
}

#[derive(Clone, Debug, Deserialize)]
struct ExpectationMap {
    #[serde(default)]
    strict: Vec<ExpectedDiagnostic>,
    #[serde(default)]
    compat: Vec<ExpectedDiagnostic>,
}

#[derive(Clone, Debug, Deserialize)]
struct ExpectedDiagnostic {
    severity: String,
    code: String,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct DiagnosticSignature {
    pub severity: Severity,
    pub code: String,
}

impl DiagnosticSignature {
    fn from_parts(severity: Severity, code: impl Into<String>) -> Self {
        Self {
            severity,
            code: code.into(),
        }
    }
}

pub fn run_conformance(
    manifest_path: &Path,
    requested_profile: Option<LintProfile>,
) -> Result<ConformanceReport> {
    let manifest_path = manifest_path
        .canonicalize()
        .with_context(|| format!("canonicalize {}", manifest_path.display()))?;
    let root = manifest_path
        .parent()
        .expect("manifest paths always have a parent");
    let manifest = load_manifest(&manifest_path)?;
    validate_manifest(&manifest)?;

    let profiles = if let Some(profile) = requested_profile {
        vec![profile]
    } else {
        vec![LintProfile::Strict, LintProfile::Compat]
    };

    let mut runs = Vec::new();
    for case in manifest.cases {
        let _ = &case.description;
        let case_path = root.join(&case.path);
        for profile in &profiles {
            let result = lint_path_with_profile(&case_path, *profile)
                .with_context(|| format!("lint {}", case_path.display()))?;
            let expected = expected_signatures(&case.expect, *profile)?;
            let mut actual = result
                .diagnostics
                .iter()
                .map(|diagnostic| {
                    DiagnosticSignature::from_parts(diagnostic.severity, diagnostic.code)
                })
                .collect::<Vec<_>>();
            actual.sort();
            runs.push(ConformanceRun {
                id: case.id.clone(),
                path: case_path.clone(),
                profile: *profile,
                expected,
                actual,
            });
        }
    }

    Ok(ConformanceReport {
        manifest: manifest_path,
        runs,
    })
}

fn load_manifest(path: &Path) -> Result<Manifest> {
    let source = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
    let manifest: Manifest =
        serde_json::from_str(&source).with_context(|| format!("parse {}", path.display()))?;
    Ok(manifest)
}

fn validate_manifest(manifest: &Manifest) -> Result<()> {
    if manifest.schema_version != 1 {
        bail!(
            "unsupported conformance schema version: {}",
            manifest.schema_version
        );
    }
    if manifest.language != "openprose" {
        bail!("unsupported conformance language: {}", manifest.language);
    }
    let default_profile = manifest.default_profile.as_str();
    if default_profile != "strict" && default_profile != "compat" {
        bail!("unsupported default profile: {}", manifest.default_profile);
    }
    if manifest.cases.is_empty() {
        bail!("conformance manifest has no cases");
    }
    let mut ids = BTreeSet::new();
    for case in &manifest.cases {
        if !ids.insert(case.id.clone()) {
            bail!("duplicate conformance case id: {}", case.id);
        }
    }
    Ok(())
}

fn expected_signatures(
    expectations: &ExpectationMap,
    profile: LintProfile,
) -> Result<Vec<DiagnosticSignature>> {
    let source = match profile {
        LintProfile::Strict => &expectations.strict,
        LintProfile::Compat => &expectations.compat,
    };
    let mut signatures = Vec::with_capacity(source.len());
    for expected in source {
        let severity = match expected.severity.as_str() {
            "error" => Severity::Error,
            "warning" => Severity::Warning,
            other => bail!("unknown expected severity: {other}"),
        };
        signatures.push(DiagnosticSignature::from_parts(
            severity,
            expected.code.clone(),
        ));
    }
    signatures.sort();
    Ok(signatures)
}

#[cfg(test)]
mod tests {
    use super::run_conformance;
    use crate::profile::LintProfile;
    use crate::spec::reference_conformance_manifest;

    #[test]
    fn reference_conformance_manifest_passes_strict() {
        let Some(manifest) = reference_conformance_manifest() else {
            return;
        };
        let report = run_conformance(&manifest, Some(LintProfile::Strict)).unwrap();
        assert_eq!(report.failure_count(), 0);
    }

    #[test]
    fn reference_conformance_manifest_passes_compat() {
        let Some(manifest) = reference_conformance_manifest() else {
            return;
        };
        let report = run_conformance(&manifest, Some(LintProfile::Compat)).unwrap();
        assert_eq!(report.failure_count(), 0);
    }
}
