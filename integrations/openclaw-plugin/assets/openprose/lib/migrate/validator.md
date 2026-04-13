---
name: validator
kind: service
---

requires:
- output: the converted `.md` file(s) from the converter
- source: the original `.prose` file contents

ensures:
- report: a validation report containing:
    - status: "pass", "pass-with-warnings", or "needs-review"
    - contract-completeness: whether every service has well-formed requires and ensures sections, and whether the index.md (if present) properly lists all services
    - intent-preservation: whether the converted program preserves the original's purpose, data flow, and behavioral intent. Checks that no sessions or agents were silently dropped, and that error handling is accounted for.
    - frontmatter-validity: whether all YAML frontmatter is well-formed with correct kind values (program vs service) and valid field names
    - wiring-consistency: for multi-service programs, whether the ensures of upstream services satisfy the requires of downstream services (the dependency graph is complete and has no gaps)
    - unconverted-patterns: a list of any v0 patterns that could not be cleanly converted, with explanations and suggestions for manual resolution
    - suggestions: actionable recommendations for the author to review or improve the converted output (e.g., "consider adding a strategies section to the researcher service for retry logic", "the original had a choice block that was flattened -- verify the conversion captures all branches")

strategies:
- when the original is very simple: keep the report concise, do not pad with unnecessary detail
- when there are unconverted patterns: prioritize them at the top of the report so the author sees them first
- when the wiring has gaps: suggest specific fixes (e.g., "service X requires 'data' but no upstream service ensures it -- consider adding it to service Y's ensures")
