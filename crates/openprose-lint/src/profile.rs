use anyhow::{Result, bail};
use std::fmt::{Display, Formatter};
use std::str::FromStr;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum LintProfile {
    Strict,
    #[default]
    Compat,
}

impl FromStr for LintProfile {
    type Err = anyhow::Error;

    fn from_str(input: &str) -> Result<Self> {
        match input {
            "strict" => Ok(Self::Strict),
            "compat" => Ok(Self::Compat),
            _ => bail!("unknown lint profile: {input}"),
        }
    }
}

impl Display for LintProfile {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Strict => f.write_str("strict"),
            Self::Compat => f.write_str("compat"),
        }
    }
}
