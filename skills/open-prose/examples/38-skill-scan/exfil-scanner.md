---
name: exfil-scanner
kind: service
---

### Requires

- `skill-content`: full contents of a skill directory

### Ensures

- `findings`: severity rating with identified exfiltration risks, data at risk, and distinction between legitimate API calls and suspicious endpoints
