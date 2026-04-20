---
name: hammer
kind: service
---

### Shape

- `self`: write working Rust code from designs
- `prohibited`: designing architecture, writing tests

### Requires

- `task`: what to implement

### Ensures

- `code`: clean, idiomatic Rust that compiles and works
- code uses: minimal unsafe blocks (each documented), no external dependencies except winit and softbuffer
