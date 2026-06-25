#[cfg(not(target_arch = "wasm32"))]
pub mod adapter;
#[cfg(not(target_arch = "wasm32"))]
pub mod adapter_dogfood;
pub mod briefing;
#[cfg(not(target_arch = "wasm32"))]
pub mod capabilities;
#[cfg(not(target_arch = "wasm32"))]
pub mod cli;
#[cfg(not(target_arch = "wasm32"))]
pub mod conformance;
pub mod current_lint;
pub mod diag;
#[cfg(not(target_arch = "wasm32"))]
pub mod fs;
pub mod hover;
pub mod lint;
#[cfg(not(target_arch = "wasm32"))]
pub mod lsp;
pub mod profile;
#[cfg(not(target_arch = "wasm32"))]
pub mod release;
#[cfg(not(target_arch = "wasm32"))]
pub mod spec;
#[cfg(not(target_arch = "wasm32"))]
pub mod spec_identity;
#[cfg(not(target_arch = "wasm32"))]
pub mod spec_source;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub use diag::{Diagnostic, Severity};
pub use lint::{LintResult, count_diagnostics, lint_source, lint_source_with_profile};
#[cfg(not(target_arch = "wasm32"))]
pub use lint::{lint_path, lint_path_with_profile, lint_paths, lint_paths_with_profile};
pub use profile::LintProfile;
