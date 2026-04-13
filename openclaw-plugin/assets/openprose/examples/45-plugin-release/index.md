---
name: plugin-release
kind: program
services: [validator, analyzer, writer, executor]
---

requires:
- release-type: "major", "minor", "patch", or empty for auto-detect (optional)

ensures:
- release: completed release with version, tag, changelog, release notes, and verification status

errors:
- preflight-failed: pre-flight checks found issues that must be fixed before release
- release-failed: release execution failed and was rolled back

strategies:
- when version contradicts impact analysis: warn and confirm with user
- when post-release verification fails: continue with remaining checks (graceful degradation)
