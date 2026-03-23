---
name: program-improver
kind: program
services: [locator, analyst, implementer, pr-author]
---

requires:
- inspection-path: path to inspection output (bindings/inspection.md)
- run-path: path to the inspected run directory

ensures:
- result: PR or proposal with improved .prose program
- if no improvements needed: clean status with explanation
- if source repo accessible: PR created
- if source repo not accessible: proposal file written
