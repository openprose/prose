use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn collect_prose_files(targets: &[PathBuf]) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for target in targets {
        if target.is_file() {
            if is_prose_file(target) {
                files.push(
                    target
                        .canonicalize()
                        .with_context(|| format!("canonicalize {}", target.display()))?,
                );
            }
            continue;
        }

        if target.is_dir() {
            for entry in WalkDir::new(target)
                .into_iter()
                .filter_map(|entry| entry.ok())
                .filter(|entry| entry.file_type().is_file())
            {
                if is_prose_file(entry.path()) {
                    files.push(
                        entry
                            .path()
                            .canonicalize()
                            .with_context(|| format!("canonicalize {}", entry.path().display()))?,
                    );
                }
            }
            continue;
        }

        anyhow::bail!("path does not exist: {}", target.display());
    }

    files.sort();
    files.dedup();
    Ok(files)
}

pub fn is_prose_file(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()) == Some("prose")
}
