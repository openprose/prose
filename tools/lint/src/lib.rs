pub mod diag;
#[cfg(not(target_arch = "wasm32"))]
pub mod fs;
pub mod lint;
pub mod lint_legacy;
pub mod profile;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub use diag::{Diagnostic, Severity};
pub use lint_legacy::{LintResult as LegacyLintResult, count_diagnostics, lint_source, lint_source_with_profile};
#[cfg(not(target_arch = "wasm32"))]
pub use lint_legacy::{lint_path, lint_path_with_profile, lint_paths, lint_paths_with_profile};
pub use profile::LintProfile;
