use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

fn send(w: &mut impl Write, msg: &str) {
    write!(w, "Content-Length: {}\r\n\r\n{}", msg.len(), msg).unwrap();
    w.flush().unwrap();
}

fn recv(r: &mut BufReader<impl std::io::Read>) -> serde_json::Value {
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        let n = r.read_line(&mut line).unwrap();
        assert!(n > 0, "unexpected EOF reading headers");
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if let Some(len) = trimmed.strip_prefix("Content-Length: ") {
            content_length = len.parse().unwrap();
        }
    }
    assert!(content_length > 0, "got zero Content-Length");
    let mut buf = vec![0u8; content_length];
    std::io::Read::read_exact(r, &mut buf).unwrap();
    serde_json::from_slice(&buf).unwrap()
}

struct Lsp {
    w: std::process::ChildStdin,
    r: BufReader<std::process::ChildStdout>,
    child: std::process::Child,
}

impl Lsp {
    fn start() -> Self {
        let bin = env!("CARGO_BIN_EXE_openprose-lsp");
        let mut child = Command::new(bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let w = child.stdin.take().unwrap();
        let r = BufReader::new(child.stdout.take().unwrap());
        Self { w, r, child }
    }

    fn init(&mut self) -> serde_json::Value {
        send(
            &mut self.w,
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":null,"capabilities":{}}}"#,
        );
        let resp = recv(&mut self.r);
        send(
            &mut self.w,
            r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#,
        );
        resp
    }

    fn send_raw(&mut self, msg: &str) {
        send(&mut self.w, msg);
    }

    fn send_json(&mut self, msg: &serde_json::Value) {
        send(&mut self.w, &serde_json::to_string(msg).unwrap());
    }

    fn recv(&mut self) -> serde_json::Value {
        recv(&mut self.r)
    }

    fn stop(mut self) {
        send(
            &mut self.w,
            r#"{"jsonrpc":"2.0","id":99,"method":"shutdown"}"#,
        );
        let _ = recv(&mut self.r);
        send(&mut self.w, r#"{"jsonrpc":"2.0","method":"exit"}"#);
        drop(self.w);
        self.child.wait().unwrap();
    }
}

// ── 1. Initialize handshake ─────────────────────────────────────────

#[test]
fn initialize_returns_full_sync_capabilities() {
    let mut lsp = Lsp::start();
    let resp = lsp.init();

    assert_eq!(resp["id"], 1);
    assert!(resp.get("error").is_none());
    assert_eq!(resp["result"]["capabilities"]["textDocumentSync"], 1);

    lsp.stop();
}

// ── 2. didOpen → publishDiagnostics ─────────────────────────────────

#[test]
fn did_open_invalid_prose_publishes_diagnostics() {
    let mut lsp = Lsp::start();
    lsp.init();

    lsp.send_raw(r#"{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///tmp/test.prose","languageId":"openprose","version":0,"text":"session \"\"\n"}}}"#);

    let notif = lsp.recv();
    assert_eq!(notif["method"], "textDocument/publishDiagnostics");
    assert!(
        !notif["params"]["diagnostics"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(notif["params"]["uri"], "file:///tmp/test.prose");

    lsp.stop();
}

// ── 3. didChange clears diagnostics ─────────────────────────────────

#[test]
fn did_change_clears_diagnostics_when_valid() {
    let mut lsp = Lsp::start();
    lsp.init();

    // Open broken
    lsp.send_raw(r#"{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///tmp/test.prose","languageId":"openprose","version":0,"text":"session \"\"\n"}}}"#);
    let notif = lsp.recv();
    assert!(
        !notif["params"]["diagnostics"]
            .as_array()
            .unwrap()
            .is_empty()
    );

    // Fix it
    lsp.send_raw(r#"{"jsonrpc":"2.0","method":"textDocument/didChange","params":{"textDocument":{"uri":"file:///tmp/test.prose","version":1},"contentChanges":[{"text":"session \"valid\"\n\nagent w:\n  model: sonnet\n  prompt: \"go\"\n"}]}}"#);
    let notif = lsp.recv();
    assert_eq!(notif["method"], "textDocument/publishDiagnostics");
    assert!(
        notif["params"]["diagnostics"]
            .as_array()
            .unwrap()
            .is_empty(),
        "valid prose should clear diagnostics"
    );

    lsp.stop();
}

// ── 4. Real legacy fixture lints clean ────────────────────────────────

#[test]
fn legacy_fixture_lints_clean_over_stdio() {
    let example = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/valid/basic.prose");
    let source = std::fs::read_to_string(example).unwrap();

    let mut lsp = Lsp::start();
    lsp.init();

    lsp.send_json(&serde_json::json!({
        "jsonrpc": "2.0",
        "method": "textDocument/didOpen",
        "params": {
            "textDocument": {
                "uri": format!("file://{example}"),
                "languageId": "openprose",
                "version": 0,
                "text": source
            }
        }
    }));

    let notif = lsp.recv();
    assert_eq!(notif["method"], "textDocument/publishDiagnostics");
    assert!(
        notif["params"]["diagnostics"]
            .as_array()
            .unwrap()
            .is_empty(),
        "spec example should lint clean, got: {:?}",
        notif["params"]["diagnostics"]
    );

    lsp.stop();
}

// ── 5. Current Markdown fixture lints clean ─────────────────────────

#[test]
fn current_markdown_fixture_lints_clean_over_stdio() {
    let example = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/fixtures/briefing/single-file.md"
    );
    let source = std::fs::read_to_string(example).unwrap();

    let mut lsp = Lsp::start();
    lsp.init();

    lsp.send_json(&serde_json::json!({
        "jsonrpc": "2.0",
        "method": "textDocument/didOpen",
        "params": {
            "textDocument": {
                "uri": format!("file://{example}"),
                "languageId": "openprose",
                "version": 0,
                "text": source
            }
        }
    }));

    let notif = lsp.recv();
    assert_eq!(notif["method"], "textDocument/publishDiagnostics");
    assert!(
        notif["params"]["diagnostics"]
            .as_array()
            .unwrap()
            .is_empty(),
        "current Markdown example should lint clean, got: {:?}",
        notif["params"]["diagnostics"]
    );

    lsp.stop();
}

#[test]
fn invalid_current_markdown_reports_current_diagnostics_over_stdio() {
    // Regression for current Markdown routing through the same parser as the public `lint` command.
    let mut lsp = Lsp::start();
    lsp.init();

    lsp.send_json(&serde_json::json!({
        "jsonrpc": "2.0",
        "method": "textDocument/didOpen",
        "params": {
            "textDocument": {
                "uri": "file:///tmp/broken.md",
                "languageId": "openprose",
                "version": 0,
                "text": "# Missing Frontmatter\n"
            }
        }
    }));

    let notif = lsp.recv();
    assert_eq!(notif["method"], "textDocument/publishDiagnostics");
    let diagnostics = notif
        .get("params")
        .and_then(|params| params.get("diagnostics"))
        .and_then(|diagnostics| diagnostics.as_array())
        .expect("diagnostics should be an array");
    assert!(
        diagnostics.iter().any(
            |diagnostic| diagnostic.get("code").and_then(|code| code.as_str()) == Some("MDE001")
        ),
        "invalid current Markdown should report MDE001, got: {diagnostics:?}"
    );

    lsp.stop();
}
