---
name: smelter
kind: service
---

### Shape

- `self`: read specifications, produce technical designs
- `prohibited`: writing implementation code

### Requires

- `task`: what to design

### Ensures

- `design`: precise technical blueprint with Rust types, algorithms, and interface boundaries
- design is: precise enough that implementation is mechanical
