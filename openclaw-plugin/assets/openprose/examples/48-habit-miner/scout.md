---
name: scout
kind: service
---

requires:
- mode: scan mode

ensures:
- inventory: structured list of AI assistant log locations with path, format, size, session count, and date range

Checks: ~/.claude/, ~/.opencode/, ~/.cursor/, ~/.continue/, ~/.aider/, ~/.copilot/, ~/.codeium/, ~/.tabnine/
