---
name: dependency-aware
kind: program
---

### Services

- `review`
- `std/evals/inspector`

### Requires

- `draft`: Markdown<Draft> - source draft

### Ensures

- `final`: Markdown<Brief> - reviewed final brief

## review
---
kind: service
---

### Requires

- `draft`: Markdown<Draft> - source draft

### Ensures

- `final`: Markdown<Brief> - reviewed final brief

### Effects

- `pure`: deterministic transform over the provided draft
