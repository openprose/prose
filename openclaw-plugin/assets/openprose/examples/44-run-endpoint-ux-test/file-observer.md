---
name: file-observer
kind: service
persist: true
---

requires:
- execution: environment ID and API details for filesystem polling

ensures:
- file-feedback: filesystem UX assessment covering directory clarity, file naming, state file readability, and what a file browser UI should highlight
