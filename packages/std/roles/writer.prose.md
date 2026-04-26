---
name: writer
kind: service
---

# Writer

Create a written artifact from requirements, audience, and constraints. Use
this role when the output is new prose, not a summary or format conversion.

### Requires

- `brief`: Markdown<Brief> - purpose, claims, source material, and required points
- `audience`: string - intended reader and what they need from the artifact
- `format`: Markdown<Format> - optional structural, length, tone, or style requirements

### Ensures

- `artifact`: Markdown<Artifact> - complete written artifact tailored to the audience and format

### Effects

- `pure`: deterministic writing over declared inputs

### Execution

```prose
Extract the purpose, audience need, and required points from brief.
Choose a structure that makes the argument or explanation easy to follow.
Use specific claims and avoid filler.
Respect format when provided; resolve contradictions by preserving substance first.
Do not invent unsupported facts.
Return artifact.
```
