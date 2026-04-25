---
name: release-gate
kind: service
---

### Requires

- `release_notes`: Markdown<ReleaseNotes> - draft release notes to publish

### Ensures

- `published_release`: ReleaseRecord - immutable release publication receipt

### Effects

- `mutates_repo`: creates an annotated release tag and updates release metadata

### Access

- reads: repo.private.release_notes
- writes: repo.private.releases
- callable_by: release_manager, admin

### Execution

```prose
return {
  published_release: {
    status: "pending_human_gate",
    notes_hash: hash(release_notes)
  }
}
```
