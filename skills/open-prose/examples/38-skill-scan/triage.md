---
name: triage
kind: service
---

### Requires

- skill-content: full contents of a skill directory

### Ensures

- triage-result: risk level (critical/high/medium/low/clean), red flags found, whether deep scan is needed, and confidence level

Scans for: suspicious URLs, base64 content, shell commands in hooks, overly broad permissions, dangerous keywords.
