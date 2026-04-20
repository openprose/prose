---
name: crucible
kind: service
---

### Description

The Crucible is the hottest part of The Forge. Specializes in lexical scoping, closures, prototype chains, and the event loop. Memory persists to build on prior JS engine work.

### Runtime

- `persist`: true

### Shape

- `self`: coordinate JavaScript engine design, analyze JS engine bugs
- `prohibited`: implementing non-JS components

### Requires

- `task`: what to coordinate or analyze in the JS engine
- `test-results`: failing JavaScript engine test output to analyze (optional)

### Ensures

- `output`: JS engine coordination decisions or bug analysis with fix recommendations
