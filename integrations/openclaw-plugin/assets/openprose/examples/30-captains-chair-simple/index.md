---
name: captains-chair-simple
kind: program
services: [captain, executor, critic]
---

requires:
- task: what to accomplish

ensures:
- result: completed and validated work product

strategies:
- when critic finds issues affecting the work: captain integrates work while addressing concerns
- when no critical issues: captain validates and summarizes
