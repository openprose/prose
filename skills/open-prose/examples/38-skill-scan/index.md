---
name: skill-scan
kind: program
services: [discovery, triage, malicious-scanner, exfil-scanner, injection-scanner, permission-analyzer, hook-analyzer, synthesizer]
---

requires:
- mode: scan mode -- "quick" (triage only), "standard" (triage + deep on concerns), or "deep" (full analysis)
- focus: specific category to focus on (optional: malicious, exfiltration, injection, permissions, hooks)
- skill-filter: specific skill name or path to scan (optional, default: all discovered)

ensures:
- audit: security audit report with overall risk rating, findings by severity, and remediation recommendations
- if no skills found: brief report listing directories checked
- each skill scanned: has individual risk rating and safe-to-use verdict

strategies:
- when mode is standard and triage is clean with high confidence: skip deep scan for that skill
- when critical vulnerability found mid-scan: alert immediately, do not wait for full scan
- when scanner fails: continue with remaining scanners (graceful degradation)
