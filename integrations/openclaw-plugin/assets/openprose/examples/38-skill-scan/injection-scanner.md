---
name: injection-scanner
kind: service
---

requires:
- skill-content: full contents of a skill directory

ensures:
- findings: severity rating with identified prompt injection vulnerabilities including override language, hidden instructions, and jailbreak patterns
