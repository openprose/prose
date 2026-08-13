//! openprose-lsp — native-only Language Server.
//!
//! The wasm32 target builds only the library (cdylib) for embedders, and
//! the LSP depends on tower-lsp/tokio (native-only), so this binary is a no-op
//! under wasm32. See README "Editor support".

#[cfg(not(target_arch = "wasm32"))]
mod server {
    use openprose_lint::lsp::{
        hover_at, lint_diagnostics_for_source, make_server_capabilities, to_lsp_diagnostics,
    };
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use tower_lsp::jsonrpc::Result;
    use tower_lsp::lsp_types::*;
    use tower_lsp::{Client, LanguageServer, LspService, Server};

    struct OpenProseLsp {
        client: Client,
        docs: Mutex<HashMap<Url, String>>,
    }

    impl OpenProseLsp {
        fn new(client: Client) -> Self {
            Self {
                client,
                docs: Mutex::new(HashMap::new()),
            }
        }

        async fn lint_and_publish(&self, uri: Url, text: &str) {
            self.docs
                .lock()
                .unwrap()
                .insert(uri.clone(), text.to_string());

            let path = uri
                .to_file_path()
                .unwrap_or_else(|_| PathBuf::from(uri.path()));
            // Shares current-vs-legacy routing with the CLI/library lint surface.
            let diagnostics = lint_diagnostics_for_source(&path, text);
            let diagnostics = to_lsp_diagnostics(&diagnostics);

            self.client
                .publish_diagnostics(uri, diagnostics, None)
                .await;
        }
    }

    #[tower_lsp::async_trait]
    impl LanguageServer for OpenProseLsp {
        async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
            Ok(InitializeResult {
                capabilities: make_server_capabilities(),
                ..Default::default()
            })
        }

        async fn initialized(&self, _: InitializedParams) {}

        async fn did_open(&self, params: DidOpenTextDocumentParams) {
            let uri = params.text_document.uri;
            let text = params.text_document.text;
            self.lint_and_publish(uri, &text).await;
        }

        async fn did_change(&self, params: DidChangeTextDocumentParams) {
            let uri = params.text_document.uri;
            if let Some(change) = params.content_changes.into_iter().last() {
                self.lint_and_publish(uri, &change.text).await;
            }
        }

        async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
            let uri = &params.text_document_position_params.text_document.uri;
            let pos = params.text_document_position_params.position;

            let docs = self.docs.lock().unwrap();
            let Some(source) = docs.get(uri) else {
                return Ok(None);
            };

            let Some(markdown) = hover_at(source, pos.line, pos.character) else {
                return Ok(None);
            };

            Ok(Some(Hover {
                contents: HoverContents::Markup(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value: markdown,
                }),
                range: None,
            }))
        }

        async fn shutdown(&self) -> Result<()> {
            Ok(())
        }
    }

    #[tokio::main]
    pub async fn run() {
        let stdin = tokio::io::stdin();
        let stdout = tokio::io::stdout();

        let (service, socket) = LspService::new(OpenProseLsp::new);
        Server::new(stdin, stdout, socket).serve(service).await;
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    server::run();
}

// On wasm32 only the library (cdylib) is built for embedders; the native
// LSP binary is intentionally a no-op so `cargo build --target wasm32-...` succeeds.
#[cfg(target_arch = "wasm32")]
fn main() {}
