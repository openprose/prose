use lsp_types::{
    Diagnostic as LspDiagnostic, DiagnosticSeverity, NumberOrString, Position,
    PublishDiagnosticsParams, Range, ServerCapabilities, TextDocumentSyncCapability,
    TextDocumentSyncKind, Url,
};
use std::path::PathBuf;
use tokio::sync::mpsc;

use crate::current_lint;
use crate::diag::{Diagnostic, Severity};
use crate::lint::lint_source as lint_legacy_source;

// ── Diagnostic conversion ───────────────────────────────────────────

pub fn to_lsp_diagnostic(diag: &Diagnostic) -> LspDiagnostic {
    let severity = match diag.severity {
        Severity::Error => DiagnosticSeverity::ERROR,
        Severity::Warning => DiagnosticSeverity::WARNING,
    };
    // Our diagnostics are 1-indexed; LSP is 0-indexed.
    let line = diag.line.saturating_sub(1) as u32;
    let col = diag.column.saturating_sub(1) as u32;

    LspDiagnostic {
        // End column u32::MAX → LSP clients clamp to end of line,
        // giving a visible underline from the diagnostic column onward.
        range: Range::new(Position::new(line, col), Position::new(line, u32::MAX)),
        severity: Some(severity),
        code: Some(NumberOrString::String(diag.code.to_string())),
        source: Some("openprose-lint".to_string()),
        message: diag.message.clone(),
        ..Default::default()
    }
}

pub fn to_lsp_diagnostics(diags: &[Diagnostic]) -> Vec<LspDiagnostic> {
    diags.iter().map(to_lsp_diagnostic).collect()
}

pub fn lint_diagnostics_for_source(path: &std::path::Path, text: &str) -> Vec<Diagnostic> {
    if current_lint::should_lint_as_current(path, text) {
        current_lint::current_lint_source(path, text).diagnostics
    } else {
        lint_legacy_source(path, text).diagnostics
    }
}

pub use crate::hover::hover_at;

// ── Server capabilities ─────────────────────────────────────────────

pub fn make_server_capabilities() -> ServerCapabilities {
    ServerCapabilities {
        text_document_sync: Some(TextDocumentSyncCapability::Kind(TextDocumentSyncKind::FULL)),
        hover_provider: Some(lsp_types::HoverProviderCapability::Simple(true)),
        ..Default::default()
    }
}

// ── Test harness ────────────────────────────────────────────────────

/// A lightweight service for integration tests that doesn't require
/// a full tower-lsp transport. Sends `PublishDiagnosticsParams`
/// over an mpsc channel instead of a real client connection.
pub struct TestService {
    tx: mpsc::Sender<PublishDiagnosticsParams>,
}

impl TestService {
    pub async fn did_open(&self, params: lsp_types::DidOpenTextDocumentParams) {
        let uri = params.text_document.uri.clone();
        let text = params.text_document.text;
        self.lint_and_publish(uri, &text).await;
    }

    pub async fn did_change(&self, params: lsp_types::DidChangeTextDocumentParams) {
        let uri = params.text_document.uri.clone();
        // Full text sync — last change event contains the full text.
        if let Some(change) = params.content_changes.into_iter().last() {
            self.lint_and_publish(uri, &change.text).await;
        }
    }

    async fn lint_and_publish(&self, uri: Url, text: &str) {
        let path = uri_to_path(&uri);
        let diagnostics = lint_diagnostics_for_source(&path, text);
        let diagnostics = to_lsp_diagnostics(&diagnostics);

        let params = PublishDiagnosticsParams {
            uri,
            diagnostics,
            version: None,
        };
        let _ = self.tx.send(params).await;
    }
}

fn uri_to_path(uri: &Url) -> PathBuf {
    uri.to_file_path()
        .unwrap_or_else(|_| PathBuf::from(uri.path()))
}

pub async fn test_harness() -> (TestService, mpsc::Receiver<PublishDiagnosticsParams>) {
    let (tx, rx) = mpsc::channel(16);
    (TestService { tx }, rx)
}
