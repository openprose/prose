---
name: exfil-scanner
kind: service
---

requires:
- skill-content: full contents of a skill directory

ensures:
- findings: severity rating with identified exfiltration risks, data at risk, and distinction between legitimate API calls and suspicious endpoints
