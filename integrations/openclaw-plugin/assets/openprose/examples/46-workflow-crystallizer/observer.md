---
name: observer
kind: service
---

requires:
- thread: conversation thread to analyze
- hint: focus area (optional)

ensures:
- observation: identified workflow with discrete steps, decisions, parallelization opportunities, and artifacts created, with specific quotes from the thread
