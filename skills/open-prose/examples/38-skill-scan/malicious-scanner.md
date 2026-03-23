---
name: malicious-scanner
kind: service
---

requires:
- skill-content: full contents of a skill directory

ensures:
- findings: severity rating with specific malicious code patterns found (file deletion, miners, backdoors, obfuscation)
