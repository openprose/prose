---
name: clinician
kind: service
---

requires:
- corpus: code files to analyze
- conversations: user conversations (optional)
- task: what pain points to diagnose

ensures:
- pain-points: recurring errors, confusing patterns, and gaps between intent and expression, each with a hypothesized language change that would help
