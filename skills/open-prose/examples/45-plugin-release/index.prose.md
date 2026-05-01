---
name: plugin-release
kind: system
---

### Services

- `validator`
- `analyzer`
- `writer`
- `executor`

### Requires

- `release-type`: "major", "minor", "patch", or empty for auto-detect (optional)

### Ensures

- `release`: release record with version, tag, changelog, release notes, verification status, and rollback note if applicable

### Errors

- `preflight-failed`: pre-flight checks found issues that must be fixed before release
- `release-failed`: release execution failed and was rolled back

### Strategies

- when version contradicts impact analysis: warn and confirm with user
- when post-release verification fails: continue with remaining checks (graceful degradation)
