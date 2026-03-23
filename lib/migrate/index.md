---
name: migrate
kind: program
services: [analyzer, classifier, converter, validator]
---

requires:
- source: a `.prose` file path or directory containing `.prose` files to migrate to v2 format

ensures:
- output: converted `.md` file(s) in v2 format (index.md + service files for multi-service programs, single .md for simple programs)
- report: a migration report summarizing what was converted, any patterns that required manual attention, and validation results

strategies:
- when the source is a directory: discover all `.prose` files recursively, migrate each independently, produce a combined report
- when a v0 construct has no clean v2 equivalent: preserve author intent by approximating with the closest v2 pattern and flag for manual review
- when the source uses imports (`use` statements): note the dependency but convert the local program structure only
- when agent definitions include retry/backoff: convert to `strategies` sections in the corresponding service
- when the source is already in v2 format: skip conversion and note in the report
