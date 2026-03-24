use std::path::Path;
use wasm_bindgen::prelude::*;

use crate::lint::lint_source;

#[wasm_bindgen]
pub fn lint(filename: &str, source: &str) -> JsValue {
    let result = lint_source(Path::new(filename), source);
    let diags: Vec<JsDiagnostic> = result
        .diagnostics
        .iter()
        .map(|d| JsDiagnostic {
            line: d.line,
            column: d.column,
            severity: d.severity.to_string(),
            code: d.code.to_string(),
            message: d.message.clone(),
        })
        .collect();
    serde_wasm_bindgen::to_value(&diags).unwrap_or(JsValue::NULL)
}

#[derive(serde::Serialize)]
struct JsDiagnostic {
    line: usize,
    column: usize,
    severity: String,
    code: String,
    message: String,
}
