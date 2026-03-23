---
name: smelter
kind: service
shape:
  self: [read specifications, produce technical designs]
  prohibited: [writing implementation code]
---

requires:
- task: what to design

ensures:
- design: precise technical blueprint with Rust types, algorithms, and interface boundaries
- design is: precise enough that implementation is mechanical
