use openprose_lint::spec_identity::artifact_digest;
use serde_json::{Value, json};
use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::tempdir;

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_openprose-lint"))
        .args(args)
        .output()
        .unwrap()
}

fn parse_json(output: &std::process::Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap()
}

fn write_skill(root: &Path, contract_text: &str) {
    fs::create_dir_all(root).unwrap();
    fs::write(
        root.join("SKILL.md"),
        "---\nname: open-prose\nversion: 0.15.0\nruntime_contract: 2\n---\n",
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
    let manifest_path = root.join("spec-version.json");
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .unwrap();
    manifest_path
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
    let manifest_path = root.join("spec-version.json");
    fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .unwrap();
    manifest_path
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

#[test]
fn specs_verify_accepts_multiple_package_versions() {
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

        let output = run(&[
            "specs",
            "verify",
            "--manifest",
            manifest.to_str().unwrap(),
            "--root",
            skill_root.to_str().unwrap(),
            "--expect-repo",
            "openprose/prose",
            "--package-json",
            package_root.join("package.json").to_str().unwrap(),
        ]);
        assert!(
            output.status.success(),
            "status: {:?}\nstdout: {}\nstderr: {}",
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        let json = parse_json(&output);
        assert_eq!(json["valid"], true);
        assert!(
            json["checks"]
                .as_array()
                .unwrap()
                .iter()
                .any(|check| check["name"] == format!("package:@openprose/reactor@{version}"))
        );
    }
}

#[test]
fn specs_verify_rejects_tampered_package_bundle() {
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
            "version": "0.3.1"
        }))
        .unwrap(),
    )
    .unwrap();

    let output = run(&[
        "specs",
        "verify",
        "--manifest",
        manifest.to_str().unwrap(),
        "--root",
        skill_root.to_str().unwrap(),
        "--expect-repo",
        "openprose/prose",
        "--package-json",
        package_root.join("package.json").to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json(&output);
    assert_eq!(json["valid"], false);
    assert!(
        json["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["name"] == "artifact:contract-markdown.md"
                && check["passed"] == false)
    );
}

#[test]
fn specs_verify_rejects_declared_package_without_package_json() {
    let dir = tempdir().unwrap();
    let skill_root = dir.path().join("skill/open-prose");
    write_skill(&skill_root, "contract package\n");
    let manifest = write_manifest(&skill_root, "0.3.1");

    let output = run(&[
        "specs",
        "verify",
        "--manifest",
        manifest.to_str().unwrap(),
        "--root",
        skill_root.to_str().unwrap(),
        "--expect-repo",
        "openprose/prose",
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json(&output);
    assert_eq!(json["valid"], false);
    assert!(json["checks"].as_array().unwrap().iter().any(|check| {
        check["name"] == "package:@openprose/reactor" && check["passed"] == false
    }));
}

#[test]
fn specs_verify_named_openprose_uses_registry_identity_without_manifest() {
    let output = run(&["specs", "verify", "--spec", "openprose"]);
    assert!(
        output.status.success(),
        "status: {:?}\nstdout: {}\nstderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.trim().is_empty(), "stderr: {stderr}");
    let json = parse_json(&output);
    assert_eq!(json["valid"], true);
    assert!(json["checks"].as_array().unwrap().iter().any(|check| {
        check["name"] == "identity.mode"
            && check["detail"]
                .as_str()
                .unwrap()
                .contains("registry-synthesized source identity")
    }));
    assert!(
        json["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| { check["name"] == "git.artifact:prose.md" && check["passed"] == true })
    );
    assert!(
        json["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| { check["name"] == "artifact:SKILL.md" && check["passed"] == true }),
        "stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(
        json["source_capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|capability| {
                capability["id"] == "compiler"
                    && capability["path"] == "compiler/index.prose.md"
                    && capability["present"] == true
            })
    );
    assert!(
        json["source_capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|capability| capability["id"] == "contract_markdown"
                && capability["present"] == true)
    );
}

#[test]
fn specs_verify_rejects_symlinked_artifact_directories() {
    let dir = tempdir().unwrap();
    let skill_root = dir.path().join("skill/open-prose");
    let outside_root = dir.path().join("outside");
    write_skill(&skill_root, "contract package\n");
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
            "reactor.md": artifact_digest(&skill_root.join("reactor.md")).unwrap(),
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

    let output = run(&[
        "specs",
        "verify",
        "--manifest",
        manifest_path.to_str().unwrap(),
        "--root",
        skill_root.to_str().unwrap(),
        "--expect-repo",
        "openprose/prose",
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json(&output);
    assert_eq!(json["valid"], false);
    assert!(json["checks"].as_array().unwrap().iter().any(|check| {
        check["name"] == "artifact:linked/extra.md"
            && check["passed"] == false
            && check["detail"]
                .as_str()
                .unwrap()
                .contains("must not traverse a symlink")
    }));
}

#[test]
fn specs_verify_rejects_package_bundle_symlinked_artifact_directories() {
    let dir = tempdir().unwrap();
    let package_root = dir.path().join("node_modules/@openprose/reactor");
    let skill_root = package_root.join("skill/open-prose");
    let outside_root = dir.path().join("outside");
    write_skill(&skill_root, "contract package\n");
    fs::create_dir_all(&outside_root).unwrap();
    fs::write(outside_root.join("extra.md"), "outside\n").unwrap();
    fs::write(
        package_root.join("package.json"),
        serde_json::to_string_pretty(&json!({
            "name": "@openprose/reactor",
            "version": "0.3.1"
        }))
        .unwrap(),
    )
    .unwrap();
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
        "packages": {
            "@openprose/reactor": "0.3.1"
        },
        "artifacts": {
            "SKILL.md": artifact_digest(&skill_root.join("SKILL.md")).unwrap(),
            "contract-markdown.md": artifact_digest(&skill_root.join("contract-markdown.md")).unwrap(),
            "prose.md": artifact_digest(&skill_root.join("prose.md")).unwrap(),
            "forme.md": artifact_digest(&skill_root.join("forme.md")).unwrap(),
            "prosescript.md": artifact_digest(&skill_root.join("prosescript.md")).unwrap(),
            "reactor.md": artifact_digest(&skill_root.join("reactor.md")).unwrap(),
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

    let output = run(&[
        "specs",
        "verify",
        "--manifest",
        manifest_path.to_str().unwrap(),
        "--root",
        skill_root.to_str().unwrap(),
        "--expect-repo",
        "openprose/prose",
        "--package-json",
        package_root.join("package.json").to_str().unwrap(),
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json(&output);
    assert_eq!(json["valid"], false);
    assert!(json["checks"].as_array().unwrap().iter().any(|check| {
        check["name"] == "artifact:linked/extra.md"
            && check["passed"] == false
            && check["detail"]
                .as_str()
                .unwrap()
                .contains("must not traverse a symlink")
    }));
}

#[test]
fn specs_verify_rejects_git_checkout_that_does_not_own_root() {
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
    let manifest = write_manifest_without_packages(&external_skill_root);

    let output = run(&[
        "specs",
        "verify",
        "--manifest",
        manifest.to_str().unwrap(),
        "--root",
        external_skill_root.to_str().unwrap(),
        "--git-repo",
        repo.to_str().unwrap(),
        "--expect-repo",
        "openprose/prose",
        "--expect-commit",
        &commit,
    ]);
    assert_eq!(output.status.code(), Some(1), "status: {:?}", output.status);
    let json = parse_json(&output);
    assert_eq!(json["valid"], false);
    assert!(
        json["checks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["name"] == "git.root" && check["passed"] == false)
    );
}
