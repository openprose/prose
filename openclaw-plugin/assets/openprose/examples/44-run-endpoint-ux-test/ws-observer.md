---
name: ws-observer
kind: service
persist: true
---

requires:
- execution: WebSocket URL and connection details

ensures:
- ws-feedback: UX assessment covering latency, status clarity, event quality, error messages, and overall flow from a user perspective
