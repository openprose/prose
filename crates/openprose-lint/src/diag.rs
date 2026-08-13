use std::fmt::{Display, Formatter};
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum Severity {
    Error,
    Warning,
}

impl Display for Severity {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Error => f.write_str("error"),
            Self::Warning => f.write_str("warning"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Diagnostic {
    pub code: &'static str,
    pub severity: Severity,
    pub message: String,
    pub path: PathBuf,
    pub line: usize,
    pub column: usize,
}

impl Diagnostic {
    pub fn new(
        path: &std::path::Path,
        code: &'static str,
        severity: Severity,
        message: impl Into<String>,
        line: usize,
        column: usize,
    ) -> Self {
        Self {
            code,
            severity,
            message: message.into(),
            path: path.to_path_buf(),
            line,
            column,
        }
    }
}
