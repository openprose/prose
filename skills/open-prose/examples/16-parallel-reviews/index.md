---
name: parallel-reviews
kind: program
---

### Services

- `security-reviewer`
- `perf-reviewer`
- `style-reviewer`
- `synthesizer`

### Requires

- `code`: the code to review

### Ensures

- `report`: a unified code review report covering security, performance, and style
