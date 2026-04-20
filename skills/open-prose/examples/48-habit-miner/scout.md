---
name: scout
kind: service
---

### Requires

- mode: scan mode

### Ensures

- inventory: structured list of AI assistant log locations with path, format, size, session count, and date range

Checks: ~/.claude/, ~/.opencode/, ~/.cursor/, ~/.continue/, ~/.aider/, ~/.copilot/, ~/.codeium/, ~/.tabnine/
