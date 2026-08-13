use openprose_lint::lsp::hover_at;

// ── Top-level keywords ──────────────────────────────────────────────

#[test]
fn hover_session_keyword() {
    let source = "session \"hello\"\n";
    let result = hover_at(source, 0, 0); // line 0, col 0 = "s" in "session"
    let text = result.expect("should return hover for 'session'");
    assert!(
        text.contains("session"),
        "hover should mention 'session': {text}"
    );
}

#[test]
fn hover_agent_keyword() {
    let source = "session \"test\"\n\nagent worker:\n  model: sonnet\n";
    let result = hover_at(source, 2, 0); // line 2 = "agent worker:"
    let text = result.expect("should return hover for 'agent'");
    assert!(
        text.contains("agent"),
        "hover should mention 'agent': {text}"
    );
}

#[test]
fn hover_loop_keyword() {
    let source = "session \"test\"\n\nloop:\n  session \"iterate\"\n";
    let result = hover_at(source, 2, 0);
    let text = result.expect("should return hover for 'loop'");
    assert!(text.contains("loop"), "hover should mention 'loop': {text}");
}

#[test]
fn hover_gate_keyword() {
    let source = "session \"test\"\n\ngate approve:\n  prompt: \"ok?\"\n";
    let result = hover_at(source, 2, 0);
    let text = result.expect("should return hover for 'gate'");
    assert!(text.contains("gate"), "hover should mention 'gate': {text}");
}

#[test]
fn hover_resume_keyword() {
    let source = "session \"test\"\n\nagent w:\n  model: sonnet\n\nresume: w\n";
    let result = hover_at(source, 5, 0); // line 5 = "resume: w"
    let text = result.expect("should return hover for 'resume'");
    assert!(
        text.contains("resume"),
        "hover should mention 'resume': {text}"
    );
}

#[test]
fn hover_input_keyword() {
    let source = "session \"test\"\n\ninput topic: \"what?\"\n";
    let result = hover_at(source, 2, 0);
    let text = result.expect("should return hover for 'input'");
    assert!(
        text.contains("input"),
        "hover should mention 'input': {text}"
    );
}

// ── Properties ──────────────────────────────────────────────────────

#[test]
fn hover_model_property() {
    let source = "session \"test\"\n\nagent w:\n  model: sonnet\n";
    let result = hover_at(source, 3, 2); // line 3, col 2 = "m" in "model"
    let text = result.expect("should return hover for 'model'");
    assert!(
        text.contains("model"),
        "hover should mention 'model': {text}"
    );
}

#[test]
fn hover_prompt_property() {
    let source = "session \"test\"\n\nagent w:\n  prompt: \"go\"\n";
    let result = hover_at(source, 3, 2);
    let text = result.expect("should return hover for 'prompt'");
    assert!(
        text.contains("prompt"),
        "hover should mention 'prompt': {text}"
    );
}

#[test]
fn hover_permissions_property() {
    let source = "session \"test\"\n\nagent w:\n  permissions: allow\n";
    let result = hover_at(source, 3, 2);
    let text = result.expect("should return hover for 'permissions'");
    assert!(text.contains("permissions"), "{text}");
}

// ── No hover on empty/irrelevant positions ──────────────────────────

#[test]
fn hover_empty_line_returns_none() {
    let source = "session \"test\"\n\n\nagent w:\n";
    let result = hover_at(source, 2, 0); // empty line
    assert!(result.is_none(), "empty line should return no hover");
}

#[test]
fn hover_inside_string_returns_none() {
    let source = "session \"hello world\"\n";
    let result = hover_at(source, 0, 12); // inside the string content
    assert!(result.is_none(), "string content should return no hover");
}

#[test]
fn hover_comment_returns_none() {
    let source = "# this is a comment\nsession \"test\"\n";
    let result = hover_at(source, 0, 5); // inside the comment
    assert!(result.is_none(), "comment should return no hover");
}
