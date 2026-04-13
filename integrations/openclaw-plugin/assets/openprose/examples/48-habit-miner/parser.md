---
name: parser
kind: service
---

requires:
- sources: log file paths to parse

ensures:
- sessions: normalized conversation data with session ID, timestamps, user requests, assistant actions, and outcomes

Handles formats: JSONL (Claude Code), SQLite, JSON arrays, and Markdown conversation exports. Normalizes all to a common schema.
