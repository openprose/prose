---
name: parser
kind: service
---

### Description

Handles formats: JSONL (Claude Code), SQLite, JSON arrays, and Markdown conversation exports. Normalizes all to a common schema.

### Requires

- `sources`: log file paths to parse

### Ensures

- `sessions`: normalized conversation data with session ID, timestamps, user requests, assistant actions, and outcomes
