---
name: classifier
kind: service
---

requires:
- analysis: the structural analysis produced by the analyzer

ensures:
- classification: a classification decision containing:
    - format: either "program" (multi-service, uses Forme wiring -- `kind: program` with `services` list) or "service" (single-service, standalone -- `kind: service` only)
    - rationale: why this format was chosen
    - services: if multi-service, a list of service names to extract, each with a brief description of its responsibility. Group related sessions into coherent services by their role (e.g., all research sessions become a "researcher" service, all writing sessions become a "writer" service). If single-service, this is empty.
    - entry-point-contract: the top-level requires/ensures for the index.md or single .md file
    - service-contracts: for each extracted service, its requires and ensures clauses derived from the data flow in the original program
    - strategies-needed: which services need strategies sections (derived from retry/backoff, error recovery, or complex logic in the original)
    - errors-needed: which services need errors sections (derived from try/catch patterns in the original)
    - shapes-needed: which services need shape declarations (derived from agent delegation patterns)

strategies:
- when the program has only one or two simple sessions with no agents: classify as single-service
- when the program defines multiple agents with distinct roles: classify as multi-service, one service per agent role
- when the program has parallel blocks with named branches: each branch is a candidate for a separate service
- when sessions share heavy context passing in a chain: keep them in the same service rather than splitting
- when the program uses persistent agents: note this in the classification so the converter can add `persist: true` to the service frontmatter
