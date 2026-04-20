---
name: automated-pr-review
kind: program
---

### Services

- `reviewer`
- `security-expert`
- `performance-expert`
- `synthesizer`

### Requires

- `changes`: the code changes to review (PR diff or directory)

### Ensures

- `recommendation`: a clear Approve, Request Changes, or Comment verdict with unified review
