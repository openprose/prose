use lsp_types::{DiagnosticSeverity, NumberOrString, Position, Url};
use std::fs;
use std::path::Path;

// ── 1. Diagnostic conversion ────────────────────────────────────────

#[test]
fn converts_error_diagnostic_to_lsp() {
    let diag = openprose_lint::Diagnostic::new(
        Path::new("test.prose"),
        "E001",
        openprose_lint::Severity::Error,
        "empty session name",
        1,
        1,
    );

    let lsp_diag = openprose_lint::lsp::to_lsp_diagnostic(&diag);

    assert_eq!(lsp_diag.severity, Some(DiagnosticSeverity::ERROR));
    assert_eq!(lsp_diag.source, Some("openprose-lint".to_string()));
    assert_eq!(
        lsp_diag.code,
        Some(NumberOrString::String("E001".to_string()))
    );
    assert_eq!(lsp_diag.message, "empty session name");
    // LSP lines are 0-indexed; our diagnostics are 1-indexed
    assert_eq!(lsp_diag.range.start, Position::new(0, 0));
}

#[test]
fn converts_warning_diagnostic_to_lsp() {
    let diag = openprose_lint::Diagnostic::new(
        Path::new("test.prose"),
        "W001",
        openprose_lint::Severity::Warning,
        "unknown property",
        5,
        3,
    );

    let lsp_diag = openprose_lint::lsp::to_lsp_diagnostic(&diag);

    assert_eq!(lsp_diag.severity, Some(DiagnosticSeverity::WARNING));
    assert_eq!(lsp_diag.range.start, Position::new(4, 2));
}

// ── 2. Bulk conversion: lint result → LSP diagnostics ───────────────

#[test]
fn converts_lint_result_to_lsp_diagnostics() {
    let source = "session \"\"\n";
    let result = openprose_lint::lint_source(Path::new("test.prose"), source);

    let lsp_diags = openprose_lint::lsp::to_lsp_diagnostics(&result.diagnostics);

    assert!(
        !lsp_diags.is_empty(),
        "invalid source should produce diagnostics"
    );
    for d in &lsp_diags {
        assert_eq!(d.source, Some("openprose-lint".to_string()));
    }
}

#[test]
fn valid_source_produces_empty_diagnostics() {
    let source = r#"session "test"

agent worker:
  model: sonnet
  prompt: "do work"
"#;
    let result = openprose_lint::lint_source(Path::new("valid.prose"), source);

    let lsp_diags = openprose_lint::lsp::to_lsp_diagnostics(&result.diagnostics);

    assert!(
        lsp_diags.is_empty(),
        "valid source should produce no diagnostics"
    );
}

// ── 3. Server capabilities ──────────────────────────────────────────

#[tokio::test]
async fn server_initialize_returns_text_document_sync() {
    use openprose_lint::lsp::make_server_capabilities;

    let caps = make_server_capabilities();

    // Must advertise full text sync (TextDocumentSyncKind::FULL = 1)
    let sync = caps
        .text_document_sync
        .expect("must advertise text doc sync");
    assert!(
        matches!(
            sync,
            lsp_types::TextDocumentSyncCapability::Kind(lsp_types::TextDocumentSyncKind::FULL)
        ),
        "expected TextDocumentSyncKind::FULL"
    );
}

// ── 4. Full LSP round-trip: didOpen → publishDiagnostics ────────────

#[tokio::test]
async fn did_open_invalid_prose_publishes_diagnostics() {
    let (service, mut rx) = openprose_lint::lsp::test_harness().await;

    let uri = Url::parse("file:///tmp/test.prose").unwrap();
    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri: uri.clone(),
                language_id: "openprose".to_string(),
                version: 0,
                text: "session \"\"\n".to_string(),
            },
        })
        .await;

    let params = rx
        .recv()
        .await
        .expect("should receive diagnostics notification");
    assert_eq!(params.uri, uri);
    assert!(
        !params.diagnostics.is_empty(),
        "invalid prose should yield diagnostics"
    );
}

#[tokio::test]
async fn did_open_invalid_current_markdown_publishes_current_diagnostics() {
    // Regression for current Markdown routing through the shared lint diagnostics helper.
    let (service, mut rx) = openprose_lint::lsp::test_harness().await;

    let uri = Url::parse("file:///tmp/test.md").unwrap();
    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri: uri.clone(),
                language_id: "openprose".to_string(),
                version: 0,
                text: "# Missing Frontmatter\n".to_string(),
            },
        })
        .await;

    let params = rx
        .recv()
        .await
        .expect("should receive diagnostics notification");
    assert_eq!(params.uri, uri);
    assert!(
        params.diagnostics.iter().any(|diagnostic| matches!(
            diagnostic.code.as_ref(),
            Some(NumberOrString::String(code)) if code == "MDE001"
        )),
        "invalid Markdown should yield current diagnostics, got: {:?}",
        params.diagnostics
    );
}

#[tokio::test]
async fn did_change_relints_and_publishes() {
    let (service, mut rx) = openprose_lint::lsp::test_harness().await;

    let uri = Url::parse("file:///tmp/test.prose").unwrap();

    // Open with invalid content
    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri: uri.clone(),
                language_id: "openprose".to_string(),
                version: 0,
                text: "session \"\"\n".to_string(),
            },
        })
        .await;
    let params = rx.recv().await.unwrap();
    assert!(!params.diagnostics.is_empty());

    // Change to valid content — diagnostics should clear
    service
        .did_change(lsp_types::DidChangeTextDocumentParams {
            text_document: lsp_types::VersionedTextDocumentIdentifier {
                uri: uri.clone(),
                version: 1,
            },
            content_changes: vec![lsp_types::TextDocumentContentChangeEvent {
                range: None,
                range_length: None,
                text: "session \"valid\"\n\nagent w:\n  model: sonnet\n  prompt: \"go\"\n"
                    .to_string(),
            }],
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert_eq!(params.uri, uri);
    assert!(
        params.diagnostics.is_empty(),
        "valid prose should clear diagnostics"
    );
}

// ── 5. Stable valid inputs lint clean via LSP ────────────────────────

#[tokio::test]
async fn valid_fixture_basic_produces_no_diagnostics() {
    let example = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/valid/basic.prose");
    let source = fs::read_to_string(example).expect("fixture file should exist");

    let (service, mut rx) = openprose_lint::lsp::test_harness().await;
    let uri = Url::parse(&format!("file://{example}")).unwrap();

    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri: uri.clone(),
                language_id: "openprose".to_string(),
                version: 0,
                text: source,
            },
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert!(
        params.diagnostics.is_empty(),
        "fixtures/valid/basic.prose should lint clean, got: {:?}",
        params.diagnostics
    );
}

#[tokio::test]
async fn valid_inline_session_produces_no_diagnostics() {
    let source = "session \"valid\"\n\nagent researcher:\n  model: sonnet\n  prompt: \"Research carefully\"\n\nlet notes = session: researcher\n  prompt: \"Summarize the topic\"\n\noutput result = notes\n";

    let (service, mut rx) = openprose_lint::lsp::test_harness().await;
    let uri = Url::parse("file:///tmp/valid-inline.prose").unwrap();

    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri: uri.clone(),
                language_id: "openprose".to_string(),
                version: 0,
                text: source.to_string(),
            },
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert!(
        params.diagnostics.is_empty(),
        "valid inline source should lint clean, got: {:?}",
        params.diagnostics
    );
}

// ── 6. Intentionally broken prose produces specific diagnostics ─────

#[tokio::test]
async fn empty_session_name_produces_error() {
    let source = fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/lsp/empty-session.prose"
    ))
    .unwrap();

    let (service, mut rx) = openprose_lint::lsp::test_harness().await;
    let uri = Url::parse("file:///tmp/empty-session.prose").unwrap();

    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri,
                language_id: "openprose".to_string(),
                version: 0,
                text: source,
            },
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert!(
        params
            .diagnostics
            .iter()
            .any(|d| d.severity == Some(DiagnosticSeverity::WARNING)
                && d.message.contains("Empty session")),
        "empty session name should be a warning, got: {:?}",
        params.diagnostics
    );
}

#[tokio::test]
async fn unknown_model_produces_warning() {
    let source = fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/lsp/unknown-model.prose"
    ))
    .unwrap();

    let (service, mut rx) = openprose_lint::lsp::test_harness().await;
    let uri = Url::parse("file:///tmp/unknown-model.prose").unwrap();

    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri,
                language_id: "openprose".to_string(),
                version: 0,
                text: source,
            },
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert!(
        params
            .diagnostics
            .iter()
            .any(|d| d.severity == Some(DiagnosticSeverity::ERROR) && d.message.contains("model")),
        "unknown model 'turbo' should produce an error about model, got: {:?}",
        params.diagnostics
    );
}

#[tokio::test]
async fn duplicate_agent_produces_error() {
    let source = fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/lsp/duplicate-agent.prose"
    ))
    .unwrap();

    let (service, mut rx) = openprose_lint::lsp::test_harness().await;
    let uri = Url::parse("file:///tmp/duplicate-agent.prose").unwrap();

    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri,
                language_id: "openprose".to_string(),
                version: 0,
                text: source,
            },
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert!(
        params.diagnostics.iter().any(|d| {
            d.severity == Some(DiagnosticSeverity::ERROR) && d.message.contains("Duplicate")
        }),
        "duplicate agent 'reviewer' should produce an error mentioning 'Duplicate', got: {:?}",
        params.diagnostics
    );
}

#[tokio::test]
async fn dangling_resume_produces_error() {
    let source = fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/lsp/dangling-resume.prose"
    ))
    .unwrap();

    let (service, mut rx) = openprose_lint::lsp::test_harness().await;
    let uri = Url::parse("file:///tmp/dangling-resume.prose").unwrap();

    service
        .did_open(lsp_types::DidOpenTextDocumentParams {
            text_document: lsp_types::TextDocumentItem {
                uri,
                language_id: "openprose".to_string(),
                version: 0,
                text: source,
            },
        })
        .await;

    let params = rx.recv().await.unwrap();
    assert!(
        params
            .diagnostics
            .iter()
            .any(|d| d.severity == Some(DiagnosticSeverity::ERROR)),
        "dangling resume to 'ghost_agent' should produce an error, got: {:?}",
        params.diagnostics
    );
}
