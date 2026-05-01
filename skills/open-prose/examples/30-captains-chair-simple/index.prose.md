---
name: captains-chair-simple
kind: system
---

### Services

- `captain`
- `executor`
- `critic`

### Requires

- `task`: what to accomplish

### Ensures

- `result`: work product with validation evidence and any remaining caveats

### Strategies

- when critic finds issues affecting the work: captain integrates work while addressing concerns
- when no critical issues: captain validates and summarizes
