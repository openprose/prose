---
name: test-discovery
kind: program
services: [researcher, compiler]
---

# Test Discovery

Research a topic and compile findings.

## Contract

requires:
- topic: the subject to research
- depth: (optional, default "shallow") how deep to go

ensures:
- report: compiled findings on the topic
- sources: list of URLs consulted

errors:
- no-data: insufficient public information on the topic

strategies:
- when researching: prefer primary sources over aggregators

### Execution

let research = call researcher
  topic: topic
  depth: depth

let report = call compiler
  findings: research
