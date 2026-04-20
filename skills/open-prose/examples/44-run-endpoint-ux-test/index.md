---
name: run-endpoint-ux-test
kind: program
services: [ws-observer, file-observer, synthesizer]
---

### Requires

- test-program: the OpenProse program to execute for testing
- api-url: API base URL (e.g., https://api.openprose.com)
- auth-token: bearer token for authentication

### Ensures

- action-items: prioritized UX assessment with correlated findings from both observers and concrete recommendations
