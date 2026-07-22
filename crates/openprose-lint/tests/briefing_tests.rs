use openprose_lint::briefing::generate_briefing;
use std::path::Path;

#[test]
fn briefing_single_file() {
    let source = include_str!("../fixtures/briefing/single-file.md");
    let path = Path::new("fixtures/briefing/single-file.md");
    let briefing = generate_briefing(path, source);

    let expected = "\
<!-- openprose-lint briefing v1 -->
## test-discovery
kind: program | services: 2 | imports: 0

### contract
requires:
- topic: the subject to research
- depth: (optional, default \"shallow\") how deep to go
ensures:
- report: compiled findings on the topic
- sources: list of URLs consulted
errors:
- no-data: insufficient public information on the topic
environment: (none)

### services
researcher \u{2192} inline
compiler \u{2192} inline

### features
environment: no | use-imports: no | run-inputs: no | execution-block: yes

### diagnostics
0 errors, 0 warnings
";

    assert_eq!(briefing, expected);
}

#[test]
fn briefing_pure_contract() {
    let source = include_str!("../fixtures/briefing/pure-contract.md");
    let path = Path::new("fixtures/briefing/pure-contract.md");
    let briefing = generate_briefing(path, source);

    let expected = "\
<!-- openprose-lint briefing v1 -->
## status-check
kind: program | services: 2 | imports: 0

### contract
requires:
- runs_dir: (optional, default \".prose/runs/\") path to the runs directory
ensures:
- summary: summary of recent runs
errors:
- no-runs: no run data found
environment: (none)

### services
scanner \u{2192} vm-managed
summarizer \u{2192} vm-managed

### features
environment: no | use-imports: no | run-inputs: no | execution-block: no

### diagnostics
0 errors, 0 warnings
";

    assert_eq!(briefing, expected);
}

#[test]
fn briefing_with_imports() {
    let source = include_str!("../fixtures/briefing/with-imports.md");
    let path = Path::new("fixtures/briefing/with-imports.md");
    let briefing = generate_briefing(path, source);

    let expected = "\
<!-- openprose-lint briefing v1 -->
## daily-delivery
kind: program | services: 3 | imports: 2

### contract
requires:
- target: the subject to research
- gate_level: (optional, default \"external\") review level
ensures:
- report: the research output
- delivered: confirmation of Slack delivery
errors: (none)
environment:
- SLACK_WEBHOOK_URL
- SLACK_BOT_TOKEN

### services
research \u{2192} inline
human-gate \u{2192} use: std/delivery/human-gate
notifier \u{2192} inline

### features
environment: yes | use-imports: yes | run-inputs: no | execution-block: yes

### diagnostics
0 errors, 0 warnings
";

    assert_eq!(briefing, expected);
}
