---
name: composites-demo
kind: program
services: [worker, critic]
---

Demonstrates the worker-critic Forme composite pattern. The worker produces output, the critic evaluates it, and the cycle repeats until quality is met. Forme recognizes this as a worker-critic composite and handles the iteration automatically.

requires:
- task: what to produce
- quality-bar: what "good enough" means

ensures:
- result: output that meets the quality bar, refined through worker-critic iteration

strategies:
- when critic score is below threshold: worker revises targeting specific issues
- max 4 iterations
