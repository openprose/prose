---
name: test-prose-author-shape-root-guidance
kind: test
version: 0.15.0
subject: prose-author
---

# Test Prose Author Shape Root Guidance

### Fixtures

- `request`: |
    Add a Prose sidecar to an existing product repository. Build an incident
    triage system that receives alerts, gathers deployment and customer-impact
    evidence, drafts an incident brief, and records follow-up responsibilities.
    Keep the app source untouched and return a folder of generated Prose files.

### Expects

- `authoring_notes`: records that the landscape was scanned read-only before
  source authoring
- `authoring_notes`: records a shape/root decision for an attached sidecar root
  under `.agents/prose`
- `authoring_notes`: records that `forme.md` was loaded for the multi-service
  system shape
- `authoring_notes`: records that `responsibility-runtime.md` was loaded for
  responsibility and gateway source
- `authoring_notes`: records that `state/README.md` and
  `state/filesystem.md` were loaded because root layout and durable state
  matter
- `source_package`: includes a folder-shaped file tree with an
  `index.prose.md` root file and private service files under the selected
  sidecar root
- `source_package`: does not place generated Prose source under the product
  app's ordinary `src/` directory
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `source_package`: claims it asked the shell CLI follow-up questions mid-run
- `authoring_notes`: treats the sidecar decision as an ungrounded default
